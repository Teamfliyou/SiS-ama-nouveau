import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CameraOff, CheckCircle2, Copy, ExternalLink, HeartPulse, Inbox, Link2, Mail, Phone, Printer, RotateCcw, Save,
  Settings, Trash2, UserCheck, UserPlus, XCircle, Clock,
} from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { copyText } from '../utils/clipboard';
import Sheet from '../components/mobile/Sheet';
import {
  STATUS_INFO, ageOn, euros, frenchDate, type PreRegistrationFile, type PreRegistrationStatus,
} from '../utils/preRegistration';

type Tab = 'files' | 'settings';
type Filter = PreRegistrationStatus | 'ALL';
type Settings = {
  isOpen: boolean;
  schoolYear: string;
  minAge: number;
  ageReferenceDate: string;
  contactEmail: string | null;
  helloAssoUrl: string | null;
  rulesText: string;
};
type ClassRow = {
  id: number;
  name: string;
  tuitionFeeCents: number;
  openForRegistration: boolean;
  scheduleLabel: string | null;
  capacity: number | null;
  taken: number;
  waitlisted: number;
};

const inputCls = 'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';
const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'NEW', label: 'À traiter' },
  { value: 'WAITLIST', label: "Liste d'attente" },
  { value: 'VALIDATED', label: 'Validés' },
  { value: 'REFUSED', label: 'Refusés' },
  { value: 'ALL', label: 'Tous' },
];

