import { useEffect, useRef, useState } from 'react';
import {
  Download,
  UploadCloud,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  History,
  Trash2,
  Layers,
  DatabaseZap,
} from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import {
  CURRENT_BACKUP_FORMAT_VERSION,
  buildBackupFilename,
  downloadTextFile,
  parseBackupFileText,
  getBackupSummary,
  getBackupHistory,
  addBackupHistoryEntry,
  clearBackupHistory,
  formatBackupDateTime,
  formatBackupDayTime,
  type ParsedBackup,
  type BackupHistoryEntry,
} from '../../utils/backup';

type ImportResult = {
  classesCreated: number;
  studentsCreated: number;
  teachersCreated: number;
  paymentsCreated: number;
  attendancesCreated: number;
};

type SelectedBackup = {
  filename: string;
  raw: unknown;
  parsed: ParsedBackup;
};

type Strategy = 'merge' | 'replace';

const REPLACE_CONFIRMATION = 'REMPLACER';

/**
 * Sauvegarde / restauration complète (ADMIN uniquement).
 * Le téléchargement va toujours sur le PC de l'utilisateur ; l'historique
 * local n'est qu'informatif (le navigateur ne peut pas lister le disque).
 */
export default function BackupSettings() {
  const [downloading, setDownloading] = useState(false);
  const [selected, setSelected] = useState<SelectedBackup | null>(null);
  const [parseError, setParseError] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [replaceConfirm, setReplaceConfirm] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHistory(getBackupHistory());
  }, []);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await authFetch('/api/export');
      if (!res.ok) {
        await safeJson(res);
        return;
      }
      const text = await res.text();
      const now = new Date();
      const filename = buildBackupFilename(now, CURRENT_BACKUP_FORMAT_VERSION);
      // Téléchargement sur le PC de l'utilisateur (jamais uniquement serveur).
      downloadTextFile(text, filename);
      addBackupHistoryEntry({
        createdAt: now.toISOString(),
        filename,
        backupFormatVersion: CURRENT_BACKUP_FORMAT_VERSION,
      });
      setHistory(getBackupHistory());
      toast.success('Sauvegarde téléchargée');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    try {
      const text = await file.text();
      const parsed = parseBackupFileText(text);
      setSelected({ filename: file.name, raw: JSON.parse(text) as unknown, parsed });
      setStrategy('merge');
      setReplaceConfirm('');
    } catch (err) {
      setSelected(null);
      setParseError(err instanceof SyntaxError ? 'Fichier JSON invalide.' : 'Fichier illisible.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!selected) return;
    if (strategy === 'replace' && replaceConfirm.trim().toUpperCase() !== REPLACE_CONFIRMATION) {
      toast.error(`Tapez ${REPLACE_CONFIRMATION} pour confirmer le remplacement.`);
      return;
    }
    setRestoring(true);
    try {
      const mode = strategy === 'replace' ? 'replace' : 'merge';
      const res = await authFetch(`/api/import/full?mode=${mode}`, {
        method: 'POST',
        body: JSON.stringify(selected.raw),
      });
      const data = await safeJson<ImportResult>(res);
      toast.success(
        `Restauration réussie : ${data.studentsCreated} élèves, ${data.classesCreated} classes, ` +
          `${data.teachersCreated} professeurs, ${data.paymentsCreated} paiements, ${data.attendancesCreated} présences.`
      );
      setSelected(null);
      setReplaceConfirm('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setRestoring(false);
    }
  };

  const summary = selected ? getBackupSummary(selected.parsed) : null;
  const replaceReady = strategy !== 'replace' || replaceConfirm.trim().toUpperCase() === REPLACE_CONFIRMATION;

  return (
    <section aria-labelledby="backup-heading" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-1">
        <div className="p-2.5 bg-emerald-50 rounded-xl shrink-0">
          <DatabaseZap className="w-5 h-5 text-emerald-600" aria-hidden="true" />
        </div>
        <div>
          <h2 id="backup-heading" className="text-lg font-bold text-slate-900">
            Sauvegardes
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Sauvegarde / restauration complète SiS AMA. Le fichier est téléchargé sur votre ordinateur.
          </p>
        </div>
      </div>

      {/* Téléchargement */}
      <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-800">Télécharger une sauvegarde</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Toutes les données métier dans un fichier JSON (sans mot de passe ni secret).
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-60 whitespace-nowrap"
        >
          {downloading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> Préparation...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" aria-hidden="true" /> Télécharger une sauvegarde
            </>
          )}
        </button>
      </div>

      {/* Restauration */}
      <div className="mt-6">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <UploadCloud className="w-4 h-4 text-primary" aria-hidden="true" /> Restaurer une sauvegarde
        </h3>

        <label
          htmlFor="backup-file"
          className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl px-4 py-6 cursor-pointer hover:border-primary/50 hover:bg-slate-50 transition-colors text-center"
        >
          <FileJson className="w-7 h-7 text-slate-300" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-700">Sélectionner un fichier JSON</span>
          <span className="text-xs text-slate-400">Sauvegardes v1, v2 et v3 acceptées</span>
          <input
            ref={fileRef}
            id="backup-file"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={handleFile}
          />
        </label>

        {parseError && (
          <p role="alert" className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {parseError}
          </p>
        )}

        {selected && summary && (
          <div className="mt-4 rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <FileJson className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 break-all">{selected.filename}</p>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Sauvegarde</dt>
                    <dd className="text-slate-700">{formatBackupDateTime(selected.parsed.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-400">Version</dt>
                    <dd className="text-slate-700">v{selected.parsed.formatVersion}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-slate-400 mb-1.5">Contenu</p>
                  <ul className="flex flex-wrap gap-2 text-xs">
                    {[
                      `${summary.students} élèves`,
                      `${summary.classes} classes`,
                      `${summary.teachers} professeurs`,
                      `${summary.payments} paiements`,
                      `${summary.attendances} présences`,
                    ].map((label) => (
                      <li key={label} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">
                        {label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Stratégie de restauration */}
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-700 mb-2">Mode de restauration</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    strategy === 'merge' ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="restore-strategy"
                    value="merge"
                    checked={strategy === 'merge'}
                    onChange={() => setStrategy('merge')}
                    className="mt-1"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800 text-sm">
                      <Layers className="w-4 h-4 text-slate-500" aria-hidden="true" /> Fusionner
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Conserve les données actuelles et ajoute ce qui manque (sans doublon).
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    strategy === 'replace' ? 'border-red-400 ring-2 ring-red-300/50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="restore-strategy"
                    value="replace"
                    checked={strategy === 'replace'}
                    onChange={() => setStrategy('replace')}
                    className="mt-1"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800 text-sm">
                      <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" /> Remplacer toutes les données
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Supprime les données métier actuelles puis restaure exactement la sauvegarde.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>

            {strategy === 'replace' && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-4">
                <p className="text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Les données actuelles (élèves, classes, professeurs, paiements, présences) seront remplacées. Les
                    comptes utilisateurs sont conservés.
                  </span>
                </p>
                <label htmlFor="replace-confirm" className="block text-sm font-semibold text-red-800 mt-3 mb-1">
                  Tapez <code className="bg-white px-1 rounded">{REPLACE_CONFIRMATION}</code> pour confirmer
                </label>
                <input
                  id="replace-confirm"
                  type="text"
                  value={replaceConfirm}
                  onChange={(e) => setReplaceConfirm(e.target.value)}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-red-400"
                />
              </div>
            )}

            <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setParseError('');
                }}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRestore}
                disabled={restoring || !replaceReady}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-50"
              >
                {restoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> Restauration...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Restaurer cette sauvegarde
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historique local */}
      <div className="mt-8 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" aria-hidden="true" /> Dernières sauvegardes téléchargées
          </h3>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                clearBackupHistory();
                setHistory([]);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors"
            >
              Effacer l'historique
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune sauvegarde téléchargée depuis ce navigateur.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry, index) => (
              <li
                key={`${entry.createdAt}-${index}`}
                className="flex items-center justify-between gap-3 text-sm bg-slate-50/70 rounded-lg px-3 py-2"
              >
                <span className="text-slate-700">{formatBackupDayTime(entry.createdAt)}</span>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-slate-400 text-xs truncate hidden sm:inline">{entry.filename}</span>
                  <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                    v{entry.backupFormatVersion}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Historique informatif stocké dans ce navigateur. Pour restaurer, sélectionnez toujours manuellement le fichier
          JSON ci-dessus.
        </p>
      </div>
    </section>
  );
}
