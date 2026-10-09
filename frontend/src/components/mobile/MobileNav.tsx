import { Link } from 'react-router-dom';
import { Grid2x2, KeyRound, LogOut, ChevronRight } from 'lucide-react';
import Sheet from './Sheet';
import type { NavItem, TabItem } from './nav';

export function MobileHeader({ title, initials, onAccount }: { title: string; initials: string; onAccount: () => void }) {
  return (
    <header className="no-print hidden mobile:flex fixed top-0 inset-x-0 z-30 glass-bar !border-x-0 !border-t-0 pt-[var(--safe-top)]">
      <div className="h-[var(--m-header-h)] w-full flex items-center gap-3 px-4">
        <img src="/logo.png" alt="ASSO AMA SIS" className="h-8 w-auto object-contain shrink-0" />
        <h1 className="flex-1 min-w-0 truncate text-[17px] font-semibold text-slate-900">{title}</h1>
        <button
          type="button"
          onClick={onAccount}
          aria-label="Mon compte"
          className="h-11 w-11 -mr-1.5 flex items-center justify-center rounded-full"
        >
          <span className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center font-bold text-xs">
            {initials}
          </span>
        </button>
      </div>
    </header>
  );
}

export function MobileTabBar({ items, pathname, moreActive, onMore }: { items: TabItem[]; pathname: string; moreActive: boolean; onMore: () => void }) {
  const itemCls = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold transition-colors ${active ? 'text-primary' : 'text-slate-500'}`;
  const pillCls = (active: boolean) =>
    `flex items-center justify-center h-7 w-12 rounded-full transition-colors ${active ? 'bg-primary/12' : ''}`;

  return (
    <nav
      aria-label="Navigation principale"
      className="no-print hidden mobile:block fixed z-30 left-3 right-3 bottom-[max(8px,var(--safe-bottom))] glass-bar rounded-[22px]"
    >
      <ul className="grid grid-cols-5 h-[var(--m-tabbar-h)] px-1">
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex">
              <Link to={item.href} aria-current={active ? 'page' : undefined} className={`flex-1 ${itemCls(active)}`}>
                <span className={pillCls(active)}><item.icon className="w-[22px] h-[22px]" /></span>
                {item.short}
              </Link>
            </li>
          );
        })}
        <li className="flex">
          <button type="button" onClick={onMore} className={`flex-1 ${itemCls(moreActive)}`}>
            <span className={pillCls(moreActive)}><Grid2x2 className="w-[22px] h-[22px]" /></span>
            Plus
          </button>
        </li>
      </ul>
    </nav>
  );
}

type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  pathname: string;
  email: string;
  initials: string;
  roleLabel: string;
  onPassword: () => void;
  onLogout: () => void;
};

/** Menu « Plus » : sections secondaires + compte, en bottom sheet. */
export function MoreSheet({ open, onClose, items, pathname, email, initials, roleLabel, onPassword, onLogout }: MoreSheetProps) {
  const rowCls = 'w-full flex items-center gap-3 px-4 min-h-[52px] text-[15px] font-medium text-slate-800 active:bg-slate-50';

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-4 pb-2 space-y-5">
        {/* Compte */}
        <div className="flex items-center gap-3 px-1 pt-1">
          <span className="h-11 w-11 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center font-bold text-sm shrink-0">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-slate-900 truncate">{email}</p>
            <p className="text-[13px] text-slate-500">{roleLabel}</p>
          </div>
        </div>

        {/* Sections secondaires */}
        <ul className="rounded-2xl bg-slate-50 divide-y divide-slate-100 overflow-hidden">
          {items.map(item => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link to={item.href} onClick={onClose} className={`${rowCls} ${active ? 'text-primary' : ''}`}>
                  <item.icon className={`w-5 h-5 ${active ? 'text-primary' : 'text-slate-400'}`} />
                  <span className="flex-1">{item.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Compte */}
        <ul className="rounded-2xl bg-slate-50 divide-y divide-slate-100 overflow-hidden">
          <li>
            <button type="button" onClick={() => { onClose(); onPassword(); }} className={rowCls}>
              <KeyRound className="w-5 h-5 text-slate-400" />
              <span className="flex-1 text-left">Changer mon mot de passe</span>
            </button>
          </li>
          <li>
            <button type="button" onClick={() => { onClose(); onLogout(); }} className={`${rowCls} !text-red-600`}>
              <LogOut className="w-5 h-5 text-red-500" />
              <span className="flex-1 text-left">Déconnexion</span>
            </button>
          </li>
        </ul>
      </div>
    </Sheet>
  );
}
