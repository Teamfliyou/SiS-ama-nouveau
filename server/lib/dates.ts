/**
 * Convertit des dates « calendaire » (YYYY-MM-DD) en/vers des objets Date
 * PostgreSQL sans dépendre du fuseau horaire du serveur.
 *
 * Entrée : un jour calendaire est stocké à minuit UTC afin que Prisma sérialise
 * toujours la bonne date (composantes UTC). Sortie : on lit les composantes
 * LOCALES pour reformer le même jour calendaire, quel que soit TZ local.
 */
export const ymdToDate = (ymd: string): Date => new Date(`${ymd}T00:00:00.000Z`);

/** Formate une Date (ou chaîne) en « YYYY-MM-DD » via les composantes locales. */
export const toYmd = (value: Date | string): string => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const todayYmd = (): string => toYmd(new Date());