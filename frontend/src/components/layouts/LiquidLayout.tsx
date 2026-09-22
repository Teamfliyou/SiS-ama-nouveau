import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  KeyRound,
  LogOut,
  Printer,
  Settings as SettingsIcon,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { useUiTheme } from '../../hooks/useUiTheme';
import { buildNavigation, pageTitle } from '../liquid/navigation';
import LiquidSidebar from '../liquid/LiquidSidebar';
import BottomNav from '../liquid/BottomNav';
import GlassModal from '../liquid/GlassModal';
import ChangePasswordForm from '../settings/ChangePasswordForm';

/**
 * Layout Liquid Glass : sidebar flottante repliable, header minimal sans
 * contrôle décoratif, barre de navigation basse sur mobile et feuille « Plus ».
 * Il ne partage aucune règle visuelle avec le layout Classique.
 */
export default function LiquidLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useUiTheme();
  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const userEmail = localStorage.getItem('user') || 'Administrateur';
  const userInitials = userEmail.slice(0, 2).toUpperCase();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const groups = buildNavigation(isAdmin);
  const title = pageTitle(location.pathname);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    if (profileOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [profileOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const moreItems = [
    { name: 'Classes', href: '/classes', icon: BookOpen },
    { name: 'Professeurs', href: '/teachers', icon: GraduationCap },
    { name: "Feuilles d'appel", href: '/attendance-sheets', icon: Printer },
    { name: 'Import CSV', href: '/import-csv', icon: UploadCloud },
    { name: 'Paramètres', href: '/settings', icon: SettingsIcon },
    ...(isAdmin ? [{ name: 'Utilisateurs', href: '/users', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="lg-app min-h-screen" data-liquid-layout>
      <div className="lg-bg" aria-hidden="true" />

      <div className="flex min-h-screen">
        <LiquidSidebar
          groups={groups}
          pathname={location.pathname}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 px-3 sm:px-5 lg:px-7 pt-3">
            <div className="lg-glass-strong rounded-[22px] h-14 px-3 sm:px-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img src="/logo.png" alt="" className="h-8 w-8 object-contain lg:hidden" />
                <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">{title}</h1>
              </div>

              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-white/60 transition-colors"
                >
                  <span className="lg-avatar h-9 w-9 text-xs">{userInitials}</span>
                  <span className="hidden sm:block text-left max-w-[10rem]">
                    <span className="block text-xs font-semibold text-slate-700 truncate">{userEmail}</span>
                    <span className="block text-[11px] text-slate-400">{isAdmin ? 'Administrateur' : 'Staff'}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {profileOpen && (
                  <div role="menu" className="lg-glass-strong absolute right-0 top-full mt-2 w-60 rounded-2xl p-1.5 z-40">
                    <div className="px-3 py-2.5">
                      <p className="text-sm font-semibold text-slate-800 truncate">{userEmail}</p>
                      <span className={`lg-badge mt-1 ${isAdmin ? 'lg-badge-accent' : ''}`}>
                        {isAdmin ? 'Administrateur' : 'Staff'}
                      </span>
                    </div>
                    <div className="lg-hairline" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); setPwdOpen(true); }}
                      className="lg-nav-link w-full mt-1"
                    >
                      <KeyRound className="w-4 h-4" aria-hidden="true" /> Changer mon mot de passe
                    </button>
                    <Link to="/settings" role="menuitem" onClick={() => setProfileOpen(false)} className="lg-nav-link w-full">
                      <SettingsIcon className="w-4 h-4" aria-hidden="true" /> Paramètres
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); handleLogout(); }}
                      className="lg-nav-link w-full text-red-500 hover:text-red-600"
                    >
                      <LogOut className="w-4 h-4" aria-hidden="true" /> Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main key={theme} className="lg-enter flex-1 px-3 sm:px-5 lg:px-7 py-5 pb-32 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav pathname={location.pathname} onOpenMore={() => setMoreOpen(true)} />

      {/* Feuille « Plus » (mobile) */}
      <GlassModal open={moreOpen} onClose={() => setMoreOpen(false)} title="Plus" description="Toutes les sections" size="sm">
        <div className="grid grid-cols-1 gap-1">
          {moreItems.map((item) => {
            const active = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMoreOpen(false)}
                data-active={active}
                className="lg-nav-link"
              >
                <item.icon className="w-5 h-5" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
          <div className="lg-hairline my-1" />
          <button type="button" onClick={handleLogout} className="lg-nav-link w-full text-red-500">
            <LogOut className="w-5 h-5" aria-hidden="true" /> Déconnexion
          </button>
        </div>
      </GlassModal>

      {/* Changement de mot de passe */}
      <GlassModal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Changer le mot de passe" size="sm">
        <ChangePasswordForm liquid onSuccess={() => setTimeout(() => setPwdOpen(false), 1200)} />
      </GlassModal>
    </div>
  );
}
