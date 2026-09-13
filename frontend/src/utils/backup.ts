/**
 * Sauvegardes JSON côté client.
 *
 * Ce module gère :
 *   - la lecture/analyse d'un fichier de sauvegarde (v1, v2, v3, avec ou sans
 *     enveloppe `data`) pour l'aperçu avant restauration ;
 *   - la génération du nom de fichier canonique ;
 *   - le téléchargement sur le PC de l'utilisateur (jamais seulement serveur) ;
 *   - l'historique local des téléchargements (localStorage).
 *
 * La migration effective vers le format interne courant est faite par le
 * backend (`server/lib/backup.ts`) : c'est la frontière de sécurité.
 */

export const CURRENT_BACKUP_FORMAT_VERSION = 3;
export const BACKUP_HISTORY_KEY = 'sis-backup-history';
const HISTORY_LIMIT = 20;

export type BackupCollections = {
  classes: unknown[];
  schoolYears: unknown[];
  families: unknown[];
  students: unknown[];
  teachers: unknown[];
  payments: unknown[];
  attendances: unknown[];
  enrollments: unknown[];
};

export type ParsedBackup = {
  formatVersion: number;
  application: string | null;
  createdAt: string | null;
  data: BackupCollections;
};

export type BackupSummary = {
  students: number;
  classes: number;
  teachers: number;
  payments: number;
  attendances: number;
};

export type BackupHistoryEntry = {
  createdAt: string;
  filename: string;
  backupFormatVersion: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function detectBackupVersion(raw: unknown): number {
  const root = isRecord(raw) ? raw : {};
  const candidate = root.backupFormatVersion ?? root.version;
  const parsed =
    typeof candidate === 'number' ? candidate : Number.parseInt(String(candidate ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Analyse un objet de sauvegarde (déjà parsé) et déballe `data` si présent. */
export function parseBackup(input: unknown): ParsedBackup {
  const root = isRecord(input) ? input : {};
  const source = isRecord(root.data) ? root.data : root;
  const createdAt =
    typeof root.createdAt === 'string'
      ? root.createdAt
      : typeof root.exportDate === 'string'
        ? root.exportDate
        : null;

  return {
    formatVersion: detectBackupVersion(root),
    application: typeof root.application === 'string' ? root.application : null,
    createdAt,
    data: {
      classes: asArray(source.classes),
      schoolYears: asArray(source.schoolYears),
      families: asArray(source.families),
      students: asArray(source.students),
      teachers: asArray(source.teachers),
      payments: asArray(source.payments),
      attendances: asArray(source.attendances),
      enrollments: asArray(source.enrollments),
    },
  };
}

/** Analyse le contenu texte d'un fichier .json. Lève une SyntaxError si invalide. */
export function parseBackupFileText(text: string): ParsedBackup {
  return parseBackup(JSON.parse(text));
}

export function getBackupSummary(backup: ParsedBackup): BackupSummary {
  return {
    students: backup.data.students.length,
    classes: backup.data.classes.length,
    teachers: backup.data.teachers.length,
    payments: backup.data.payments.length,
    attendances: backup.data.attendances.length,
  };
}

/** Nom canonique : SiS-AMA-backup-2026-09-13-18-30-v3.json */
export function buildBackupFilename(
  date: Date = new Date(),
  version: number = CURRENT_BACKUP_FORMAT_VERSION
): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}`;
  return `SiS-AMA-backup-${stamp}-v${version}.json`;
}

/** Déclenche le téléchargement d'un contenu texte sur le PC de l'utilisateur. */
export function downloadTextFile(content: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libère l'URL après le déclenchement du téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Historique local des sauvegardes téléchargées ────────────────────

const isHistoryEntry = (value: unknown): value is BackupHistoryEntry => {
  if (!isRecord(value)) return false;
  return (
    typeof value.createdAt === 'string' &&
    typeof value.filename === 'string' &&
    typeof value.backupFormatVersion === 'number'
  );
};

export function getBackupHistory(): BackupHistoryEntry[] {
  try {
    const raw = localStorage.getItem(BACKUP_HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

export function addBackupHistoryEntry(entry: BackupHistoryEntry): void {
  try {
    const next = [entry, ...getBackupHistory()].slice(0, HISTORY_LIMIT);
    localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Historique purement informatif : un échec de stockage n'est pas bloquant.
  }
}

export function clearBackupHistory(): void {
  try {
    localStorage.removeItem(BACKUP_HISTORY_KEY);
  } catch {
    // ignore
  }
}

// ─── Formatage des dates ──────────────────────────────────────────────

export function formatBackupDateTime(iso: string | null): string {
  if (!iso) return 'Date inconnue';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date inconnue';
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "Aujourd'hui 18:30", "Hier 21:15" ou la date complète. */
export function formatBackupDayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Date inconnue';
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (d.getTime() >= startOfToday) return `Aujourd'hui ${time}`;
  if (d.getTime() >= startOfToday - dayMs) return `Hier ${time}`;
  return formatBackupDateTime(iso);
}
