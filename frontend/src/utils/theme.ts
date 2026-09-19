/**
 * Gestion de l'apparence de l'application.
 *
 * Deux thèmes :
 *   - "classic" : l'apparence historique (défaut) ;
 *   - "liquid"  : le thème « Liquid Glass ».
 *
 * Le choix est stocké dans localStorage sous `sis-ui-theme` et appliqué via
 * `data-theme` sur <html>. Un script inline dans index.html applique le thème
 * avant le premier rendu pour éviter tout flash visuel (FOUC).
 */

export type UiTheme = 'classic' | 'liquid';

export const THEME_STORAGE_KEY = 'sis-ui-theme';
export const THEME_EVENT = 'sis-theme-change';

export const THEMES: { id: UiTheme; label: string; description: string }[] = [
  {
    id: 'classic',
    label: 'Classique',
    description: "L'apparence historique de SiS AMA, sobre et familière.",
  },
  {
    id: 'liquid',
    label: 'Liquid Glass',
    description: 'Thème moderne translucide : cartes en verre, dégradés doux et animations discrètes.',
  },
];

export function isUiTheme(value: unknown): value is UiTheme {
  return value === 'classic' || value === 'liquid';
}

/** Lit le thème stocké, avec repli sur "classic". */
export function getStoredTheme(): UiTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isUiTheme(raw) ? raw : 'classic';
  } catch {
    return 'classic';
  }
}

/** Applique le thème au document sans le persister. */
export function applyTheme(theme: UiTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
  window.dispatchEvent(new CustomEvent<UiTheme>(THEME_EVENT, { detail: theme }));
}

/** Persiste puis applique le thème. */
export function setTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage indisponible (mode privé) : on applique quand même le thème.
  }
  applyTheme(theme);
}

/** À appeler une fois au démarrage : synchronise le DOM avec localStorage. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/** S'abonne aux changements de thème (retourne une fonction de désabonnement). */
export function subscribeTheme(listener: (theme: UiTheme) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<UiTheme>).detail);
  window.addEventListener(THEME_EVENT, handler);
  return () => window.removeEventListener(THEME_EVENT, handler);
}
