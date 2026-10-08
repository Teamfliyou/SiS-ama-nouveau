import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Titre affiché dans l'en-tête de la sheet (laisser vide si le contenu a déjà le sien). */
  title?: ReactNode;
  /** Largeur max. de la modale sur desktop (inchangée par rapport à l'existant). */
  maxWidth?: string;
};

/**
 * Modale responsive : bottom sheet sur téléphone, modale centrée classique au-delà.
 * Les classes desktop reprennent celles des modales existantes de SIS.
 */
export default function Sheet({ open, onClose, children, title, maxWidth = 'max-w-md' }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 mobile:items-end mobile:p-0 mobile:bg-slate-900/35 mobile:backdrop-blur-none mobile:anim-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} mobile:max-w-none mobile:rounded-b-none mobile:rounded-t-[28px] mobile:max-h-[92dvh] mobile:overflow-y-auto mobile:overscroll-contain mobile:pb-[max(16px,var(--safe-bottom))] mobile:bg-white/95 mobile:backdrop-blur-xl mobile:anim-sheet-up`}
        onClick={e => e.stopPropagation()}
      >
        {/* Poignée (mobile) */}
        <div className="hidden mobile:flex justify-center pt-2.5 pb-1" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-slate-300/80" />
        </div>
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 mobile:pt-1">
            <h3 className="text-lg font-bold text-slate-800 truncate mobile:text-[17px]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="-mr-2 h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
