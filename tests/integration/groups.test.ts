import { describe, it, expect } from "vitest";
import { db, Group, GroupMembership, eq } from "@db";
import {
  createGroup,
  deleteGroup,
  getEnsembleGroups,
  getEnsembleMembersBasic,
  getGroupMembershipsWithUsers,
  setGroupMemberRole,
  toggleGroupMember,
  updateGroup,
} from "@lib/groups";
import {
  createUser,
  createEnsemble,
  createMembership,
  createGroup as insertGroup,
  createGroupMembership,
} from "./fixtures.ts";

async function setup() {
  const admin = await createUser({ name: "Admin" });
  const member = await createUser({ name: "Member" });
  const ensemble = await createEnsemble(admin.id);
  await createMembership(ensemble.id, admin.id, { role: "admin" });
  await createMembership(ensemble.id, member.id);
  const group = await insertGroup(ensemble.id);
  return { admin, member, ensemble, group };
}

function membershipsOf(groupId: string) {
  return db.select().from(GroupMembership).where(eq(GroupMembership.groupId, groupId)).all();
}

describe("createGroup / updateGroup / getEnsembleGroups", () => {
  it("creates a group in the ensemble and lists it", async () => {
    const { ensemble } = await setup();
    await createGroup(ensemble.id, "Altos", "Section leads", "success");

    const groups = await getEnsembleGroups(ensemble.id);
    expect(groups.find((group) => group.name === "Altos")).toMatchObject({
      ensembleId: ensemble.id,
      description: "Section leads",
      color: "success",
    });
  });

  it("does not list another ensemble's groups", async () => {
    const { ensemble } = await setup();
    const other = await setup();
    const groups = await getEnsembleGroups(ensemble.id);
    expect(groups.map((group) => group.id)).not.toContain(other.group.id);
  });

  it("updates name, description and color", async () => {
    const { group } = await setup();
    await updateGroup(group.id, "Renamed", null, "danger");
    const updated = await db.select().from(Group).where(eq(Group.id, group.id)).get();
    expect(updated).toMatchObject({ name: "Renamed", description: null, color: "danger" });
  });
});

describe("toggleGroupMember", () => {
  it("adds a member who is not in the group, then removes them", async () => {
    const { group, member } = await setup();

    await toggleGroupMember(group.id, member.id);
    expect((await membershipsOf(group.id)).map((row) => row.userId)).toEqual([member.id]);

    await toggleGroupMember(group.id, member.id);
    expect(await membershipsOf(group.id)).toHaveLength(0);
  });
});

describe("setGroupMemberRole", () => {
  it("sets and clears the lead role", async () => {
    const { group, member } = await setup();
    await createGroupMembership(group.id, member.id);

    await setGroupMemberRole(group.id, member.id, "lead");
    expect((await membershipsOf(group.id))[0].role).toBe("lead");

    await setGroupMemberRole(group.id, member.id, null);
    expect((await membershipsOf(group.id))[0].role).toBeNull();
  });

  it("treats an empty role as no role", async () => {
    const { group, member } = await setup();
    await createGroupMembership(group.id, member.id, { role: "lead" });
    await setGroupMemberRole(group.id, member.id, "");
    expect((await membershipsOf(group.id))[0].role).toBeNull();
  });

  it("only touches the member in that group", async () => {
    const { group, member, admin } = await setup();
    await createGroupMembership(group.id, member.id);
    await createGroupMembership(group.id, admin.id);
    await setGroupMemberRole(group.id, member.id, "lead");

    const leads = (await membershipsOf(group.id)).filter((row) => row.role === "lead");
    expect(leads.map((row) => row.userId)).toEqual([member.id]);
  });
});

describe("deleteGroup", () => {
  it("removes the group and its memberships", async () => {
    const { group, member } = await setup();
    await createGroupMembership(group.id, member.id);

    await deleteGroup(group.id);

    expect(await db.select().from(Group).where(eq(Group.id, group.id)).get()).toBeUndefined();
    expect(await membershipsOf(group.id)).toHaveLength(0);
  });
});

describe("getGroupMembershipsWithUsers", () => {
  it("returns each membership with the member name and role", async () => {
    const { ensemble, group, member } = await setup();
    await createGroupMembership(group.id, member.id, { role: "lead" });

    const memberships = await getGroupMembershipsWithUsers(ensemble.id);
    expect(memberships).toContainEqual({
      groupId: group.id,
      userId: member.id,
      role: "lead",
      userName: "Member",
    });
  });

  it("does not return another ensemble's group memberships", async () => {
    const { ensemble } = await setup();
    const other = await setup();
    await createGroupMembership(other.group.id, other.member.id);

    const memberships = await getGroupMembershipsWithUsers(ensemble.id);
    expect(memberships.map((row) => row.groupId)).not.toContain(other.group.id);
  });
});

describe("getEnsembleMembersBasic", () => {
  it("lists the ensemble's members and nobody else", async () => {
    const { ensemble, admin, member } = await setup();
    const other = await setup();

    const members = await getEnsembleMembersBasic(ensemble.id);
    expect(members.map((row) => row.id).sort()).toEqual([admin.id, member.id].sort());
    expect(members.map((row) => row.id)).not.toContain(other.member.id);
  });
});
