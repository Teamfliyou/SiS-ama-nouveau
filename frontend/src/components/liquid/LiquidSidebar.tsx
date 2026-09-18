import { Link } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeft, X } from 'lucide-react';
import type { NavGroup } from './navigation';

type Props = {
  groups: NavGroup[];
  pathname: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onLogout: () => void;
};

/**
 * Navigation latérale Liquid Glass : fine, flottante, arrondie et translucide.
 * Sur mobile elle reste toujours en largeur complète ; sur ordinateur elle peut être repliée.
 */
export default function LiquidSidebar({
  groups,
  pathname,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onLogout,
}: Props) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`lg-sidebar fixed inset-y-3 left-3 z-50 flex w-[268px] shrink-0 flex-col p-3 transition-[width,transform] duration-300 lg:sticky lg:top-3 lg:inset-y-auto lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-[110%]'
        }`}
        data-collapsed={collapsed ? 'true' : 'false'}
        aria-label="Navigation principale"
      >
        <div className="lg-sidebar-head flex h-14 shrink-0 items-center gap-3 px-2">
          <div className="lg-sidebar-brand flex min-w-0 flex-1 items-center gap-2.5">
            <img src="/logo.png" alt="SiS AMA" className="h-9 w-9 shrink-0 object-contain" />
            <div className="lg-sidebar-brand-text min-w-0">
              <p className="truncate text-sm font-extrabold leading-tight text-slate-900">SiS AMA</p>
              <p className="truncate text-[11px] leading-tight text-slate-400">Portail scolaire</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
            className="lg-icon-btn shrink-0 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Déployer le menu' : 'Replier le menu'}
            className="lg-icon-btn lg-sidebar-toggle hidden shrink-0 lg:inline-flex"
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <nav className="lg-sidebar-nav mt-2 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden pr-0.5" aria-label="Sections">
          {groups.map((group) => (
            <div key={group.label} className="lg-sidebar-group">
              <p className="lg-nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    data-active={active}
                    onClick={onCloseMobile}
                    title={collapsed ? item.name : undefined}
                    aria-current={active ? 'page' : undefined}
                    className="lg-nav-link"
                  >
                    <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="lg-sidebar-link-label truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          className="lg-nav-link lg-sidebar-logout mt-2 w-full shrink-0 text-red-500 hover:text-red-600"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="lg-sidebar-link-label">Déconnexion</span>
        </button>
      </aside>
    </>
  );
}
