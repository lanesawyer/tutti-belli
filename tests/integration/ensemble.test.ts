import { describe, it, expect } from "vitest";
import {
  getEnsembleAccess,
  getEnsembleBySlugOrId,
  loadEnsemblePage,
  updateEnsemble,
  getEnsembleByInviteCode,
  removeMember,
  setMemberRole,
} from "../../src/lib/ensemble.ts";
import { db, Ensemble, EnsembleMember, eq } from "@db";
import { findUniqueSlug } from "../../src/lib/slug.ts";
import { getAllEnsembles, getAllUsers, getSiteAdminIds } from "../../src/lib/admin.ts";
import { createUser, createEnsemble, createInvite, createMembership } from "./fixtures.ts";

describe("getEnsembleBySlugOrId", () => {
  it("returns an ensemble when looked up by UUID id", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id, { name: "String Quartet" });

    const result = await getEnsembleBySlugOrId(ensemble!.id);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("String Quartet");
  });

  it("returns an ensemble when looked up by slug", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id, {
      name: "Chamber Choir",
      slug: "chamber-choir",
    });

    const result = await getEnsembleBySlugOrId("chamber-choir");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(ensemble!.id);
  });

  it("returns null for an unknown id or slug", async () => {
    const result = await getEnsembleBySlugOrId("nonexistent-slug-or-id");
    expect(result).toBeNull();
  });

  it("returns the correct ensemble when multiple exist", async () => {
    const admin = await createUser({ role: "admin" });
    await createEnsemble(admin!.id, { name: "Ensemble One", slug: "ensemble-one" });
    await createEnsemble(admin!.id, { name: "Ensemble Two", slug: "ensemble-two" });

    const result = await getEnsembleBySlugOrId("ensemble-two");
    expect(result!.name).toBe("Ensemble Two");
  });
});

describe("findUniqueSlug", () => {
  it("returns the generated slug when it is not already taken", async () => {
    const uuid = crypto.randomUUID();

    const slug = await findUniqueSlug("My Ensemble", uuid);
    expect(slug).toBe("my-ensemble");
  });

  it("returns the uuid when the slug is already taken", async () => {
    const admin = await createUser({ role: "admin" });
    // Create an ensemble with the slug that would be generated
    await createEnsemble(admin!.id, { slug: "my-ensemble" });

    const uuid = crypto.randomUUID();
    const slug = await findUniqueSlug("My Ensemble", uuid);
    expect(slug).toBe(uuid);
  });

  it("returns the uuid when the generated slug would be empty", async () => {
    const uuid = crypto.randomUUID();
    const slug = await findUniqueSlug("!!!", uuid);
    expect(slug).toBe(uuid);
  });
});

describe("updateEnsemble", () => {
  const fields = {
    name: "Renamed",
    slug: null,
    description: null,
    discordLink: null,
    discordWebhookUrl: null,
    codeOfConduct: null,
    checkInStartMinutes: 30,
    checkInEndMinutes: 15,
  };

  it("keeps the stored image when imageUrl is left out", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    await db
      .update(Ensemble)
      .set({ imageUrl: "data:image/png;base64,AAAA" })
      .where(eq(Ensemble.id, ensemble!.id));

    await updateEnsemble(ensemble!.id, fields);

    const after = await db.select().from(Ensemble).where(eq(Ensemble.id, ensemble!.id)).get();
    expect(after!.name).toBe("Renamed");
    expect(after!.imageUrl).toBe("data:image/png;base64,AAAA");
  });

  it("clears the image when imageUrl is null", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    await db
      .update(Ensemble)
      .set({ imageUrl: "data:image/png;base64,AAAA" })
      .where(eq(Ensemble.id, ensemble!.id));

    await updateEnsemble(ensemble!.id, { ...fields, imageUrl: null });

    const after = await db.select().from(Ensemble).where(eq(Ensemble.id, ensemble!.id)).get();
    expect(after!.imageUrl).toBeNull();
  });
});

