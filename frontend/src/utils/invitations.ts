// Teacher accounts created by invitation: shared types and labels.

export type AccountStatus = 'ACTIVE' | 'INVITED' | 'EXPIRED';

/** The Prof account of a teacher record (null: none yet). */
export type TeacherAccount = { email: string; status: AccountStatus; inviteExpiresAt: string | null } | null;

/** Outcome of an invitation: the link is only given when the email did not leave. */
export type InvitationResult =
  | { email: string; emailStatus: 'SENT' | 'SIMULATED' | 'FAILED'; expiresAt: string; link?: string }
  | { error: string };

export const ACCOUNT_LABELS: Record<AccountStatus | 'NONE' | 'NO_EMAIL', { label: string; color: string }> = {
  ACTIVE: { label: 'Accès actif', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INVITED: { label: 'Invitation envoyée', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  EXPIRED: { label: 'Invitation expirée', color: 'bg-red-50 text-red-700 border-red-200' },
  NONE: { label: "Pas encore d'accès", color: 'bg-slate-50 text-slate-600 border-slate-200' },
  NO_EMAIL: { label: "Pas d'e-mail", color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

/** Status shown for a teacher record. */
export const accessKey = (email: string | null | undefined, account: TeacherAccount) =>
  account ? account.status : email ? 'NONE' : 'NO_EMAIL';

/** One-line message after an invitation, for a toast. */
export function invitationMessage(result: InvitationResult): { ok: boolean; text: string } {
  if ('error' in result) return { ok: false, text: `Compte professeur : ${result.error}` };
  if (result.emailStatus === 'SENT') return { ok: true, text: `Invitation envoyée à ${result.email}` };
  if (result.emailStatus === 'FAILED') {
    return { ok: false, text: "L'e-mail d'invitation n'a pas pu partir : copiez le lien affiché sur la fiche du professeur" };
  }
  return { ok: true, text: "Compte créé. L'envoi d'e-mails n'est pas configuré : copiez le lien d'invitation sur la fiche" };
}
