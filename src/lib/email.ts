import { Resend } from "resend";
import { siteLink } from "./site-url";

interface SendParams {
  to: string;
  subject: string;
  html: string;
}

function getEnv(key: string): string {
  return process.env[key] || "";
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Plain text as HTML: escaped, with line breaks kept as `<br />`. */
export function textToHtml(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br />");
}

/** A header-safe subject: control characters, including CR and LF, become spaces. */
export function emailSubject(value: string): string {
  return value.replace(/[\p{Cc}\u2028\u2029]+/gu, " ").trim();
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

function getClient(): { client: Resend; fromEmail: string } | { error: EmailResult } {
  const apiKey = getEnv("EMAIL_API_KEY");
  if (!apiKey) {
    console.error("EMAIL_API_KEY is not set");
    return { error: { success: false, error: "Email service is not configured" } };
  }
  const fromEmail = getEnv("EMAIL_FROM");
  if (!fromEmail) {
    console.error("EMAIL_FROM is not set");
    return { error: { success: false, error: "Email service is not configured" } };
  }
  return { client: new Resend(apiKey), fromEmail };
}

const HTML_UNESCAPES: Record<string, string> = Object.fromEntries(
  Object.entries(HTML_ESCAPES).map(([char, entity]) => [entity, char]),
);

function emailLinks(html: string): string[] {
  const links = [...html.matchAll(/href="([^"]*)"/g)].map((match) =>
    match[1].replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => HTML_UNESCAPES[entity]),
  );
  return [...new Set(links)];
}

/** With sending disabled (local dev, tests, PR previews), the log stands in for the inbox. */
function logUnsentEmail(params: SendParams, logContext: string): void {
  console.log(
    `[email] disabled — skipping ${logContext} to="${params.to}" subject="${emailSubject(params.subject)}"`,
  );
  for (const link of emailLinks(params.html)) {
    console.log(`[email]   link: ${link}`);
  }
}

async function sendEmail(params: SendParams, logContext: string): Promise<EmailResult> {
  if (getEnv("EMAIL_DISABLED")) {
    logUnsentEmail(params, logContext);
    return { success: true };
  }
  const result = getClient();
  if ("error" in result) return result.error;

  console.log(`[email] ${logContext} to="${params.to}"`);
  try {
    const { error: sendError } = await result.client.emails.send({
      ...params,
      from: result.fromEmail,
      subject: emailSubject(params.subject),
    });
    if (sendError) {
      console.error(`Failed to send ${logContext}:`, sendError);
      return { success: false, error: sendError.message };
    }
    return { success: true };
  } catch (error) {
    console.error(`Failed to send ${logContext}:`, error);
    return { success: false, error: String(error) };
  }
}

async function sendEmailBatch(paramsList: SendParams[], logContext: string): Promise<EmailResult> {
  if (getEnv("EMAIL_DISABLED")) {
    for (const params of paramsList) logUnsentEmail(params, logContext);
    return { success: true };
  }
  const result = getClient();
  if ("error" in result) return result.error;

  console.log(`[email] ${logContext} to ${paramsList.length} recipients`);
  try {
    const { error: sendError } = await result.client.batch.send(
      paramsList.map((params) => ({
        ...params,
        from: result.fromEmail,
        subject: emailSubject(params.subject),
      })),
    );
    if (sendError) {
      console.error(`Failed to send ${logContext}:`, sendError);
      return { success: false, error: sendError.message };
    }
    return { success: true };
  } catch (error) {
    console.error(`Failed to send ${logContext}:`, error);
    return { success: false, error: String(error) };
  }
}

export async function sendAnnouncementEmail(
  recipients: { email: string; name: string }[],
  ensembleName: string,
  ensembleId: string,
  announcementTitle: string,
  announcementContent: string,
  authorName: string,
): Promise<EmailResult> {
  if (recipients.length === 0) return { success: true };

  const announcementsUrl = siteLink(`/ensembles/${encodeURIComponent(ensembleId)}/announcements`);

  return sendEmailBatch(
    recipients.map(({ email, name }) => ({
      to: email,
      subject: `[${ensembleName}] ${announcementTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${escapeHtml(announcementTitle)}</h2>
          <p>Hi ${escapeHtml(name)},</p>
          <p><strong>${escapeHtml(authorName)}</strong> posted a new announcement in <strong>${escapeHtml(ensembleName)}</strong>:</p>
          <div style="background-color: #f5f5f5; border-left: 4px solid #485fc7; padding: 16px; margin: 24px 0;">${textToHtml(announcementContent)}</div>
          ${emailButton(announcementsUrl, "View Announcements")}
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            You're receiving this because you're a member of ${escapeHtml(ensembleName)}.
          </p>
        </div>
      `,
    })),
    "announcement emails",
  );
}