describe("getEnsembleAccess", () => {
  it("lets active members in, as admins only when they are ensemble admins", async () => {
    const owner = await createUser();
    const member = await createUser();
    const ensemble = await createEnsemble(owner!.id);
    await createMembership(ensemble!.id, owner!.id, { role: "admin" });
    await createMembership(ensemble!.id, member!.id);

    expect((await getEnsembleAccess(owner!, ensemble!.id))?.isAdmin).toBe(true);
    expect((await getEnsembleAccess(member!, ensemble!.id))?.isAdmin).toBe(false);
  });

  it("keeps out users who are not members", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const ensemble = await createEnsemble(owner!.id);

    expect(await getEnsembleAccess(outsider!, ensemble!.id)).toBeNull();
  });

  it("keeps out pending members unless the page allows them", async () => {
    const owner = await createUser();
    const pending = await createUser();
    const ensemble = await createEnsemble(owner!.id);
    await createMembership(ensemble!.id, pending!.id, { status: "pending" });

    expect(await getEnsembleAccess(pending!, ensemble!.id)).toBeNull();
    const access = await getEnsembleAccess(pending!, ensemble!.id, { allowPending: true });
    expect(access?.membership?.status).toBe("pending");
    expect(access?.isAdmin).toBe(false);
  });

  it("lets site admins into any ensemble", async () => {
    const owner = await createUser();
    const siteAdmin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(owner!.id);

    const access = await getEnsembleAccess(siteAdmin!, ensemble!.id);
    expect(access?.membership).toBeNull();
    expect(access?.isAdmin).toBe(true);
  });
});

describe("loadEnsemblePage", () => {
  async function setup() {
    const admin = await createUser();
    const member = await createUser();
    const pending = await createUser();
    const outsider = await createUser();
    const siteAdmin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin.id, { slug: "page-choir" });
    await createMembership(ensemble.id, admin.id, { role: "admin" });
    await createMembership(ensemble.id, member.id);
    await createMembership(ensemble.id, pending.id, { status: "pending" });
    return { admin, member, pending, outsider, siteAdmin, ensemble };
  }

  const get = (id: string | undefined, pathname = `/ensembles/${id}/songs`) => ({
    id,
    method: "GET",
    pathname,
  });

  function expectRedirect(page: { response?: Response }, location: string, status = 302) {
    expect(page.response?.status).toBe(status);
    expect(page.response?.headers.get("Location")).toBe(location);
  }

  it("sends an unknown or missing ensemble to /ensembles", async () => {
    const { admin } = await setup();
    expectRedirect(await loadEnsemblePage(admin, get("no-such-ensemble")), "/ensembles");
    expectRedirect(await loadEnsemblePage(admin, get(undefined)), "/ensembles");
  });

  it("sends non-members to /ensembles, the same answer as for a missing ensemble", async () => {
    const { outsider } = await setup();
    expectRedirect(await loadEnsemblePage(outsider, get("page-choir")), "/ensembles");
  });

  it("keeps out pending members unless the page allows them", async () => {
    const { pending } = await setup();
    expectRedirect(await loadEnsemblePage(pending, get("page-choir")), "/ensembles");

    const page = await loadEnsemblePage(pending, get("page-choir"), { allowPending: true });
    if (page.response) throw new Error("expected the page to load");
    expect(page.membership?.status).toBe("pending");
    expect(page.isAdmin).toBe(false);
  });

  it("lets members see a page, but answers 403 on an admin-only one", async () => {
    const { member, ensemble } = await setup();
    const page = await loadEnsemblePage(member, get("page-choir"));
    if (page.response) throw new Error("expected the page to load");
    expect(page.ensemble.id).toBe(ensemble.id);
    expect(page.canonicalId).toBe("page-choir");
    expect(page.isAdmin).toBe(false);

    const adminPage = await loadEnsemblePage(member, get("page-choir"), { adminOnly: true });
    expect(adminPage.response?.status).toBe(403);
    expect(await adminPage.response?.text()).toBe("Unauthorized");
  });

  it("lets ensemble admins and site admins without a membership onto admin-only pages", async () => {
    const { admin, siteAdmin } = await setup();
    const adminPage = await loadEnsemblePage(admin, get("page-choir"), { adminOnly: true });
    if (adminPage.response) throw new Error("expected the page to load");
    expect(adminPage.isAdmin).toBe(true);

    const sitePage = await loadEnsemblePage(siteAdmin, get("page-choir"), { adminOnly: true });
    if (sitePage.response) throw new Error("expected the page to load");
    expect(sitePage.isAdmin).toBe(true);
    expect(sitePage.membership).toBeNull();
  });

  it("redirects a GET by id to the slug URL, keeping the rest of the path", async () => {
    const { member, ensemble } = await setup();
    expectRedirect(
      await loadEnsemblePage(member, get(ensemble.id, `/ensembles/${ensemble.id}/songs/s1`)),
      "/ensembles/page-choir/songs/s1",
      301,
    );
  });

  it("loads a POST by id without redirecting, so the action result isn't lost", async () => {
    const { member, ensemble } = await setup();
    const page = await loadEnsemblePage(member, {
      id: ensemble.id,
      method: "POST",
      pathname: `/ensembles/${ensemble.id}/songs`,
    });
    if (page.response) throw new Error("expected the page to load");
    expect(page.canonicalId).toBe("page-choir");
  });

  it("uses the id as the canonical URL for an ensemble without a slug", async () => {
    const { member } = await setup();
    const plain = await createEnsemble(member.id);
    await createMembership(plain.id, member.id);
    const page = await loadEnsemblePage(member, get(plain.id));
    if (page.response) throw new Error("expected the page to load");
    expect(page.canonicalId).toBe(plain.id);
  });

  it("checks access before revealing the canonical URL", async () => {
    const { outsider, ensemble } = await setup();
    expectRedirect(await loadEnsemblePage(outsider, get(ensemble.id)), "/ensembles");
  });
});

