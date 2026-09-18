import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: ReactNode;
  children?: ReactNode;
};

const VARIANT_CLASS: Record<Variant, string> = {
  default: '',
  primary: 'lg-btn-primary',
  ghost: 'lg-btn-ghost',
  danger: 'lg-btn-danger',
};

/** Bouton Liquid Glass avec variantes (primaire, fantôme, danger). */
export default function GlassButton({
  variant = 'default',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button type={type} className={`lg-btn ${VARIANT_CLASS[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
