import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, BookOpen, CreditCard, LogOut, Bell, Search, Menu,
  ClipboardList, UploadCloud, ShieldCheck, GraduationCap,
  ChevronDown, User, KeyRound, X, Eye, EyeOff
} from 'lucide-react';
import { useState } from 'react';
import { authFetch } from '../utils/api';

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);

  // Password change form
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const userEmail = localStorage.getItem('user') || 'Administrateur';
  const userRole = localStorage.getItem('role') || '';
  const userInitials = userEmail.slice(0, 2).toUpperCase();
  const isAdmin = userRole === 'ADMIN';

  const navigation = [
    { name: 'Tableau de bord', href: '/dashboard',   icon: LayoutDashboard },
    { name: 'Élèves',          href: '/students',     icon: Users },
    { name: 'Classes',         href: '/classes',      icon: BookOpen },
    { name: 'Professeurs',     href: '/teachers',     icon: GraduationCap },
    { name: 'Finances',        href: '/finances',     icon: CreditCard },
    { name: 'Appel',           href: '/attendance',   icon: ClipboardList },
    { name: 'Import CSV',      href: '/import-csv',   icon: UploadCloud },
    ...(isAdmin ? [{ name: 'Utilisateurs', href: '/users', icon: ShieldCheck }] : []),
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdLoading(true); setPwdError(''); setPwdSuccess(false);
    try {
      const res = await authFetch('/api/profile/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error); return; }
      setPwdSuccess(true);
      setCurrentPwd(''); setNewPwd('');
      setTimeout(() => { setShowPwdModal(false); setPwdSuccess(false); }, 1500);
    } finally { setPwdLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-20 bg-slate-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Profile dropdown backdrop */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-sm ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-center h-20 border-b border-slate-100 px-6">
            <img src="/logo.png" alt="ASSO AMA SIS" className="h-14 w-auto object-contain" />
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const active = location.pathname === item.href;
              return (
                <Link key={item.name} to={item.href} onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${active ? 'bg-primary text-white shadow-md shadow-primary/20' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  <item.icon className={`mr-3 h-5 w-5 ${active ? 'text-white' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-slate-100">
            <button onClick={handleLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 rounded-xl hover:bg-red-50 transition-colors">
              <LogOut className="mr-3 h-5 w-5 text-red-500" /> Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 h-20 flex items-center justify-between px-4 sm:px-6 lg:px-8 z-10 sticky top-0">
          <div className="flex items-center">
            <button onClick={() => setSidebarOpen(true)} className="p-2 mr-4 text-slate-500 rounded-lg lg:hidden hover:bg-slate-100">
              <Menu className="h-6 w-6" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input type="text" placeholder="Rechercher..."
                className="pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-full text-sm focus:bg-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all w-64" />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button className="relative p-2 text-slate-400 hover:text-slate-500 transition-colors rounded-full hover:bg-slate-100">
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
              <Bell className="h-6 w-6" />
            </button>

            {/* ── Profile menu ── */}
            <div className="relative border-l border-slate-200 pl-3">
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-slate-100 transition-colors group"
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center font-bold text-sm shadow-md">
                  {userInitials}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-semibold text-slate-700 leading-tight">{userEmail}</p>
                  <p className="text-xs text-slate-400">{isAdmin ? 'Administrateur' : 'Staff'}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 hidden md:block transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {isProfileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-40 py-2 animate-in fade-in zoom-in-95 duration-150">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-primary to-blue-400 text-white flex items-center justify-center font-bold text-sm shadow">
                        {userInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{userEmail}</p>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${isAdmin ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                          {isAdmin ? 'Admin' : 'Staff'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="py-1">
                    <button
                      onClick={() => { setProfileOpen(false); setPwdError(''); setPwdSuccess(false); setShowPwdModal(true); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <KeyRound className="w-4 h-4 text-slate-400" /> Changer mon mot de passe
                    </button>
                    <Link to="/teachers" onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <GraduationCap className="w-4 h-4 text-slate-400" /> Gérer les professeurs
                    </Link>
                    {isAdmin && (
                      <Link to="/users" onClick={() => setProfileOpen(false)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                        <User className="w-4 h-4 text-slate-400" /> Comptes utilisateurs
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-slate-100 py-1">
                    <button onClick={() => { setProfileOpen(false); handleLogout(); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      <LogOut className="w-4 h-4" /> Déconnexion
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* ── Change password modal ── */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <KeyRound className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Changer le mot de passe</h3>
              </div>
              <button onClick={() => setShowPwdModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwdSuccess ? (
              <div className="text-center py-6">
                <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="font-semibold text-slate-800">Mot de passe modifié !</p>
              </div>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe actuel</label>
                  <div className="relative">
                    <input type={showCurrent ? 'text' : 'password'} required
                      value={currentPwd} onChange={e => setCurrentPwd(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary" />
                    <button type="button" onClick={() => setShowCurrent(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showCurrent ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nouveau mot de passe</label>
                  <div className="relative">
                    <input type={showNew ? 'text' : 'password'} required minLength={8}
                      value={newPwd} onChange={e => setNewPwd(e.target.value)}
                      placeholder="Min. 8 caractères"
                      className="w-full px-3 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary" />
                    <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                      {showNew ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                    </button>
                  </div>
                </div>
                {pwdError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{pwdError}</p>}
                <div className="flex justify-end gap-3 pt-1">
                  <button type="button" onClick={() => setShowPwdModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Annuler</button>
                  <button type="submit" disabled={pwdLoading}
                    className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-60">
                    {pwdLoading ? 'Enregistrement...' : 'Confirmer'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
