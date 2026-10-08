import { useSyncExternalStore } from 'react';

// Même seuil que la variante Tailwind `mobile:` (voir index.css).
const QUERY = 'screen and (max-width: 767.98px)';

const getMql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void) {
  const mql = getMql();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/** true sur téléphone : la présentation change, la logique métier reste partagée. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => getMql()?.matches ?? false, () => false);
}
