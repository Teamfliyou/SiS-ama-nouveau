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
 * Sur mobile elle devient un tiroir ; sur ordinateur elle peut être repliée.
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
        className={`lg-sidebar fixed inset-y-3 left-3 z-50 flex flex-col p-3 transition-[width,transform] duration-300 lg:sticky lg:top-3 lg:inset-y-auto lg:h-[calc(100vh-1.5rem)] lg:translate-x-0 ${
          collapsed ? 'w-[84px]' : 'w-[268px]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}
        aria-label="Navigation principale"
      >
        <div className={`flex items-center gap-3 px-2 h-14 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 leading-tight truncate">SiS AMA</p>
                <p className="text-[11px] text-slate-400 leading-tight">Portail scolaire</p>
              </div>
            </div>
          )}
          {collapsed && <img src="/logo.png" alt="SiS AMA" className="h-9 w-9 object-contain" />}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
            className="lg-icon-btn lg:hidden"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Déployer le menu' : 'Replier le menu'}
            className="lg-icon-btn hidden lg:inline-flex"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto mt-2 space-y-0.5 pr-0.5" aria-label="Sections">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && <p className="lg-nav-group-label">{group.label}</p>}
              {collapsed && <div className="h-3" />}
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
                    className={`lg-nav-link ${collapsed ? 'justify-center px-0' : ''}`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={onLogout}
          className={`lg-nav-link mt-2 text-red-500 hover:text-red-600 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" />
          {!collapsed && <span>Déconnexion</span>}
        </button>
      </aside>
    </>
  );
}
