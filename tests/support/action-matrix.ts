import { expect } from "vitest";
import type { APIContext } from "astro";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import {
  db,
  and,
  eq,
  Announcement,
  Attendance,
  EmailChangeToken,
  Ensemble,
  EnsembleInvite,
  EnsembleLink,
  EnsembleMember,
  Event,
  EventProgram,
  EventRsvp,
  Group,
  GroupMembership,
  MemberPart,
  Part,
  PasswordResetToken,
  Season,
  SeasonMembership,
  SiteBanner,
  Song,
  SongFile,
  SongPart,
  Task,
  TaskCompletion,
  User,
} from "@db";
import { createPasswordResetToken, verifyPassword } from "@lib/auth";
import { getSession } from "@lib/session";
import type { Fields, FieldValue } from "./actions.ts";
import { WORLD_PASSWORD, type World, type WorldUser } from "./world.ts";

/**
 * Who an action is meant for. The runner derives the rejection cases from this:
 * - `public`: anyone, signed in or not
 * - `authenticated`: any signed-in user
 * - `member`: active members of the ensemble in the form
 * - `ensembleAdmin`: admins of the ensemble in the form (and site admins)
 * - `siteAdmin`: site admins only
 */
export type Access = "public" | "authenticated" | "member" | "ensembleAdmin" | "siteAdmin";

export type MatrixEntry = {
  access: Access;
  /** Who runs the happy path and the foreign-ID cases. Defaults to the least privileged user the access level allows, in ensemble A. */
  as?: (w: World) => WorldUser | null;
  /** A valid submission against ensemble A. */
  fields: (w: World) => Fields | Promise<Fields>;
  /** For each ID field the action accepts, the same kind of record from ensemble B. */
  foreign?: Record<string, (w: World) => FieldValue>;
  /** Proves the happy path really ran the action. */
  verify: (w: World, result: { data: unknown; context: APIContext }) => Promise<void> | void;
};

async function find<T extends SQLiteTable & { id: SQLiteColumn }>(table: T, id: string) {
  return (await db
    .select()
    .from(table as SQLiteTable)
    .where(eq(table.id, id))
    .get()) as T["$inferSelect"] | undefined;
}

const eventFields = (w: World) => ({
  ensembleId: w.a.ensemble.id,
  title: "Dress rehearsal",
  date: "2030-01-15",
  time: "19:00",
  groupId: w.a.group.id,
});

const songFields = (w: World) => ({
  ensembleId: w.a.ensemble.id,
  name: "Ave Verum Corpus",
  parts: [w.a.part.id],
  seasons: [w.a.season.id],
});

const membershipFields = (membership: (w: World) => { id: string }) => (w: World) => ({
  ensembleId: w.a.ensemble.id,
  membershipId: membership(w).id,
});

const foreignMembership = { membershipId: (w: World) => w.b.memberMembership.id };

