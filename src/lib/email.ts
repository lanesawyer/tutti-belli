import { Resend } from 'resend';

interface SendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

function getEnv(key: string, fallback = ''): string {
  return import.meta.env[key] || process.env[key] || fallback;
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

function getClient(): { client: Resend; fromEmail: string } | { error: EmailResult } {
  const apiKey = getEnv('EMAIL_API_KEY');
  if (!apiKey) {
    console.error('EMAIL_API_KEY is not set');
    return { error: { success: false, error: 'Email service is not configured' } };
  }
  return { client: new Resend(apiKey), fromEmail: getEnv('EMAIL_FROM', 'noreply@example.com') };
}

async function sendEmail(params: SendParams, logContext: string): Promise<EmailResult> {
  if (getEnv('EMAIL_DISABLED')) {
    console.log(`[email] disabled — skipping ${logContext} to="${params.to}"`);
    return { success: true };
  }
  const result = getClient();
  if ('error' in result) return result.error;

  console.log(`[email] ${logContext} to="${params.to}"`);
  try {
    const { error: sendError } = await result.client.emails.send(params);
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
  if (getEnv('EMAIL_DISABLED')) {
    console.log(`[email] disabled — skipping ${logContext} to ${paramsList.length} recipients`);
    return { success: true };
  }
  const result = getClient();
  if ('error' in result) return result.error;

  console.log(`[email] ${logContext} to ${paramsList.length} recipients`);
  try {
    const { error: sendError } = await result.client.batch.send(paramsList);
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

  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');
  const announcementsUrl = new URL(`/ensembles/${ensembleId}/announcements`, siteUrl).toString();

  return sendEmailBatch(
    recipients.map(({ email, name }) => ({
      from: fromEmail,
      to: email,
      subject: `[${ensembleName}] ${announcementTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${announcementTitle}</h2>
          <p>Hi ${name},</p>
          <p><strong>${authorName}</strong> posted a new announcement in <strong>${ensembleName}</strong>:</p>
          <div style="background-color: #f5f5f5; border-left: 4px solid #485fc7; padding: 16px; margin: 24px 0; white-space: pre-wrap;">${announcementContent}</div>
          <p style="margin: 32px 0;">
            <a
              href="${announcementsUrl}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              View Announcements
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            You're receiving this because you're a member of ${ensembleName}.
          </p>
        </div>
      `,
    })),
    'announcement emails',
  );
}

export async function sendEmailChangeVerificationEmail(
  toEmail: string,
  toName: string,
  verifyToken: string,
): Promise<EmailResult> {
  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');
  const verifyUrl = new URL(`/verify-email-change?token=${verifyToken}`, siteUrl).toString();

  return sendEmail(
    {
      from: fromEmail,
      to: toEmail,
      subject: 'Verify your new email address',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify your new email address</h2>
          <p>Hi ${toName},</p>
          <p>We received a request to change your account email to <strong>${toEmail}</strong>.</p>
          <p>Click the button below to confirm this change. Your current email will continue to work for login until you verify the new one.</p>
          <p style="margin: 32px 0;">
            <a
              href="${verifyUrl}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              Verify New Email
            </a>
          </p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this change, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            If the button above doesn't work, copy and paste this URL into your browser:<br />
            <a href="${verifyUrl}" style="color: #485fc7;">${verifyUrl}</a>
          </p>
        </div>
      `,
    },
    'email change verification email',
  );
}

export async function sendEmailVerificationEmail(
  toEmail: string,
  toName: string,
  verifyToken: string,
): Promise<EmailResult> {
  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');
  const verifyUrl = new URL(`/verify-email?token=${verifyToken}`, siteUrl).toString();

  return sendEmail(
    {
      from: fromEmail,
      to: toEmail,
      subject: 'Verify your email address',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Ensemble!</h2>
          <p>Hi ${toName},</p>
          <p>Thanks for signing up! Please verify your email address to activate your account.</p>
          <p style="margin: 32px 0;">
            <a
              href="${verifyUrl}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              Verify Email Address
            </a>
          </p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't create an account, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            If the button above doesn't work, copy and paste this URL into your browser:<br />
            <a href="${verifyUrl}" style="color: #485fc7;">${verifyUrl}</a>
          </p>
        </div>
      `,
    },
    'email verification email',
  );
}

export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetToken: string,
): Promise<EmailResult> {
  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');
  const resetUrl = new URL(`/reset-password?token=${resetToken}`, siteUrl).toString();

  return sendEmail(
    {
      from: fromEmail,
      to: toEmail,
      subject: 'Reset your password',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi ${toName},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one.</p>
          <p style="margin: 32px 0;">
            <a
              href="${resetUrl}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              Reset Password
            </a>
          </p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            If the button above doesn't work, copy and paste this URL into your browser:<br />
            <a href="${resetUrl}" style="color: #485fc7;">${resetUrl}</a>
          </p>
        </div>
      `,
    },
    'password reset email',
  );
}
