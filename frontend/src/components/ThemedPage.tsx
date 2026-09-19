import type { ComponentType } from 'react';
import { useUiTheme } from '../hooks/useUiTheme';

type Props = {
  classic: ComponentType;
  liquid: ComponentType;
};

/**
 * Rend la vue Classique ou Liquid selon l'apparence choisie, sans changer
 * l'URL. Les deux vues partagent les mêmes données, API et permissions.
 */
export default function ThemedPage({ classic: Classic, liquid: Liquid }: Props) {
  const theme = useUiTheme();
  return theme === 'liquid' ? <Liquid /> : <Classic />;
}
