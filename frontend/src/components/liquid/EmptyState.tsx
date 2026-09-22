import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

/** État vide centré, discret et lisible. */
export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div className="h-14 w-14 rounded-2xl bg-white/70 border border-white/80 shadow-sm flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" aria-hidden="true" />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
