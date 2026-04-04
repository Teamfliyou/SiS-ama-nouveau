import { useState, useEffect, useRef } from 'react';
import {
  Users, BookOpen, GraduationCap, TrendingUp,
  KeyRound, UserPlus, Download, UploadCloud,
  Eye, EyeOff, CheckCircle2, AlertTriangle, RefreshCw, Settings
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authFetch } from '../utils/api';

type Stats = { studentsCount: number; classesCount: number; teachersCount: number; totalPayments: number };
type ImportResult = { classesCreated: number; studentsCreated: number; teachersCreated: number };

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ studentsCount: 0, classesCount: 0, teachersCount: 0, totalPayments: 0 });
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem('role') === 'ADMIN';

  // Password change
  const [pwdOpen, setPwdOpen] = useState(false);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Create admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Import
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    authFetch('/api/stats').then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  const statCards = [
    { name: 'Élèves Inscrits',   value: stats.studentsCount,              icon: Users,          color: 'bg-blue-500',    link: '/students' },
    { name: 'Classes Actives',   value: stats.classesCount,               icon: BookOpen,       color: 'bg-indigo-500',  link: '/classes' },
    { name: 'Professeurs',       value: stats.teachersCount,              icon: GraduationCap,  color: 'bg-purple-500',  link: '/teachers' },
    { name: 'Paiements totaux',  value: `${stats.totalPayments} €`,       icon: TrendingUp,     color: 'bg-emerald-500', link: '/finances' },
  ];

  // ── Password change ──
  const handlePwdChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdLoading(true); setPwdMsg(null);
    try {
      const res = await authFetch('/api/profile/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd })
      });
      const data = await res.json();
      if (!res.ok) { setPwdMsg({ type: 'error', text: data.error }); return; }
      setPwdMsg({ type: 'success', text: 'Mot de passe modifié avec succès !' });
      setCurPwd(''); setNewPwd('');
      setTimeout(() => { setPwdOpen(false); setPwdMsg(null); }, 2000);
    } finally { setPwdLoading(false); }
  };

  // ── Create admin ──
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true); setAdminMsg(null);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email: adminEmail, password: adminPwd, role: 'ADMIN' })
      });
      const data = await res.json();
      if (!res.ok) { setAdminMsg({ type: 'error', text: data.error }); return; }
      setAdminMsg({ type: 'success', text: `Compte ${adminEmail} créé !` });
      setAdminEmail(''); setAdminPwd('');
      setTimeout(() => { setAdminOpen(false); setAdminMsg(null); }, 2000);
    } finally { setAdminLoading(false); }
  };

  // ── Export ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await authFetch('/api/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asso-ama-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setExporting(false); }
  };

  // ── Import ──
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportError(''); setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await authFetch('/api/import/full', { method: 'POST', body: JSON.stringify(json) });
      const data = await res.json();
      if (!res.ok) { setImportError(data.error); return; }
      setImportResult(data);
      authFetch('/api/stats').then(r => r.json()).then(setStats);
    } catch {
      setImportError('Fichier JSON invalide.');
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Vue d'ensemble</h2>
        <p className="mt-2 text-sm text-slate-500">Bienvenue sur le portail ASSO AMA SIS.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((item) => (
          <Link key={item.name} to={item.link}
            className="block bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all hover:border-primary/30 relative overflow-hidden group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{item.name}</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
              </div>
              <div className={`p-4 rounded-xl ${item.color} text-white shadow-lg`}>
                <item.icon className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full group-hover:bg-emerald-100 transition-colors">
                Voir &rarr;
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: recent + payments */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-lg font-semibold text-slate-800">Dernières inscriptions</h3>
              <Link to="/students" className="text-sm text-primary font-medium hover:text-blue-700">Voir tout</Link>
            </div>
            <div className="p-12 text-center text-slate-500 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-medium text-slate-600">Accédez au registre complet</p>
              <p className="text-sm mt-1">Gérez facilement vos élèves et leurs informations.</p>
              <button onClick={() => navigate('/students')} className="mt-6 px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-blue-600 shadow-sm shadow-primary/30 transition-colors">
                + Ajouter un élève
              </button>
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-primary/20">
            <h3 className="font-bold text-lg mb-2">Paiements</h3>
            <p className="text-blue-100 text-sm mb-6">Suivez les revenus et arriérés.</p>
            <button onClick={() => navigate('/finances')} className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors text-white font-medium py-2 rounded-lg text-sm">
              Gérer la trésorerie
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-1">Activité récente</h3>
            <div className="relative pl-5 pt-4 border-l-2 border-slate-100">
              <div className="absolute left-[-9px] top-4 w-4 h-4 rounded-full bg-slate-200 border-4 border-white"/>
              <p className="text-sm font-medium text-slate-800">Système opérationnel</p>
              <p className="text-xs text-slate-400 mt-0.5">À jour</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Actions rapides ── */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-primary rounded-full inline-block"></span>
          Actions rapides
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Change password */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button onClick={() => { setPwdOpen(o => !o); setPwdMsg(null); }}
              className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors text-left">
              <div className="p-3 bg-blue-50 rounded-xl shrink-0"><KeyRound className="w-5 h-5 text-primary"/></div>
              <div>
                <p className="font-semibold text-slate-800">Changer mon mot de passe</p>
                <p className="text-xs text-slate-400 mt-0.5">Modifier les identifiants de connexion</p>
              </div>
            </button>
            {pwdOpen && (
              <form onSubmit={handlePwdChange} className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                <div className="relative">
                  <input type={showCur ? 'text' : 'password'} required placeholder="Mot de passe actuel"
                    value={curPwd} onChange={e => setCurPwd(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary"/>
                  <button type="button" onClick={() => setShowCur(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showCur ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
                <div className="relative">
                  <input type={showNew ? 'text' : 'password'} required minLength={8} placeholder="Nouveau (min. 8 car.)"
                    value={newPwd} onChange={e => setNewPwd(e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary"/>
                  <button type="button" onClick={() => setShowNew(s=>!s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showNew ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </button>
                </div>
                {pwdMsg && (
                  <p className={`text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${pwdMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                    {pwdMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertTriangle className="w-3.5 h-3.5"/>}
                    {pwdMsg.text}
                  </p>
                )}
                <button type="submit" disabled={pwdLoading}
                  className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-all disabled:opacity-60">
                  {pwdLoading ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </form>
            )}
          </div>

          {/* Create admin — admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => { setAdminOpen(o => !o); setAdminMsg(null); }}
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors text-left">
                <div className="p-3 bg-violet-50 rounded-xl shrink-0"><UserPlus className="w-5 h-5 text-violet-600"/></div>
                <div>
                  <p className="font-semibold text-slate-800">Créer un compte admin</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ajouter un nouvel administrateur</p>
                </div>
              </button>
              {adminOpen && (
                <form onSubmit={handleCreateAdmin} className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
                  <input type="email" required placeholder="Email du compte"
                    value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary"/>
                  <input type="password" required minLength={8} placeholder="Mot de passe (min. 8 car.)"
                    value={adminPwd} onChange={e => setAdminPwd(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary"/>
                  {adminMsg && (
                    <p className={`text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${adminMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {adminMsg.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5"/> : <AlertTriangle className="w-3.5 h-3.5"/>}
                      {adminMsg.text}
                    </p>
                  )}
                  <button type="submit" disabled={adminLoading}
                    className="w-full py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-all disabled:opacity-60">
                    {adminLoading ? 'Création...' : 'Créer le compte'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Paramètres & Données ── */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-slate-400 rounded-full inline-block"></span>
          <Settings className="w-5 h-5 text-slate-500"/> Paramètres & Données
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Export */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
            <div className="p-3 bg-emerald-50 rounded-xl shrink-0"><Download className="w-5 h-5 text-emerald-600"/></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">Exporter toutes les données</p>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">Sauvegarde complète en JSON (classes, élèves, profs, paiements)</p>
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-60">
                {exporting ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Export...</> : <><Download className="w-3.5 h-3.5"/> Télécharger le fichier</>}
              </button>
            </div>
          </div>

          {/* Import */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-start gap-4">
            <div className="p-3 bg-amber-50 rounded-xl shrink-0"><UploadCloud className="w-5 h-5 text-amber-600"/></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800">Importer des données</p>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">Restaurer depuis un fichier d'export JSON (fusion, sans doublon)</p>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile}/>
              <button onClick={() => importRef.current?.click()} disabled={importing}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-all disabled:opacity-60">
                {importing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin"/> Import...</> : <><UploadCloud className="w-3.5 h-3.5"/> Choisir un fichier</>}
              </button>
              {importResult && (
                <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5"/>
                  {importResult.classesCreated} classes · {importResult.studentsCreated} élèves · {importResult.teachersCreated} profs importés
                </p>
              )}
              {importError && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5"/> {importError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
