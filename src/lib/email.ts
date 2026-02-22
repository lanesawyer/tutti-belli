import { Resend } from 'resend';

interface SendParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

interface EmailAdapter {
  send(params: SendParams): Promise<{ error?: { message: string } }>;
}

function createResendAdapter(apiKey: string): EmailAdapter {
  const client = new Resend(apiKey);
  return {
    async send(params) {
      const { error } = await client.emails.send(params);
      return { error: error ?? undefined };
    },
  };
}

function getEnv(key: string, fallback = ''): string {
  return import.meta.env[key] || process.env[key] || fallback;
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendWelcomeEmail(
  toEmail: string,
  toName: string,
): Promise<EmailResult> {
  const apiKey = getEnv('EMAIL_API_KEY');
  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');

  if (!apiKey) {
    console.error('EMAIL_API_KEY is not set');
    return { success: false, error: 'Email service is not configured' };
  }

  console.log(`[email] welcome from="${fromEmail}", to="${toEmail}"`);

  const adapter = createResendAdapter(apiKey);
  const loginUrl = new URL('/login', siteUrl).toString();

  try {
    const { error: sendError } = await adapter.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Welcome to Ensemble!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Ensemble!</h2>
          <p>Hi ${toName},</p>
          <p>Thanks for creating an account. You're all set to start managing your ensembles, track rehearsals, and stay connected with your fellow musicians.</p>
          <p style="margin: 32px 0;">
            <a
              href="${loginUrl}"
              style="background-color: #485fc7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;"
            >
              Go to Ensemble
            </a>
          </p>
          <p>If you have any questions, just reply to this email. We're happy to help!</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #888; font-size: 0.875rem;">
            You're receiving this because you signed up at <a href="${siteUrl}" style="color: #485fc7;">${siteUrl}</a>.
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error('Failed to send welcome email:', sendError);
      return { success: false, error: sendError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    return { success: false, error: String(error) };
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  toName: string,
  resetToken: string,
): Promise<EmailResult> {
  const apiKey = getEnv('EMAIL_API_KEY');
  const fromEmail = getEnv('EMAIL_FROM', 'noreply@example.com');
  const siteUrl = getEnv('SITE', 'http://localhost:4321');

  if (!apiKey) {
    console.error('EMAIL_API_KEY is not set');
    return { success: false, error: 'Email service is not configured' };
  }

  console.log(`[email] from="${fromEmail}", to="${toEmail}", site="${siteUrl}"`);

  const adapter = createResendAdapter(apiKey);
  const resetUrl = new URL(`/reset-password?token=${resetToken}`, siteUrl).toString();

  try {
    const { error: sendError } = await adapter.send({
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
    });

    if (sendError) {
      console.error('Failed to send password reset email:', sendError);
      return { success: false, error: sendError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return { success: false, error: String(error) };
  }
}
