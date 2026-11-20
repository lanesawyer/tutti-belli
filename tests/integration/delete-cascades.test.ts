import { describe, it, expect, vi } from "vitest";
import {
  db,
  eq,
  Announcement,
  Attendance,
  Ensemble,
  EnsembleInvite,
  EnsembleMember,
  Event,
  EventProgram,
  EventRsvp,
  Group,
  GroupMembership,
  MemberPart,
  Part,
  Season,
  SeasonMembership,
  SeasonSong,
  Song,
  SongFile,
  SongPart,
  Task,
  TaskCompletion,
  User,
} from "@db";

vi.mock("../../src/lib/storage.ts", () => ({
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn().mockResolvedValue(undefined),
}));

import { deleteImage, deleteStorageFile } from "../../src/lib/storage.ts";
import { deleteEvent } from "../../src/lib/events.ts";
import { deletePart, removeMember } from "../../src/lib/ensemble.ts";
import { deleteGroup } from "../../src/lib/groups.ts";
import { deleteSong } from "../../src/lib/songs.ts";
import { deleteSeason } from "../../src/lib/seasons.ts";
import { adminDeleteUser, deleteAccount } from "../../src/lib/profile.ts";
import { UserError } from "../../src/lib/errors.ts";
import { getEnsembleAnnouncements } from "../../src/lib/announcements.ts";
import { getSongDetailData } from "../../src/lib/songs.ts";
import {
  createUser,
  createEnsemble,
  createMembership,
  createInvite,
  createSeason,
  createPart,
  createMemberPart,
  createEvent,
  createEventProgramEntry,
  createGroup,
  createGroupMembership,
  createSong,
  createSongFile,
  createSeasonSong,
  createTask,
  createTaskCompletion,
} from "./fixtures.ts";

async function setup() {
  const admin = await createUser({ role: "admin" });
  const member = await createUser();
  const ensemble = await createEnsemble(admin.id);
  const season = await createSeason(ensemble.id);
  return { admin, member, ensemble, season };
}

describe("deleteEvent", () => {
  it("deletes an event that has attendance, RSVPs and a program", async () => {
    const { member, ensemble, season } = await setup();
    const event = await createEvent(ensemble.id, season.id);
    const song = await createSong(ensemble.id);
    await createEventProgramEntry(event.id, song.id);
    await db.insert(Attendance).values({
      id: crypto.randomUUID(),
      eventId: event.id,
      userId: member.id,
      checkedInMethod: "qr",
    });
    await db
      .insert(EventRsvp)
      .values({ id: crypto.randomUUID(), eventId: event.id, userId: member.id, response: "yes" });

    await deleteEvent(event.id);

    expect(await db.select().from(Event).where(eq(Event.id, event.id)).get()).toBeUndefined();
    expect(await db.select().from(Attendance).all()).toHaveLength(0);
    expect(await db.select().from(EventRsvp).all()).toHaveLength(0);
    expect(await db.select().from(EventProgram).all()).toHaveLength(0);
    expect(await db.select().from(Song).where(eq(Song.id, song.id)).get()).toBeDefined();
  });
});

describe("removeMember", () => {
  it("removes a member who has a part assigned", async () => {
    const { member, ensemble } = await setup();
    const membership = await createMembership(ensemble.id, member.id);
    const part = await createPart(ensemble.id);
    await createMemberPart(membership.id, part.id);

    await removeMember(membership.id);

    expect(
      await db.select().from(EnsembleMember).where(eq(EnsembleMember.id, membership.id)).get(),
    ).toBeUndefined();
    expect(await db.select().from(MemberPart).all()).toHaveLength(0);
    expect(await db.select().from(Part).where(eq(Part.id, part.id)).get()).toBeDefined();
  });
});

describe("deletePart", () => {
  it("deletes a part that songs are linked to", async () => {
    const { ensemble } = await setup();
    const part = await createPart(ensemble.id);
    const song = await createSong(ensemble.id);
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId: song.id, partId: part.id });

    expect(await deletePart(part.id, ensemble.id)).toEqual({ ok: true });

    expect(await db.select().from(Part).where(eq(Part.id, part.id)).get()).toBeUndefined();
    expect(await db.select().from(SongPart).all()).toHaveLength(0);
  });
});

