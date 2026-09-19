import type { HTMLAttributes, ReactNode } from 'react';

type PanelProps = { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>;

/** Surface en verre standard (rayon généreux, ombre douce). */
export function GlassPanel({ children, className = '', ...rest }: PanelProps) {
  return (
    <div className={`lg-panel ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Carte en verre plus légère, adaptée aux listes et grilles. */
export function GlassCard({ children, className = '', ...rest }: PanelProps) {
  return (
    <div className={`lg-card ${className}`} {...rest}>
      {children}
    </div>
  );
}
