import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, eq, EnsembleMember, Event, EventProgram, Group, MemberPart, SongPart } from "@db";
import { server } from "@actions/index";
import {
  emailAndIpKey,
  failedLoginsByEmail,
  failedLoginsByEmailAndIp,
  failedLoginsByIp,
} from "@lib/rate-limit";
import { readVerifyingBrowser, VERIFY_EMAIL_COOKIE } from "@lib/session";
import { uploadImage, uploadSongFile } from "@lib/storage";
import { INPUT_SCHEMA, isInputError } from "../support/astro-actions.ts";
import { callAction, type Fields } from "../support/actions.ts";
import { matrix, type Access, type MatrixEntry } from "../support/action-matrix.ts";
import { createWorld, WORLD_PASSWORD, type World, type WorldUser } from "../support/world.ts";
import { createTask } from "./fixtures.ts";

vi.mock("@lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/storage")>()),
  uploadSongFile: vi.fn().mockResolvedValue("ensemble/songs/uploaded.pdf"),
  uploadImage: vi.fn().mockResolvedValue("/images/avatars/uploaded.png"),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  deleteStorageFile: vi.fn().mockResolvedValue(undefined),
  getFileStream: vi.fn(),
}));

vi.mock("@lib/email", () => ({
  sendAnnouncementEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeRequestedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAddedToEnsembleEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@lib/discord", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lib/discord")>()),
  postAnnouncementToDiscord: vi.fn().mockResolvedValue({ success: true }),
}));

const actions: Record<string, unknown> = Object.fromEntries(
  Object.entries(server).flatMap(([group, groupActions]) =>
    Object.entries(groupActions).map(([name, action]) => [`${group}.${name}`, action]),
  ),
);

const membershipFieldsFor = (membershipId: string) => ({
  ensembleId: w.a.ensemble.id,
  membershipId,
});

const REJECTED = ["UNAUTHORIZED", "FORBIDDEN"];
const NOT_YOURS = ["NOT_FOUND", "FORBIDDEN"];

let w: World;

beforeEach(async () => {
  w = await createWorld();
});

function defaultCaller(access: Access): WorldUser | null {
  switch (access) {
    case "public":
      return null;
    case "authenticated":
      return w.outsider;
    case "member":
      return w.a.member;
    case "ensembleAdmin":
      return w.a.admin;
    case "siteAdmin":
      return w.siteAdmin;
  }
}

function callerFor(entry: MatrixEntry) {
  return entry.as ? entry.as(w) : defaultCaller(entry.access);
}

/**
 * A rejection only counts if the input was valid: a zod failure would also come back as an
 * error, and would hide a missing permission check behind a typo in the matrix.
 */
async function expectRejected(
  name: string,
  fields: Fields,
  user: WorldUser | null,
  codes: string[],
) {
  const { error } = await callAction(actions[name], fields, { user });
  expect(error, "the action accepted the request").toBeDefined();
  expect(isInputError(error), `input failed validation: ${error?.message}`).toBe(false);
  expect(codes).toContain(error!.code);
}

