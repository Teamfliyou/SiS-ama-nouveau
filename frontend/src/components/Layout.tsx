import { useUiTheme } from '../hooks/useUiTheme';
import ClassicLayout from './layouts/ClassicLayout';
import LiquidLayout from './layouts/LiquidLayout';
import ToastContainer from './ToastContainer';

/**
 * Point d'entrée du layout : choisit la présentation selon l'apparence
 * mémorisée. Les URLs, l'authentification et les permissions sont identiques
 * dans les deux cas ; seule la présentation change.
 */
export default function Layout() {
  const theme = useUiTheme();
  return (
    <>
      {theme === 'liquid' ? <LiquidLayout /> : <ClassicLayout />}
      <ToastContainer />
    </>
  );
}
