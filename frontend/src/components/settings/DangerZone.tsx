import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, RefreshCw, Trash2, X, ShieldAlert } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import {
  CURRENT_BACKUP_FORMAT_VERSION,
  buildBackupFilename,
  downloadTextFile,
  addBackupHistoryEntry,
} from '../../utils/backup';

const RESET_CONFIRMATION = 'SUPPRIMER TOUTES LES DONNÉES';

/**
 * Zone dangereuse (ADMIN uniquement) : réinitialisation complète des données
 * métier. Les comptes utilisateurs (dont les ADMIN) sont toujours conservés.
 * Confirmation forte exigée côté client ET côté serveur.
 */
export default function DangerZone() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const confirmed = confirmText.trim() === RESET_CONFIRMATION;

  const handleBackupFirst = async () => {
    setBackingUp(true);
    try {
      const res = await authFetch('/api/export');
      if (!res.ok) {
        await safeJson(res);
        return;
      }
      const text = await res.text();
      const now = new Date();
      const filename = buildBackupFilename(now, CURRENT_BACKUP_FORMAT_VERSION);
      downloadTextFile(text, filename);
      addBackupHistoryEntry({
        createdAt: now.toISOString(),
        filename,
        backupFormatVersion: CURRENT_BACKUP_FORMAT_VERSION,
      });
      toast.success('Sauvegarde téléchargée');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBackingUp(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmed) return;
    setDeleting(true);
    try {
      const res = await authFetch('/api/data/reset', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: RESET_CONFIRMATION }),
      });
      await safeJson(res);
      toast.success('Toutes les données métier ont été supprimées. Les comptes utilisateurs sont conservés.');
      setExpanded(false);
      setConfirmText('');
      navigate('/dashboard');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      aria-labelledby="danger-heading"
      className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-red-50 rounded-xl shrink-0">
          <ShieldAlert className="w-5 h-5 text-red-600" aria-hidden="true" />
        </div>
        <div>
          <h2 id="danger-heading" className="text-lg font-bold text-red-700">
            Zone dangereuse
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Actions irréversibles réservées aux administrateurs.
          </p>
        </div>
      </div>

      {!expanded ? (
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50/60 p-4">
          <p className="text-sm text-red-700">
            Supprimer définitivement toutes les données métier. Les comptes utilisateurs sont conservés.
          </p>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" /> Supprimer toutes les données
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50/70 p-4 sm:p-5">
          <p className="text-sm text-red-800 flex items-start gap-2" role="alert">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Cette action supprimera définitivement tous les élèves, classes, professeurs, paiements et présences. Les
              comptes utilisateurs seront conservés.
            </span>
          </p>

          <button
            type="button"
            onClick={handleBackupFirst}
            disabled={backingUp}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-emerald-300 text-emerald-700 text-sm font-semibold rounded-xl hover:bg-emerald-50 transition-colors disabled:opacity-60"
          >
            {backingUp ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> Préparation...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" aria-hidden="true" /> Télécharger une sauvegarde avant de supprimer
              </>
            )}
          </button>
          <p className="text-xs text-emerald-700 mt-2">Conseillé : téléchargez une sauvegarde avant de continuer.</p>

          <label htmlFor="danger-confirm" className="block text-sm font-semibold text-red-800 mt-5 mb-1">
            Tapez <code className="bg-white px-1 rounded">{RESET_CONFIRMATION}</code> pour confirmer
          </label>
          <input
            id="danger-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            aria-describedby="danger-help"
            className="w-full px-3 py-2.5 border border-red-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-red-400"
          />
          <p id="danger-help" className="text-xs text-red-600 mt-1">
            Le bouton de confirmation reste désactivé tant que le texte n'est pas exactement correct.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setConfirmText('');
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white rounded-xl transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" /> Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" aria-hidden="true" /> Confirmer la suppression
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
