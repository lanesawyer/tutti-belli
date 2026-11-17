import {
  db,
  eq,
  and,
  gt,
  isNull,
  inArray,
  User,
  Ensemble,
  EnsembleMember,
  Part,
  MemberPart,
  PasswordResetToken,
  EmailChangeToken,
  EmailVerificationToken,
  runBatch,
} from "@db";
import { validateImageFile } from "./upload";
import { deleteImage, uploadImage } from "./storage";
import type { AstroCookies } from "astro";
import { UserError } from "./errors";
import {
  EMAIL_VERIFICATION_TTL_MS,
  hashPassword,
  hashToken,
  newPasswordError,
  verifyPassword,
} from "./auth";
import {
  bumpSessionVersion,
  readVerifyingBrowser,
  startSession,
  VERIFY_EMAIL_COOKIE,
} from "./session";
import {
  sendAccountExistsEmail,
  sendEmailChangedEmail,
  sendEmailChangeRequestedEmail,
  sendEmailChangeVerificationEmail,
  sendEmailVerificationEmail,
} from "./email";

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ userId: string }> {
  const { name, password } = params;
  const email = params.email.trim().toLowerCase();
  const passwordError = newPasswordError(password);
  if (passwordError) throw new UserError(passwordError);

  // Hashed before the lookup, so a taken address takes as long as a new one.
  const passwordHash = await hashPassword(password);

  // A taken address gets the same response as a new one, so sign-up can't reveal who has an
  // account. Its owner is emailed instead. No verification link, even if the account is
  // unverified: whoever created it chose its password, and verifying it from here would
  // activate that password for someone who thinks they just set their own. The email points
  // them to a password reset, which also verifies the address.
  const existing = await db.select().from(User).where(eq(User.email, email)).get();
  if (existing) {
    sendAccountExistsEmail(existing.email, existing.name).catch(() => {});
    return { userId: existing.id };
  }

  const userId = crypto.randomUUID();

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await db.batch([
    db.insert(User).values({ id: userId, email, passwordHash, name, role: "user" }),
    db
      .insert(EmailVerificationToken)
      .values({ id: crypto.randomUUID(), userId, token: hashToken(token), expiresAt }),
  ]);

  // Fire-and-forget: don't block registration if email fails
  sendEmailVerificationEmail(email, name, token).catch((error) => {
    console.error(`Verification email threw for user ${userId}:`, error);
  });

  return { userId };
}

export type ActionResult = { type: "redirect"; url: string } | { type: "error"; message: string };