describe("deleteGroup", () => {
  it("deletes a group that has members and events, keeping the events for everyone", async () => {
    const { member, ensemble, season } = await setup();
    const group = await createGroup(ensemble.id);
    await createGroupMembership(group.id, member.id);
    const event = await createEvent(ensemble.id, season.id, { groupId: group.id });

    await deleteGroup(group.id);

    expect(await db.select().from(Group).where(eq(Group.id, group.id)).get()).toBeUndefined();
    expect(await db.select().from(GroupMembership).all()).toHaveLength(0);
    const kept = await db.select().from(Event).where(eq(Event.id, event.id)).get();
    expect(kept?.groupId).toBeNull();
  });
});

describe("deleteSong", () => {
  it("deletes a song used in an event program, and its stored files but not its links", async () => {
    const { admin, ensemble, season } = await setup();
    const song = await createSong(ensemble.id);
    const part = await createPart(ensemble.id);
    const event = await createEvent(ensemble.id, season.id);
    await db.insert(SongPart).values({ id: crypto.randomUUID(), songId: song.id, partId: part.id });
    await createSeasonSong(season.id, song.id);
    await createEventProgramEntry(event.id, song.id);
    await createSongFile(song.id, admin.id, {
      url: `${ensemble.id}/songs/score.pdf`,
      category: "sheet_music",
    });
    await createSongFile(song.id, admin.id, {
      url: "https://example.com/recording",
      category: "link",
    });

    await deleteSong(song.id);

    expect(await db.select().from(Song).where(eq(Song.id, song.id)).get()).toBeUndefined();
    expect(await db.select().from(SongPart).all()).toHaveLength(0);
    expect(await db.select().from(SeasonSong).all()).toHaveLength(0);
    expect(await db.select().from(EventProgram).all()).toHaveLength(0);
    expect(await db.select().from(SongFile).all()).toHaveLength(0);
    expect(await db.select().from(Event).where(eq(Event.id, event.id)).get()).toBeDefined();
    expect(deleteStorageFile).toHaveBeenCalledWith(`${ensemble.id}/songs/score.pdf`);
    expect(deleteStorageFile).not.toHaveBeenCalledWith("https://example.com/recording");
  });

  it("does nothing for a song that does not exist", async () => {
    vi.mocked(deleteStorageFile).mockClear();
    await expect(deleteSong("missing-song")).resolves.toBeUndefined();
    expect(deleteStorageFile).not.toHaveBeenCalled();
  });
});

describe("deleteSeason", () => {
  it("deletes a season with members, songs and season tasks", async () => {
    const { admin, member, ensemble, season } = await setup();
    const song = await createSong(ensemble.id);
    await createSeasonSong(season.id, song.id);
    await db
      .insert(SeasonMembership)
      .values({ id: crypto.randomUUID(), seasonId: season.id, userId: member.id });
    const task = await createTask(ensemble.id, { seasonId: season.id });
    await createTaskCompletion(task.id, member.id, admin.id);
    const ensembleWideTask = await createTask(ensemble.id);

    expect(await deleteSeason(season.id)).toEqual({ ok: true });

    expect(await db.select().from(Season).where(eq(Season.id, season.id)).get()).toBeUndefined();
    expect(await db.select().from(SeasonMembership).all()).toHaveLength(0);
    expect(await db.select().from(SeasonSong).all()).toHaveLength(0);
    expect(await db.select().from(Task).where(eq(Task.id, task.id)).get()).toBeUndefined();
    expect(await db.select().from(TaskCompletion).all()).toHaveLength(0);
    expect(
      await db.select().from(Task).where(eq(Task.id, ensembleWideTask.id)).get(),
    ).toBeDefined();
    expect(await db.select().from(Song).where(eq(Song.id, song.id)).get()).toBeDefined();
  });

  it("still refuses to delete a season that has events", async () => {
    const { ensemble, season } = await setup();
    await createEvent(ensemble.id, season.id);
    expect(await deleteSeason(season.id)).toEqual({
      ok: false,
      error: "Cannot delete a season that has rehearsals.",
    });
    expect(await db.select().from(Season).where(eq(Season.id, season.id)).get()).toBeDefined();
  });
});

