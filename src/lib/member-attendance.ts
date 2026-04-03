import { db, eq, and, Attendance, Event, EnsembleMember, User } from 'astro:db';

export type MemberAttendanceStat = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  attended: number;
  total: number;
  pct: number;
};

/**
 * Returns attendance stats per active member for all events in the ensemble,
 * sorted by attendance percentage ascending (worst first).
 */
export async function getMemberAttendanceStats(ensembleId: string, seasonId?: string): Promise<MemberAttendanceStat[]> {
  const members = await db
    .select({
      userId: User.id,
      name: User.name,
      email: User.email,
      avatarUrl: User.avatarUrl,
      role: EnsembleMember.role,
    })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, 'active')))
    .all();

  if (members.length === 0) return [];

  // Get relevant events
  const events = seasonId
    ? await db.select({ id: Event.id }).from(Event).where(and(eq(Event.ensembleId, ensembleId), eq(Event.seasonId, seasonId))).all()
    : await db.select({ id: Event.id }).from(Event).where(eq(Event.ensembleId, ensembleId)).all();

  const totalEvents = events.length;
  if (totalEvents === 0) {
    return members.map((m) => ({ ...m, attended: 0, total: 0, pct: 0, avatarUrl: m.avatarUrl ?? null }));
  }

  // Get all attendance records for these events via join
  const attendanceRows = await db
    .select({ userId: Attendance.userId })
    .from(Attendance)
    .innerJoin(Event, and(eq(Attendance.eventId, Event.id), eq(Event.ensembleId, ensembleId)))
    .where(seasonId ? eq(Event.seasonId, seasonId) : eq(Event.ensembleId, ensembleId))
    .all();

  // Count attendance per user
  const attendedByUser = new Map<string, number>();
  for (const row of attendanceRows) {
    attendedByUser.set(row.userId, (attendedByUser.get(row.userId) ?? 0) + 1);
  }

  const stats: MemberAttendanceStat[] = members.map((m) => {
    const attended = attendedByUser.get(m.userId) ?? 0;
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl ?? null,
      role: m.role,
      attended,
      total: totalEvents,
      pct: totalEvents > 0 ? Math.round((attended / totalEvents) * 100) : 0,
    };
  });

  // Sort by pct ascending (worst attendance first)
  stats.sort((a, b) => a.pct - b.pct);

  return stats;
}

