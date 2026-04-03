import { describe, it, expect } from 'vitest';
import { db, Attendance } from 'astro:db';
import { createUser, createEnsemble, createMembership, createSeason, createEvent } from './fixtures.ts';
import { getMemberAttendanceStats, type MemberAttendanceStat } from '../../src/lib/member-attendance.ts';
import { toCSV, type CsvColumn } from '../../src/lib/csv.ts';

const attendanceColumns: CsvColumn<MemberAttendanceStat>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Email', value: (r) => r.email },
  { header: 'Role', value: (r) => r.role },
  { header: 'Attended', value: (r) => r.attended },
  { header: 'Total Events', value: (r) => r.total },
  { header: 'Attendance %', value: (r) => r.pct },
];

async function createAttendance(eventId: string, userId: string) {
  await db.insert(Attendance).values({
    id: crypto.randomUUID(),
    eventId,
    userId,
    checkedInMethod: 'admin',
  });
}

describe('member-attendance lib', () => {
  describe('getMemberAttendanceStats', () => {
    it('returns stats sorted by pct ascending (worst first)', async () => {
      const admin = await createUser();
      const ensemble = await createEnsemble(admin!.id);
      const userA = await createUser();
      const userB = await createUser();
      await createMembership(ensemble!.id, userA!.id, { status: 'active' });
      await createMembership(ensemble!.id, userB!.id, { status: 'active' });
      const season = await createSeason(ensemble!.id);
      const event1 = await createEvent(ensemble!.id, season!.id);
      const event2 = await createEvent(ensemble!.id, season!.id);

      // userA attends both, userB attends none
      await createAttendance(event1!.id, userA!.id);
      await createAttendance(event2!.id, userA!.id);

      const stats = await getMemberAttendanceStats(ensemble!.id);

      expect(stats).toHaveLength(2);
      // worst first: userB (0%) then userA (100%)
      expect(stats[0].userId).toBe(userB!.id);
      expect(stats[0].pct).toBe(0);
      expect(stats[0].attended).toBe(0);
      expect(stats[0].total).toBe(2);
      expect(stats[1].userId).toBe(userA!.id);
      expect(stats[1].pct).toBe(100);
      expect(stats[1].attended).toBe(2);
      expect(stats[1].total).toBe(2);
    });

    it('filters by seasonId when provided', async () => {
      const admin = await createUser();
      const ensemble = await createEnsemble(admin!.id);
      const userA = await createUser();
      await createMembership(ensemble!.id, userA!.id, { status: 'active' });
      const season1 = await createSeason(ensemble!.id, { name: 'Season 1', isActive: 0 });
      const season2 = await createSeason(ensemble!.id, { name: 'Season 2', isActive: 1 });
      const eventS1 = await createEvent(ensemble!.id, season1!.id);
      await createEvent(ensemble!.id, season2!.id);

      await createAttendance(eventS1!.id, userA!.id);
      // userA does NOT attend season2 event

      const statsS1 = await getMemberAttendanceStats(ensemble!.id, season1!.id);
      expect(statsS1).toHaveLength(1);
      expect(statsS1[0].attended).toBe(1);
      expect(statsS1[0].total).toBe(1);
      expect(statsS1[0].pct).toBe(100);

      const statsS2 = await getMemberAttendanceStats(ensemble!.id, season2!.id);
      expect(statsS2).toHaveLength(1);
      expect(statsS2[0].attended).toBe(0);
      expect(statsS2[0].total).toBe(1);
      expect(statsS2[0].pct).toBe(0);
    });

    it('returns empty array when no active members', async () => {
      const admin = await createUser();
      const ensemble = await createEnsemble(admin!.id);
      // add a pending member (should be excluded)
      const user = await createUser();
      await createMembership(ensemble!.id, user!.id, { status: 'pending' });

      const stats = await getMemberAttendanceStats(ensemble!.id);
      expect(stats).toHaveLength(0);
    });

    it('returns zero totals when no events exist', async () => {
      const admin = await createUser();
      const ensemble = await createEnsemble(admin!.id);
      const user = await createUser();
      await createMembership(ensemble!.id, user!.id, { status: 'active' });

      const stats = await getMemberAttendanceStats(ensemble!.id);
      expect(stats).toHaveLength(1);
      expect(stats[0].attended).toBe(0);
      expect(stats[0].total).toBe(0);
      expect(stats[0].pct).toBe(0);
    });

    it('does not count attendance from other ensembles', async () => {
      const admin = await createUser();
      const ensemble1 = await createEnsemble(admin!.id);
      const ensemble2 = await createEnsemble(admin!.id);
      const user = await createUser();
      await createMembership(ensemble1!.id, user!.id, { status: 'active' });
      const season2 = await createSeason(ensemble2!.id);
      const eventOther = await createEvent(ensemble2!.id, season2!.id);
      await createAttendance(eventOther!.id, user!.id);

      // ensemble1 has no events, so total should be 0
      const stats = await getMemberAttendanceStats(ensemble1!.id);
      expect(stats[0].attended).toBe(0);
      expect(stats[0].total).toBe(0);
    });

    it('computes pct correctly with rounding', async () => {
      const admin = await createUser();
      const ensemble = await createEnsemble(admin!.id);
      const user = await createUser();
      await createMembership(ensemble!.id, user!.id, { status: 'active' });
      const season = await createSeason(ensemble!.id);
      // 3 events, attend 1 → 33%
      const e1 = await createEvent(ensemble!.id, season!.id);
      await createEvent(ensemble!.id, season!.id);
      await createEvent(ensemble!.id, season!.id);
      await createAttendance(e1!.id, user!.id);

      const stats = await getMemberAttendanceStats(ensemble!.id);
      expect(stats[0].pct).toBe(33);
    });
  });
});

describe('attendance CSV export pipeline', () => {
  it('produces a valid CSV with correct headers', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const member = await createUser({ name: 'Jane Doe', email: 'jane@csv.test' });
    await createMembership(ensemble!.id, member!.id, { status: 'active' });
    const event = await createEvent(ensemble!.id, season!.id);
    await createAttendance(event!.id, member!.id);

    const stats = await getMemberAttendanceStats(ensemble!.id);
    const csv = toCSV(stats, attendanceColumns);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Name,Email,Role,Attended,Total Events,Attendance %');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Jane Doe');
    expect(lines[1]).toContain('jane@csv.test');
  });

  it('CSV reflects correct attended, total, and pct values', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    const member = await createUser({ name: 'Count Tester' });
    await createMembership(ensemble!.id, member!.id, { status: 'active' });
    const e1 = await createEvent(ensemble!.id, season!.id);
    const e2 = await createEvent(ensemble!.id, season!.id);
    await createAttendance(e1!.id, member!.id);
    void e2;

    const stats = await getMemberAttendanceStats(ensemble!.id);
    const csv = toCSV(stats, attendanceColumns);
    // Name,Email,Role,Attended,Total Events,Attendance %
    const fields = csv.split('\r\n')[1].split(',');
    expect(fields[3]).toBe('1');  // Attended
    expect(fields[4]).toBe('2');  // Total Events
    expect(fields[5]).toBe('50'); // Attendance %
  });

  it('produces one row per active member', async () => {
    const admin = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const season = await createSeason(ensemble!.id);
    for (let i = 0; i < 3; i++) {
      const u = await createUser();
      await createMembership(ensemble!.id, u!.id, { status: 'active' });
    }
    await createEvent(ensemble!.id, season!.id);

    const stats = await getMemberAttendanceStats(ensemble!.id);
    const csv = toCSV(stats, attendanceColumns);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4); // header + 3 members
  });
});
