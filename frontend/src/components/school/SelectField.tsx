import { ChevronDown } from 'lucide-react';
import type { ComponentType } from 'react';

type Props = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string | number; label: string }[];
};

/** Labelled select used by the filters of the school-record pages. */
export default function SelectField({ label, icon: Icon, value, onChange, placeholder, options }: Props) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-sm font-semibold text-slate-700 mb-2 mobile:text-[13px] mobile:text-slate-600 mobile:mb-1.5">
        {Icon && <Icon className="inline w-4 h-4 mr-1.5 text-primary" />}
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none pl-4 pr-10 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm mobile:py-2 mobile:shadow-none"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}
