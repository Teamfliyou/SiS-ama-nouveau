// Transactional emails through the Brevo API (https://developers.brevo.com).
// Without BREVO_API_KEY nothing leaves the server: the email is only logged and
// reported as SIMULATED, which keeps local testing safe.

export type MailStatus = 'SENT' | 'SIMULATED' | 'FAILED';

export type Mail = {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export const mailConfigured = (): boolean => !!process.env.BREVO_API_KEY;

export async function sendMail(mail: Mail): Promise<MailStatus> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.info(`[mail simulé] à ${mail.to.join(', ')} — ${mail.subject}`);
    }
    return 'SIMULATED';
  }
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: {
          email: process.env.MAIL_FROM || 'edu@assoma.fr',
          name: process.env.MAIL_FROM_NAME || 'Association Musulmane Audomaroise',
        },
        to: mail.to.map((email) => ({ email })),
        ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
        subject: mail.subject,
        textContent: mail.text,
        htmlContent: mail.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[mail] Brevo a refusé l'envoi (${res.status})`);
      return 'FAILED';
    }
    return 'SENT';
  } catch (err) {
    console.error('[mail] envoi impossible :', err instanceof Error ? err.message : err);
    return 'FAILED';
  }
}
