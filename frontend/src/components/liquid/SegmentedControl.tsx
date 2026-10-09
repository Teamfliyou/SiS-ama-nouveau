import { useLayoutEffect, useRef, useState } from 'react';
import { useUiTheme } from '../../hooks/useUiTheme';

export type SegmentOption<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
};

/**
 * Sélecteur segmenté type Apple. S'adapte automatiquement au thème :
 * capsule en verre en Liquid, capsule sobre en Classique.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<T>) {
  const liquid = useUiTheme() === 'liquid';
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const update = () => {
      const container = containerRef.current;
      const active = container?.querySelector<HTMLElement>(`[data-value="${value}"]`);
      if (container && active) setThumb({ left: active.offsetLeft, width: active.offsetWidth });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [value, options]);

  const base = liquid ? 'lg-segmented' : 'lg-segmented-classic';
  const thumbClass = liquid ? 'lg-segmented-thumb' : 'lg-segmented-classic-thumb';

  return (
    <div ref={containerRef} role="radiogroup" aria-label={ariaLabel} className={base}>
      <span
        aria-hidden="true"
        className={thumbClass}
        style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
