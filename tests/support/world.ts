import { db, eq, User } from "@db";
import { hashPassword } from "@lib/auth";
import {
  createAnnouncement,
  createAttendance,
  createEnsemble,
  createEnsembleLink,
  createEvent,
  createEventProgramEntry,
  createGroup,
  createGroupMembership,
  createInvite,
  createMembership,
  createPart,
  createSeason,
  createSong,
  createSongFile,
  createTask,
} from "../integration/fixtures.ts";

export const WORLD_PASSWORD = "test123";

// bcrypt is slow on purpose; hashing once keeps a per-test world cheap.
let passwordHash: Promise<string> | undefined;

async function createWorldUser(name: string, role: "admin" | "user" = "user") {
  passwordHash ??= hashPassword(WORLD_PASSWORD);
  const id = crypto.randomUUID();
  await db.insert(User).values({
    id,
    name,
    role,
    email: `${name.toLowerCase().replaceAll(" ", "-")}@test.com`,
    passwordHash: await passwordHash,
    emailVerifiedAt: new Date(),
  });
  return (await db.select().from(User).where(eq(User.id, id)).get())!;
}

async function createWorldEnsemble(label: string) {
  const admin = await createWorldUser(`Admin ${label}`);
  const member = await createWorldUser(`Member ${label}`);
  const pending = await createWorldUser(`Pending ${label}`);

  const ensemble = await createEnsemble(admin.id, { name: `Ensemble ${label}` });
  const adminMembership = await createMembership(ensemble.id, admin.id, { role: "admin" });
  const memberMembership = await createMembership(ensemble.id, member.id);
  const pendingMembership = await createMembership(ensemble.id, pending.id, { status: "pending" });

  const season = await createSeason(ensemble.id, { name: `Season ${label}` });
  const emptySeason = await createSeason(ensemble.id, {
    name: `Empty season ${label}`,
    isActive: 0,
  });
  const group = await createGroup(ensemble.id, { name: `Group ${label}` });
  const groupMembership = await createGroupMembership(group.id, member.id);
  const part = await createPart(ensemble.id, { name: `Part ${label}` });
  const song = await createSong(ensemble.id, { name: `Song ${label}` });
  const songFile = await createSongFile(song.id, admin.id, {
    category: "link",
    url: "https://example.com/score",
  });
  const event = await createEvent(ensemble.id, season.id, { title: `Event ${label}` });
  const programEntry = await createEventProgramEntry(event.id, song.id);
  const spareEvent = await createEvent(ensemble.id, season.id, { title: `Spare event ${label}` });
  const spareSong = await createSong(ensemble.id, { name: `Spare song ${label}` });
  const attendance = await createAttendance(event.id, member.id);
  const task = await createTask(ensemble.id, { title: `Task ${label}` });
  const announcement = await createAnnouncement(ensemble.id, admin.id);
  const invite = await createInvite(ensemble.id, admin.id);
  const link = await createEnsembleLink(ensemble.id);

  return {
    ensemble,
    admin,
    member,
    pending,
    adminMembership,
    memberMembership,
    pendingMembership,
    season,
    emptySeason,
    group,
    groupMembership,
    part,
    song,
    songFile,
    event,
    programEntry,
    spareEvent,
    spareSong,
    attendance,
    task,
    announcement,
    invite,
    link,
  };
}

/**
 * Two fully populated ensembles that share nothing, a site admin and a user who belongs to
 * neither. Every permission test is some user from here acting on some record from here.
 */
export async function createWorld() {
  const siteAdmin = await createWorldUser("Site Admin", "admin");
  const outsider = await createWorldUser("Outsider");
  const a = await createWorldEnsemble("A");
  const b = await createWorldEnsemble("B");
  return { siteAdmin, outsider, a, b };
}

export type World = Awaited<ReturnType<typeof createWorld>>;
export type WorldUser = World["outsider"];
