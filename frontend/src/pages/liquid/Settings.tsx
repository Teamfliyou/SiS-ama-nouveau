import { Link } from 'react-router-dom';
import { ArrowRight, Lock, Settings as SettingsIcon, ShieldCheck, UserCog } from 'lucide-react';
import AppearanceSettings from '../../components/settings/AppearanceSettings';
import BackupSettings from '../../components/settings/BackupSettings';
import DangerZone from '../../components/settings/DangerZone';
import ChangePasswordForm from '../../components/settings/ChangePasswordForm';
import { GlassPanel, PageHeader } from '../../components/liquid';

/**
 * Paramètres (Liquid Glass).
 * La logique de sauvegarde / restauration / suppression admin est réutilisée
 * telle quelle ; seule la présentation change.
 */
export default function LiquidSettings() {
  const isAdmin = localStorage.getItem('role') === 'ADMIN';

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader title="Paramètres" subtitle="Apparence, compte et données de SiS AMA." />

      {/* Apparence */}
      <AppearanceSettings />

      {/* Compte */}
      <GlassPanel className="p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <UserCog className="w-5 h-5 text-primary" aria-hidden="true" />
          <h2 className="lg-section-title">Compte</h2>
        </div>
        <p className="lg-subtitle mb-4">Modifiez votre mot de passe de connexion.</p>
        <ChangePasswordForm liquid />
      </GlassPanel>

      {isAdmin ? (
        <>
          {/* Administration */}
          <GlassPanel className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-5 h-5 text-violet-500" aria-hidden="true" />
              <h2 className="lg-section-title">Administration</h2>
            </div>
            <p className="lg-subtitle mb-4">Gérez les comptes et les accès à l'application.</p>
            <Link to="/users" className="lg-btn">
              <SettingsIcon className="w-4 h-4" aria-hidden="true" /> Gérer les utilisateurs
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </GlassPanel>

          <BackupSettings />
          <DangerZone />
        </>
      ) : (
        <GlassPanel className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-white/70 rounded-xl shrink-0">
              <Lock className="w-5 h-5 text-slate-500" aria-hidden="true" />
            </div>
            <div>
              <h2 className="lg-section-title">Fonctions administrateur</h2>
              <p className="lg-subtitle mt-0.5">
                La sauvegarde, la restauration et la suppression des données sont réservées aux comptes
                administrateurs.
              </p>
            </div>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
