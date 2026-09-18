import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { MOBILE_PRIMARY } from './navigation';

type Props = {
  pathname: string;
  onOpenMore: () => void;
};

/** Barre de navigation basse type application mobile, flottante et translucide. */
export default function BottomNav({ pathname, onOpenMore }: Props) {
  const isPrimary = MOBILE_PRIMARY.some((item) => item.href === pathname);

  return (
    <nav className="lg-bottom-nav lg:hidden" aria-label="Navigation mobile">
      {MOBILE_PRIMARY.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="lg-bottom-link"
          >
            <item.icon className="w-5 h-5" aria-hidden="true" />
            <span>{item.name}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        data-active={!isPrimary}
        aria-label="Plus d'options"
        aria-haspopup="dialog"
        className="lg-bottom-link"
      >
        <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        <span>Plus</span>
      </button>
    </nav>
  );
}
