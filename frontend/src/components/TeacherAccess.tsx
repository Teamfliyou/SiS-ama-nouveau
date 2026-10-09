import { useState } from 'react';
import { Copy, KeyRound, Loader2, Send } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { copyText } from '../utils/clipboard';
import {
  ACCOUNT_LABELS,
  accessKey,
  invitationMessage,
  type InvitationResult,
  type TeacherAccount,
} from '../utils/invitations';

type Props = {
  teacherId: number;
  email: string | null;
  account: TeacherAccount;
  /** Invitation just made for this teacher (at creation), to show its link. */
  result?: InvitationResult | null;
  onChanged?: () => void;
  compact?: boolean;
};

/**
 * Access of a teacher to the application: status of their Prof account and the
 * invitation button. When the email could not leave, the link is shown to be
 * sent another way (WhatsApp, SMS...).
 */
export default function TeacherAccess({ teacherId, email, account, result, onChanged, compact }: Props) {
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<InvitationResult | null>(null);
  const shown = last ?? result ?? null;
  const key = accessKey(email, account);
  const info = ACCOUNT_LABELS[key];
  const link = shown && !('error' in shown) ? shown.link : undefined;

  const invite = async () => {
    setSending(true);
    try {
      const res = await safeJson<InvitationResult>(await authFetch(`/api/teachers/${teacherId}/invitation`, { method: 'POST' }));
      setLast(res);
      const msg = invitationMessage(res);
      if (msg.ok) toast.success(msg.text);
      else toast.error(msg.text);
      onChanged?.();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (link && (await copyText(link))) toast.success("Lien d'invitation copié");
    else toast.error('Copie impossible : sélectionnez le lien à la main');
  };

  const action = key === 'ACTIVE' ? 'Nouveau mot de passe' : key === 'NONE' ? 'Inviter' : "Renvoyer l'invitation";

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'} onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${info.color}`}
          title={account?.inviteExpiresAt ? `Lien valable jusqu'au ${new Date(account.inviteExpiresAt).toLocaleDateString('fr-FR')}` : undefined}
        >
          <KeyRound className="w-3 h-3" /> {info.label}
        </span>
        {email && (
          <button type="button" onClick={invite} disabled={sending}
            title={key === 'ACTIVE' ? 'Envoie un lien pour choisir un nouveau mot de passe' : "Envoie le lien pour choisir son mot de passe"}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} {action}
          </button>
        )}
      </div>
      {!email && !compact && (
        <p className="text-[11px] text-slate-500">Ajoutez son adresse e-mail pour lui créer un accès.</p>
      )}
      {shown && 'error' in shown && <p className="text-[11px] text-red-600">{shown.error}</p>}
      {link && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
          <p className="text-[11px] text-amber-800">
            {shown && !('error' in shown) && shown.emailStatus === 'FAILED'
              ? "L'e-mail n'a pas pu partir."
              : "L'envoi d'e-mails n'est pas configuré."}{' '}
            Envoyez ce lien au professeur (valable 7 jours) :
          </p>
          <div className="flex gap-1">
            <input readOnly value={link} onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded border border-amber-200 bg-white px-2 py-1 text-[11px] text-slate-700" />
            <button type="button" onClick={copy}
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
              <Copy className="w-3 h-3" /> Copier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
