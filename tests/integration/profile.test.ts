import { describe, it, expect, vi } from "vitest";
import {
  registerUser,
  resendVerificationEmail,
  updateName,
  updatePhone,
  deleteAccount,
  updateParts,
  verifyEmail,
  verifyEmailToken,
  verifyEmailChangeToken,
  initiateEmailChange,
  validatePasswordResetToken,
  resetPassword,
} from "../../src/lib/profile.ts";
import {
  db,
  User,
  EnsembleMember,
  MemberPart,
  EmailVerificationToken,
  EmailChangeToken,
  PasswordResetToken,
  eq,
} from "@db";
import {
  createUser,
  createEnsemble,
  createMembership,
  createPart,
  createMemberPart,
} from "./fixtures.ts";
import { hashToken } from "../../src/lib/auth.ts";
import {
  getSession,
  rememberVerifyingBrowser,
  VERIFY_EMAIL_COOKIE,
} from "../../src/lib/session.ts";
import { createTestContext } from "../support/actions.ts";
import {
  sendEmailChangedEmail,
  sendEmailChangeRequestedEmail,
  sendEmailChangeVerificationEmail,
  sendEmailVerificationEmail,
} from "../../src/lib/email.ts";

// Mock email module — we don't want to call the real Resend API in tests
vi.mock("../../src/lib/email.ts", () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangeRequestedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmailChangedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendAnnouncementEmail: vi.fn().mockResolvedValue({ success: true }),
}));

/** The raw token in the last verification email: the database only has its hash. */
function lastVerificationToken(): string {
  return vi.mocked(sendEmailVerificationEmail).mock.lastCall![2];
}

describe("registerUser", () => {
  it("creates a new user and returns their userId", async () => {
    const result = await registerUser({
      name: "Alice Smith",
      email: "alice@test.com",
      password: "password123",
    });
    expect(result.userId).toBeDefined();

    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user).not.toBeNull();
    expect(user!.email).toBe("alice@test.com");
    expect(user!.name).toBe("Alice Smith");
  });

  it("hashes the password (does not store plaintext)", async () => {
    const result = await registerUser({
      name: "Bob Jones",
      email: "bob@test.com",
      password: "secret123",
    });
    const user = await db.select().from(User).where(eq(User.id, result.userId)).get();
    expect(user!.passwordHash).not.toBe("secret123");
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("throws an error if the email is already in use", async () => {
    await registerUser({ name: "First", email: "dup@test.com", password: "password1" });
    await expect(
      registerUser({ name: "Second", email: "dup@test.com", password: "password2" }),
    ).rejects.toThrow("already exists");
  });

  it("stores the email lowercased and treats other casings as the same account", async () => {
    const { userId } = await registerUser({
      name: "Casey",
      email: "  Casey@Test.COM ",
      password: "password123",
    });
    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.email).toBe("casey@test.com");
    await expect(
      registerUser({ name: "Casey 2", email: "casey@test.com", password: "password123" }),
    ).rejects.toThrow("already exists");
  });

  it("rejects a password shorter than 8 or longer than 72 bytes", async () => {
    await expect(
      registerUser({ name: "Short", email: "short@test.com", password: "1234567" }),
    ).rejects.toThrow("at least 8 characters");
    await expect(
      registerUser({ name: "Long", email: "long@test.com", password: "a".repeat(73) }),
    ).rejects.toThrow("at most 72 characters");
  });

  it("creates an email verification token for the new user", async () => {
    const { userId } = await registerUser({
      name: "Carol White",
      email: "carol@test.com",
      password: "password123",
    });
    const token = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();
    expect(token).not.toBeNull();
    expect(token!.usedAt).toBeNull();
    expect(token!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(token!.token).toBe(hashToken(lastVerificationToken()));
    expect(token!.token).not.toBe(lastVerificationToken());
  });

  it("leaves the new user unverified (emailVerifiedAt is null)", async () => {
    const { userId } = await registerUser({
      name: "Dan Brown",
      email: "dan@test.com",
      password: "password123",
    });
    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.emailVerifiedAt).toBeNull();
  });
});

