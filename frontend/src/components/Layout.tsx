import { Navigate, useLocation } from 'react-router-dom';
import { useUiTheme } from '../hooks/useUiTheme';
import ClassicLayout from './layouts/ClassicLayout';
import LiquidLayout from './layouts/LiquidLayout';
import ToastContainer from './ToastContainer';
import { canOpen, currentRole, homePath } from '../utils/roles';

/**
 * Point d'entrée du layout : choisit la présentation selon l'apparence
 * mémorisée. Les URLs, l'authentification et les permissions sont identiques
 * dans les deux cas ; seule la présentation change.
 */
export default function Layout() {
  const theme = useUiTheme();
  const location = useLocation();
  const role = currentRole();
  // A Prof account opening another section (old link, typed address) goes to the roll call.
  if (!canOpen(role, location.pathname)) return <Navigate to={homePath(role)} replace />;
  return (
    <>
      {theme === 'liquid' ? <LiquidLayout /> : <ClassicLayout />}
      <ToastContainer />
    </>
  );
}