export const matrix: Record<string, MatrixEntry> = {
  "admin.createEnsemble": {
    access: "authenticated",
    fields: () => ({ name: "New Ensemble", description: "Fresh" }),
    verify: async (w, { data }) => {
      const { ensembleUrlId } = data as { ensembleUrlId: string };
      const created = await db
        .select()
        .from(Ensemble)
        .where(eq(Ensemble.name, "New Ensemble"))
        .get();
      expect(created?.createdBy).toBe(w.outsider.id);
      expect(ensembleUrlId).toBeTruthy();
    },
  },
  "admin.deleteEnsemble": {
    access: "siteAdmin",
    fields: (w) => ({ ensembleId: w.b.ensemble.id }),
    verify: async (w) => expect(await find(Ensemble, w.b.ensemble.id)).toBeUndefined(),
  },
  "admin.toggleAdmin": {
    access: "siteAdmin",
    fields: (w) => ({ userId: w.outsider.id }),
    verify: async (w) => expect((await find(User, w.outsider.id))?.role).toBe("admin"),
  },
  "admin.deleteUser": {
    access: "siteAdmin",
    fields: (w) => ({ userId: w.outsider.id }),
    verify: async (w) => expect(await find(User, w.outsider.id)).toBeUndefined(),
  },
  "admin.setBanner": {
    access: "siteAdmin",
    fields: () => ({ message: "Maintenance tonight", color: "warning" }),
    verify: async () => {
      const banner = await db.select().from(SiteBanner).get();
      expect(banner?.message).toBe("Maintenance tonight");
    },
  },
  "admin.clearBanner": {
    access: "siteAdmin",
    fields: () => ({}),
    verify: async () => {
      const active = await db.select().from(SiteBanner).where(eq(SiteBanner.isActive, 1)).all();
      expect(active).toHaveLength(0);
    },
  },

  "announcements.create": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      title: "Concert moved",
      content: "Now on Friday.",
    }),
    verify: async (w) => {
      const rows = await db
        .select()
        .from(Announcement)
        .where(eq(Announcement.ensembleId, w.a.ensemble.id))
        .all();
      expect(rows.map((row) => row.title)).toContain("Concert moved");
    },
  },
  "announcements.update": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      announcementId: w.a.announcement.id,
      title: "Edited",
      content: "Edited content",
    }),
    foreign: { announcementId: (w) => w.b.announcement.id },
    verify: async (w) =>
      expect((await find(Announcement, w.a.announcement.id))?.title).toBe("Edited"),
  },
  "announcements.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, announcementId: w.a.announcement.id }),
    foreign: { announcementId: (w) => w.b.announcement.id },
    verify: async (w) => expect(await find(Announcement, w.a.announcement.id)).toBeUndefined(),
  },

  "auth.login": {
    access: "public",
    fields: (w) => ({ email: w.a.member.email, password: WORLD_PASSWORD }),
    verify: (w, { data, context }) => {
      expect(data).toEqual({ redirectUrl: `/ensembles/${w.a.ensemble.id}` });
      expect(getSession(context.cookies.get("session")?.value)?.userId).toBe(w.a.member.id);
    },
  },
  "auth.forgotPassword": {
    access: "public",
    fields: (w) => ({ email: w.a.member.email }),
    verify: async (w) => {
      const tokens = await db
        .select()
        .from(PasswordResetToken)
        .where(eq(PasswordResetToken.userId, w.a.member.id))
        .all();
      expect(tokens).toHaveLength(1);
    },
  },
  "auth.resetPassword": {
    access: "public",
    fields: async (w) => ({
      token: await createPasswordResetToken(w.a.member.id),
      password: "brand-new-password",
      confirmPassword: "brand-new-password",
    }),
    verify: async (w) => {
      const user = await find(User, w.a.member.id);
      expect(await verifyPassword("brand-new-password", user!.passwordHash)).toBe(true);
    },
  },

  "ensembles.join": {
    access: "authenticated",
    fields: (w) => ({ code: w.a.invite.code }),
    verify: async (w, { data }) => {
      expect(data).toEqual({ ensembleId: w.a.ensemble.id });
      const membership = await db
        .select()
        .from(EnsembleMember)
        .where(
          and(
            eq(EnsembleMember.ensembleId, w.a.ensemble.id),
            eq(EnsembleMember.userId, w.outsider.id),
          ),
        )
        .get();
      expect(membership?.status).toBe("pending");
    },
  },
  "ensembles.createInvite": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id }),
    verify: async (w) => {
      const invites = await db
        .select()
        .from(EnsembleInvite)
        .where(eq(EnsembleInvite.ensembleId, w.a.ensemble.id))
        .all();
      expect(invites).toHaveLength(2);
    },
  },
  "ensembles.deleteInvite": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, inviteId: w.a.invite.id }),
    foreign: { inviteId: (w) => w.b.invite.id },
    verify: async (w) => expect(await find(EnsembleInvite, w.a.invite.id)).toBeUndefined(),
  },
  "ensembles.update": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      name: "Renamed Ensemble",
      slug: "renamed-ensemble",
    }),
    verify: async (w, { data }) => {
      expect(data).toEqual({ newSlug: "renamed-ensemble" });
      expect((await find(Ensemble, w.a.ensemble.id))?.name).toBe("Renamed Ensemble");
    },
  },
  "ensembles.addLink": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      label: "Drive",
      url: "https://example.com/drive",
    }),
    verify: async (w) => {
      const links = await db
        .select()
        .from(EnsembleLink)
        .where(eq(EnsembleLink.ensembleId, w.a.ensemble.id))
        .all();
      expect(links.map((row) => row.label)).toContain("Drive");
    },
  },
  "ensembles.deleteLink": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, linkId: w.a.link.id }),
    foreign: { linkId: (w) => w.b.link.id },
    verify: async (w) => expect(await find(EnsembleLink, w.a.link.id)).toBeUndefined(),
  },

  "events.create": {
    access: "ensembleAdmin",
    fields: eventFields,
    foreign: { groupId: (w) => w.b.group.id },
    verify: async (w) => {
      const created = await db.select().from(Event).where(eq(Event.title, "Dress rehearsal")).get();
      expect(created).toMatchObject({ ensembleId: w.a.ensemble.id, groupId: w.a.group.id });
    },
  },
  "events.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, eventId: w.a.spareEvent.id }),
    foreign: { eventId: (w) => w.b.spareEvent.id },
    verify: async (w) => expect(await find(Event, w.a.spareEvent.id)).toBeUndefined(),
  },
  "events.edit": {
    access: "ensembleAdmin",
    fields: (w) => ({ ...eventFields(w), eventId: w.a.event.id }),
    foreign: { eventId: (w) => w.b.event.id, groupId: (w) => w.b.group.id },
    verify: async (w) => expect((await find(Event, w.a.event.id))?.title).toBe("Dress rehearsal"),
  },
  "events.checkIn": {
    access: "member",
    as: (w) => w.a.admin,
    fields: (w) => ({ ensembleId: w.a.ensemble.id, eventId: w.a.event.id }),
    foreign: { eventId: (w) => w.b.event.id },
    verify: async (w) => {
      const attendance = await db
        .select()
        .from(Attendance)
        .where(and(eq(Attendance.eventId, w.a.event.id), eq(Attendance.userId, w.a.admin.id)))
        .get();
      expect(attendance).toBeDefined();
    },
  },
  "events.addAttendance": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, eventId: w.a.event.id, userId: w.a.admin.id }),
    foreign: { eventId: (w) => w.b.event.id, userId: (w) => w.b.member.id },
    verify: async (w) => {
      const attendance = await db
        .select()
        .from(Attendance)
        .where(and(eq(Attendance.eventId, w.a.event.id), eq(Attendance.userId, w.a.admin.id)))
        .get();
      expect(attendance?.checkedInMethod).toBe("admin");
    },
  },
  "events.removeAttendance": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, attendanceId: w.a.attendance.id }),
    foreign: { attendanceId: (w) => w.b.attendance.id },
    verify: async (w) => expect(await find(Attendance, w.a.attendance.id)).toBeUndefined(),
  },
  "events.rsvp": {
    access: "member",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, eventId: w.a.event.id, response: "yes" }),
    foreign: { eventId: (w) => w.b.event.id },
    verify: async (w) => {
      const rsvp = await db
        .select()
        .from(EventRsvp)
        .where(eq(EventRsvp.eventId, w.a.event.id))
        .get();
      expect(rsvp).toMatchObject({ userId: w.a.member.id, response: "yes" });
    },
  },
  "events.removeRsvp": {
    access: "member",
    fields: async (w) => {
      await db
        .insert(EventRsvp)
        .values({
          id: crypto.randomUUID(),
          eventId: w.a.event.id,
          userId: w.a.member.id,
          response: "yes",
        });
      return { ensembleId: w.a.ensemble.id, eventId: w.a.event.id };
    },
    foreign: { eventId: (w) => w.b.event.id },
    verify: async (w) => {
      expect(
        await db.select().from(EventRsvp).where(eq(EventRsvp.eventId, w.a.event.id)).all(),
      ).toHaveLength(0);
    },
  },
  "events.addProgramSong": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      eventId: w.a.event.id,
      songId: w.a.song.id,
      notes: "Encore",
    }),
    foreign: { eventId: (w) => w.b.event.id, songId: (w) => w.b.song.id },
    verify: async (w) => {
      const entries = await db
        .select()
        .from(EventProgram)
        .where(eq(EventProgram.eventId, w.a.event.id))
        .all();
      expect(entries.map((entry) => entry.notes)).toContain("Encore");
    },
  },
  "events.addProgramItem": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      eventId: w.a.event.id,
      type: "break",
      label: "Interval",
    }),
    foreign: { eventId: (w) => w.b.event.id },
    verify: async (w) => {
      const entries = await db
        .select()
        .from(EventProgram)
        .where(eq(EventProgram.eventId, w.a.event.id))
        .all();
      expect(entries).toHaveLength(2);
    },
  },
  "events.removeProgramSong": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, programEntryId: w.a.programEntry.id }),
    foreign: { programEntryId: (w) => w.b.programEntry.id },
    verify: async (w) => expect(await find(EventProgram, w.a.programEntry.id)).toBeUndefined(),
  },
  "events.updateProgramSongNotes": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      programEntryId: w.a.programEntry.id,
      notes: "From bar 12",
    }),
    foreign: { programEntryId: (w) => w.b.programEntry.id },
    verify: async (w) =>
      expect((await find(EventProgram, w.a.programEntry.id))?.notes).toBe("From bar 12"),
  },
  "events.updateProgramEntry": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      programEntryId: w.a.programEntry.id,
      notes: "Slower",
      length: 7,
    }),
    foreign: { programEntryId: (w) => w.b.programEntry.id },
    verify: async (w) =>
      expect(await find(EventProgram, w.a.programEntry.id)).toMatchObject({
        notes: "Slower",
        length: 7,
      }),
  },
  "events.reorderProgramSongs": {
    access: "ensembleAdmin",
    fields: async (w) => {
      await db
        .update(EventProgram)
        .set({ sortOrder: 5 })
        .where(eq(EventProgram.id, w.a.programEntry.id));
      return {
        ensembleId: w.a.ensemble.id,
        eventId: w.a.event.id,
        orderedEntryIds: JSON.stringify([w.a.programEntry.id]),
      };
    },
    foreign: { eventId: (w) => w.b.event.id },
    verify: async (w) => expect((await find(EventProgram, w.a.programEntry.id))?.sortOrder).toBe(1),
  },
  "events.checkInByCode": {
    access: "authenticated",
    as: (w) => w.a.admin,
    fields: (w) => ({ code: w.a.event.checkInCode }),
    verify: async (w) => {
      const attendance = await db
        .select()
        .from(Attendance)
        .where(and(eq(Attendance.eventId, w.a.event.id), eq(Attendance.userId, w.a.admin.id)))
        .get();
      expect(attendance).toBeDefined();
    },
  },

  "groups.create": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, name: "Chamber choir" }),
    verify: async (w) => {
      const groups = await db
        .select()
        .from(Group)
        .where(eq(Group.ensembleId, w.a.ensemble.id))
        .all();
      expect(groups.map((group) => group.name)).toContain("Chamber choir");
    },
  },
  "groups.update": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, groupId: w.a.group.id, name: "Renamed group" }),
    foreign: { groupId: (w) => w.b.group.id },
    verify: async (w) => expect((await find(Group, w.a.group.id))?.name).toBe("Renamed group"),
  },
  "groups.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, groupId: w.a.group.id }),
    foreign: { groupId: (w) => w.b.group.id },
    verify: async (w) => expect(await find(Group, w.a.group.id)).toBeUndefined(),
  },
  "groups.toggleMember": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, groupId: w.a.group.id, userId: w.a.admin.id }),
    foreign: { groupId: (w) => w.b.group.id, userId: (w) => w.b.member.id },
    verify: async (w) => {
      const memberships = await db
        .select()
        .from(GroupMembership)
        .where(eq(GroupMembership.groupId, w.a.group.id))
        .all();
      expect(memberships.map((membership) => membership.userId)).toContain(w.a.admin.id);
    },
  },
  "groups.setMemberRole": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      groupId: w.a.group.id,
      userId: w.a.member.id,
      role: "lead",
    }),
    foreign: { groupId: (w) => w.b.group.id, userId: (w) => w.b.member.id },
    verify: async (w) =>
      expect((await find(GroupMembership, w.a.groupMembership.id))?.role).toBe("lead"),
  },

  "members.add": {
    access: "siteAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, email: w.outsider.email }),
    verify: async (w, { data }) => {
      expect(data).toMatchObject({ name: w.outsider.name, setPasswordUrl: null });
      const membership = await db
        .select()
        .from(EnsembleMember)
        .where(
          and(
            eq(EnsembleMember.ensembleId, w.a.ensemble.id),
            eq(EnsembleMember.userId, w.outsider.id),
          ),
        )
        .get();
      expect(membership).toMatchObject({ status: "active", role: "member" });
    },
  },
  "members.approve": {
    access: "ensembleAdmin",
    fields: membershipFields((w) => w.a.pendingMembership),
    foreign: { membershipId: (w) => w.b.pendingMembership.id },
    verify: async (w) =>
      expect((await find(EnsembleMember, w.a.pendingMembership.id))?.status).toBe("active"),
  },
  "members.reject": {
    access: "ensembleAdmin",
    fields: membershipFields((w) => w.a.pendingMembership),
    foreign: { membershipId: (w) => w.b.pendingMembership.id },
    verify: async (w) =>
      expect(await find(EnsembleMember, w.a.pendingMembership.id)).toBeUndefined(),
  },
  "members.remove": {
    access: "ensembleAdmin",
    fields: membershipFields((w) => w.a.memberMembership),
    foreign: foreignMembership,
    verify: async (w) =>
      expect(await find(EnsembleMember, w.a.memberMembership.id)).toBeUndefined(),
  },
  "members.promote": {
    access: "ensembleAdmin",
    fields: membershipFields((w) => w.a.memberMembership),
    foreign: foreignMembership,
    verify: async (w) =>
      expect((await find(EnsembleMember, w.a.memberMembership.id))?.role).toBe("admin"),
  },
  "members.demote": {
    access: "ensembleAdmin",
    fields: membershipFields((w) => w.a.adminMembership),
    foreign: { membershipId: (w) => w.b.adminMembership.id },
    verify: async (w) =>
      expect((await find(EnsembleMember, w.a.adminMembership.id))?.role).toBe("member"),
  },

  "parts.add": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, name: "Tenor", sortOrder: 2 }),
    verify: async (w) => {
      const parts = await db.select().from(Part).where(eq(Part.ensembleId, w.a.ensemble.id)).all();
      expect(parts.map((part) => part.name)).toContain("Tenor");
    },
  },
  "parts.edit": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, partId: w.a.part.id, name: "Renamed part" }),
    foreign: { partId: (w) => w.b.part.id },
    verify: async (w) => expect((await find(Part, w.a.part.id))?.name).toBe("Renamed part"),
  },
  "parts.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, partId: w.a.part.id }),
    foreign: { partId: (w) => w.b.part.id },
    verify: async (w) => expect(await find(Part, w.a.part.id)).toBeUndefined(),
  },

  "profile.register": {
    access: "public",
    fields: () => ({
      name: "New Singer",
      email: "new-singer@test.com",
      password: "secret-password",
    }),
    verify: async (_w, { data }) => {
      expect(data).toEqual({ email: "new-singer@test.com" });
      const user = await db.select().from(User).where(eq(User.email, "new-singer@test.com")).get();
      expect(user).toMatchObject({ name: "New Singer", role: "user", emailVerifiedAt: null });
    },
  },
  "profile.updateName": {
    access: "authenticated",
    fields: () => ({ name: "Renamed User" }),
    verify: async (w) => expect((await find(User, w.outsider.id))?.name).toBe("Renamed User"),
  },
  "profile.updatePhone": {
    access: "authenticated",
    fields: () => ({ phone: "555-123-4567" }),
    verify: async (w) => expect((await find(User, w.outsider.id))?.phone).toBe("555-123-4567"),
  },
  "profile.updateInfo": {
    access: "authenticated",
    fields: () => ({ name: "Renamed User", phone: "555-123-4567" }),
    verify: async (w) => {
      expect(await find(User, w.outsider.id)).toMatchObject({
        name: "Renamed User",
        phone: "555-123-4567",
      });
    },
  },
  "profile.updateAvatar": {
    access: "authenticated",
    fields: () => ({ avatar: new File([new Uint8Array(16)], "me.png", { type: "image/png" }) }),
    verify: async (w) =>
      expect((await find(User, w.outsider.id))?.avatarUrl).toBe("/images/avatars/uploaded.png"),
  },
  "profile.updateParts": {
    access: "authenticated",
    as: (w) => w.a.member,
    fields: (w) => ({ membershipId: w.a.memberMembership.id, partIds: [w.a.part.id] }),
    foreign: { membershipId: (w) => w.b.memberMembership.id, partIds: (w) => [w.b.part.id] },
    verify: async (w) => {
      const parts = await db
        .select()
        .from(MemberPart)
        .where(eq(MemberPart.membershipId, w.a.memberMembership.id))
        .all();
      expect(parts.map((part) => part.partId)).toEqual([w.a.part.id]);
    },
  },
  "profile.changeEmail": {
    access: "authenticated",
    fields: () => ({ newEmail: "moved@test.com" }),
    verify: async (w) => {
      const token = await db
        .select()
        .from(EmailChangeToken)
        .where(eq(EmailChangeToken.userId, w.outsider.id))
        .get();
      expect(token?.newEmail).toBe("moved@test.com");
    },
  },
  "profile.deleteAccount": {
    access: "authenticated",
    fields: () => ({ password: WORLD_PASSWORD }),
    verify: async (w) => expect(await find(User, w.outsider.id)).toBeUndefined(),
  },
  "profile.signOutOtherDevices": {
    access: "authenticated",
    fields: () => ({}),
    verify: async (w, { context }) => {
      expect((await find(User, w.outsider.id))?.sessionVersion).toBe(1);
      expect(getSession(context.cookies.get("session")?.value)).toMatchObject({
        userId: w.outsider.id,
        sessionVersion: 1,
      });
    },
  },

  "seasons.create": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, name: "Spring 2031", startDate: "2031-03-01" }),
    verify: async (w) => {
      const seasons = await db
        .select()
        .from(Season)
        .where(eq(Season.ensembleId, w.a.ensemble.id))
        .all();
      expect(seasons.map((season) => season.name)).toContain("Spring 2031");
    },
  },
  "seasons.update": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      seasonId: w.a.season.id,
      name: "Renamed season",
    }),
    foreign: { seasonId: (w) => w.b.season.id },
    verify: async (w) => expect((await find(Season, w.a.season.id))?.name).toBe("Renamed season"),
  },
  "seasons.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, seasonId: w.a.emptySeason.id }),
    foreign: { seasonId: (w) => w.b.emptySeason.id },
    verify: async (w) => expect(await find(Season, w.a.emptySeason.id)).toBeUndefined(),
  },
  "seasons.toggleMember": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      seasonId: w.a.season.id,
      userId: w.a.member.id,
    }),
    foreign: { seasonId: (w) => w.b.season.id, userId: (w) => w.b.member.id },
    verify: async (w) => {
      const memberships = await db
        .select()
        .from(SeasonMembership)
        .where(eq(SeasonMembership.seasonId, w.a.season.id))
        .all();
      expect(memberships.map((membership) => membership.userId)).toEqual([w.a.member.id]);
    },
  },

  "songs.add": {
    access: "ensembleAdmin",
    fields: songFields,
    foreign: { parts: (w) => [w.b.part.id], seasons: (w) => [w.b.season.id] },
    verify: async (w) => {
      const song = await db.select().from(Song).where(eq(Song.name, "Ave Verum Corpus")).get();
      expect(song?.ensembleId).toBe(w.a.ensemble.id);
      const parts = await db.select().from(SongPart).where(eq(SongPart.songId, song!.id)).all();
      expect(parts.map((part) => part.partId)).toEqual([w.a.part.id]);
    },
  },
  "songs.edit": {
    access: "ensembleAdmin",
    fields: (w) => ({ ...songFields(w), songId: w.a.song.id }),
    foreign: {
      songId: (w) => w.b.song.id,
      parts: (w) => [w.b.part.id],
      seasons: (w) => [w.b.season.id],
    },
    verify: async (w) => expect((await find(Song, w.a.song.id))?.name).toBe("Ave Verum Corpus"),
  },
  "songs.delete": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, songId: w.a.spareSong.id }),
    foreign: { songId: (w) => w.b.spareSong.id },
    verify: async (w) => expect(await find(Song, w.a.spareSong.id)).toBeUndefined(),
  },
  "songs.addFile": {
    access: "ensembleAdmin",
    fields: (w) => ({
      ensembleId: w.a.ensemble.id,
      songId: w.a.song.id,
      fileName: "Recording",
      category: "link",
      fileUrl: "https://example.com/recording",
    }),
    foreign: { songId: (w) => w.b.song.id },
    verify: async (w) => {
      const files = await db.select().from(SongFile).where(eq(SongFile.songId, w.a.song.id)).all();
      expect(files.map((file) => file.name)).toContain("Recording");
    },
  },
  "songs.deleteFile": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, fileId: w.a.songFile.id }),
    foreign: { fileId: (w) => w.b.songFile.id },
    verify: async (w) => expect(await find(SongFile, w.a.songFile.id)).toBeUndefined(),
  },

  "tasks.createTask": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, seasonId: w.a.season.id, title: "Pay dues" }),
    foreign: { seasonId: (w) => w.b.season.id },
    verify: async (w) => {
      const task = await db.select().from(Task).where(eq(Task.title, "Pay dues")).get();
      expect(task).toMatchObject({ ensembleId: w.a.ensemble.id, seasonId: w.a.season.id });
    },
  },
  "tasks.editTask": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, taskId: w.a.task.id, title: "Renamed task" }),
    foreign: { taskId: (w) => w.b.task.id },
    verify: async (w) => expect((await find(Task, w.a.task.id))?.title).toBe("Renamed task"),
  },
  "tasks.deleteTask": {
    access: "ensembleAdmin",
    fields: (w) => ({ ensembleId: w.a.ensemble.id, taskId: w.a.task.id }),
    foreign: { taskId: (w) => w.b.task.id },
    verify: async (w) => expect(await find(Task, w.a.task.id)).toBeUndefined(),
  },
  "tasks.markComplete": {
    access: "ensembleAdmin",
    fields: (w) => ({ taskId: w.a.task.id, userId: w.a.member.id }),
    foreign: { taskId: (w) => w.b.task.id, userId: (w) => w.b.member.id },
    verify: async (w) => {
      const completion = await db
        .select()
        .from(TaskCompletion)
        .where(eq(TaskCompletion.taskId, w.a.task.id))
        .get();
      expect(completion).toMatchObject({ userId: w.a.member.id, completedBy: w.a.admin.id });
    },
  },
  "tasks.markIncomplete": {
    access: "ensembleAdmin",
    fields: async (w) => {
      await db.insert(TaskCompletion).values({
        id: crypto.randomUUID(),
        taskId: w.a.task.id,
        userId: w.a.member.id,
        completedBy: w.a.admin.id,
      });
      return { taskId: w.a.task.id, userId: w.a.member.id };
    },
    foreign: { taskId: (w) => w.b.task.id, userId: (w) => w.b.member.id },
    verify: async (w) => {
      expect(
        await db.select().from(TaskCompletion).where(eq(TaskCompletion.taskId, w.a.task.id)).all(),
      ).toHaveLength(0);
    },
  },
};
