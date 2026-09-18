import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../../utils/api';

type Props = {
  onSuccess?: () => void;
  /** Utilise les classes Liquid Glass quand true (sinon styles classiques). */
  liquid?: boolean;
};

/** Formulaire de changement de mot de passe, réutilisable dans les deux thèmes. */
export default function ChangePasswordForm({ onSuccess, liquid = false }: Props) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const inputClass = liquid
    ? 'lg-input pr-11'
    : 'w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary';
  const labelClass = liquid ? 'lg-label' : 'block text-sm font-medium text-slate-700 mb-1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      const res = await authFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const data = await safeJson<{ error?: string }>(res);
      if (data.error) {
        setError(data.error);
        return;
      }
      setSuccess(true);
      setCurrentPwd('');
      setNewPwd('');
      onSuccess?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-500" aria-hidden="true" />
        </div>
        <p className="font-semibold text-slate-800">Mot de passe modifié !</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass} htmlFor="pwd-current">Mot de passe actuel</label>
        <div className="relative">
          <input
            id="pwd-current"
            type={showCurrent ? 'text' : 'password'}
            required
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className={inputClass}
          />
          <button type="button" onClick={() => setShowCurrent((s) => !s)} aria-label={showCurrent ? 'Masquer' : 'Afficher'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="pwd-new">Nouveau mot de passe</label>
        <div className="relative">
          <input
            id="pwd-new"
            type={showNew ? 'text' : 'password'}
            required
            minLength={8}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Min. 8 caractères"
            className={inputClass}
          />
          <button type="button" onClick={() => setShowNew((s) => !s)} aria-label={showNew ? 'Masquer' : 'Afficher'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className={
            liquid
              ? 'lg-btn lg-btn-primary'
              : 'px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-60'
          }
        >
          <KeyRound className="w-4 h-4" aria-hidden="true" />
          {loading ? 'Enregistrement...' : 'Confirmer'}
        </button>
      </div>
    </form>
  );
}
