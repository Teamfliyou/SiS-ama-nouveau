import { useEffect, useState } from 'react';
import { getStoredTheme, subscribeTheme, type UiTheme } from '../utils/theme';

/** Retourne le thème d'interface courant et se met à jour à chaque changement. */
export function useUiTheme(): UiTheme {
  const [theme, setTheme] = useState<UiTheme>(getStoredTheme());
  useEffect(() => subscribeTheme(setTheme), []);
  return theme;
}