export async function sendEmailChangeVerificationEmail(
  toEmail: string,
  toName: string,
  verifyToken: string,
): Promise<EmailResult> {
  const verifyUrl = siteLink("/verify-email-change", { token: verifyToken });

  return sendEmail(
    {
      to: toEmail,
      subject: "Verify your new email address",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify your new email address</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>We received a request to change your account email to <strong>${escapeHtml(toEmail)}</strong>.</p>
          <p>Click the button below to confirm this change. Your current email will continue to work for login until you verify the new one.</p>
          ${emailButton(verifyUrl, "Verify New Email")}
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this change, you can safely ignore this email.</p>
          ${linkFallback(verifyUrl)}
        </div>
      `,
    },
    "email change verification email",
  );
}

/** To the current address when someone asks to move the account to another one. */
export async function sendEmailChangeRequestedEmail(
  toEmail: string,
  toName: string,
  newEmail: string,
): Promise<EmailResult> {
  const resetUrl = siteLink("/forgot-password");

  return sendEmail(
    {
      to: toEmail,
      subject: "Email change requested",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email change requested</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>Someone asked to change your account email to <strong>${escapeHtml(newEmail)}</strong>. Nothing changes unless the link sent to that address is used.</p>
          <p>If this wasn't you, reset your password now.</p>
          ${emailButton(resetUrl, "Reset Password")}
        </div>
      `,
    },
    "email change requested email",
  );
}

/** To the old address once an email change is confirmed. */
export async function sendEmailChangedEmail(
  toEmail: string,
  toName: string,
  newEmail: string,
): Promise<EmailResult> {
  return sendEmail(
    {
      to: toEmail,
      subject: "Your email address was changed",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your email address was changed</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>Your account email is now <strong>${escapeHtml(newEmail)}</strong>, and you have been signed out everywhere.</p>
          <p>If this wasn't you, contact your ensemble administrator right away.</p>
        </div>
      `,
    },
    "email changed email",
  );
}

export async function sendEmailVerificationEmail(
  toEmail: string,
  toName: string,
  verifyToken: string,
): Promise<EmailResult> {
  const verifyUrl = siteLink("/verify-email", { token: verifyToken });

  return sendEmail(
    {
      to: toEmail,
      subject: "Verify your email address",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Ensemble!</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>Thanks for signing up! Please verify your email address to activate your account.</p>
          ${emailButton(verifyUrl, "Verify Email Address")}
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
          ${linkFallback(verifyUrl)}
        </div>
      `,
    },
    "email verification email",
  );
}

/** To an address that already has an account when someone tries to sign up with it again. */
export async function sendAccountExistsEmail(
  toEmail: string,
  toName: string,
): Promise<EmailResult> {
  const loginUrl = siteLink("/login");
  const resetUrl = siteLink("/forgot-password");

  return sendEmail(
    {
      to: toEmail,
      subject: "You already have an account",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You already have an account</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>Someone tried to sign up with this email address, but it already has an account. If that was you, log in instead.</p>
          ${emailButton(loginUrl, "Log In")}
          <p>Forgot your password, or never finished setting up the account? <a href="${escapeHtml(resetUrl)}" style="color: #485fc7;">Reset your password</a>.</p>
          <p>If this wasn't you, you can safely ignore this email.</p>
        </div>
      `,
    },
    "account exists email",
  );
}

export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetToken: string,
): Promise<EmailResult> {
  const resetUrl = passwordSetUrl(resetToken);

  return sendEmail(
    {
      to: toEmail,
      subject: "Reset your password",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one.</p>
          ${emailButton(resetUrl, "Reset Password")}
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
          ${linkFallback(resetUrl)}
        </div>
      `,
    },
    "password reset email",
  );
}

/** The reset-password link, which also lets a newly added member choose their first password. */
export function passwordSetUrl(token: string): string {
  return siteLink("/reset-password", { token });
}

function emailButton(href: string, label: string): string {
  return `
          <p style="margin: 32px 0;">
            <a
              href="${escapeHtml(href)}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              ${escapeHtml(label)}
            </a>
          </p>`;
}

function linkFallback(href: string): string {
  return `
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            If the button above doesn't work, copy and paste this URL into your browser:<br />
            <a href="${escapeHtml(href)}" style="color: #485fc7;">${escapeHtml(href)}</a>
          </p>`;
}

/** For someone a site admin added who had no account yet: set a password to get in. */
export async function sendWelcomeEmail(
  toEmail: string,
  toName: string,
  ensembleName: string,
  setPasswordToken: string,
): Promise<EmailResult> {
  const setPasswordUrl = passwordSetUrl(setPasswordToken);

  return sendEmail(
    {
      to: toEmail,
      subject: `You've been added to ${ensembleName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to ${escapeHtml(ensembleName)}</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>You've been added to <strong>${escapeHtml(ensembleName)}</strong> on Tutti Belli. Choose a password to sign in.</p>
          ${emailButton(setPasswordUrl, "Set Your Password")}
          <p>This link will expire in 7 days.</p>
          ${linkFallback(setPasswordUrl)}
        </div>
      `,
    },
    "welcome email",
  );
}

/** For someone who already had an account and was added to another ensemble. */
export async function sendAddedToEnsembleEmail(
  toEmail: string,
  toName: string,
  ensembleName: string,
  ensembleId: string,
): Promise<EmailResult> {
  const ensembleUrl = siteLink(`/ensembles/${encodeURIComponent(ensembleId)}`);

  return sendEmail(
    {
      to: toEmail,
      subject: `You've been added to ${ensembleName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been added to ${escapeHtml(ensembleName)}</h2>
          <p>Hi ${escapeHtml(toName)},</p>
          <p>You're now a member of <strong>${escapeHtml(ensembleName)}</strong> on Tutti Belli.</p>
          ${emailButton(ensembleUrl, `Open ${ensembleName}`)}
        </div>
      `,
    },
    "added to ensemble email",
  );
}
