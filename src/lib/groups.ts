import { db, eq, and, desc, Group, GroupMembership, EnsembleMember, User } from 'astro:db';

export async function getEnsembleGroups(ensembleId: string) {
  return await db
    .select()
    .from(Group)
    .where(eq(Group.ensembleId, ensembleId))
    .orderBy(desc(Group.createdAt))
    .all();
}

export async function getGroupMembershipsWithUsers(_ensembleId: string) {
  return await db
    .select({
      groupId: GroupMembership.groupId,
      userId: GroupMembership.userId,
      role: GroupMembership.role,
      userName: User.name,
    })
    .from(GroupMembership)
    .innerJoin(User, eq(GroupMembership.userId, User.id))
    .all();
}

export async function getEnsembleMembersBasic(ensembleId: string) {
  return await db
    .select({ id: User.id, name: User.name, email: User.email })
    .from(EnsembleMember)
    .innerJoin(User, eq(EnsembleMember.userId, User.id))
    .where(eq(EnsembleMember.ensembleId, ensembleId))
    .all();
}

export async function createGroup(
  ensembleId: string,
  name: string,
  description: string | null,
  color: string,
) {
  await db.insert(Group).values({
    id: crypto.randomUUID(),
    ensembleId,
    name,
    description,
    color,
  });
}

export async function updateGroup(
  groupId: string,
  name: string,
  description: string | null,
  color: string,
) {
  await db.update(Group).set({ name, description, color }).where(eq(Group.id, groupId));
}

export async function deleteGroup(groupId: string) {
  await db.delete(GroupMembership).where(eq(GroupMembership.groupId, groupId));
  await db.delete(Group).where(eq(Group.id, groupId));
}

export async function toggleGroupMember(groupId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(GroupMembership)
    .where(and(eq(GroupMembership.groupId, groupId), eq(GroupMembership.userId, userId)));

  if (existing) {
    await db.delete(GroupMembership).where(eq(GroupMembership.id, existing.id));
  } else {
    await db.insert(GroupMembership).values({
      id: crypto.randomUUID(),
      groupId,
      userId,
    });
  }
}

export async function setGroupMemberRole(groupId: string, userId: string, role: string | null) {
  await db
    .update(GroupMembership)
    .set({ role: role || null })
    .where(and(eq(GroupMembership.groupId, groupId), eq(GroupMembership.userId, userId)));
}