export async function getMembershipsWithParts(userId: string) {
  const memberships = await db
    .select({
      ensembleId: Ensemble.id,
      ensembleName: Ensemble.name,
      membershipId: EnsembleMember.id,
    })
    .from(EnsembleMember)
    .innerJoin(Ensemble, eq(EnsembleMember.ensembleId, Ensemble.id))
    .where(eq(EnsembleMember.userId, userId))
    .all();

  const membershipIds = memberships.map((m) => m.membershipId);
  const ensembleIds = memberships.map((m) => m.ensembleId);
  const allParts = ensembleIds.length > 0 ? await db.select().from(Part).all() : [];

  const memberPartRows =
    membershipIds.length > 0
      ? await db
          .select()
          .from(MemberPart)
          .where(inArray(MemberPart.membershipId, membershipIds))
          .all()
      : [];

  const partsByMembership = new Map<string, (typeof allParts)[number][]>();
  for (const mp of memberPartRows) {
    const part = allParts.find((p) => p.id === mp.partId);
    if (!part) continue;
    if (!partsByMembership.has(mp.membershipId)) {
      partsByMembership.set(mp.membershipId, []);
    }
    partsByMembership.get(mp.membershipId)!.push(part);
  }
  for (const parts of partsByMembership.values()) {
    parts.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  const partsByEnsemble = new Map<string, (typeof allParts)[number][]>();
  for (const part of allParts) {
    if (ensembleIds.includes(part.ensembleId)) {
      if (!partsByEnsemble.has(part.ensembleId)) {
        partsByEnsemble.set(part.ensembleId, []);
      }
      partsByEnsemble.get(part.ensembleId)!.push(part);
    }
  }
  for (const parts of partsByEnsemble.values()) {
    parts.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return { memberships, partsByEnsemble, partsByMembership };
}

export async function updateName(userId: string, name: string | undefined): Promise<ActionResult> {
  if (!name?.trim()) {
    return { type: "error", message: "Name cannot be empty" };
  }
  await db.update(User).set({ name: name.trim() }).where(eq(User.id, userId));
  return { type: "redirect", url: "/profile" };
}

export async function updatePhone(
  userId: string,
  phone: string | undefined,
): Promise<ActionResult> {
  const trimmed = phone?.trim() || null;
  if (trimmed && !/^\d{3}-\d{3}-\d{4}$/.test(trimmed)) {
    return { type: "error", message: "Phone number must be in the format 333-333-3333" };
  }
  await db.update(User).set({ phone: trimmed }).where(eq(User.id, userId));
  return { type: "redirect", url: "/profile" };
}

export async function updateAvatar(
  userId: string,
  currentAvatarUrl: string | null | undefined,
  avatarFile: File,
  removeAvatar: boolean,
): Promise<ActionResult> {
  let avatarUrl = currentAvatarUrl ?? null;

  if (removeAvatar && avatarUrl) {
    avatarUrl = null;
  }

  if (avatarFile && avatarFile.size > 0) {
    const validation = validateImageFile(avatarFile, 2);
    if (!validation.valid) {
      return { type: "error", message: validation.error! };
    }
    avatarUrl = await uploadImage(avatarFile, "avatars");
  }

  await db.update(User).set({ avatarUrl }).where(eq(User.id, userId));
  if (currentAvatarUrl && currentAvatarUrl !== avatarUrl) await deleteImage(currentAvatarUrl);
  return { type: "redirect", url: "/profile" };
}

export async function updateParts(
  membershipId: string | undefined,
  partIds: string[],
): Promise<ActionResult | null> {
  if (!membershipId) return null;
  const uniquePartIds = [...new Set(partIds)];
  await runBatch([
    db.delete(MemberPart).where(eq(MemberPart.membershipId, membershipId)),
    ...uniquePartIds.map((partId) =>
      db
        .insert(MemberPart)
        .values({ id: crypto.randomUUID(), membershipId, partId })
        .onConflictDoNothing(),
    ),
  ]);
  return { type: "redirect", url: "/profile" };
}

export async function initiateEmailChange(
  userId: string,
  userName: string,
  currentEmail: string,
  newEmail: string | undefined,
  password: string | undefined,
): Promise<ActionResult> {
  if (!newEmail?.trim()) {
    return { type: "error", message: "Please enter a new email address." };
  }

  const trimmedEmail = newEmail.trim().toLowerCase();

  if (!trimmedEmail.includes("@")) {
    return { type: "error", message: "Please enter a valid email address." };
  }

  if (trimmedEmail === currentEmail.toLowerCase()) {
    return { type: "error", message: "That is already your current email address." };
  }

  if (!password) {
    return { type: "error", message: "Password is required to change your email." };
  }

  const fullUser = await db.select().from(User).where(eq(User.id, userId)).get();
  const valid = fullUser ? await verifyPassword(password, fullUser.passwordHash) : false;
  if (!valid) {
    return { type: "error", message: "Incorrect password. Email not changed." };
  }

  const [existingUser] = await db
    .select({ id: User.id })
    .from(User)
    .where(eq(User.email, trimmedEmail));
  // Answer as if the link went out: saying the address is taken would tell this member that
  // someone has an account there. The current address is still told about the request.
  if (existingUser) {
    await sendEmailChangeRequestedEmail(currentEmail, userName, trimmedEmail);
    return { type: "redirect", url: "/profile?emailChangePending=1" };
  }

  // Invalidate any existing pending email change for this user
  const now = new Date();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await db.batch([
    db
      .update(EmailChangeToken)
      .set({ usedAt: now })
      .where(
        and(
          eq(EmailChangeToken.userId, userId),
          isNull(EmailChangeToken.usedAt),
          gt(EmailChangeToken.expiresAt, now),
        ),
      ),
    db.insert(EmailChangeToken).values({
      id: crypto.randomUUID(),
      userId,
      token: hashToken(token),
      newEmail: trimmedEmail,
      expiresAt,
    }),
  ]);

  // Not awaited outside dev: waiting on the email provider only here would let the response
  // time tell a taken address from a free one.
  const sent = sendEmailChangeVerificationEmail(trimmedEmail, userName, token).then((result) => {
    if (!result.success) console.error("Email change verification email failed:", result.error);
    return result;
  });
  if (import.meta.env.DEV) {
    const emailResult = await sent;
    if (!emailResult.success)
      return { type: "error", message: `Email failed: ${emailResult.error}` };
  }
  await sendEmailChangeRequestedEmail(currentEmail, userName, trimmedEmail);

  return { type: "redirect", url: "/profile?emailChangePending=1" };
}

export async function resendVerificationEmail(email: string): Promise<void> {
  const user = await db.select().from(User).where(eq(User.email, email.trim().toLowerCase())).get();
  if (!user || user.emailVerifiedAt) return; // silent: prevent enumeration
  await sendNewVerificationLink(user);
}

async function sendNewVerificationLink(user: { id: string; email: string; name: string }) {
  // Invalidate any existing pending tokens
  const now = new Date();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await db.batch([
    db
      .update(EmailVerificationToken)
      .set({ usedAt: now })
      .where(
        and(eq(EmailVerificationToken.userId, user.id), isNull(EmailVerificationToken.usedAt)),
      ),
    db
      .insert(EmailVerificationToken)
      .values({ id: crypto.randomUUID(), userId: user.id, token: hashToken(token), expiresAt }),
  ]);

  sendEmailVerificationEmail(user.email, user.name, token).catch((error) => {
    console.error(`Verification email threw for user ${user.id}:`, error);
  });
}

export type VerifyEmailChangeResult =
  | { type: "success"; newEmail: string; user: { id: string; sessionVersion: number } }
  | { type: "conflict" }
  | { type: "invalid" };

export async function verifyEmailChangeToken(token: string): Promise<VerifyEmailChangeResult> {
  const now = new Date();
  const [record] = await db
    .select({
      id: EmailChangeToken.id,
      userId: EmailChangeToken.userId,
      newEmail: EmailChangeToken.newEmail,
      oldEmail: User.email,
      name: User.name,
    })
    .from(EmailChangeToken)
    .innerJoin(User, eq(User.id, EmailChangeToken.userId))
    .where(
      and(
        eq(EmailChangeToken.token, hashToken(token)),
        gt(EmailChangeToken.expiresAt, now),
        isNull(EmailChangeToken.usedAt),
      ),
    );

  if (!record) return { type: "invalid" };

  const [conflict] = await db
    .select({ id: User.id })
    .from(User)
    .where(eq(User.email, record.newEmail));

  if (conflict) {
    await db
      .update(EmailChangeToken)
      .set({ usedAt: now })
      .where(eq(EmailChangeToken.id, record.id));
    return { type: "conflict" };
  }

  const [[user]] = await db.batch([
    db
      .update(User)
      .set({ email: record.newEmail, sessionVersion: bumpSessionVersion })
      .where(eq(User.id, record.userId))
      .returning({ id: User.id, sessionVersion: User.sessionVersion }),
    db.update(EmailChangeToken).set({ usedAt: now }).where(eq(EmailChangeToken.id, record.id)),
  ]);

  await sendEmailChangedEmail(record.oldEmail, record.name, record.newEmail);

  return { type: "success", newEmail: record.newEmail, user };
}

export async function verifyEmailToken(
  token: string,
): Promise<{ id: string; sessionVersion: number; email: string } | null> {
  const now = new Date();
  const record = await db
    .select()
    .from(EmailVerificationToken)
    .where(
      and(
        eq(EmailVerificationToken.token, hashToken(token)),
        gt(EmailVerificationToken.expiresAt, now),
        isNull(EmailVerificationToken.usedAt),
      ),
    )
    .get();

  if (!record) return null;

  const [[user]] = await db.batch([
    db
      .update(User)
      .set({ emailVerifiedAt: now })
      .where(eq(User.id, record.userId))
      .returning({ id: User.id, sessionVersion: User.sessionVersion, email: User.email }),
    db
      .update(EmailVerificationToken)
      .set({ usedAt: now })
      .where(eq(EmailVerificationToken.id, record.id)),
  ]);

  return user ?? null;
}

/**
 * Verifies the address in an emailed link. Only the browser that registered (or asked for the
 * link again) is signed in, so a link someone else sends can't sign a victim into their account.
 */
export async function verifyEmail(
  token: string,
  cookies: AstroCookies,
): Promise<{ type: "invalid" } | { type: "signedIn"; userId: string } | { type: "verified" }> {
  const user = await verifyEmailToken(token);
  if (!user) return { type: "invalid" };

  const verifyingEmail = readVerifyingBrowser(cookies.get(VERIFY_EMAIL_COOKIE)?.value);
  cookies.delete(VERIFY_EMAIL_COOKIE, { path: "/" });
  if (verifyingEmail !== user.email) return { type: "verified" };

  startSession(cookies, user);
  return { type: "signedIn", userId: user.id };
}

export async function validatePasswordResetToken(token: string): Promise<boolean> {
  const now = new Date();
  const [record] = await db
    .select({ id: PasswordResetToken.id })
    .from(PasswordResetToken)
    .where(
      and(
        eq(PasswordResetToken.token, hashToken(token)),
        gt(PasswordResetToken.expiresAt, now),
        isNull(PasswordResetToken.usedAt),
      ),
    );
  return !!record;
}

export async function resetPassword(
  token: string,
  password: string,
): Promise<{ type: "success" } | { type: "invalid" } | { type: "error"; message: string }> {
  const passwordError = newPasswordError(password);
  if (passwordError) return { type: "error", message: passwordError };

  const now = new Date();
  const [record] = await db
    .select()
    .from(PasswordResetToken)
    .where(
      and(
        eq(PasswordResetToken.token, hashToken(token)),
        gt(PasswordResetToken.expiresAt, now),
        isNull(PasswordResetToken.usedAt),
      ),
    );

  if (!record) return { type: "invalid" };

  const passwordHash = await hashPassword(password);
  await db.batch([
    // Whoever had the old password may still be signed in somewhere.
    db
      .update(User)
      .set({ passwordHash, sessionVersion: bumpSessionVersion })
      .where(eq(User.id, record.userId)),
    // The link came by email, so using it proves the address. Accounts added by an admin start
    // unverified and get verified here when the person sets their first password.
    db
      .update(User)
      .set({ emailVerifiedAt: now })
      .where(and(eq(User.id, record.userId), isNull(User.emailVerifiedAt))),
    db.update(PasswordResetToken).set({ usedAt: now }).where(eq(PasswordResetToken.id, record.id)),
    // A pending email change may have been started by whoever had the old password.
    db
      .update(EmailChangeToken)
      .set({ usedAt: now })
      .where(and(eq(EmailChangeToken.userId, record.userId), isNull(EmailChangeToken.usedAt))),
  ]);

  return { type: "success" };
}

async function deleteUserData(userId: string): Promise<void> {
  const deleted = await db
    .delete(User)
    .where(eq(User.id, userId))
    .returning({ avatarUrl: User.avatarUrl })
    .get();
  await deleteImage(deleted?.avatarUrl);
}

// Self-service account deletion: requires password, blocks admins from deleting themselves.
export async function deleteAccount(
  userId: string,
  role: string,
  password: string | undefined,
): Promise<ActionResult> {
  if (role === "admin") {
    return {
      type: "error",
      message: "Site administrators cannot delete their own account. Transfer admin rights first.",
    };
  }
  if (!password) {
    return { type: "error", message: "Password is required to delete your account." };
  }

  const fullUser = await db.select().from(User).where(eq(User.id, userId)).get();
  const valid = fullUser ? await verifyPassword(password, fullUser.passwordHash) : false;
  if (!valid) {
    return { type: "error", message: "Incorrect password. Account not deleted." };
  }

  await deleteUserData(userId);
  return { type: "redirect", url: "/" };
}

// Admin-initiated deletion: no password required, can delete any non-self user.
export async function adminDeleteUser(userId: string): Promise<void> {
  await deleteUserData(userId);
}
