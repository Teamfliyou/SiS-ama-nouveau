// Money formatting helpers (frontend). The server sends amounts in EUROS (with
// *Cents int fields alongside) so the UI can render them losslessly.

/** Formats an amount in euros with a max of 2 decimals, e.g. 125.5 -> "125,50 €". */
export function formatCurrency(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0,00 €';
  return (
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'
  );
}

/** Parses a user-entered amount (fr/en decimal separators) into a number or false. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
/**
 * Déduit un prénom affichable d'un identifiant email : "jean-pierre.dupont@assoma.fr" -> "Jean-Pierre".
 * La partie avant "@" est coupée sur "." / "_" (prénom en premier), chiffres retirés, majuscules ajoutées.
 */
export function firstNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0];
  const first = local.split(/[._]/).find(part => /\p{L}/u.test(part)) ?? '';
  return first
    .replace(/\d+/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|-)(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('fr-FR'));
}