describe("resendVerificationEmail", () => {
  it("creates a new verification token for an unverified user", async () => {
    const { userId } = await registerUser({
      name: "Eve Green",
      email: "eve@test.com",
      password: "password123",
    });

    // Mark the original token as used to simulate an expired/used token
    await db
      .update(EmailVerificationToken)
      .set({ usedAt: new Date() })
      .where(eq(EmailVerificationToken.userId, userId));

    await resendVerificationEmail("eve@test.com");

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .all();
    const activeToken = tokens.find((t) => t.usedAt === null);
    expect(activeToken).toBeDefined();
  });

  it("invalidates the previous pending token when resending", async () => {
    const { userId } = await registerUser({
      name: "Frank Black",
      email: "frank@test.com",
      password: "password123",
    });

    await resendVerificationEmail("frank@test.com");

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .all();
    // Only the newest token should be active (usedAt = null)
    const activeTokens = tokens.filter((t) => t.usedAt === null);
    expect(activeTokens).toHaveLength(1);
  });

  it("finds the account whatever the email's casing", async () => {
    const { userId } = await registerUser({
      name: "Gina Gray",
      email: "gina@test.com",
      password: "password123",
    });

    await resendVerificationEmail(" Gina@Test.com ");

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .all();
    expect(tokens).toHaveLength(2);
  });

  it("does nothing silently for an unknown email", async () => {
    await expect(resendVerificationEmail("nobody@test.com")).resolves.toBeUndefined();
  });

  it("does nothing silently for an already-verified user", async () => {
    const user = await createUser();
    await db.update(User).set({ emailVerifiedAt: new Date() }).where(eq(User.id, user!.id));

    await expect(resendVerificationEmail(user!.email)).resolves.toBeUndefined();

    const tokens = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, user!.id))
      .all();
    expect(tokens).toHaveLength(0);
  });
});

describe("verifyEmailToken", () => {
  it("returns the userId and marks user as verified on a valid token", async () => {
    const { userId } = await registerUser({
      name: "Verify User",
      email: "verify-valid@test.com",
      password: "password123",
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    const result = await verifyEmailToken(lastVerificationToken());

    expect(result).not.toBeNull();
    expect(result!.id).toBe(userId);

    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.emailVerifiedAt).not.toBeNull();

    const updatedToken = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.id, tokenRow!.id))
      .get();
    expect(updatedToken!.usedAt).not.toBeNull();
  });

  it("returns null for a token that does not exist", async () => {
    const result = await verifyEmailToken("nonexistent-token");
    expect(result).toBeNull();
  });

  it("returns null for a token that has already been used", async () => {
    await registerUser({
      name: "Used Token User",
      email: "verify-used@test.com",
      password: "password123",
    });

    const token = lastVerificationToken();
    await verifyEmailToken(token);
    const result = await verifyEmailToken(token);
    expect(result).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const { userId } = await registerUser({
      name: "Expired Token User",
      email: "verify-expired@test.com",
      password: "password123",
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    // Backdate the expiry
    await db
      .update(EmailVerificationToken)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(EmailVerificationToken.id, tokenRow!.id));

    const result = await verifyEmailToken(lastVerificationToken());
    expect(result).toBeNull();
  });

  it("does not accept the stored hash as a token", async () => {
    const { userId } = await registerUser({
      name: "Database Reader",
      email: "verify-hash@test.com",
      password: "password123",
    });
    const tokenRow = await db
      .select()
      .from(EmailVerificationToken)
      .where(eq(EmailVerificationToken.userId, userId))
      .get();

    expect(await verifyEmailToken(tokenRow!.token)).toBeNull();
  });
});

