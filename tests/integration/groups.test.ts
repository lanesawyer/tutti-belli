import { describe, it, expect } from 'vitest';
import { db, GroupMembership, eq } from 'astro:db';
import { createUser, createEnsemble, createGroup, createGroupMembership } from './fixtures.ts';

describe('GroupMembership role', () => {
  it('defaults to null role when not specified', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const group = await createGroup(ensemble!.id);
    const membership = await createGroupMembership(group!.id, user!.id);

    expect(membership!.role).toBeNull();
  });

  it('stores and returns the lead role', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const group = await createGroup(ensemble!.id);
    const membership = await createGroupMembership(group!.id, user!.id, { role: 'lead' });

    expect(membership!.role).toBe('lead');
  });

  it('can update an existing membership role', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const group = await createGroup(ensemble!.id);
    const membership = await createGroupMembership(group!.id, user!.id);
    expect(membership!.role).toBeNull();

    await db
      .update(GroupMembership)
      .set({ role: 'lead' })
      .where(eq(GroupMembership.id, membership!.id));

    const updated = await db
      .select()
      .from(GroupMembership)
      .where(eq(GroupMembership.id, membership!.id))
      .get();

    expect(updated!.role).toBe('lead');
  });

  it('can clear a role back to null', async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user!.id);
    const group = await createGroup(ensemble!.id);
    const membership = await createGroupMembership(group!.id, user!.id, { role: 'lead' });
    expect(membership!.role).toBe('lead');

    await db
      .update(GroupMembership)
      .set({ role: null })
      .where(eq(GroupMembership.id, membership!.id));

    const updated = await db
      .select()
      .from(GroupMembership)
      .where(eq(GroupMembership.id, membership!.id))
      .get();

    expect(updated!.role).toBeNull();
  });

  it('distinguishes leads from regular members in the same group', async () => {
    const admin = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(admin!.id);
    const group = await createGroup(ensemble!.id);
    await createGroupMembership(group!.id, admin!.id, { role: 'lead' });
    await createGroupMembership(group!.id, member!.id);

    const memberships = await db
      .select()
      .from(GroupMembership)
      .where(eq(GroupMembership.groupId, group!.id));

    const leads = memberships.filter((m) => m.role === 'lead');
    const regulars = memberships.filter((m) => m.role !== 'lead');

    expect(leads).toHaveLength(1);
    expect(leads[0].userId).toBe(admin!.id);
    expect(regulars).toHaveLength(1);
    expect(regulars[0].userId).toBe(member!.id);
  });
});
