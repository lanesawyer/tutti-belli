/**
 * Migration 0004 rebuilds every table with a foreign key, removes orphans and duplicates, and adds
 * unique indexes. These tests run it the way a deploy does (drizzle's migrate() on a database at
 * 0003) against rows covering every foreign key, plus seeded duplicates and orphans.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const MIGRATIONS = path.resolve("drizzle");
const TARGET = "0004_delete_rules_unique_indexes";

type Row = Record<string, unknown>;

let dir: string;
let client: Client;

/** A copy of the migrations folder that stops at the one before 0004. */
function migrationsBefore0004(): string {
  const folder = path.join(dir, "drizzle");
  mkdirSync(path.join(folder, "meta"), { recursive: true });
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8"));
  const index = journal.entries.findIndex((e: { tag: string }) => e.tag === TARGET);
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index);
  for (const entry of journal.entries) {
    copyFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
  }
  writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify(journal));
  return folder;
}

async function rows(table: string): Promise<Row[]> {
  const result = await client.execute(`SELECT * FROM "${table}" ORDER BY "id"`);
  return result.rows.map((r) => Object.fromEntries(result.columns.map((c) => [c, r[c]])));
}

async function tables(): Promise<string[]> {
  const result = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
  );
  return result.rows.map((r) => String(r.name));
}

async function columns(table: string) {
  return (
    await client.execute(
      `SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`,
    )
  ).rows.map((r) => ({
    name: r.name,
    type: r.type,
    notnull: r.notnull,
    dflt_value: r.dflt_value,
    pk: r.pk,
  }));
}

async function snapshot() {
  const data: Record<string, Row[]> = {};
  for (const table of await tables()) data[table] = await rows(table);
  return data;
}