describe("deleting an account", () => {
  /** A user who has created, authored, or been referenced by something in every user-linked table. */
  async function busyUser() {
    const { admin, ensemble, season } = await setup();
    const user = await createUser({ password: "pw123456" });
    const owned = await createEnsemble(user.id, { name: "Founded by user" });
    const membership = await createMembership(ensemble.id, user.id, { role: "admin" });
    await createMembership(ensemble.id, admin.id, { role: "admin" });
    const part = await createPart(ensemble.id);
    await createMemberPart(membership.id, part.id);
    await createInvite(ensemble.id, user.id);
    const event = await createEvent(ensemble.id, season.id);
    await db.insert(Attendance).values({
      id: crypto.randomUUID(),
      eventId: event.id,
      userId: user.id,
      checkedInMethod: "qr",
    });
    await db
      .insert(EventRsvp)
      .values({ id: crypto.randomUUID(), eventId: event.id, userId: user.id, response: "no" });
    await db
      .insert(SeasonMembership)
      .values({ id: crypto.randomUUID(), seasonId: season.id, userId: user.id });
    const group = await createGroup(ensemble.id);
    await createGroupMembership(group.id, user.id);
    await db.insert(Announcement).values({
      id: crypto.randomUUID(),
      ensembleId: ensemble.id,
      title: "Hello",
      content: "x",
      createdBy: user.id,
    });
    const song = await createSong(ensemble.id);
    await createSongFile(song.id, user.id, { url: "https://example.com/a", category: "link" });
    const task = await createTask(ensemble.id);
    await createTaskCompletion(task.id, user.id, admin.id);
    await createTaskCompletion(task.id, admin.id, user.id);
    await db.update(User).set({ avatarUrl: "/images/avatars/me.png" }).where(eq(User.id, user.id));
    return { user, admin, ensemble, owned, song, task };
  }

  it("adminDeleteUser removes the user and their own records, keeping what they authored", async () => {
    const { user, admin, ensemble, owned, song, task } = await busyUser();

    await adminDeleteUser(user.id);

    expect(await db.select().from(User).where(eq(User.id, user.id)).get()).toBeUndefined();
    expect(
      await db.select().from(EnsembleMember).where(eq(EnsembleMember.userId, user.id)).all(),
    ).toHaveLength(0);
    expect(await db.select().from(MemberPart).all()).toHaveLength(0);
    expect(await db.select().from(Attendance).all()).toHaveLength(0);
    expect(await db.select().from(EventRsvp).all()).toHaveLength(0);
    expect(await db.select().from(SeasonMembership).all()).toHaveLength(0);
    expect(await db.select().from(GroupMembership).all()).toHaveLength(0);
    expect(deleteImage).toHaveBeenCalledWith("/images/avatars/me.png");

    expect(
      (await db.select().from(Ensemble).where(eq(Ensemble.id, owned.id)).get())?.createdBy,
    ).toBeNull();
    expect(
      (
        await db
          .select()
          .from(EnsembleInvite)
          .where(eq(EnsembleInvite.ensembleId, ensemble.id))
          .get()
      )?.createdBy,
    ).toBeNull();
    expect(
      (await db.select().from(SongFile).where(eq(SongFile.songId, song.id)).get())?.uploadedBy,
    ).toBeNull();
    const completions = await db
      .select()
      .from(TaskCompletion)
      .where(eq(TaskCompletion.taskId, task.id))
      .all();
    expect(completions).toEqual([expect.objectContaining({ userId: admin.id, completedBy: null })]);

    const announcements = await getEnsembleAnnouncements(ensemble.id);
    expect(announcements).toEqual([expect.objectContaining({ title: "Hello", creatorName: null })]);
    const songDetail = await getSongDetailData(ensemble.id, song.id);
    expect(songDetail.songFiles).toEqual([expect.objectContaining({ uploaderName: null })]);
  });

  it("refuses to delete the only admin of an ensemble until someone else is one", async () => {
    const { admin, ensemble } = await setup();
    const user = await createUser({ password: "pw123456" });
    await createMembership(ensemble.id, user.id, { role: "admin" });
    await createMembership(ensemble.id, admin.id);

    expect(await deleteAccount(user.id, "user", "pw123456")).toMatchObject({ type: "error" });
    await expect(adminDeleteUser(user.id)).rejects.toThrow(UserError);
    expect(await db.select().from(User).where(eq(User.id, user.id)).get()).toBeDefined();

    await createMembership(ensemble.id, (await createUser()).id, { role: "admin" });
    await adminDeleteUser(user.id);
    expect(await db.select().from(User).where(eq(User.id, user.id)).get()).toBeUndefined();
  });

  it("deleteAccount lets a busy user delete their own account", async () => {
    const { user } = await busyUser();
    expect(await deleteAccount(user.id, "user", "pw123456")).toEqual({
      type: "redirect",
      url: "/",
    });
    expect(await db.select().from(User).where(eq(User.id, user.id)).get()).toBeUndefined();
  });
});