describe("verifyEmail", () => {
  /** A browser's cookie jar, holding the cookie it gets when it registers `email`. */
  function browserThatRegistered(email: string | null) {
    const { cookies } = createTestContext();
    if (email) rememberVerifyingBrowser(cookies, email);
    const value = cookies.get(VERIFY_EMAIL_COOKIE)?.value;
    return createTestContext({ cookies: value ? { [VERIFY_EMAIL_COOKIE]: value } : {} }).cookies;
  }

  async function register(email: string) {
    const { userId } = await registerUser({ name: "Verifier", email, password: "password123" });
    return { userId, token: lastVerificationToken() };
  }

  it("signs in the browser that registered the address", async () => {
    const { userId, token } = await register("same-browser@test.com");
    const cookies = browserThatRegistered("Same-Browser@test.com");

    expect(await verifyEmail(token, cookies)).toEqual({ type: "signedIn", userId });
    expect(getSession(cookies.get("session")?.value)?.userId).toBe(userId);
    expect(cookies.get(VERIFY_EMAIL_COOKIE)).toBeUndefined();
  });

  it("verifies but does not sign in a browser without the cookie", async () => {
    const { userId, token } = await register("other-browser@test.com");
    const cookies = browserThatRegistered(null);

    expect(await verifyEmail(token, cookies)).toEqual({ type: "verified" });
    expect(cookies.get("session")).toBeUndefined();
    const user = await db.select().from(User).where(eq(User.id, userId)).get();
    expect(user!.emailVerifiedAt).not.toBeNull();
  });

  it("does not sign in a browser that registered a different address", async () => {
    const { token } = await register("attacker@test.com");
    const cookies = browserThatRegistered("victim@test.com");

    expect(await verifyEmail(token, cookies)).toEqual({ type: "verified" });
    expect(cookies.get("session")).toBeUndefined();
    expect(cookies.get(VERIFY_EMAIL_COOKIE)).toBeUndefined();
  });

  it("rejects an unknown token", async () => {
    const cookies = browserThatRegistered("nobody@test.com");
    expect(await verifyEmail("nonexistent-token", cookies)).toEqual({ type: "invalid" });
    expect(cookies.get("session")).toBeUndefined();
  });
});

describe("initiateEmailChange", () => {
  it("rejects a wrong password without sending anything", async () => {
    const user = await createUser({ email: "wrong-pw@test.com", password: "right-password" });
    vi.mocked(sendEmailChangeVerificationEmail).mockClear();
    vi.mocked(sendEmailChangeRequestedEmail).mockClear();

    const result = await initiateEmailChange(
      user!.id,
      user!.name,
      user!.email,
      "wrong-pw-new@test.com",
      "wrong-password",
    );

    expect(result).toEqual({ type: "error", message: "Incorrect password. Email not changed." });
    const tokens = await db
      .select()
      .from(EmailChangeToken)
      .where(eq(EmailChangeToken.userId, user!.id))
      .all();
    expect(tokens).toHaveLength(0);
    expect(sendEmailChangeVerificationEmail).not.toHaveBeenCalled();
    expect(sendEmailChangeRequestedEmail).not.toHaveBeenCalled();
  });

  it("requires a password", async () => {
    const user = await createUser();
    const result = await initiateEmailChange(
      user!.id,
      user!.name,
      user!.email,
      "no-pw-new@test.com",
      "",
    );
    expect(result).toEqual({
      type: "error",
      message: "Password is required to change your email.",
    });
  });

  it("with the right password, emails the new address a link and tells the current one", async () => {
    const user = await createUser({
      name: "Mover",
      email: "right-pw@test.com",
      password: "right-password",
    });

    const result = await initiateEmailChange(
      user!.id,
      user!.name,
      user!.email,
      "Right-PW-New@test.com",
      "right-password",
    );

    expect(result).toEqual({ type: "redirect", url: "/profile?emailChangePending=1" });
    const token = await db
      .select()
      .from(EmailChangeToken)
      .where(eq(EmailChangeToken.userId, user!.id))
      .get();
    expect(sendEmailChangeVerificationEmail).toHaveBeenCalledWith(
      "right-pw-new@test.com",
      "Mover",
      expect.any(String),
    );
    expect(hashToken(vi.mocked(sendEmailChangeVerificationEmail).mock.lastCall![2])).toBe(
      token!.token,
    );
    expect(sendEmailChangeRequestedEmail).toHaveBeenCalledWith(
      "right-pw@test.com",
      "Mover",
      "right-pw-new@test.com",
    );
  });
});

