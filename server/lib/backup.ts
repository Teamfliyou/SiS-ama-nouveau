/**
 * Normalisation et migration des sauvegardes JSON.
 *
 * Le format interne courant (v3) est un objet plat contenant les 8 collections
 * métier attendues par `importPayloadSchema` dans routes/data.ts :
 *   classes, schoolYears, families, students, teachers, payments,
 *   attendances, enrollments
 *
 * Les fichiers peuvent arriver sous plusieurs formes :
 *   - v1 (SQLite) : classes/students/teachers/payments/attendances, montants en
 *     euros (`tuitionFee`, `amount`) ;
 *   - v2 : ajoute les présences typées mais pas les années/familles/inscriptions ;
 *   - v3 : ajoute schoolYears/families/enrollments et les classes de profs.
 *
 * Le format canonique exporté par le serveur est :
 *   { application, backupFormatVersion, createdAt, version, data: { ... } }
 *
 * Ce module ramène toute entrée (ancienne ou nouvelle, avec ou sans enveloppe
 * `data`) vers le format interne courant. Les migrations sont volontairement
 * conservatrices : elles ne suppriment aucune donnée métier et se contentent de
 * compléter les collections manquantes, car le schéma d'import accepte déjà les
 * anciennes représentations (euros/cents, `class: { name }`, etc.).
 */

export const CURRENT_BACKUP_FORMAT_VERSION = 3;

/** Collections métier reconnues, dans l'ordre de restauration logique. */
export const BACKUP_COLLECTIONS = [
  'classes',
  'schoolYears',
  'families',
  'students',
  'teachers',
  'payments',
  'attendances',
  'enrollments',
] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

type Dict = Record<string, unknown>;

const isRecord = (value: unknown): value is Dict =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Lit la version d'un fichier : `backupFormatVersion` prioritaire, sinon `version`. */
export function detectBackupVersion(raw: unknown): number {
  const root = isRecord(raw) ? raw : {};
  const candidate = root.backupFormatVersion ?? root.version;
  const parsed =
    typeof candidate === 'number' ? candidate : Number.parseInt(String(candidate ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Ne garde que les collections métier connues, en tableau.
 * Toute propriété inattendue (métadonnées, champs dangereux…) est ignorée :
 * c'est aussi une barrière de sécurité à l'entrée de l'import.
 */
function extractCollections(source: Dict): Dict {
  const out: Dict = {};
  for (const key of BACKUP_COLLECTIONS) out[key] = asArray(source[key]);
  return out;
}

/** v1 → courant : collections manquantes par défaut, montants euros acceptés tels quels. */
export function migrateBackupV1ToCurrent(raw: unknown): Dict {
  return extractCollections(isRecord(raw) ? raw : {});
}

/** v2 → courant : idem, le schéma accepte déjà l'absence d'années/familles/inscriptions. */
export function migrateBackupV2ToCurrent(raw: unknown): Dict {
  return extractCollections(isRecord(raw) ? raw : {});
}

/** v3 → courant : identité (déjà au format interne). */
export function migrateBackupV3ToCurrent(raw: unknown): Dict {
  return extractCollections(isRecord(raw) ? raw : {});
}

export interface NormalizedBackup {
  detectedVersion: number;
  /** Objet plat prêt pour `importPayloadSchema`. */
  payload: Dict;
}

/**
 * Point d'entrée : détecte la version, déballe l'enveloppe `data` si présente,
 * applique la migration adaptée et renvoie le format interne courant.
 */
export function normalizeBackupInput(raw: unknown): NormalizedBackup {
  const detectedVersion = detectBackupVersion(raw);
  const root = isRecord(raw) ? raw : {};
  const source = isRecord(root.data) ? root.data : root;

  let payload: Dict;
  if (detectedVersion <= 1) payload = migrateBackupV1ToCurrent(source);
  else if (detectedVersion === 2) payload = migrateBackupV2ToCurrent(source);
  else payload = migrateBackupV3ToCurrent(source);

  return { detectedVersion, payload };
}

/** Nom de fichier canonique : SiS-AMA-backup-2026-09-13-18-30-v3.json */
export function buildBackupFilename(date: Date = new Date(), version = CURRENT_BACKUP_FORMAT_VERSION): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}-${p(date.getMinutes())}`;
  return `SiS-AMA-backup-${stamp}-v${version}.json`;
}
