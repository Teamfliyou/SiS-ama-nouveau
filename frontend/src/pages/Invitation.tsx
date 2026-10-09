import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { API_BASE } from '../utils/api';

type Info = { email: string; firstName: string | null };

/** Public page of an invitation email: the teacher chooses their password. */
export default function Invitation() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Ce lien d'invitation est incomplet : ouvrez le lien reçu par e-mail.");
      return;
    }
    fetch(`${API_BASE}/api/invitations/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Lien invalide');
        setInfo(data as Info);
      })
      .catch((err: Error) => setError(err.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe sont différents');
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Enregistrement impossible');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'mt-1 block w-full px-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary text-sm';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6">
        <div className="text-center space-y-2">
          <img src="/logo.png" alt="ASSO AMA SIS" className="h-14 mx-auto object-contain" />
          <h1 className="text-xl font-bold text-slate-900">Votre accès à SiS AMA</h1>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
            <p className="text-sm text-slate-700">
              Votre mot de passe est enregistré. Connectez-vous avec <b>{info?.email}</b>.
            </p>
            <Link to="/login" className="inline-block px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-600">
              Se connecter
            </Link>
          </div>
        ) : info ? (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600">
              {info.firstName ? <>Bonjour {info.firstName}, choisissez</> : 'Choisissez'} le mot de passe de votre compte{' '}
              <b>{info.email}</b>. Vous seul le connaîtrez.
            </p>
            <label className="block text-sm font-medium text-slate-700">
              Mot de passe (8 caractères minimum)
              <div className="relative">
                <input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label="Afficher / masquer"
                  className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-slate-400">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirmez le mot de passe
              <input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
            </label>
            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-600 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Enregistrer mon mot de passe
            </button>
          </form>
        ) : error ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-red-600 bg-red-50 px-3 py-3 rounded-lg">{error}</p>
            <Link to="/login" className="text-sm font-semibold text-primary hover:underline">Aller à la connexion</Link>
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500"><Loader2 className="inline w-4 h-4 animate-spin mr-1" /> Vérification du lien…</p>
        )}
      </div>
    </div>
  );
}
