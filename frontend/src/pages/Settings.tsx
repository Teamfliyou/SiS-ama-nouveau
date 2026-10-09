import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, UploadCloud, Lock, ArrowRight } from 'lucide-react';
import AppearanceSettings from '../components/settings/AppearanceSettings';
import BackupSettings from '../components/settings/BackupSettings';
import DangerZone from '../components/settings/DangerZone';

/**
 * Page Paramètres.
 * - Apparence : accessible à tous ;
 * - Sauvegardes / Zone dangereuse : ADMIN uniquement (également contrôlé côté API).
 */
export default function Settings() {
  const isAdmin = localStorage.getItem('role') === 'ADMIN';

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-7 h-7 text-slate-400" aria-hidden="true" /> Paramètres
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Personnalisez l'apparence et gérez les données de SiS AMA.
        </p>
      </header>

      <AppearanceSettings />

      {/* Clarification : import CSV (inscriptions) ≠ sauvegarde/restauration complète */}
      <section
        aria-labelledby="data-tools-heading"
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8"
      >
        <h2 id="data-tools-heading" className="text-lg font-bold text-slate-900">
          Importer des données
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Deux fonctions distinctes, à ne pas confondre.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/import-csv"
            className="group rounded-xl border border-slate-200 p-4 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <UploadCloud className="w-4 h-4 text-primary" aria-hidden="true" /> Import CSV des inscriptions
            </span>
            <span className="block text-xs text-slate-500 mt-1.5">
              Importer des élèves et leurs classes depuis un fichier CSV.
            </span>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              Ouvrir <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
          <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/60">
            <span className="flex items-center gap-2 font-semibold text-slate-800">
              <SettingsIcon className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Sauvegarde / restauration SiS AMA
            </span>
            <span className="block text-xs text-slate-500 mt-1.5">
              Sauvegarde complète JSON et restauration (section ci-dessous, réservée aux administrateurs).
            </span>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <>
          <BackupSettings />
          <DangerZone />
        </>
      ) : (
        <section
          aria-label="Sections réservées aux administrateurs"
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-slate-100 rounded-xl shrink-0">
              <Lock className="w-5 h-5 text-slate-500" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Fonctions administrateur</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                La sauvegarde, la restauration et la suppression complète des données sont réservées aux comptes
                administrateurs.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
