import { useEffect, useState } from 'react';
import { MonitorSmartphone, Sparkles } from 'lucide-react';
import { THEMES, getStoredTheme, setTheme, subscribeTheme, type UiTheme } from '../../utils/theme';
import SegmentedControl from '../liquid/SegmentedControl';

const ICONS: Record<UiTheme, typeof Sparkles> = {
  classic: MonitorSmartphone,
  liquid: Sparkles,
};

/**
 * Sélection de l'apparence : Classique (historique) ou Liquid Glass.
 * Petit sélecteur segmenté type Apple, application immédiate et mémorisée.
 */
export default function AppearanceSettings() {
  const [theme, setThemeState] = useState<UiTheme>(getStoredTheme());

  useEffect(() => subscribeTheme(setThemeState), []);

  const apply = (next: UiTheme) => {
    setTheme(next);
    setThemeState(next);
  };

  const active = THEMES.find((option) => option.id === theme) ?? THEMES[0];
  const ActiveIcon = ICONS[active.id];

  return (
    <section
      aria-labelledby="appearance-heading"
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8"
    >
      <h2 id="appearance-heading" className="text-lg font-bold text-slate-900">
        Apparence
      </h2>
      <p className="text-sm text-slate-500 mt-0.5">
        Choisissez l'apparence de l'interface. Le thème est mémorisé sur cet appareil et appliqué immédiatement.
      </p>

      <div className="mt-5">
        <SegmentedControl
          ariaLabel="Choix de l'apparence"
          value={theme}
          onChange={apply}
          options={THEMES.map((option) => ({ value: option.id, label: option.label }))}
        />
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <ActiveIcon className="w-4 h-4 text-primary" aria-hidden="true" />
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">{active.description}</p>
      </div>
    </section>
  );
}