describe("verifyEmailChangeToken", () => {
  async function insertChangeToken(
    userId: string,
    newEmail: string,
    overrides: { usedAt?: Date; expiresAt?: Date } = {},
  ) {
    const token = crypto.randomUUID();
    await db.insert(EmailChangeToken).values({
      id: crypto.randomUUID(),
      userId,
      token: hashToken(token),
      newEmail,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it("updates the user email, signs out every session and notifies the old address", async () => {
    const user = await createUser({ name: "Changer", email: "old-email@test.com" });
    const token = await insertChangeToken(user!.id, "new-email@test.com");

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({
      type: "success",
      newEmail: "new-email@test.com",
      user: { id: user!.id, sessionVersion: user!.sessionVersion + 1 },
    });
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.email).toBe("new-email@test.com");
    expect(updated!.sessionVersion).toBe(user!.sessionVersion + 1);
    expect(sendEmailChangedEmail).toHaveBeenCalledWith(
      "old-email@test.com",
      "Changer",
      "new-email@test.com",
    );
    const tokenRow = await db
      .select()
      .from(EmailChangeToken)
      .where(eq(EmailChangeToken.token, hashToken(token)))
      .get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });

  it("returns invalid for a nonexistent token", async () => {
    const result = await verifyEmailChangeToken("nonexistent-token");
    expect(result).toEqual({ type: "invalid" });
  });

  it("returns invalid for an expired token", async () => {
    const user = await createUser({ email: "expired-change@test.com" });
    const token = await insertChangeToken(user!.id, "expired-new@test.com", {
      expiresAt: new Date(Date.now() - 1000),
    });
    const result = await verifyEmailChangeToken(token);
    expect(result).toEqual({ type: "invalid" });
  });

  it("returns invalid for an already-used token", async () => {
    const user = await createUser({ email: "used-change@test.com" });
    const token = await insertChangeToken(user!.id, "used-new@test.com", {
      usedAt: new Date(),
    });
    const result = await verifyEmailChangeToken(token);
    expect(result).toEqual({ type: "invalid" });
  });

  it("returns conflict and marks token used when the new email is already taken", async () => {
    const user = await createUser({ email: "changer@test.com" });
    await createUser({ email: "already-taken@test.com" });
    const token = await insertChangeToken(user!.id, "already-taken@test.com");

    const result = await verifyEmailChangeToken(token);

    expect(result).toEqual({ type: "conflict" });
    const unchanged = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(unchanged!.email).toBe("changer@test.com");
    const tokenRow = await db
      .select()
      .from(EmailChangeToken)
      .where(eq(EmailChangeToken.token, hashToken(token)))
      .get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });
});

describe("validatePasswordResetToken", () => {
  async function insertResetToken(
    userId: string,
    overrides: { usedAt?: Date; expiresAt?: Date } = {},
  ) {
    const token = crypto.randomUUID();
    await db.insert(PasswordResetToken).values({
      id: crypto.randomUUID(),
      userId,
      token: hashToken(token),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it("returns true for a valid unused unexpired token", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id);
    expect(await validatePasswordResetToken(token)).toBe(true);
  });

  it("returns false for a nonexistent token", async () => {
    expect(await validatePasswordResetToken("nonexistent-token")).toBe(false);
  });

  it("returns false for an expired token", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await validatePasswordResetToken(token)).toBe(false);
  });

  it("returns false for an already-used token", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { usedAt: new Date() });
    expect(await validatePasswordResetToken(token)).toBe(false);
  });
});

