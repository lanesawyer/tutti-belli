import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerUser,
  resendVerificationEmail,
  initiateEmailChange,
} from "../../src/lib/profile.ts";
import { createAnnouncement } from "../../src/lib/announcements.ts";
import { createUser, createEnsemble, createMembership } from "./fixtures.ts";

type Sent = { to: string; html: string };
const sent: Sent[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (params: Sent) => {
        sent.push(params);
        return { error: null };
      },
    };
    batch = {
      send: async (paramsList: Sent[]) => {
        sent.push(...paramsList);
        return { error: null };
      },
    };
  },
}));
vi.mock("../../src/lib/discord.ts", () => ({
  postAnnouncementToDiscord: vi.fn().mockResolvedValue(undefined),
}));

const SITE = "https://tuttibelli.org";

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

function expectOnlySiteLinks(email: Sent) {
  const links = hrefs(email.html);
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) expect(link.startsWith(`${SITE}/`)).toBe(true);
}

describe("emails sent by lib functions", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.stubEnv("EMAIL_DISABLED", "");
    vi.stubEnv("EMAIL_API_KEY", "test-key");
    vi.stubEnv("SITE_URL", SITE);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("registration and resend link to the configured site and escape the name", async () => {
    await registerUser({
      name: "<b>Mallory</b>",
      email: "mallory@test.com",
      password: "password123",
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await resendVerificationEmail("mallory@test.com");
    await vi.waitFor(() => expect(sent).toHaveLength(2));

    for (const email of sent) {
      expectOnlySiteLinks(email);
      expect(email.html).toContain(`${SITE}/verify-email?token=`);
      expect(email.html).toContain("&lt;b&gt;Mallory&lt;/b&gt;");
      expect(email.html).not.toContain("<b>Mallory");
    }
  });

  it("email change links to the configured site", async () => {
    const user = await createUser({ name: "Changer", email: "changer-links@test.com" });
    const result = await initiateEmailChange(
      user!.id,
      "Changer",
      user!.email,
      "new-links@test.com",
      "test123",
    );
    expect(result.type).toBe("redirect");
    expect(sent).toHaveLength(2);
    for (const email of sent) expectOnlySiteLinks(email);
    expect(sent[0].html).toContain(`${SITE}/verify-email-change?token=`);
  });

  it("announcements link to the configured site and arrive escaped", async () => {
    const admin = await createUser({ name: "Admin <i>One</i>" });
    const ensemble = await createEnsemble(admin!.id, { name: "Choir <script>" });
    await createMembership(ensemble!.id, admin!.id, { role: "admin" });

    await createAnnouncement({
      ensembleId: ensemble!.id,
      title: "<h1>Big</h1>",
      content: 'Line one\n<a href="https://evil.example">click</a>',
      createdBy: admin!.id,
      creatorName: admin!.name,
      postToDiscord: false,
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));

    const html = sent[0].html;
    expectOnlySiteLinks(sent[0]);
    expect(html).toContain("&lt;h1&gt;Big&lt;/h1&gt;");
    expect(html).toContain("Choir &lt;script&gt;");
    expect(html).toContain("Admin &lt;i&gt;One&lt;/i&gt;");
    expect(html).toContain(
      "Line one<br />&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;",
    );
    expect(html).not.toContain('evil.example">');
  });
});
