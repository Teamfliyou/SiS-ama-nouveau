import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: 'blue' | 'violet' | 'emerald' | 'amber';
};

const TONES: Record<NonNullable<Props['tone']>, string> = {
  blue: 'from-blue-500 to-sky-400',
  violet: 'from-violet-500 to-fuchsia-400',
  emerald: 'from-emerald-500 to-teal-400',
  amber: 'from-amber-500 to-orange-400',
};

/** Petite tuile statistique compacte (icône ronde + valeur). */
export default function StatCard({ icon: Icon, label, value, hint, to, onClick, tone = 'blue' }: Props) {
  const content = (
    <div className="lg-stat lg-hover flex items-center gap-3">
      <div className={`h-11 w-11 rounded-2xl bg-gradient-to-tr ${TONES[tone]} text-white flex items-center justify-center shadow-sm shrink-0`}>
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="lg-stat-value leading-none truncate">{value}</p>
        <p className="lg-stat-label mt-1 truncate">{label}</p>
        {hint && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none rounded-[20px]">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left rounded-[20px]">
        {content}
      </button>
    );
  }
  return content;
}