const StatusBadge = ({ status }: { status: PreRegistrationStatus }) => (
  <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_INFO[status].badge}`}>{STATUS_INFO[status].label}</span>
);

const guardianName = (f: PreRegistrationFile) => {
  const g = f.guardians[0];
  return g ? `${g.firstName} ${g.lastName.toUpperCase()}` : '—';
};

export default function PreRegistrations() {
  const [tab, setTab] = useState<Tab>('files');
  const [filter, setFilter] = useState<Filter>('NEW');
  const [files, setFiles] = useState<PreRegistrationFile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<PreRegistrationFile | null>(null);
  const [classChoice, setClassChoice] = useState<Record<number, string>>({});
  const [validating, setValidating] = useState(false);
  const [note, setNote] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [mailConfigured, setMailConfigured] = useState(false);
  const publicUrl = `${window.location.origin}/preinscription`;

  const loadFiles = useCallback(async () => {
    try {
      const data = await safeJson<{ files: PreRegistrationFile[]; counts: Record<string, number> }>(
        await authFetch(`/api/pre-registrations${filter === 'ALL' ? '' : `?status=${filter}`}`)
      );
      setFiles(data.files);
      setCounts(data.counts);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [filter]);

  const loadSettings = useCallback(async () => {
    try {
      const data = await safeJson<{ settings: Settings; classes: ClassRow[]; mailConfigured: boolean }>(
        await authFetch('/api/pre-registrations/settings')
      );
      setSettings(data.settings);
      setClasses(data.classes);
      setMailConfigured(data.mailConfigured);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => { void loadFiles(); }, [loadFiles]);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const offered = classes.filter((c) => c.openForRegistration);

  const open = (f: PreRegistrationFile) => {
    setSelected(f);
    setNote(f.adminNote ?? '');
    setShowEmail(false);
    setClassChoice(Object.fromEntries(f.children.map((c) => [c.id, c.classId ? String(c.classId) : ''])));
  };
  const close = useCallback(() => setSelected(null), []);

  const refresh = async (updated?: PreRegistrationFile) => {
    await loadFiles();
    void loadSettings();
    if (updated) setSelected(updated);
  };

  const setStatus = async (status: PreRegistrationStatus) => {
    if (!selected) return;
    try {
      const updated = await safeJson<PreRegistrationFile>(
        await authFetch(`/api/pre-registrations/${selected.id}/status`, { method: 'PUT', body: JSON.stringify({ status, adminNote: note }) })
      );
      toast.success(`Dossier ${updated.reference} : ${STATUS_INFO[status].label.toLowerCase()}`);
      await refresh(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const validateFile = async () => {
    if (!selected) return;
    if (!window.confirm(`Valider le dossier ${selected.reference} et inscrire ${selected.children.length > 1 ? 'les enfants' : "l'enfant"} dans la liste des élèves ?`)) return;
    setValidating(true);
    try {
      const body = JSON.stringify({
        children: selected.children.map((c) => ({ id: c.id, classId: classChoice[c.id] ? Number(classChoice[c.id]) : null })),
      });
      const res = await safeJson<{ file: PreRegistrationFile; studentsCreated: number; studentsUpdated: number }>(
        await authFetch(`/api/pre-registrations/${selected.id}/validate`, { method: 'POST', body })
      );
      toast.success(
        `Dossier validé : ${res.studentsCreated} élève(s) créé(s)${res.studentsUpdated ? `, ${res.studentsUpdated} fiche(s) mise(s) à jour` : ''}`
      );
      await refresh(res.file);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setValidating(false);
    }
  };

  const resendEmail = async () => {
    if (!selected) return;
    try {
      const { emailStatus } = await safeJson<{ emailStatus: string }>(
        await authFetch(`/api/pre-registrations/${selected.id}/resend-email`, { method: 'POST' })
      );
      toast.success(emailStatus === 'SENT' ? 'Email renvoyé' : emailStatus === 'SIMULATED' ? 'Email préparé (envoi simulé)' : "L'email n'a pas pu être envoyé");
      await loadFiles();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Supprimer définitivement le dossier ${selected.reference} ?${selected.status === 'VALIDATED' ? ' Les élèves déjà créés sont conservés.' : ''}`)) return;
    try {
      await safeJson(await authFetch(`/api/pre-registrations/${selected.id}`, { method: 'DELETE' }));
      toast.success('Dossier supprimé');
      setSelected(null);
      await refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      await safeJson(await authFetch('/api/pre-registrations/settings', { method: 'PUT', body: JSON.stringify(settings) }));
      toast.success('Réglages enregistrés');
      void loadSettings();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const saveClass = async (c: ClassRow) => {
    try {
      await safeJson(
        await authFetch(`/api/pre-registrations/classes/${c.id}`, {
          method: 'PUT',
          body: JSON.stringify({ openForRegistration: c.openForRegistration, scheduleLabel: c.scheduleLabel ?? '', capacity: c.capacity }),
        })
      );
      toast.success(`Classe ${c.name} enregistrée`);
      void loadSettings();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const setClassRow = (id: number, patch: Partial<ClassRow>) =>
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const copyLink = async () => {
    if (await copyText(publicUrl)) toast.success('Lien copié');
    else toast.error('Copie impossible sur cet appareil');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="no-print mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Pré-inscriptions</h2>
        <p className="mt-2 text-sm text-slate-500">
          Les dossiers envoyés par les familles depuis le formulaire en ligne. Un dossier validé crée les élèves dans leur classe ;
          l'inscription est définitive après le paiement, à enregistrer dans Finances.
        </p>
      </div>

      {/* Public link */}
      <div className={`no-print ${card} p-5 mobile:p-4 flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${settings?.isOpen ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            <Link2 className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">
              Formulaire {settings?.isOpen ? 'ouvert' : 'fermé'} aux familles
              {settings && <span className="font-normal text-slate-500"> · {settings.schoolYear}</span>}
            </p>
            <p className="text-sm text-slate-500 truncate">{publicUrl}</p>
          </div>
        </div>
        <div className="flex gap-2 mobile:w-full">
          <button onClick={copyLink} className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 mobile:flex-1 mobile:min-h-[44px]">
            <Copy className="w-4 h-4" /> Copier le lien
          </button>
          <a href="/preinscription" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 mobile:flex-1 mobile:min-h-[44px]">
            <ExternalLink className="w-4 h-4" /> Ouvrir
          </a>
        </div>
      </div>

      <div className="no-print inline-flex rounded-xl bg-slate-100 p-1 mobile:flex mobile:w-full" role="tablist">
        {([
          ['files', `Dossiers (${total})`, Inbox],
          ['settings', 'Réglages', Settings],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors mobile:flex-1 mobile:min-h-[44px] ${tab === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'files' ? (
        <div className="space-y-4">
          <div className="no-print flex flex-wrap gap-2 mobile:flex-nowrap mobile:overflow-x-auto mobile:-mx-4 mobile:px-4" data-hscroll>
            {FILTERS.map((f) => (
              <button key={f.value} onClick={() => setFilter(f.value)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full border text-sm font-semibold transition-colors ${filter === f.value ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                {f.label} ({f.value === 'ALL' ? total : counts[f.value] ?? 0})
              </button>
            ))}
          </div>

          {files.length === 0 ? (
            <div className={`${card} text-center py-16 mobile:py-12`}>
              <Inbox className="w-14 h-14 mx-auto text-slate-200 mb-4" />
              <p className="font-semibold text-slate-500">Aucun dossier dans cette liste.</p>
              <p className="mt-1 text-sm text-slate-400">Communiquez le lien du formulaire aux familles pour recevoir leurs pré-inscriptions.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {files.map((f) => (
                <li key={f.id}>
                  <button onClick={() => open(f)} className={`${card} w-full text-left p-5 mobile:p-4 hover:border-primary/40 hover:shadow-md transition-all`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{guardianName(f)} <span className="font-normal text-slate-400">· {f.reference}</span></p>
                        <p className="text-sm text-slate-500">
                          Reçu le {new Date(f.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          {f.guardians[0] && <> · {f.guardians[0].phone}</>}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900">{euros(f.totalCents)}</span>
                        <StatusBadge status={f.status} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.children.map((c) => (
                        <span key={c.id} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${c.waitlisted && f.status !== 'VALIDATED' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                          {c.firstName} · {c.class?.name ?? 'sans classe'}
                          {c.waitlisted && f.status !== 'VALIDATED' && <Clock className="w-3.5 h-3.5" />}
                          {c.medicalInfo && <HeartPulse className="w-3.5 h-3.5 text-red-500" />}
                          {c.photoOptOut && <CameraOff className="w-3.5 h-3.5 text-slate-500" />}
                        </span>
                      ))}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        settings && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mobile:gap-4">
            <form onSubmit={saveSettings} className={`${card} p-6 mobile:p-4 space-y-4 lg:col-span-2`}>
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Formulaire en ligne</h3>
              <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 cursor-pointer">
                <input type="checkbox" className="h-5 w-5 accent-primary" checked={settings.isOpen} onChange={(e) => setSettings({ ...settings, isOpen: e.target.checked })} />
                <span className="text-sm font-semibold text-slate-800">Pré-inscriptions ouvertes aux familles</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Année scolaire</label>
                  <input required className={inputCls} placeholder="2026-2027" value={settings.schoolYear} onChange={(e) => setSettings({ ...settings, schoolYear: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Âge minimum</label>
                  <input required type="number" min={0} max={18} className={inputCls} value={settings.minAge} onChange={(e) => setSettings({ ...settings, minAge: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Âge atteint au</label>
                <input required type="date" className={inputCls} value={settings.ageReferenceDate} onChange={(e) => setSettings({ ...settings, ageReferenceDate: e.target.value })} />
                <p className="mt-1 text-xs text-slate-500">L'enfant doit avoir l'âge minimum à cette date.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email de la mosquée</label>
                <input type="email" className={inputCls} placeholder="edu@assoma.fr" value={settings.contactEmail ?? ''} onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })} />
                <p className="mt-1 text-xs text-slate-500">Affiché aux familles et destinataire d'un email à chaque nouveau dossier.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Lien HelloAsso</label>
                <input type="url" className={inputCls} placeholder="https://www.helloasso.com/associations/…" value={settings.helloAssoUrl ?? ''} onChange={(e) => setSettings({ ...settings, helloAssoUrl: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Règlement intérieur</label>
                <textarea required rows={8} className={inputCls} value={settings.rulesText} onChange={(e) => setSettings({ ...settings, rulesText: e.target.value })} />
              </div>
              <p className={`flex items-start gap-2 rounded-xl p-3 text-xs ${mailConfigured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                <Mail className="w-4 h-4 shrink-0" />
                {mailConfigured
                  ? 'Envoi des emails actif (Brevo).'
                  : "Envoi des emails simulé : les emails sont préparés et gardés dans chaque dossier, mais rien n'est envoyé tant que la clé Brevo n'est pas configurée."}
              </p>
              <button type="submit" className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-blue-600 mobile:min-h-[48px]">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </form>

            <section className={`${card} p-6 mobile:p-4 lg:col-span-3`}>
              <h3 className="text-lg font-semibold text-slate-800">Classes proposées</h3>
              <p className="mt-1 text-sm text-slate-500">
                Tarif repris de la page Classes. Au-delà du nombre de places, les enfants passent en liste d'attente.
              </p>
              <ul className="mt-4 divide-y divide-slate-100">
                {classes.map((c) => (
                  <li key={c.id} className="py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" className="h-5 w-5 accent-primary" checked={c.openForRegistration} onChange={(e) => setClassRow(c.id, { openForRegistration: e.target.checked })} />
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <span className="text-sm text-emerald-600 font-semibold">{euros(c.tuitionFeeCents)}</span>
                      </label>
                      <span className="text-xs text-slate-500">
                        {c.taken}{c.capacity ? ` / ${c.capacity}` : ''} place{c.taken > 1 ? 's' : ''} prise{c.taken > 1 ? 's' : ''}
                        {c.waitlisted > 0 && <span className="text-amber-700 font-semibold"> · {c.waitlisted} en attente</span>}
                      </span>
                    </div>
                    {c.openForRegistration && (
                      <div className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end mobile:grid-cols-[1fr_5.5rem_auto]">
                        <div>
                          <label className="block text-xs font-medium text-slate-600">Créneau affiché</label>
                          <input className={inputCls} placeholder="Samedi matin" value={c.scheduleLabel ?? ''} onChange={(e) => setClassRow(c.id, { scheduleLabel: e.target.value })} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600">Places</label>
                          <input type="number" min={1} className={inputCls} placeholder="∞" value={c.capacity ?? ''}
                            onChange={(e) => setClassRow(c.id, { capacity: e.target.value === '' ? null : Number(e.target.value) })} />
                        </div>
                        <button onClick={() => saveClass(c)} className="h-[42px] px-3 rounded-lg border border-slate-200 text-slate-600 hover:text-primary hover:border-primary" aria-label={`Enregistrer ${c.name}`}>
                          <Save className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {!c.openForRegistration && (
                      <button onClick={() => saveClass(c)} className="text-xs font-semibold text-slate-500 hover:text-primary">Enregistrer</button>
                    )}
                  </li>
                ))}
              </ul>
              {offered.length === 0 && <p className="mt-2 text-sm text-amber-700">Aucune classe proposée : le formulaire n'aura rien à choisir.</p>}
            </section>
          </div>
        )
      )}

      {/* File detail */}
      <Sheet open={!!selected} onClose={close} maxWidth="max-w-2xl"
        title={selected ? <span className="flex items-center gap-3">{selected.reference} <StatusBadge status={selected.status} /></span> : ''}>
        {selected && (
          <div className="print-area px-5 pb-5 space-y-5">
            <p className="text-sm text-slate-500 -mt-2">
              Reçu le {new Date(selected.createdAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} · année {selected.schoolYear}
            </p>

            <section className="space-y-3">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Enfants</h4>
              {selected.children.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{c.firstName} <span className="uppercase">{c.lastName}</span></p>
                      <p className="text-sm text-slate-500">
                        {c.gender === 'F' ? 'Fille, née' : 'Garçon, né'} le {frenchDate(c.birthDate)}
                        {settings && ` (${ageOn(c.birthDate, settings.ageReferenceDate)} ans au ${frenchDate(settings.ageReferenceDate)})`}
                        {' · '}{c.firstEnrollment ? 'première inscription' : 'déjà inscrit(e)'}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{c.waitlisted && selected.status !== 'VALIDATED' ? <span className="text-amber-700">Liste d'attente</span> : euros(c.feeCents)}</p>
                  </div>
                  <p className="text-sm text-slate-700">Classe demandée : <span className="font-semibold">{c.class ? `${c.class.name}${c.class.scheduleLabel ? ` · ${c.class.scheduleLabel}` : ''}` : 'classe supprimée'}</span></p>
                  {c.medicalInfo && (
                    <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"><HeartPulse className="w-4 h-4 mt-0.5 shrink-0" /> {c.medicalInfo}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className={`px-2 py-1 rounded-lg ${c.photoOptOut ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{c.photoOptOut ? 'Refus des photos' : 'Photos autorisées'}</span>
                    <span className={`px-2 py-1 rounded-lg ${c.canLeaveAlone ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>{c.canLeaveAlone ? 'Rentre seul(e)' : 'Ne rentre pas seul(e)'}</span>
                  </div>
                  {selected.status !== 'VALIDATED' && (
                    <div className="no-print">
                      <label className="block text-xs font-medium text-slate-600">Classe à la validation</label>
                      <select className={inputCls} value={classChoice[c.id] ?? ''} onChange={(e) => setClassChoice({ ...classChoice, [c.id]: e.target.value })}>
                        <option value="">Sans classe pour l'instant</option>
                        {classes.map((k) => <option key={k.id} value={k.id}>{k.name}{k.capacity ? ` (${k.taken}/${k.capacity})` : ''}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Responsables</h4>
              {selected.guardians.map((g, i) => (
                <div key={i} className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
                  <p className="font-bold text-slate-900">{g.firstName} {g.lastName.toUpperCase()} <span className="font-normal text-slate-500">· {g.relationship}</span>
                    {g.volunteer && <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Bénévole</span>}</p>
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    <a href={`tel:${g.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-primary"><Phone className="w-3.5 h-3.5" /> {g.phone}</a>
                    <a href={`mailto:${g.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="w-3.5 h-3.5" /> {g.email}</a>
                  </p>
                  {g.address && <p>{g.address}</p>}
                  {g.profession && <p className="text-slate-500">{g.profession}</p>}
                </div>
              ))}
            </section>

            <section className="rounded-xl border border-slate-200 p-4 text-sm space-y-1">
              <p className="flex justify-between"><span>Sous-total</span><span>{euros(selected.subtotalCents)}</span></p>
              {selected.discountCents > 0 && <p className="flex justify-between text-emerald-700"><span>Réduction famille</span><span>−{euros(selected.discountCents)}</span></p>}
              <p className="flex justify-between font-bold text-slate-900"><span>Cotisation totale due</span><span>{euros(selected.totalCents)}</span></p>
              <p className="pt-2 text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Règlement accepté et informations attestées sur l'honneur</p>
            </section>

            <section className="no-print rounded-xl border border-slate-200 p-4 text-sm space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-semibold text-slate-800">
                  <Mail className="w-4 h-4 text-primary" /> Email de confirmation :
                  <span className={selected.emailStatus === 'SENT' ? 'text-emerald-700' : selected.emailStatus === 'FAILED' ? 'text-red-600' : 'text-amber-700'}>
                    {selected.emailStatus === 'SENT' ? 'envoyé' : selected.emailStatus === 'FAILED' ? "échec de l'envoi" : 'simulé'}
                  </span>
                </p>
                <div className="flex gap-2">
                  {selected.emailText && (
                    <button onClick={() => setShowEmail(!showEmail)} className="text-xs font-semibold text-slate-600 hover:text-primary">{showEmail ? 'Masquer' : 'Voir'}</button>
                  )}
                  <button onClick={resendEmail} className="text-xs font-semibold text-primary hover:underline">Renvoyer</button>
                </div>
              </div>
              {showEmail && selected.emailText && (
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-600 bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto">{selected.emailText}</pre>
              )}
            </section>

            {selected.status !== 'VALIDATED' ? (
              <section className="no-print space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Note interne <span className="font-normal text-slate-400">(facultatif)</span></label>
                  <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex : à rappeler pour confirmer le niveau" />
                </div>
                <button onClick={validateFile} disabled={validating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 mobile:min-h-[48px]">
                  <UserCheck className="w-4 h-4" /> {validating ? 'Validation…' : 'Valider et créer les élèves'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {selected.status === 'NEW' ? (
                    <button onClick={() => setStatus('WAITLIST')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                      <Clock className="w-4 h-4" /> Liste d'attente
                    </button>
                  ) : (
                    <button onClick={() => setStatus('NEW')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <RotateCcw className="w-4 h-4" /> Remettre à traiter
                    </button>
                  )}
                  {selected.status !== 'REFUSED' ? (
                    <button onClick={() => setStatus('REFUSED')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <XCircle className="w-4 h-4" /> Refuser
                    </button>
                  ) : (
                    <button onClick={() => setStatus('WAITLIST')} className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                      <Clock className="w-4 h-4" /> Liste d'attente
                    </button>
                  )}
                </div>
              </section>
            ) : (
              <p className="no-print flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                <UserPlus className="w-4 h-4" /> Dossier validé : les élèves sont dans la <Link to="/students" className="font-semibold underline">liste des élèves</Link>.
                Enregistrez le paiement dans Finances.
              </p>
            )}
            {selected.adminNote && selected.status === 'VALIDATED' && <p className="text-sm text-slate-600">Note : {selected.adminNote}</p>}

            <div className="no-print flex justify-between gap-2 pt-1">
              <button onClick={remove} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Supprimer
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
                <Printer className="w-4 h-4" /> Imprimer le dossier
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
