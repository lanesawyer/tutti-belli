import {
  db,
  eq,
  and,
  inArray,
  Attendance,
  Event,
  EnsembleMember,
  GroupMembership,
  User,
} from "@db";

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
 * Returns attendance stats per active member for past events each member was invited to,
 * sorted by attendance percentage ascending (worst first).
 */
export async function getMemberAttendanceStats(
  ensembleId: string,
  seasonId?: string,
): Promise<MemberAttendanceStat[]> {
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
    .where(and(eq(EnsembleMember.ensembleId, ensembleId), eq(EnsembleMember.status, "active")))
    .all();

  if (members.length === 0) return [];

  const events = await db
    .select({ id: Event.id, scheduledAt: Event.scheduledAt, groupId: Event.groupId })
    .from(Event)
    .where(
      seasonId
        ? and(eq(Event.ensembleId, ensembleId), eq(Event.seasonId, seasonId))
        : eq(Event.ensembleId, ensembleId),
    )
    .all();

  const now = Date.now();
  const pastEvents = events.filter((e) => new Date(e.scheduledAt).getTime() <= now);

  const groupIds = [...new Set(pastEvents.flatMap((e) => (e.groupId ? [e.groupId] : [])))];
  const groupMembers = new Map<string, Set<string>>();
  if (groupIds.length > 0) {
    const rows = await db
      .select({ groupId: GroupMembership.groupId, userId: GroupMembership.userId })
      .from(GroupMembership)
      .where(inArray(GroupMembership.groupId, groupIds))
      .all();
    for (const row of rows) {
      if (!groupMembers.has(row.groupId)) groupMembers.set(row.groupId, new Set());
      groupMembers.get(row.groupId)!.add(row.userId);
    }
  }

  const attendedKeys = new Set<string>();
  if (pastEvents.length > 0) {
    const attendanceRows = await db
      .select({ userId: Attendance.userId, eventId: Attendance.eventId })
      .from(Attendance)
      .innerJoin(Event, and(eq(Attendance.eventId, Event.id), eq(Event.ensembleId, ensembleId)))
      .where(seasonId ? eq(Event.seasonId, seasonId) : eq(Event.ensembleId, ensembleId))
      .all();
    for (const row of attendanceRows) attendedKeys.add(`${row.userId}:${row.eventId}`);
  }

  const stats: MemberAttendanceStat[] = members.map((m) => {
    const invited = pastEvents.filter(
      (e) => !e.groupId || groupMembers.get(e.groupId)?.has(m.userId),
    );
    const total = invited.length;
    const attended = invited.filter((e) => attendedKeys.has(`${m.userId}:${e.id}`)).length;
    return {
      userId: m.userId,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl ?? null,
      role: m.role,
      attended,
      total,
      pct: total > 0 ? Math.round((attended / total) * 100) : 0,
    };
  });

  // Sort by pct ascending (worst attendance first)
  stats.sort((a, b) => a.pct - b.pct);

  return stats;
}
