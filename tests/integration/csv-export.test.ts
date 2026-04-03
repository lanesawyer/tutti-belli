/**
 * Integration tests for the members CSV export data pipeline.
 *
 * These tests verify that the lib functions used by the export route
 * (getEnsembleMembersWithUsers, getEnsembleParts, getMemberPartAssignments)
 * produce data that round-trips correctly through toCSV.
 */
import { describe, it, expect } from 'vitest';
import {
  getEnsembleMembersWithUsers,
  getEnsembleParts,
  getMemberPartAssignments,
} from '../../src/lib/ensemble.ts';
import { toCSV, type CsvColumn } from '../../src/lib/csv.ts';
import {
  createUser,
  createEnsemble,
  createMembership,
  createPart,
  createMemberPart,
} from './fixtures.ts';

type MemberRow = Awaited<ReturnType<typeof getEnsembleMembersWithUsers>>[number] & {
  parts: string;
};

/** Mirrors the column definition in the export route. */
const memberColumns: CsvColumn<MemberRow>[] = [
  { header: 'Name', value: (r) => r.name },
  { header: 'Email', value: (r) => r.email },
  { header: 'Role', value: (r) => r.role },
  { header: 'Parts', value: (r) => r.parts },
  { header: 'Joined', value: (r) => new Date(r.joinedAt).toISOString().slice(0, 10) },
];

async function buildMemberRows(ensembleId: string): Promise<MemberRow[]> {
  const members = await getEnsembleMembersWithUsers(ensembleId);
  const allParts = await getEnsembleParts(ensembleId);
  const partById = new Map(allParts.map((p) => [p.id, p.name]));
  const memberPartRows = await getMemberPartAssignments(members.map((m) => m.membershipId));

  const partsByMembership = new Map<string, string[]>();
  for (const mp of memberPartRows) {
    const name = partById.get(mp.partId);
    if (!name) continue;
    if (!partsByMembership.has(mp.membershipId)) partsByMembership.set(mp.membershipId, []);
    partsByMembership.get(mp.membershipId)!.push(name);
  }

  return members.map((m) => ({
    ...m,
    parts: (partsByMembership.get(m.membershipId) ?? []).join('; '),
  }));
}

describe('members CSV export data', () => {
  it('includes all active members in the output', async () => {
    const admin = await createUser({ name: 'Admin User', email: 'admin@export.test', role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const alice = await createUser({ name: 'Alice', email: 'alice@export.test' });
    const bob = await createUser({ name: 'Bob', email: 'bob@export.test' });
    await createMembership(ensemble!.id, alice!.id, { status: 'active' });
    await createMembership(ensemble!.id, bob!.id, { status: 'active' });

    const rows = await buildMemberRows(ensemble!.id);
    expect(rows).toHaveLength(2);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Alice');
    expect(names).toContain('Bob');
  });

  it('excludes pending members from the export', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const active = await createUser({ name: 'Active Member' });
    const pending = await createUser({ name: 'Pending Member' });
    await createMembership(ensemble!.id, active!.id, { status: 'active' });
    await createMembership(ensemble!.id, pending!.id, { status: 'pending' });

    const rows = await buildMemberRows(ensemble!.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Active Member');
  });

  it('includes the member role in each row', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const adminUser = await createUser({ name: 'Ensemble Admin' });
    const regularUser = await createUser({ name: 'Regular Member' });
    await createMembership(ensemble!.id, adminUser!.id, { status: 'active', role: 'admin' });
    await createMembership(ensemble!.id, regularUser!.id, { status: 'active', role: 'member' });

    const rows = await buildMemberRows(ensemble!.id);
    const byName = new Map(rows.map((r) => [r.name, r]));
    expect(byName.get('Ensemble Admin')!.role).toBe('admin');
    expect(byName.get('Regular Member')!.role).toBe('member');
  });

  it('joins part names as a semicolon-separated string', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const soprano = await createPart(ensemble!.id, { name: 'Soprano', sortOrder: 0 });
    const alto = await createPart(ensemble!.id, { name: 'Alto', sortOrder: 1 });
    const user = await createUser({ name: 'Multi-part Singer' });
    const membership = await createMembership(ensemble!.id, user!.id, { status: 'active' });
    await createMemberPart(membership!.id, soprano!.id);
    await createMemberPart(membership!.id, alto!.id);

    const rows = await buildMemberRows(ensemble!.id);
    expect(rows).toHaveLength(1);
    const parts = rows[0].parts.split('; ');
    expect(parts).toContain('Soprano');
    expect(parts).toContain('Alto');
  });

  it('produces an empty parts string for members with no part assigned', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser({ name: 'Unassigned Singer' });
    await createMembership(ensemble!.id, user!.id, { status: 'active' });

    const rows = await buildMemberRows(ensemble!.id);
    expect(rows[0].parts).toBe('');
  });

  it('returns an empty array when the ensemble has no active members', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);

    const rows = await buildMemberRows(ensemble!.id);
    expect(rows).toHaveLength(0);
  });

  it('produces a valid CSV with correct headers and one row per member', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser({ name: 'Jane Doe', email: 'jane@export.test' });
    await createMembership(ensemble!.id, user!.id, { status: 'active' });

    const rows = await buildMemberRows(ensemble!.id);
    const csv = toCSV(rows, memberColumns);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe('Name,Email,Role,Parts,Joined');
    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain('Jane Doe');
    expect(lines[1]).toContain('jane@export.test');
  });

  it('CSV Joined date is formatted as YYYY-MM-DD', async () => {
    const admin = await createUser({ role: 'admin' });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser({ name: 'Date Tester' });
    await createMembership(ensemble!.id, user!.id, { status: 'active' });

    const rows = await buildMemberRows(ensemble!.id);
    const csv = toCSV(rows, memberColumns);
    const dataLine = csv.split('\r\n')[1];
    // Joined column is last — check it matches YYYY-MM-DD
    const joined = dataLine.split(',').at(-1)!;
    expect(joined).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
