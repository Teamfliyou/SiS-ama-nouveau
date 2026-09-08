import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserPlus, School, Users, BookOpen, CheckCircle2,
  UploadCloud, Download, Plus, Trash2, Loader2, AlertTriangle,
  ArrowRight, X, GraduationCap,
} from 'lucide-react';
import { API_BASE, authFetch } from '../utils/api';
import { toast } from '../utils/toast';
import ToastContainer from '../components/ToastContainer';
import { parseCSV, findColumn, downloadCsv } from '../utils/csv';

type Step = 'admin' | 'users' | 'classes' | 'students' | 'teachers' | 'done';
type RowMap = Record<string, string>;
type FieldDef = { key: string; label: string; required?: boolean; aliases: string[] };
type ImportSummary = { label: string; count: number }[];

const STEPS: { id: Step; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'users', label: 'Comptes' },
  { id: 'classes', label: 'Classes' },
  { id: 'students', label: 'Élèves' },
  { id: 'teachers', label: 'Profs' },
  { id: 'done', label: 'Terminé' },
];

const CLASSES_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Nom de la classe', required: true, aliases: ['classe', 'class', 'nom de la classe', 'name'] },
  { key: 'tuitionFee', label: 'Frais de scolarité', aliases: ['frais', 'fee', 'tarif'] },
];

const STUDENTS_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'Prénom', required: true, aliases: ['prénom', 'prenom', 'firstname', 'first name'] },
  { key: 'lastName', label: 'Nom', required: true, aliases: ['nom de famille', 'lastname', 'last name', 'nom'] },
  { key: 'className', label: 'Classe', aliases: ['classe', 'class'] },
  { key: 'tuitionFee', label: 'Frais de scolarité', aliases: ['frais', 'fee', 'tarif'] },
];

const TEACHERS_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'Prénom', required: true, aliases: ['prénom', 'prenom', 'firstname', 'first name'] },
  { key: 'lastName', label: 'Nom', required: true, aliases: ['nom de famille', 'lastname', 'last name', 'nom'] },
  { key: 'subject', label: 'Matière', aliases: ['matière', 'matiere', 'subject', 'discipline'] },
  { key: 'email', label: 'Email', aliases: ['email', 'mail', 'e-mail'] },
  { key: 'phone', label: 'Téléphone', aliases: ['téléphone', 'telephone', 'phone', 'portable'] },
  { key: 'className', label: 'Classe', aliases: ['classe', 'class'] },
];

function autoMap(fields: FieldDef[], headers: string[]): Record<string, string> {
  const pool = [...headers];
  const map: Record<string, string> = {};
  for (const field of fields) {
    const match = findColumn(pool, field.aliases);
    map[field.key] = match;
    if (match) {
      const idx = pool.indexOf(match);
      if (idx !== -1) pool.splice(idx, 1);
    }
  }
  return map;
}

function extractRows(fields: FieldDef[], headers: string[], rows: string[][], columnMap: Record<string, string>): RowMap[] {
  return rows.map(row => {
    const mapped: RowMap = {};
    for (const field of fields) {
      mapped[field.key] = columnMap[field.key] ? row[headers.indexOf(columnMap[field.key])] || '' : '';
    }
    return mapped;
  }).filter(r => fields.every(f => !f.required || r[f.key].trim() !== ''));
}

// ─── Generic CSV import step ──────────────────────────────────────────────────

