import { useState, type ComponentType, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Sheet from './Sheet';

export type Action = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/** Bouton « ⋯ » ouvrant les actions secondaires dans une bottom sheet. */
export default function ActionMenu({ actions, title, label = 'Plus d’actions' }: { actions: Action[]; title?: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="h-11 w-11 shrink-0 -mr-2 flex items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      <Sheet open={open} onClose={close} title={title}>
        <ul className="px-3 pb-2">
          {actions.map(a => (
            <li key={a.label}>
              <button
                type="button"
                disabled={a.disabled}
                onClick={() => { close(); a.onClick(); }}
                className={`w-full min-h-[52px] flex items-center gap-3 px-3 rounded-2xl text-[15px] font-medium active:bg-slate-100 disabled:opacity-50 ${a.danger ? 'text-red-600' : 'text-slate-800'}`}
              >
                <a.icon className={`w-5 h-5 ${a.danger ? 'text-red-500' : 'text-slate-400'}`} />
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 pt-1">
          <button
            type="button"
            onClick={close}
            className="w-full min-h-[48px] rounded-2xl bg-slate-100 text-[15px] font-semibold text-slate-600 active:bg-slate-200"
          >
            Annuler
          </button>
        </div>
      </Sheet>
    </>
  );
}
