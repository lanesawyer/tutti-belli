import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import {
  DUMMY_PASSWORD_HASH,
  getUserByEmail,
  verifyPassword,
  createPasswordResetToken,
} from "@lib/auth";
import { rememberVerifyingBrowser, startSession } from "@lib/session";
import { getRedirectUrl } from "@lib/redirect";
import { sendPasswordResetEmail } from "@lib/email";
import {
  validatePasswordResetToken,
  resetPassword as doResetPassword,
  resendVerificationEmail,
} from "@lib/profile";
import {
  emailAndIpKey,
  failedLoginsByEmail,
  failedLoginsByEmailAndIp,
  failedLoginsByIp,
  passwordResetsByEmail,
  passwordResetsByIp,
  requestIp,
  retryAfter,
  tooManyAttemptsMessage,
  verificationResendsByEmail,
  verificationResendsByIp,
} from "@lib/rate-limit";
import { VIEW_AS_COOKIE } from "@lib/view-as";
import { newPassword } from "./utils";

export const auth = {
  login: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().min(1, "Email is required."),
      password: z.string().min(1, "Password is required."),
      redirect: z.string().optional(),
    }),
    handler: async ({ email, password, redirect }, context) => {
      const emailKey = email.trim().toLowerCase();
      const ip = requestIp(context);
      const pairKey = emailAndIpKey(emailKey, ip);
      const wait = retryAfter([
        [failedLoginsByEmailAndIp, pairKey],
        [failedLoginsByIp, ip],
        [failedLoginsByEmail, emailKey],
      ]);
      if (wait) {
        throw new ActionError({ code: "TOO_MANY_REQUESTS", message: tooManyAttemptsMessage(wait) });
      }

      const user = await getUserByEmail(email);
      const passwordMatches = await verifyPassword(
        password,
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!user || !passwordMatches) {
        failedLoginsByEmailAndIp.record(pairKey);
        failedLoginsByIp.record(ip);
        failedLoginsByEmail.record(emailKey);
        throw new ActionError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      failedLoginsByEmailAndIp.reset(pairKey);

      if (!user.emailVerifiedAt) {
        throw new ActionError({ code: "FORBIDDEN", message: `unverified:${email}` });
      }

      startSession(context.cookies, user);

      const redirectUrl = await getRedirectUrl(user.id, redirect);
      return { redirectUrl };
    },
  }),

  logout: defineAction({
    accept: "form",
    handler: async (_input, context) => {
      context.cookies.delete("session", { path: "/" });
      context.cookies.delete(VIEW_AS_COOKIE, { path: "/" });
    },
  }),

  forgotPassword: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().min(1, "Email is required."),
    }),
    handler: async ({ email }, context) => {
      const emailKey = email.trim().toLowerCase();
      const ip = requestIp(context);
      const wait = retryAfter([
        [passwordResetsByEmail, emailKey],
        [passwordResetsByIp, ip],
      ]);
      if (wait) {
        throw new ActionError({ code: "TOO_MANY_REQUESTS", message: tooManyAttemptsMessage(wait) });
      }
      passwordResetsByEmail.record(emailKey);
      passwordResetsByIp.record(ip);

      const user = await getUserByEmail(email);

      if (user) {
        const token = await createPasswordResetToken(user.id);
        // Not awaited outside dev: waiting on the email provider only for real accounts would
        // let the response time say which addresses have one.
        const sent = sendPasswordResetEmail(user.email, user.name, token).then((result) => {
          if (!result.success) console.error("Email send failed:", result.error);
          return result;
        });
        if (import.meta.env.DEV) {
          const result = await sent;
          if (!result.success) {
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Email failed: ${result.error}`,
            });
          }
        }
      }
      // Always return success to avoid leaking whether the email exists
    },
  }),

  resendVerification: defineAction({
    accept: "form",
    input: z.object({
      email: z.string().optional(),
    }),
    handler: async (input, context) => {
      const email = input.email?.trim().toLowerCase() ?? "";
      const ip = requestIp(context);
      // Over the limit, skip the email but answer the same way so the page can't be used
      // to probe for accounts or limits.
      if (
        email &&
        !retryAfter([
          [verificationResendsByEmail, email],
          [verificationResendsByIp, ip],
        ])
      ) {
        verificationResendsByEmail.record(email);
        verificationResendsByIp.record(ip);
        await resendVerificationEmail(email);
      }
      if (email) rememberVerifyingBrowser(context.cookies, email);
    },
  }),

  resetPassword: defineAction({
    accept: "form",
    input: z.object({
      token: z.string().min(1),
      password: newPassword,
      confirmPassword: z.string().min(1, "Please confirm your password."),
    }),
    handler: async ({ token, password, confirmPassword }) => {
      if (password !== confirmPassword) {
        throw new ActionError({ code: "BAD_REQUEST", message: "Passwords do not match." });
      }

      const valid = await validatePasswordResetToken(token);
      if (!valid) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "This password reset link is invalid or has expired. Please request a new one.",
        });
      }

      const result = await doResetPassword(token, password);
      if (result.type === "invalid") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "This password reset link is invalid or has expired. Please request a new one.",
        });
      }
      if (result.type === "error") {
        throw new ActionError({ code: "BAD_REQUEST", message: result.message });
      }
    },
  }),
};
