import { useState } from 'react';
import { Check, Database, Monitor, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import { authFetch, apiErrorMessage } from '../utils/api';
import { getTheme, setTheme, type UiTheme } from '../utils/theme';
import { toast } from '../utils/toast';

const RESET_PHRASE = 'SUPPRIMER TOUTES LES DONNÉES';

export default function Settings() {
  const [theme, setCurrentTheme] = useState<UiTheme>(() => getTheme());
  const [showReset, setShowReset] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [resetting, setResetting] = useState(false);
  const isAdmin = localStorage.getItem('role') === 'ADMIN';

  const chooseTheme = (next: UiTheme) => {
    setCurrentTheme(next);
    setTheme(next);
  };

  const resetData = async () => {
    if (confirmation !== RESET_PHRASE) return;
    setResetting(true);
    try {
      const res = await authFetch('/api/data/reset', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: RESET_PHRASE }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Impossible de supprimer les données');
      }
      toast.success('Toutes les données de gestion ont été supprimées.');
      setShowReset(false);
      setConfirmation('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Paramètres</h2>
        <p className="mt-2 text-sm text-slate-500">Personnalisez l'interface et gérez les options avancées de SiS AMA.</p>
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="p-2.5 rounded-xl bg-blue-50 text-primary"><Monitor className="w-5 h-5" /></div>
          <div>
            <h3 className="font-bold text-slate-900">Apparence</h3>
            <p className="text-sm text-slate-500 mt-1">Le changement est instantané et reste mémorisé sur cet appareil.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => chooseTheme('classic')}
            className={`relative text-left rounded-2xl border-2 p-5 transition-all ${theme === 'classic' ? 'border-primary bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
          >
            {theme === 'classic' && <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary text-white grid place-items-center"><Check className="w-4 h-4" /></span>}
            <div className="w-full h-24 rounded-xl bg-slate-50 border border-slate-200 mb-4 p-3 flex gap-2">
              <div className="w-1/4 rounded-lg bg-white border border-slate-200" />
              <div className="flex-1 space-y-2"><div className="h-3 w-1/2 bg-slate-300 rounded"/><div className="h-12 bg-white border border-slate-200 rounded-lg"/></div>
            </div>
            <p className="font-bold text-slate-900">Classique</p>
            <p className="text-xs text-slate-500 mt-1">L'interface actuelle de SiS AMA.</p>
          </button>

          <button
            onClick={() => chooseTheme('liquid')}
            className={`relative text-left rounded-2xl border-2 p-5 transition-all ${theme === 'liquid' ? 'border-primary bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
          >
            {theme === 'liquid' && <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-primary text-white grid place-items-center"><Check className="w-4 h-4" /></span>}
            <div className="w-full h-24 rounded-xl bg-gradient-to-br from-blue-100 via-white to-violet-100 border border-white/80 mb-4 p-3 flex gap-2 overflow-hidden">
              <div className="w-1/4 rounded-xl bg-white/55 border border-white/70 backdrop-blur-xl shadow-sm" />
              <div className="flex-1 space-y-2"><div className="h-3 w-1/2 bg-white/70 rounded-full"/><div className="h-12 bg-white/45 border border-white/70 rounded-xl backdrop-blur-xl shadow-sm"/></div>
            </div>
            <div className="flex items-center gap-2"><p className="font-bold text-slate-900">Liquid Glass</p><Sparkles className="w-4 h-4 text-primary" /></div>
            <p className="text-xs text-slate-500 mt-1">Plus moderne, léger, translucide et inspiré des interfaces Apple récentes.</p>
          </button>
        </div>
      </section>

      {isAdmin && (
        <section className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-red-50 text-red-600"><Database className="w-5 h-5" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900">Zone dangereuse</h3>
                <p className="text-sm text-slate-500 mt-1">Réinitialise les élèves, classes, professeurs, paiements et présences. Les comptes utilisateurs sont conservés.</p>
              </div>
            </div>

            {!showReset ? (
              <button onClick={() => setShowReset(true)} className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors">
                <Trash2 className="w-4 h-4" /> Supprimer toutes les données
              </button>
            ) : (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/70 p-5 space-y-4">
                <div className="flex gap-3 text-red-800">
                  <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <div><p className="font-bold">Cette action est définitive.</p><p className="text-sm mt-1">Faites un export de sauvegarde avant de continuer si vous souhaitez pouvoir restaurer les données.</p></div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tapez exactement <strong>{RESET_PHRASE}</strong></label>
                  <input value={confirmation} onChange={e => setConfirmation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-red-200 bg-white focus:ring-2 focus:ring-red-400 focus:border-transparent" autoComplete="off" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => { setShowReset(false); setConfirmation(''); }} className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50">Annuler</button>
                  <button onClick={resetData} disabled={confirmation !== RESET_PHRASE || resetting} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> {resetting ? 'Suppression...' : 'Confirmer la suppression'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