describe("authorization matrix", () => {
  it("has an entry for every action", () => {
    expect(Object.keys(actions).length).toBeGreaterThan(0);
    expect(Object.keys(matrix).sort()).toEqual(Object.keys(actions).sort());
  });

  it("has a cross-ensemble case for every ID field of an ensemble-scoped action", () => {
    // Checked by a dedicated test below: the IDs are inside a JSON string.
    const coveredElsewhere = ["events.reorderProgramSongs.orderedEntryIds"];
    const missing: string[] = [];
    for (const [name, entry] of Object.entries(matrix)) {
      if (entry.access !== "member" && entry.access !== "ensembleAdmin") continue;
      const schema = Reflect.get(actions[name] as object, INPUT_SCHEMA) as {
        shape: Record<string, unknown>;
      };
      for (const field of Object.keys(schema.shape)) {
        if (!/Ids?$/.test(field) || field === "ensembleId") continue;
        if (!entry.foreign?.[field] && !coveredElsewhere.includes(`${name}.${field}`))
          missing.push(`${name}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  describe.each(Object.entries(matrix))("%s", (name, entry) => {
    it("runs for a permitted caller", async () => {
      const fields = await entry.fields(w);
      const result = await callAction(actions[name], fields, { user: callerFor(entry) });
      expect(result.error).toBeUndefined();
      await entry.verify(w, result);
    });

    const guarded = (applies: boolean) => (applies ? it : () => {});

    guarded(entry.access !== "public")("rejects an unauthenticated caller", async () => {
      await expectRejected(name, await entry.fields(w), null, REJECTED);
    });

    const ensembleScoped = entry.access === "member" || entry.access === "ensembleAdmin";

    guarded(ensembleScoped)("rejects a signed-in user who is not in the ensemble", async () => {
      await expectRejected(name, await entry.fields(w), w.outsider, ["FORBIDDEN"]);
    });

    guarded(ensembleScoped)("rejects a member whose membership is still pending", async () => {
      await expectRejected(name, await entry.fields(w), w.a.pending, ["FORBIDDEN"]);
    });

    guarded(entry.access === "ensembleAdmin")("rejects a regular member", async () => {
      await expectRejected(name, await entry.fields(w), w.a.member, ["FORBIDDEN"]);
    });

    guarded(entry.access === "ensembleAdmin")("rejects the admin of another ensemble", async () => {
      await expectRejected(name, await entry.fields(w), w.b.admin, ["FORBIDDEN"]);
    });

    guarded(entry.access === "siteAdmin")("rejects users who are not site admins", async () => {
      await expectRejected(name, await entry.fields(w), w.outsider, ["FORBIDDEN"]);
      await expectRejected(name, await entry.fields(w), w.a.admin, ["FORBIDDEN"]);
    });

    for (const [field, foreignValue] of Object.entries(entry.foreign ?? {})) {
      it(`rejects a ${field} from another ensemble`, async () => {
        const fields = { ...(await entry.fields(w)), [field]: foreignValue(w) };
        await expectRejected(name, fields, callerFor(entry), NOT_YOURS);
      });
    }
  });
});

describe("site admins", () => {
  it("can run ensemble-admin actions without a membership", async () => {
    const { error } = await callAction(
      actions["groups.create"],
      { ensembleId: w.a.ensemble.id, name: "Octet" },
      { user: w.siteAdmin },
    );
    expect(error).toBeUndefined();
  });

  it("are still held to the ensemble in the form for other IDs", async () => {
    await expectRejected(
      "groups.delete",
      { ensembleId: w.a.ensemble.id, groupId: w.b.group.id },
      w.siteAdmin,
      ["NOT_FOUND"],
    );
    expect(await db.select().from(Group).where(eq(Group.id, w.b.group.id)).get()).toBeDefined();
  });

  it("cannot change their own role or delete themselves", async () => {
    await expectRejected("admin.toggleAdmin", { userId: w.siteAdmin.id }, w.siteAdmin, [
      "BAD_REQUEST",
    ]);
    await expectRejected("admin.deleteUser", { userId: w.siteAdmin.id }, w.siteAdmin, [
      "BAD_REQUEST",
    ]);
  });
});

describe("input validation", () => {
  it("runs submissions through the action schema", async () => {
    const { error } = await callAction(
      actions["groups.create"],
      { ensembleId: w.a.ensemble.id, name: "" },
      { user: w.a.admin },
    );
    expect(isInputError(error)).toBe(true);
    expect(error!.code).toBe("BAD_REQUEST");
  });

  it("coerces and defaults form values", async () => {
    const { error } = await callAction(
      actions["parts.add"],
      { ensembleId: w.a.ensemble.id, name: "Bass", sortOrder: "-1" },
      { user: w.a.admin },
    );
    expect(isInputError(error)).toBe(true);
  });
});

describe("events.checkInByCode", () => {
  it("rejects a user who is not in the ensemble the code belongs to", async () => {
    await expectRejected("events.checkInByCode", { code: w.a.event.checkInCode }, w.outsider, [
      "FORBIDDEN",
    ]);
    await expectRejected("events.checkInByCode", { code: w.a.event.checkInCode }, w.b.member, [
      "FORBIDDEN",
    ]);
    await expectRejected("events.checkInByCode", { code: w.a.event.checkInCode }, w.a.pending, [
      "FORBIDDEN",
    ]);
  });
});

describe("events.reorderProgramSongs", () => {
  it("leaves another ensemble's program entries alone", async () => {
    const { error } = await callAction(
      actions["events.reorderProgramSongs"],
      {
        ensembleId: w.a.ensemble.id,
        eventId: w.a.event.id,
        orderedEntryIds: JSON.stringify([w.a.programEntry.id, w.b.programEntry.id]),
      },
      { user: w.a.admin },
    );
    expect(error).toBeUndefined();
    const foreign = await db
      .select()
      .from(EventProgram)
      .where(eq(EventProgram.id, w.b.programEntry.id))
      .get();
    expect(foreign?.sortOrder).toBe(w.b.programEntry.sortOrder);
  });

  it("rejects order data that is not JSON", async () => {
    await expectRejected(
      "events.reorderProgramSongs",
      { ensembleId: w.a.ensemble.id, eventId: w.a.event.id, orderedEntryIds: "not json" },
      w.a.admin,
      ["BAD_REQUEST"],
    );
  });
});

describe("profile.updateParts", () => {
  it("rejects another member's membership in the same ensemble", async () => {
    await expectRejected(
      "profile.updateParts",
      { membershipId: w.a.adminMembership.id, partIds: [w.a.part.id] },
      w.a.member,
      ["FORBIDDEN"],
    );
    expect(await db.select().from(MemberPart).all()).toHaveLength(0);
  });
});

describe("profile.signOutOtherDevices", () => {
  it("is refused while a site admin is viewing as the user", async () => {
    const { error } = await callAction(
      actions["profile.signOutOtherDevices"],
      {},
      {
        user: w.a.member,
        viewingAs: { realUser: w.siteAdmin },
      },
    );
    expect(error?.code).toBe("FORBIDDEN");
  });
});

describe("profile.deleteAccount", () => {
  it("requires the current password", async () => {
    await expectRejected("profile.deleteAccount", { password: "wrong-password" }, w.outsider, [
      "BAD_REQUEST",
    ]);
  });
});

describe("profile.register", () => {
  it("rejects an email that already has an account", async () => {
    await expectRejected(
      "profile.register",
      { name: "Copycat", email: w.a.member.email, password: "secret-password" },
      null,
      ["CONFLICT"],
    );
  });

  it("treats an email in other casing as the same account", async () => {
    await expectRejected(
      "profile.register",
      { name: "Copycat", email: w.a.member.email.toUpperCase(), password: "secret-password" },
      null,
      ["CONFLICT"],
    );
  });

  it("remembers the browser that registered, for the verification link", async () => {
    const { context } = await callAction(actions["profile.register"], {
      name: "Newcomer",
      email: "Newcomer@test.com",
      password: "secret-password",
    });
    expect(readVerifyingBrowser(context.cookies.get(VERIFY_EMAIL_COOKIE)?.value)).toBe(
      "newcomer@test.com",
    );
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { error } = await callAction(actions["profile.register"], {
      name: "Shorty",
      email: "shorty@test.com",
      password: "1234567",
    });
    expect(isInputError(error)).toBe(true);
  });
});

describe("auth.login", () => {
  beforeEach(() => {
    failedLoginsByIp.reset("127.0.0.1");
  });

  it("rejects a wrong password without starting a session", async () => {
    const { error, context } = await callAction(actions["auth.login"], {
      email: w.a.member.email,
      password: "nope",
    });
    expect(error?.code).toBe("UNAUTHORIZED");
    expect(context.cookies.get("session")).toBeUndefined();
    failedLoginsByEmailAndIp.reset(emailAndIpKey(w.a.member.email, "127.0.0.1"));
    failedLoginsByEmail.reset(w.a.member.email);
  });

  it("never redirects off-site after login", async () => {
    const { data } = await callAction(actions["auth.login"], {
      email: w.a.member.email,
      password: WORLD_PASSWORD,
      redirect: "//evil.example/steal",
    });
    expect(data).toEqual({ redirectUrl: `/ensembles/${w.a.ensemble.id}` });
  });

  it("signs in whatever the email's casing, with a password set before the 8-character minimum", async () => {
    expect(WORLD_PASSWORD.length).toBeLessThan(8);
    const { error, context } = await callAction(actions["auth.login"], {
      email: ` ${w.a.member.email.toUpperCase()} `,
      password: WORLD_PASSWORD,
    });
    expect(error).toBeUndefined();
    expect(context.cookies.get("session")).toBeDefined();
  });

  it("locks an email out on one client after repeated failures", async () => {
    const email = "locked-out@test.com";
    const headers = { "fly-client-ip": "10.0.0.1" };
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error } = await callAction(
        actions["auth.login"],
        { email, password: "nope" },
        { headers },
      );
      if (error?.code === "TOO_MANY_REQUESTS") return;
      expect(error?.code).toBe("UNAUTHORIZED");
    }
    expect.unreachable("login was never rate limited");
  });

  it("does not lock the owner out when someone else fails from another client", async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      await callAction(
        actions["auth.login"],
        { email: w.a.member.email, password: "nope" },
        { headers: { "fly-client-ip": "10.0.1.1" } },
      );
    }
    const blocked = await callAction(
      actions["auth.login"],
      { email: w.a.member.email, password: WORLD_PASSWORD },
      { headers: { "fly-client-ip": "10.0.1.1" } },
    );
    expect(blocked.error?.code).toBe("TOO_MANY_REQUESTS");

    const { error } = await callAction(
      actions["auth.login"],
      { email: w.a.member.email, password: WORLD_PASSWORD },
      { headers: { "fly-client-ip": "10.0.1.2" } },
    );
    expect(error).toBeUndefined();
    failedLoginsByEmail.reset(w.a.member.email);
  });

  it("caps failures against one email across every client", async () => {
    for (let attempt = 0; attempt < 100; attempt++) failedLoginsByEmail.record(w.a.member.email);

    const { error } = await callAction(
      actions["auth.login"],
      { email: w.a.member.email, password: WORLD_PASSWORD },
      { headers: { "fly-client-ip": "10.0.2.1" } },
    );
    expect(error?.code).toBe("TOO_MANY_REQUESTS");
    failedLoginsByEmail.reset(w.a.member.email);
  });
});

describe("auth.resetPassword", () => {
  it("rejects an unknown token", async () => {
    await expectRejected(
      "auth.resetPassword",
      {
        token: "not-a-token",
        password: "brand-new-password",
        confirmPassword: "brand-new-password",
      },
      null,
      ["BAD_REQUEST"],
    );
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { error } = await callAction(actions["auth.resetPassword"], {
      token: "not-a-token",
      password: "1234567",
      confirmPassword: "1234567",
    });
    expect(isInputError(error)).toBe(true);
  });
});

describe("uploads", () => {
  it("stores a song file through the storage module", async () => {
    const { error } = await callAction(
      actions["songs.addFile"],
      {
        ensembleId: w.a.ensemble.id,
        songId: w.a.song.id,
        fileName: "Score",
        category: "sheet_music",
        file: new File([new Uint8Array(8)], "score.pdf", { type: "application/pdf" }),
      },
      { user: w.a.admin },
    );
    expect(error).toBeUndefined();
    expect(vi.mocked(uploadSongFile)).toHaveBeenCalledWith(expect.any(File), w.a.ensemble.id);
  });

  it("stores an ensemble image through the storage module", async () => {
    const { error } = await callAction(
      actions["ensembles.update"],
      {
        ensembleId: w.a.ensemble.id,
        name: "Ensemble A",
        image: new File([new Uint8Array(8)], "logo.png", { type: "image/png" }),
      },
      { user: w.a.admin },
    );
    expect(error).toBeUndefined();
    expect(vi.mocked(uploadImage)).toHaveBeenCalledWith(expect.any(File), "ensembles");
  });
});

describe("pending memberships and link URLs", () => {
  it("rejects admin actions from a membership that is admin but still pending", async () => {
    await db
      .update(EnsembleMember)
      .set({ role: "admin" })
      .where(eq(EnsembleMember.id, w.a.pendingMembership.id));
    await expectRejected(
      "groups.create",
      { ensembleId: w.a.ensemble.id, name: "Octet" },
      w.a.pending,
      ["FORBIDDEN"],
    );
  });

  it("keeps the last admin of an ensemble, even against a site admin", async () => {
    for (const user of [w.a.admin, w.siteAdmin]) {
      for (const name of ["members.demote", "members.remove", "members.reject"]) {
        const { error } = await callAction(
          actions[name],
          membershipFieldsFor(w.a.adminMembership.id),
          { user },
        );
        expect(error?.code).toBe("BAD_REQUEST");
        expect(error?.message).toBe("An ensemble needs at least one admin.");
      }
    }
    const admin = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.id, w.a.adminMembership.id))
      .get();
    expect(admin).toMatchObject({ role: "admin", status: "active" });
  });

  it("refuses to promote a membership that is still pending", async () => {
    await expectRejected(
      "members.promote",
      membershipFieldsFor(w.a.pendingMembership.id),
      w.a.admin,
      ["BAD_REQUEST", "NOT_FOUND"],
    );
  });

  const pendingTargets: [string, (w: World) => Fields][] = [
    [
      "events.addAttendance",
      (world) => ({
        ensembleId: world.a.ensemble.id,
        eventId: world.a.event.id,
        userId: world.a.pending.id,
      }),
    ],
    [
      "groups.toggleMember",
      (world) => ({
        ensembleId: world.a.ensemble.id,
        groupId: world.a.group.id,
        userId: world.a.pending.id,
      }),
    ],
    [
      "seasons.toggleMember",
      (world) => ({
        ensembleId: world.a.ensemble.id,
        seasonId: world.a.season.id,
        userId: world.a.pending.id,
      }),
    ],
    ["tasks.markComplete", (world) => ({ taskId: world.a.task.id, userId: world.a.pending.id })],
  ];
  for (const [name, fields] of pendingTargets) {
    it(`${name} rejects a target user whose membership is still pending`, async () => {
      await expectRejected(name, fields(w), w.a.admin, NOT_YOURS);
    });
  }

  // Ensemble links and the Discord link render as <a href> for every member (EnsembleLinks.astro).
  it("ensembles.addLink rejects a javascript: URL", async () => {
    const { error } = await callAction(
      actions["ensembles.addLink"],
      { ensembleId: w.a.ensemble.id, label: "Click me", url: "javascript:alert(document.domain)" },
      { user: w.a.admin },
    );
    expect(isInputError(error)).toBe(true);
  });

  it("ensembles.update rejects a javascript: Discord link", async () => {
    const { error } = await callAction(
      actions["ensembles.update"],
      {
        ensembleId: w.a.ensemble.id,
        name: "Ensemble A",
        discordLink: "javascript:alert(document.domain)",
      },
      { user: w.a.admin },
    );
    expect(isInputError(error)).toBe(true);
  });
});

describe("deletes with related rows", () => {
  async function expectDeleted(name: string, fields: Fields) {
    const { error } = await callAction(actions[name], fields, { user: w.a.admin });
    expect(error?.code ?? "ok").not.toBe("INTERNAL_SERVER_ERROR");
  }

  it("events.delete handles an event that has attendance and a program", async () => {
    await expectDeleted("events.delete", { ensembleId: w.a.ensemble.id, eventId: w.a.event.id });
  });

  it("songs.delete handles a song that is on an event program", async () => {
    await expectDeleted("songs.delete", { ensembleId: w.a.ensemble.id, songId: w.a.song.id });
  });

  it("parts.delete handles a part that songs use", async () => {
    await db
      .insert(SongPart)
      .values({ id: crypto.randomUUID(), songId: w.a.song.id, partId: w.a.part.id });
    await expectDeleted("parts.delete", { ensembleId: w.a.ensemble.id, partId: w.a.part.id });
  });

  it("groups.delete handles a group that an event is limited to", async () => {
    await db.update(Event).set({ groupId: w.a.group.id }).where(eq(Event.id, w.a.spareEvent.id));
    await expectDeleted("groups.delete", { ensembleId: w.a.ensemble.id, groupId: w.a.group.id });
  });

  it("seasons.delete handles a season that has tasks", async () => {
    await createTask(w.a.ensemble.id, { seasonId: w.a.emptySeason.id });
    await expectDeleted("seasons.delete", {
      ensembleId: w.a.ensemble.id,
      seasonId: w.a.emptySeason.id,
    });
  });
});