describe("getEnsembleByInviteCode", () => {
  it("finds the ensemble for a code in any letter case, and null for an unknown code", async () => {
    const user = await createUser();
    const ensemble = await createEnsemble(user.id);
    await createInvite(ensemble.id, user.id, { code: "JOINME12" });

    expect((await getEnsembleByInviteCode("joinme12"))?.id).toBe(ensemble.id);
    expect(await getEnsembleByInviteCode("NOPE0000")).toBeNull();
  });
});

describe("site admin lists", () => {
  it("lists every ensemble and user, and which users are site admins", async () => {
    const admin = await createUser({ role: "admin" });
    const user = await createUser();
    const ensemble = await createEnsemble(user.id);

    expect((await getAllEnsembles()).map((e) => e.id)).toEqual([ensemble.id]);
    expect((await getAllUsers()).map((u) => u.id).sort()).toEqual([admin.id, user.id].sort());
    expect(await getSiteAdminIds()).toEqual(new Set([admin.id]));
  });
});

describe("keeping an ensemble's last admin", () => {
  async function setup() {
    const creator = await createUser();
    const ensemble = await createEnsemble(creator.id);
    const admin = await createMembership(ensemble.id, creator.id, { role: "admin" });
    return { ensemble, admin };
  }

  const find = (id: string) =>
    db.select().from(EnsembleMember).where(eq(EnsembleMember.id, id)).get();

  it("won't demote or remove the only active admin", async () => {
    const { admin } = await setup();

    expect(await setMemberRole(admin.id, "member")).toBe(false);
    expect(await removeMember(admin.id)).toBe(false);
    expect(await find(admin.id)).toMatchObject({ role: "admin", status: "active" });
  });

  it("doesn't count a pending admin or another ensemble's admin", async () => {
    const { ensemble, admin } = await setup();
    await createMembership(ensemble.id, (await createUser()).id, {
      role: "admin",
      status: "pending",
    });
    const elsewhere = await createEnsemble(admin.userId);
    await createMembership(elsewhere.id, (await createUser()).id, { role: "admin" });

    expect(await setMemberRole(admin.id, "member")).toBe(false);
    expect(await removeMember(admin.id)).toBe(false);
  });

  it("lets an admin go once another active admin remains", async () => {
    const { ensemble, admin } = await setup();
    const second = await createMembership(ensemble.id, (await createUser()).id, { role: "admin" });

    expect(await setMemberRole(admin.id, "member")).toBe(true);
    expect(await removeMember(second.id)).toBe(false);
    expect(await setMemberRole(admin.id, "admin")).toBe(true);
    expect(await removeMember(second.id)).toBe(true);
    expect(await find(second.id)).toBeUndefined();
  });

  it("still removes members and pending admins", async () => {
    const { ensemble } = await setup();
    const member = await createMembership(ensemble.id, (await createUser()).id);
    const pending = await createMembership(ensemble.id, (await createUser()).id, {
      role: "admin",
      status: "pending",
    });

    expect(await removeMember(member.id)).toBe(true);
    expect(await removeMember(pending.id)).toBe(true);
  });
});