describe("resetPassword", () => {
  async function insertResetToken(
    userId: string,
    overrides: { usedAt?: Date; expiresAt?: Date } = {},
  ) {
    const token = crypto.randomUUID();
    await db.insert(PasswordResetToken).values({
      id: crypto.randomUUID(),
      userId,
      token: hashToken(token),
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: overrides.usedAt,
    });
    return token;
  }

  it("updates the password hash and marks the token used on success", async () => {
    const user = await createUser({ password: "old-password" });
    const token = await insertResetToken(user!.id);

    const result = await resetPassword(token, "new-password-123");

    expect(result).toEqual({ type: "success" });
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.passwordHash).not.toBe(user!.passwordHash);
    const tokenRow = await db
      .select()
      .from(PasswordResetToken)
      .where(eq(PasswordResetToken.token, hashToken(token)))
      .get();
    expect(tokenRow!.usedAt).not.toBeNull();
  });

  it("cancels a pending email change", async () => {
    const user = await createUser({ password: "old-password" });
    const changeToken = crypto.randomUUID();
    await db.insert(EmailChangeToken).values({
      id: crypto.randomUUID(),
      userId: user!.id,
      newEmail: "attacker@example.com",
      token: hashToken(changeToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await resetPassword(await insertResetToken(user!.id), "new-password-123");

    expect(await verifyEmailChangeToken(changeToken)).toEqual({ type: "invalid" });
  });

  it("returns error for a password shorter than 8 characters", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id);
    const result = await resetPassword(token, "1234567");
    expect(result).toEqual({ type: "error", message: "Password must be at least 8 characters." });
  });

  it("returns error for a password bcrypt would truncate", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id);
    // 36 two-byte characters: 72 bytes is fine, 74 is not.
    expect(await resetPassword(token, "é".repeat(37))).toEqual({
      type: "error",
      message: "Password must be at most 72 characters.",
    });
    expect(await resetPassword(token, "é".repeat(36))).toEqual({ type: "success" });
  });

  it("returns invalid for a nonexistent token", async () => {
    const result = await resetPassword("nonexistent-token", "validpassword123");
    expect(result).toEqual({ type: "invalid" });
  });

  it("returns invalid for an expired token", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { expiresAt: new Date(Date.now() - 1000) });
    const result = await resetPassword(token, "validpassword123");
    expect(result).toEqual({ type: "invalid" });
  });

  it("returns invalid for an already-used token", async () => {
    const user = await createUser();
    const token = await insertResetToken(user!.id, { usedAt: new Date() });
    const result = await resetPassword(token, "validpassword123");
    expect(result).toEqual({ type: "invalid" });
  });
});

describe("updateName", () => {
  it("updates the user name in the DB", async () => {
    const user = await createUser({ name: "Old Name" });
    await updateName(user!.id, "New Name");
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.name).toBe("New Name");
  });

  it("returns a redirect result on success", async () => {
    const user = await createUser();
    const result = await updateName(user!.id, "Updated Name");
    expect(result).toEqual({ type: "redirect", url: "/profile" });
  });

  it("returns an error result for an empty name", async () => {
    const user = await createUser();
    const result = await updateName(user!.id, "");
    expect(result.type).toBe("error");
  });

  it("returns an error result for whitespace-only name", async () => {
    const user = await createUser();
    const result = await updateName(user!.id, "   ");
    expect(result.type).toBe("error");
  });
});