function CsvStep({
  title, description, icon, fields, sampleFilename, sampleContent, formatHint, importer, onComplete, onSkip,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  sampleFilename: string;
  sampleContent: string;
  formatHint: string;
  importer: (rows: RowMap[]) => Promise<ImportSummary>;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFileName(''); setHeaders([]); setRows([]); setColumnMap({});
    setError(''); setSummary(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { setError('Veuillez sélectionner un fichier .csv'); return; }
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = parseCSV(e.target?.result as string);
      if (parsed.length < 2) { setError('Le fichier est vide ou invalide.'); return; }
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      setColumnMap(autoMap(fields, parsed[0]));
    };
    reader.readAsText(file, 'UTF-8');
  };

  const validRows = extractRows(fields, headers, rows, columnMap);

  const runImport = async () => {
    setImporting(true);
    setError('');
    try {
      const result = await importer(validRows);
      setSummary(result);
      toast.success(`${title} importé${title.endsWith('s') ? 's' : ''} avec succès`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur pendant l\'import');
    } finally {
      setImporting(false);
    }
  };

  if (summary) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <p className="font-bold text-slate-800">Import terminé</p>
          <div className="flex flex-wrap justify-center gap-3 mt-4">
            {summary.map((s, i) => (
              <div key={i} className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3">
                <p className="text-2xl font-black text-primary">{s.count}</p>
                <p className="text-xs text-slate-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onComplete} className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all">
          Continuer <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2.5 rounded-xl">{icon}</div>
        <div>
          <p className="font-bold text-slate-800">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>

      {!headers.length ? (
        <>
          <div
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragOver ? 'border-primary bg-blue-50' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            <UploadCloud className={`w-10 h-10 mx-auto mb-3 transition-colors ${dragOver ? 'text-primary' : 'text-slate-300'}`} />
            <p className="font-semibold text-slate-700">Glissez votre fichier CSV ici</p>
            <p className="text-xs text-slate-400 mt-1">ou cliquez pour parcourir</p>
            <p className="text-[11px] text-slate-300 mt-3">Colonnes attendues : {formatHint}</p>
          </div>
          <button
            onClick={() => downloadCsv(sampleFilename, sampleContent)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-primary" /> Télécharger un modèle
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-400">{validRows.length} ligne{validRows.length > 1 ? 's' : ''} valide{validRows.length > 1 ? 's' : ''} sur {rows.length}</p>
            </div>
            <button onClick={reset} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 font-medium">
              <X className="w-3.5 h-3.5" /> Changer de fichier
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={columnMap[field.key] || ''}
                  onChange={e => setColumnMap(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">-- Aucune colonne --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>

          {validRows.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {fields.filter(f => columnMap[f.key]).map(f => (
                      <th key={f.key} className="px-4 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {validRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {fields.filter(f => columnMap[f.key]).map(f => (
                        <td key={f.key} className="px-4 py-2 text-sm text-slate-700">{row[f.key] || <span className="text-slate-300 italic">—</span>}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {validRows.length > 5 && <p className="px-4 py-2 text-[11px] text-slate-400 bg-slate-50">+ {validRows.length - 5} autres lignes…</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</p>}
        </>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onSkip} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors font-medium">
          Passer cette étape
        </button>
        {headers.length > 0 && (
          <button
            onClick={runImport}
            disabled={importing || validRows.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-40"
          >
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Import en cours…</>
              : <>Importer {validRows.length} ligne{validRows.length > 1 ? 's' : ''}</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main wizard ───────────────────────────────────────────────────────────────

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('admin');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [results, setResults] = useState({ users: 0, classes: 0, students: 0, teachers: 0 });

  // Admin form
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Staff accounts
  const [staff, setStaff] = useState([{ email: '', password: '', role: 'STAFF' }]);
  const [creatingUsers, setCreatingUsers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/setup/status`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (cancelled) return;
        if (!data.needsSetup) {
          navigate(localStorage.getItem('token') ? '/dashboard' : '/login', { replace: true });
          return;
        }
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const currentIdx = STEPS.findIndex(s => s.id === step);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (adminPassword.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères'); return; }
    if (adminPassword !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/setup/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Erreur lors de la création du compte'); return; }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', data.email);
      localStorage.setItem('role', data.role);
      toast.success('Compte administrateur créé');
      setResults(r => ({ ...r, users: r.users + 1 }));
      setStep('users');
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUsers = async () => {
    const filled = staff.filter(s => s.email.trim() && s.password);
    if (filled.some(s => s.password.length < 8)) { toast.error('Chaque mot de passe doit contenir au moins 8 caractères'); return; }
    setCreatingUsers(true);
    let created = 0;
    let failed = 0;
    try {
      for (const s of filled) {
        const res = await authFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({ email: s.email.trim(), password: s.password, role: s.role }),
        });
        if (res.ok) created++; else failed++;
      }
      if (failed) toast.error(`${failed} compte${failed > 1 ? 's' : ''} en échec (email déjà utilisé ?)`);
      if (created) toast.success(`${created} compte${created > 1 ? 's' : ''} supplémentaire${created > 1 ? 's' : ''} créé${created > 1 ? 's' : ''}`);
      setResults(r => ({ ...r, users: r.users + created }));
      setStep('classes');
    } finally {
      setCreatingUsers(false);
    }
  };

  const importClasses = async (rows: RowMap[]): Promise<ImportSummary> => {
    const listRes = await authFetch('/api/classes');
    if (!listRes.ok) throw new Error('Impossible de lire les classes existantes');
    const existing = new Set(((await listRes.json()) as { name: string }[]).map(c => c.name));
    const seen = new Set<string>();
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const name = r.name.trim();
      if (!name || existing.has(name) || seen.has(name)) { skipped++; continue; }
      seen.add(name);
      const res = await authFetch('/api/classes', {
        method: 'POST',
        body: JSON.stringify({ name, tuitionFee: parseFloat(r.tuitionFee) || 0 }),
      });
      if (res.ok) created++; else skipped++;
    }
    setResults(prev => ({ ...prev, classes: prev.classes + created }));
    return [{ label: 'Classes créées', count: created }, { label: 'Lignes ignorées', count: skipped }];
  };

  const importStudents = async (rows: RowMap[]): Promise<ImportSummary> => {
    const payload = rows.map(r => ({
      firstName: r.firstName.trim(),
      lastName: r.lastName.trim(),
      className: r.className.trim(),
      tuitionFee: r.tuitionFee ? parseFloat(r.tuitionFee) : undefined,
    }));
    const res = await authFetch('/api/import-csv/students', { method: 'POST', body: JSON.stringify({ rows: payload }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur pendant l\'import');
    setResults(prev => ({ ...prev, students: prev.students + (data.createdStudents || 0), classes: prev.classes + (data.createdClasses || 0) }));
    return [
      { label: 'Élèves inscrits', count: data.createdStudents || 0 },
      { label: 'Classes créées', count: data.createdClasses || 0 },
    ];
  };

  const importTeachers = async (rows: RowMap[]): Promise<ImportSummary> => {
    const payload = rows.map(r => ({
      firstName: r.firstName.trim(),
      lastName: r.lastName.trim(),
      subject: r.subject.trim(),
      email: r.email.trim(),
      phone: r.phone.trim(),
      className: r.className.trim(),
    }));
    const res = await authFetch('/api/import-csv/teachers', { method: 'POST', body: JSON.stringify({ rows: payload }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur pendant l\'import');
    setResults(prev => ({ ...prev, teachers: prev.teachers + (data.createdTeachers || 0) }));
    return [
      { label: 'Professeurs ajoutés', count: data.createdTeachers || 0 },
      { label: 'Lignes ignorées', count: data.skipped || 0 },
    ];
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
          <p className="font-bold text-slate-800 mb-1">Serveur injoignable</p>
          <p className="text-sm text-slate-500 mb-6">Vérifiez que le serveur est démarré puis réessayez.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all">
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 to-gray-50 py-10 px-4">
      <ToastContainer />
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="text-center">
          <div className="bg-primary/10 text-primary p-3 rounded-xl w-fit mx-auto mb-4">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Bienvenue dans ASSO AMA SIS</h1>
          <p className="mt-2 text-sm text-slate-500">
            Configuration initiale en 6 étapes — créez vos comptes et importez vos données. Tout est modifiable ensuite.
          </p>
        </div>

        {/* Stepper */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] px-6 py-4 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {STEPS.map((s, i) => {
              const isActive = s.id === step;
              const isDone = i < currentIdx;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'bg-primary text-white shadow-sm' :
                    isDone ? 'bg-emerald-50 text-emerald-700' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="text-[10px] font-black">{i + 1}</span>}
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 min-w-4 ${isDone ? 'bg-emerald-200' : 'bg-slate-100'}`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/40 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">

          {/* STEP 1 — Admin account */}
          {step === 'admin' && (
            <form onSubmit={handleCreateAdmin} className="space-y-6">
              <div className="space-y-1.5">
                <p className="font-bold text-slate-800 text-lg">Créez votre compte administrateur</p>
                <p className="text-xs text-slate-500">Ce compte aura tous les droits. Il vous permettra de gérer les utilisateurs plus tard.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Adresse email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="direction@asso-ama.fr"
                  className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-slate-400"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mot de passe <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={adminPassword}
                    onChange={e => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-slate-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">8 caractères minimum</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirmation <span className="text-red-500">*</span></label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-slate-400"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(26,115,232,0.39)] text-sm font-bold text-white bg-primary hover:bg-blue-600 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Créer le compte et continuer <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* STEP 2 — Additional staff accounts */}
          {step === 'users' && (
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 text-primary p-2.5 rounded-xl"><UserPlus className="w-5 h-5" /></div>
                <div>
                  <p className="font-bold text-slate-800">Comptes supplémentaires</p>
                  <p className="text-xs text-slate-500">Optionnel — créez dès maintenant les accès du secrétariat ou des enseignants.</p>
                </div>
              </div>

              {staff.map((s, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-4 space-y-3 relative">
                  {staff.length > 1 && (
                    <button onClick={() => setStaff(prev => prev.filter((_, j) => j !== i))} className="absolute top-3 right-3 text-slate-300 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={s.email}
                      onChange={e => setStaff(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-slate-400"
                    />
                    <select
                      value={s.role}
                      onChange={e => setStaff(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    >
                      <option value="STAFF">Personnel (STAFF)</option>
                      <option value="ADMIN">Administrateur (ADMIN)</option>
                    </select>
                  </div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="Mot de passe (8 caractères min.)"
                    value={s.password}
                    onChange={e => setStaff(prev => prev.map((x, j) => j === i ? { ...x, password: e.target.value } : x))}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-slate-400"
                  />
                </div>
              ))}

              <button
                onClick={() => setStaff(prev => [...prev, { email: '', password: '', role: 'STAFF' }])}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-blue-700"
              >
                <Plus className="w-4 h-4" /> Ajouter un compte
              </button>

              <div className="flex justify-between pt-2">
                <button onClick={() => setStep('classes')} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors font-medium">
                  Passer cette étape
                </button>
                <button
                  onClick={handleCreateUsers}
                  disabled={creatingUsers}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-60"
                >
                  {creatingUsers ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</> : <>Créer les comptes <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Classes */}
          {step === 'classes' && (
            <CsvStep
              key="classes"
              title="Classes"
              description="Importez vos classes depuis un fichier CSV."
              icon={<School className="w-5 h-5" />}
              fields={CLASSES_FIELDS}
              sampleFilename="classes_modele.csv"
              sampleContent={['Classe,Frais', '6ème A,150', '6ème B,150', '5ème A,180'].join('\n')}
              formatHint="Classe · Frais (optionnel)"
              importer={importClasses}
              onComplete={() => setStep('students')}
              onSkip={() => setStep('students')}
            />
          )}

          {/* STEP 4 — Students */}
          {step === 'students' && (
            <CsvStep
              key="students"
              title="Élèves"
              description="Inscrivez vos élèves en masse ; les classes manquantes sont créées automatiquement."
              icon={<Users className="w-5 h-5" />}
              fields={STUDENTS_FIELDS}
              sampleFilename="eleves_modele.csv"
              sampleContent={['Prénom,Nom,Classe,Frais', 'Jean,Dupont,6ème A,150', 'Marie,Martin,6ème A,150'].join('\n')}
              formatHint="Prénom · Nom · Classe (optionnel) · Frais (optionnel)"
              importer={importStudents}
              onComplete={() => setStep('teachers')}
              onSkip={() => setStep('teachers')}
            />
          )}

          {/* STEP 5 — Teachers */}
          {step === 'teachers' && (
            <CsvStep
              key="teachers"
              title="Profs"
              description="Ajoutez vos professeurs avec leur matière et leurs coordonnées."
              icon={<BookOpen className="w-5 h-5" />}
              fields={TEACHERS_FIELDS}
              sampleFilename="profs_modele.csv"
              sampleContent={['Prénom,Nom,Matière,Email,Téléphone', 'Ahmed,Benali,Mathématiques,a.benali@exemple.fr,06 12 34 56 78'].join('\n')}
              formatHint="Prénom · Nom · Matière · Email · Téléphone · Classe (tous optionnels sauf nom/prénom)"
              importer={importTeachers}
              onComplete={() => setStep('done')}
              onSkip={() => setStep('done')}
            />
          )}

          {/* STEP 6 — Done */}
          {step === 'done' && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-black text-slate-800">Configuration terminée !</p>
                <p className="text-sm text-slate-500 mt-2">Votre école est prête. Voici le récapitulatif :</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Comptes', value: results.users, color: 'text-primary bg-blue-50 border-blue-100' },
                  { label: 'Classes', value: results.classes, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
                  { label: 'Élèves', value: results.students, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
                  { label: 'Profs', value: results.teachers, color: 'text-amber-600 bg-amber-50 border-amber-100' },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border px-4 py-4 ${item.color}`}>
                    <p className="text-2xl font-black">{item.value}</p>
                    <p className="text-xs opacity-80">{item.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">Astuce : les imports CSV restent disponibles à tout moment depuis le menu « Import CSV ».</p>
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 hover:-translate-y-0.5 transition-all shadow-[0_4px_14px_0_rgba(26,115,232,0.39)]"
              >
                Accéder au tableau de bord <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
