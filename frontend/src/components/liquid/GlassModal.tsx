import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

const SIZES = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' } as const;

/** Modale / feuille Liquid Glass accessible (Échap, clic extérieur, scroll bloqué). */
export default function GlassModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="lg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`lg-modal w-full ${SIZES[size]} max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[26px]`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 p-5 sm:p-6 lg-hairline">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
              {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fermer" className="lg-icon-btn shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5 sm:p-6">{children}</div>
        {footer && <div className="px-5 sm:px-6 pb-5 sm:pb-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