describe("updatePhone", () => {
  it("updates the phone number in the DB", async () => {
    const user = await createUser();
    await updatePhone(user!.id, "555-123-4567");
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.phone).toBe("555-123-4567");
  });

  it("clears the phone number when empty string is provided", async () => {
    const user = await createUser();
    await updatePhone(user!.id, "555-123-4567");
    await updatePhone(user!.id, "");
    const updated = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(updated!.phone).toBeNull();
  });

  it("returns an error for invalid phone format", async () => {
    const user = await createUser();
    const result = await updatePhone(user!.id, "5551234567");
    expect(result.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toMatch(/333-333-3333/);
  });

  it("returns a redirect result on success", async () => {
    const user = await createUser();
    const result = await updatePhone(user!.id, "555-987-6543");
    expect(result).toEqual({ type: "redirect", url: "/profile" });
  });
});

describe("deleteAccount", () => {
  it("blocks site admins from deleting their own account", async () => {
    const admin = await createUser({ role: "admin" });
    const result = await deleteAccount(admin!.id, "admin", "test123");
    expect(result.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toMatch(/administrator/i);
  });

  it("returns an error when no password is provided", async () => {
    const user = await createUser();
    const result = await deleteAccount(user!.id, "user", undefined);
    expect(result.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toMatch(/password/i);
  });

  it("returns an error for an incorrect password", async () => {
    const user = await createUser({ password: "correct-password" });
    const result = await deleteAccount(user!.id, "user", "wrong-password");
    expect(result.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toMatch(/incorrect password/i);
  });

  it("deletes the user and their memberships on success", async () => {
    const user = await createUser({ password: "my-password" });
    const adminUser = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(adminUser!.id);
    const membership = await createMembership(ensemble!.id, user!.id);
    const part = await createPart(ensemble!.id, { name: "Tenor" });
    await createMemberPart(membership!.id, part!.id);

    const result = await deleteAccount(user!.id, "user", "my-password");
    expect(result.type).toBe("redirect");

    const deletedUser = await db.select().from(User).where(eq(User.id, user!.id)).get();
    expect(deletedUser).toBeUndefined();

    const memberships = await db
      .select()
      .from(EnsembleMember)
      .where(eq(EnsembleMember.userId, user!.id))
      .all();
    expect(memberships).toHaveLength(0);

    const memberParts = await db
      .select()
      .from(MemberPart)
      .where(eq(MemberPart.membershipId, membership!.id))
      .all();
    expect(memberParts).toHaveLength(0);
  });
});

describe("updateParts", () => {
  it("inserts MemberPart rows for each provided partId", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part1 = await createPart(ensemble!.id, { name: "Soprano" });
    const part2 = await createPart(ensemble!.id, { name: "Piano" });

    await updateParts(membership!.id, [part1!.id, part2!.id]);

    const rows = await db
      .select()
      .from(MemberPart)
      .where(eq(MemberPart.membershipId, membership!.id))
      .all();
    expect(rows).toHaveLength(2);
  });

  it("replaces existing parts when called again", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part1 = await createPart(ensemble!.id, { name: "Soprano" });
    const part2 = await createPart(ensemble!.id, { name: "Alto" });

    await updateParts(membership!.id, [part1!.id]);
    await updateParts(membership!.id, [part2!.id]);

    const rows = await db
      .select()
      .from(MemberPart)
      .where(eq(MemberPart.membershipId, membership!.id))
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0].partId).toBe(part2!.id);
  });

  it("removes all parts when called with an empty array", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);
    const part = await createPart(ensemble!.id, { name: "Bass" });

    await updateParts(membership!.id, [part!.id]);
    await updateParts(membership!.id, []);

    const rows = await db
      .select()
      .from(MemberPart)
      .where(eq(MemberPart.membershipId, membership!.id))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("returns a redirect result on success", async () => {
    const admin = await createUser({ role: "admin" });
    const ensemble = await createEnsemble(admin!.id);
    const user = await createUser();
    const membership = await createMembership(ensemble!.id, user!.id);

    const result = await updateParts(membership!.id, []);
    expect(result).toEqual({ type: "redirect", url: "/profile" });
  });
});