async function insert(table: string, row: Row) {
  const keys = Object.keys(row);
  await client.execute({
    sql: `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    args: keys.map((k) => row[k] as string | number | null),
  });
}

const GHOST_USER = "ghost-user";

/**
 * One or more rows in every table, exercising every foreign key, with both stored date formats
 * (CURRENT_TIMESTAMP's "YYYY-MM-DD HH:MM:SS" and ISO-8601). The duplicates are ordered so that
 * comparing the dates as text would keep the wrong row.
 */
async function seed() {
  await client.execute("PRAGMA foreign_keys = OFF");

  for (const id of ["U1", "U2", "U3"]) {
    await insert("User", {
      id,
      email: `${id}@test.com`,
      passwordHash: "x",
      name: `User ${id}`,
      role: id === "U1" ? "admin" : "user",
    });
  }
  await insert("Ensemble", {
    id: "E1",
    name: "Choir",
    slug: "choir",
    createdBy: "U1",
    codeOfConduct: "Be kind",
    createdAt: "2025-12-01 10:00:00",
  });
  await insert("Ensemble", { id: "E2", name: "Orphaned founder", createdBy: GHOST_USER });

  await insert("EnsembleMember", {
    id: "M1",
    ensembleId: "E1",
    userId: "U1",
    role: "admin",
    status: "active",
  });
  await insert("EnsembleMember", {
    id: "M2",
    ensembleId: "E1",
    userId: "U2",
    status: "pending",
    joinedAt: "2026-01-01 09:00:00",
  });
  await insert("EnsembleMember", {
    id: "M2b",
    ensembleId: "E1",
    userId: "U2",
    status: "active",
    joinedAt: "2026-01-02T00:00:00.000Z",
  });
  await insert("EnsembleMember", {
    id: "M3",
    ensembleId: "ghost-ensemble",
    userId: "U3",
    status: "active",
  });

  await insert("Part", { id: "P1", ensembleId: "E1", name: "Soprano", sortOrder: 1 });
  await insert("MemberPart", { id: "MP1", membershipId: "M2", partId: "P1" });
  await insert("MemberPart", { id: "MP2", membershipId: "M2b", partId: "P1" });
  await insert("MemberPart", { id: "MP3", membershipId: "M3", partId: "P1" });

  await insert("EnsembleInvite", {
    id: "I1",
    ensembleId: "E1",
    code: "CODE1",
    createdBy: "U1",
    expiresAt: "2027-01-01T00:00:00.000Z",
  });
  await insert("EnsembleInvite", {
    id: "I2",
    ensembleId: "E1",
    code: "CODE2",
    createdBy: GHOST_USER,
  });
  await insert("EnsembleLink", {
    id: "L1",
    ensembleId: "E1",
    label: "Site",
    url: "https://example.com",
    sortOrder: 2,
  });

  await insert("Season", {
    id: "S1",
    ensembleId: "E1",
    name: "Fall",
    startDate: "2026-09-01T00:00:00.000Z",
    isActive: 1,
  });
  await insert("SeasonMembership", {
    id: "SM1",
    seasonId: "S1",
    userId: "U2",
    joinedAt: "2026-01-02 12:00:00",
  });
  await insert("SeasonMembership", {
    id: "SM2",
    seasonId: "S1",
    userId: "U2",
    joinedAt: "2026-01-02T08:00:00.000Z",
  });

  await insert("Group", {
    id: "G1",
    ensembleId: "E1",
    name: "Sopranos",
    description: "High",
    color: "primary",
  });
  await insert("GroupMembership", {
    id: "GM1",
    groupId: "G1",
    userId: "U2",
    role: null,
    addedAt: "2026-01-01 00:00:00",
  });
  await insert("GroupMembership", {
    id: "GM2",
    groupId: "G1",
    userId: "U2",
    role: "lead",
    addedAt: "2026-01-05 00:00:00",
  });

  const event = {
    ensembleId: "E1",
    seasonId: "S1",
    title: "Rehearsal",
    scheduledAt: "2026-02-01T18:00:00.000Z",
  };
  await insert("Event", {
    ...event,
    id: "EV1",
    checkInCode: "EV1CODE",
    groupId: "G1",
    rsvpEnabled: 1,
    location: "Hall",
    durationMinutes: 120,
    category: "performance",
  });
  await insert("Event", { ...event, id: "EV2", checkInCode: "EV2CODE", groupId: "ghost-group" });
  await insert("Event", { ...event, id: "EV3", checkInCode: "EV3CODE", seasonId: "ghost-season" });

  await insert("Attendance", {
    id: "A1",
    eventId: "EV1",
    userId: "U2",
    checkedInAt: "2026-02-01 18:05:00",
    checkedInMethod: "qr",
  });
  await insert("Attendance", {
    id: "A2",
    eventId: "EV1",
    userId: "U2",
    checkedInAt: "2026-02-01T18:01:00.000Z",
    checkedInMethod: "manual",
  });
  await insert("Attendance", { id: "A3", eventId: "EV1", userId: "U3", checkedInMethod: "admin" });
  await insert("Attendance", { id: "A4", eventId: "EV3", userId: "U2", checkedInMethod: "qr" });
  await insert("Attendance", {
    id: "A5",
    eventId: "ghost-event",
    userId: "U2",
    checkedInMethod: "qr",
  });

  await insert("EventRsvp", {
    id: "R1",
    eventId: "EV1",
    userId: "U2",
    response: "yes",
    respondedAt: "2026-01-10 10:00:00",
  });
  await insert("EventRsvp", {
    id: "R2",
    eventId: "EV1",
    userId: "U2",
    response: "no",
    respondedAt: "2026-01-10T09:00:00.000Z",
  });
  await insert("EventRsvp", { id: "R3", eventId: "EV1", userId: GHOST_USER, response: "yes" });

  await insert("Announcement", {
    id: "AN1",
    ensembleId: "E1",
    title: "Hi",
    content: "Hello",
    createdBy: "U1",
  });
  await insert("Announcement", {
    id: "AN2",
    ensembleId: "E1",
    title: "Old",
    content: "Gone",
    createdBy: GHOST_USER,
  });

  await insert("Song", {
    id: "SO1",
    ensembleId: "E1",
    name: "Ave",
    composer: "Someone",
    runTime: 185,
  });
  await insert("SongPart", { id: "SP1", songId: "SO1", partId: "P1" });
  await insert("SongPart", { id: "SP2", songId: "SO1", partId: "P1" });
  await insert("SeasonSong", {
    id: "SS1",
    seasonId: "S1",
    songId: "SO1",
    addedAt: "2026-01-01 00:00:00",
  });
  await insert("SeasonSong", {
    id: "SS2",
    seasonId: "S1",
    songId: "SO1",
    addedAt: "2026-01-01 00:00:00",
  });
  await insert("SongFile", {
    id: "F1",
    songId: "SO1",
    name: "Score",
    url: "E1/songs/score.pdf",
    category: "sheet_music",
    uploadedBy: "U1",
  });
  await insert("SongFile", {
    id: "F2",
    songId: "SO1",
    name: "Video",
    url: "https://example.com/v",
    category: "link",
    uploadedBy: GHOST_USER,
  });
  await insert("SongFile", {
    id: "F3",
    songId: "ghost-song",
    name: "Lost",
    url: "E1/songs/lost.pdf",
    uploadedBy: "U1",
  });

  await insert("EventProgram", {
    id: "EP1",
    eventId: "EV1",
    type: "song",
    songId: "SO1",
    sortOrder: 1,
    length: 5,
    notes: "Slow",
  });
  await insert("EventProgram", {
    id: "EP2",
    eventId: "EV1",
    type: "break",
    label: "Tea",
    sortOrder: 2,
  });
  await insert("EventProgram", {
    id: "EP3",
    eventId: "EV1",
    type: "song",
    songId: "ghost-song",
    sortOrder: 3,
  });

  const token = { expiresAt: "2026-12-01T00:00:00.000Z" };
  await insert("PasswordResetToken", { ...token, id: "PRT1", userId: "U1", token: "prt1" });
  await insert("PasswordResetToken", { ...token, id: "PRT2", userId: GHOST_USER, token: "prt2" });
  await insert("EmailChangeToken", {
    ...token,
    id: "ECT1",
    userId: "U2",
    token: "ect1",
    newEmail: "new@test.com",
    usedAt: "2026-01-01T00:00:00.000Z",
  });
  await insert("EmailVerificationToken", { ...token, id: "EVT1", userId: "U3", token: "evt1" });

  await insert("SiteBanner", { id: "B1", message: "Welcome", color: "info", isActive: 1 });

  await insert("Task", {
    id: "T1",
    ensembleId: "E1",
    seasonId: "S1",
    title: "Pay dues",
    sortOrder: 1,
  });
  await insert("Task", { id: "T2", ensembleId: "E1", seasonId: null, title: "Sign form" });
  await insert("Task", {
    id: "T3",
    ensembleId: "E1",
    seasonId: "ghost-season",
    title: "Old season task",
  });
  await insert("TaskCompletion", {
    id: "TC1",
    taskId: "T1",
    userId: "U2",
    completedBy: "U1",
    completedAt: "2026-03-01 10:00:00",
  });
  await insert("TaskCompletion", {
    id: "TC2",
    taskId: "T1",
    userId: "U2",
    completedBy: "U2",
    completedAt: "2026-03-01T09:00:00.000Z",
  });
  await insert("TaskCompletion", {
    id: "TC3",
    taskId: "T2",
    userId: "U3",
    completedBy: GHOST_USER,
  });
  await insert("TaskCompletion", { id: "TC4", taskId: "T3", userId: "U2", completedBy: "U1" });

  await client.execute("PRAGMA foreign_keys = ON");
}

/** Rows the migration must remove: orphans (and their children), then the losing duplicates. */
const REMOVED: Record<string, string[]> = {
  EnsembleMember: ["M2", "M3"],
  MemberPart: ["MP2", "MP3"],
  SeasonMembership: ["SM1"],
  GroupMembership: ["GM1"],
  Event: ["EV3"],
  Attendance: ["A1", "A4", "A5"],
  EventRsvp: ["R2", "R3"],
  SongPart: ["SP2"],
  SeasonSong: ["SS2"],
  SongFile: ["F3"],
  EventProgram: ["EP3"],
  PasswordResetToken: ["PRT2"],
  Task: ["T3"],
  TaskCompletion: ["TC1", "TC4"],
};

/** Column values the migration must change; everything else must be byte-for-byte the same. */
const CHANGED: Record<string, Record<string, Row>> = {
  Ensemble: { E2: { createdBy: null } },
  EnsembleInvite: { I2: { createdBy: null } },
  Announcement: { AN2: { createdBy: null } },
  SongFile: { F2: { uploadedBy: null } },
  TaskCompletion: { TC3: { completedBy: null } },
  Event: { EV2: { groupId: null } },
  MemberPart: { MP1: { membershipId: "M2b" } },
};

const NOW_NULLABLE = [
  "Ensemble.createdBy",
  "EnsembleInvite.createdBy",
  "Announcement.createdBy",
  "SongFile.uploadedBy",
  "TaskCompletion.completedBy",
];

const FK_RULES: Record<string, string> = {
  "Ensemble.createdBy": "SET NULL",
  "EnsembleMember.ensembleId": "CASCADE",
  "EnsembleMember.userId": "CASCADE",
  "Part.ensembleId": "CASCADE",
  "MemberPart.membershipId": "CASCADE",
  "MemberPart.partId": "CASCADE",
  "EnsembleInvite.ensembleId": "CASCADE",
  "EnsembleInvite.createdBy": "SET NULL",
  "Season.ensembleId": "CASCADE",
  "SeasonMembership.seasonId": "CASCADE",
  "SeasonMembership.userId": "CASCADE",
  "Group.ensembleId": "CASCADE",
  "GroupMembership.groupId": "CASCADE",
  "GroupMembership.userId": "CASCADE",
  "Event.ensembleId": "CASCADE",
  "Event.seasonId": "NO ACTION",
  "Event.groupId": "SET NULL",
  "Attendance.eventId": "CASCADE",
  "Attendance.userId": "CASCADE",
  "EventRsvp.eventId": "CASCADE",
  "EventRsvp.userId": "CASCADE",
  "Announcement.ensembleId": "CASCADE",
  "Announcement.createdBy": "SET NULL",
  "Song.ensembleId": "CASCADE",
  "SongPart.songId": "CASCADE",
  "SongPart.partId": "CASCADE",
  "SeasonSong.seasonId": "CASCADE",
  "SeasonSong.songId": "CASCADE",
  "SongFile.songId": "CASCADE",
  "SongFile.uploadedBy": "SET NULL",
  "EventProgram.eventId": "CASCADE",
  "EventProgram.songId": "CASCADE",
  "EnsembleLink.ensembleId": "CASCADE",
  "PasswordResetToken.userId": "CASCADE",
  "EmailChangeToken.userId": "CASCADE",
  "EmailVerificationToken.userId": "CASCADE",
  "Task.ensembleId": "CASCADE",
  "Task.seasonId": "CASCADE",
  "TaskCompletion.taskId": "CASCADE",
  "TaskCompletion.userId": "CASCADE",
  "TaskCompletion.completedBy": "SET NULL",
};

const UNIQUE_PAIRS: Record<string, string[]> = {
  EnsembleMember_ensembleId_userId_unique: ["ensembleId", "userId"],
  MemberPart_membershipId_partId_unique: ["membershipId", "partId"],
  SeasonMembership_seasonId_userId_unique: ["seasonId", "userId"],
  GroupMembership_groupId_userId_unique: ["groupId", "userId"],
  Attendance_eventId_userId_unique: ["eventId", "userId"],
  EventRsvp_eventId_userId_unique: ["eventId", "userId"],
  SongPart_songId_partId_unique: ["songId", "partId"],
  SeasonSong_seasonId_songId_unique: ["seasonId", "songId"],
  TaskCompletion_taskId_userId_unique: ["taskId", "userId"],
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tutti-migration-"));
  client = createClient({ url: `file:${path.join(dir, "test.db")}` });
  await migrate(drizzle(client), { migrationsFolder: migrationsBefore0004() });
  await seed();
});

afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("migration 0004", () => {
  it("keeps every row and column except the orphans and duplicates it is meant to resolve", async () => {
    const before = await snapshot();
    const columnsBefore = Object.fromEntries(
      await Promise.all((await tables()).map(async (t) => [t, await columns(t)])),
    );

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    const after = await snapshot();
    expect(Object.keys(after)).toEqual(Object.keys(before));
    for (const table of Object.keys(before)) {
      const removed = REMOVED[table] ?? [];
      const expected = before[table]
        .filter((row) => !removed.includes(String(row.id)))
        .map((row) => ({ ...row, ...CHANGED[table]?.[String(row.id)] }));
      expect(after[table], table).toEqual(expected);
      expect(after[table].length, table).toBeGreaterThan(0);

      const expectedColumns = columnsBefore[table].map((c: Row) =>
        NOW_NULLABLE.includes(`${table}.${c.name}`) ? { ...c, notnull: 0 } : c,
      );
      expect(await columns(table), table).toEqual(expectedColumns);
    }

    expect((await client.execute("SELECT * FROM pragma_foreign_key_check")).rows).toEqual([]);
    expect((await client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys).toBe(1);
  });

  it("gives every foreign key its ON DELETE rule and adds the unique indexes", async () => {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    const rules: Record<string, string> = {};
    for (const table of await tables()) {
      const fks = await client.execute(
        `SELECT "from", "on_delete" FROM pragma_foreign_key_list('${table}')`,
      );
      for (const fk of fks.rows) rules[`${table}.${fk.from}`] = String(fk.on_delete);
    }
    expect(rules).toEqual(FK_RULES);

    for (const [name, cols] of Object.entries(UNIQUE_PAIRS)) {
      const info = await client.execute(
        `SELECT name FROM pragma_index_info('${name}') ORDER BY seqno`,
      );
      expect(
        info.rows.map((r) => r.name),
        name,
      ).toEqual(cols);
    }
    const leftovers = await client.execute(
      "SELECT name FROM sqlite_schema WHERE name LIKE '\\_\\_%' ESCAPE '\\' AND name != '__drizzle_migrations'",
    );
    expect(leftovers.rows).toEqual([]);
  });

  it("leaves the new schema enforcing what the app relies on", async () => {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    await expect(
      insert("Attendance", { id: "A9", eventId: "EV1", userId: "U2", checkedInMethod: "qr" }),
    ).rejects.toThrow(/UNIQUE/);
    await expect(client.execute("DELETE FROM Season WHERE id = 'S1'")).rejects.toThrow(
      /FOREIGN KEY/,
    );

    await client.execute("DELETE FROM \"Group\" WHERE id = 'G1'");
    expect(
      (await client.execute("SELECT groupId FROM Event WHERE id = 'EV1'")).rows[0].groupId,
    ).toBeNull();

    await client.execute("DELETE FROM Ensemble WHERE id = 'E1'");
    for (const table of [
      "EnsembleMember",
      "Event",
      "Attendance",
      "Season",
      "Song",
      "SongFile",
      "Task",
      "TaskCompletion",
      "MemberPart",
    ]) {
      expect((await rows(table)).length, table).toBe(0);
    }
    expect((await client.execute("SELECT * FROM pragma_foreign_key_check")).rows).toEqual([]);
  });

  it("aborts and changes nothing if foreign keys are enforced while it runs", async () => {
    const before = await snapshot();
    const schemaBefore = (await client.execute("SELECT sql FROM sqlite_schema ORDER BY name")).rows;
    const migration = readMigrationFiles({ migrationsFolder: MIGRATIONS }).find((m) =>
      m.sql.join("").includes("__fk_guard_parent"),
    );
    expect(migration).toBeDefined();

    // client.batch() runs the statements in one transaction without turning enforcement off,
    // unlike client.migrate(), which drizzle's migrator uses.
    expect((await client.execute("PRAGMA foreign_keys")).rows[0].foreign_keys).toBe(1);
    const guardInsert = migration!.sql.findIndex((stmt) =>
      stmt.includes("INSERT INTO `__fk_guard_child`"),
    );
    await expect(client.batch(migration!.sql)).rejects.toMatchObject({
      message: expect.stringMatching(/FOREIGN KEY constraint failed/),
      statementIndex: guardInsert,
    });

    expect(await snapshot()).toEqual(before);
    expect((await client.execute("SELECT sql FROM sqlite_schema ORDER BY name")).rows).toEqual(
      schemaBefore,
    );
  });

  it("runs on a database with no orphans or duplicates", async () => {
    await client.execute("PRAGMA foreign_keys = OFF");
    for (const [table, ids] of Object.entries(REMOVED)) {
      await client.execute({
        sql: `DELETE FROM "${table}" WHERE id IN (${ids.map(() => "?").join(", ")})`,
        args: ids,
      });
    }
    for (const [table, byId] of Object.entries(CHANGED)) {
      if (table === "MemberPart") continue;
      for (const id of Object.keys(byId))
        await client.execute({ sql: `DELETE FROM "${table}" WHERE id = ?`, args: [id] });
    }
    await client.execute("UPDATE MemberPart SET membershipId = 'M2b' WHERE id = 'MP1'");
    await client.execute("PRAGMA foreign_keys = ON");
    expect((await client.execute("SELECT * FROM pragma_foreign_key_check")).rows).toEqual([]);
    const before = await snapshot();

    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });

    expect(await snapshot()).toEqual(before);
  });
});
