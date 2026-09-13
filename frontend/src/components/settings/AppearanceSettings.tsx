import { useEffect, useState } from 'react';
import { Check, MonitorSmartphone, Sparkles } from 'lucide-react';
import { THEMES, getStoredTheme, setTheme, subscribeTheme, type UiTheme } from '../../utils/theme';

/**
 * Sélection de l'apparence : Classique (historique) ou Liquid Glass.
 * Le choix est mémorisé dans localStorage et appliqué immédiatement.
 */
export default function AppearanceSettings() {
  const [theme, setThemeState] = useState<UiTheme>(getStoredTheme());

  useEffect(() => subscribeTheme(setThemeState), []);

  const apply = (next: UiTheme) => {
    setTheme(next);
    setThemeState(next);
  };

  return (
    <section aria-labelledby="appearance-heading" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
      <div className="flex items-start gap-3 mb-1">
        <div className="p-2.5 bg-primary/10 rounded-xl shrink-0">
          <Sparkles className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 id="appearance-heading" className="text-lg font-bold text-slate-900">
            Apparence
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Choisissez l'apparence de l'interface. Le thème est mémorisé sur cet appareil.
          </p>
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby="appearance-heading"
        className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6"
      >
        {THEMES.map((option) => {
          const selected = theme === option.id;
          const isLiquid = option.id === 'liquid';
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => apply(option.id)}
              className={`text-left rounded-2xl border p-4 transition-all focus:outline-none ${
                selected
                  ? 'border-primary ring-2 ring-primary/40 shadow-md'
                  : 'border-slate-200 hover:border-primary/40 hover:shadow-sm'
              }`}
            >
              {/* Aperçu visuel */}
              <div
                className={`h-24 rounded-xl mb-4 overflow-hidden relative border ${
                  isLiquid
                    ? 'border-white/70 bg-[linear-gradient(135deg,#e8f0ff,#eafaf3)]'
                    : 'border-slate-200 bg-slate-50'
                }`}
                aria-hidden="true"
              >
                {isLiquid ? (
                  <div className="absolute inset-2 rounded-lg bg-white/60 backdrop-blur-sm border border-white/70 shadow-sm p-2">
                    <div className="h-2 w-16 rounded-full bg-blue-400/70" />
                    <div className="h-1.5 w-24 rounded-full bg-slate-300/70 mt-2" />
                    <div className="h-1.5 w-20 rounded-full bg-slate-300/60 mt-1.5" />
                  </div>
                ) : (
                  <div className="absolute inset-2 rounded-lg bg-white border border-slate-200 p-2">
                    <div className="h-2 w-16 rounded-full bg-blue-500" />
                    <div className="h-1.5 w-24 rounded-full bg-slate-300 mt-2" />
                    <div className="h-1.5 w-20 rounded-full bg-slate-200 mt-1.5" />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold text-slate-900">
                  {isLiquid ? (
                    <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                  ) : (
                    <MonitorSmartphone className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  )}
                  {option.label}
                </span>
                {selected && (
                  <span className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> Actif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{option.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
