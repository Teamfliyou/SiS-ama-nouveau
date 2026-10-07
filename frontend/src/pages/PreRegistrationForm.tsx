import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Baby, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, FileCheck, Info, Loader2,
  Mail, Plus, Printer, Receipt, Trash2, Users, Wallet,
} from 'lucide-react';
import { API_BASE } from '../utils/api';
import { familyQuote } from '../utils/familyDiscount';
import {
  RELATIONSHIPS, ageOn, euros, frenchDate, isEmail, isPhone, latestBirthDate, type PublicInfo,
} from '../utils/preRegistration';

type Child = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: '' | 'F' | 'M';
  firstEnrollment: '' | 'yes' | 'no';
  classId: string;
  medicalInfo: string;
  photoOptOut: boolean;
  canLeaveAlone: boolean;
};

type GuardianForm = {
  relationship: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  profession: string;
  volunteer: boolean;
};

type Result = {
  reference: string;
  schoolYear: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  emailStatus: 'SENT' | 'SIMULATED' | 'FAILED';
  emails: string[];
  children: { firstName: string; lastName: string; className: string | null; scheduleLabel: string | null; feeCents: number; waitlisted: boolean }[];
};

const DRAFT_KEY = 'preinscription-brouillon';
const STEPS = [
  { label: 'Enfants', icon: Baby },
  { label: 'Responsables', icon: Users },
  { label: 'Récapitulatif', icon: Receipt },
  { label: 'Engagement', icon: FileCheck },
];

const emptyChild = (lastName = ''): Child => ({
  firstName: '', lastName, birthDate: '', gender: '', firstEnrollment: '', classId: '',
  medicalInfo: '', photoOptOut: false, canLeaveAlone: false,
});
const emptyGuardian = (relationship = 'Mère', lastName = ''): GuardianForm => ({
  relationship, firstName: '', lastName, phone: '', email: '', address: '', profession: '', volunteer: false,
});

const inputCls = (error?: string) =>
  `block w-full px-4 py-2.5 bg-white border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition placeholder:text-slate-400 ${error ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`;
const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4';

function Field({ label, htmlFor, error, hint, optional, children }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; optional?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700 mb-1">
        {label}
        {optional && <span className="font-normal text-slate-400"> (facultatif)</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Choice<T extends string>({ value, onChange, options, error }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; error?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2 rounded-xl ${error ? 'ring-1 ring-red-300 p-0.5' : ''}`}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={`px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors mobile:min-h-[44px] ${value === o.value ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
      <span>{children}</span>
    </label>
  );
}

function loadDraft(): { children: Child[]; guardians: GuardianForm[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Public online pre-registration form (no account). */
export default function PreRegistrationForm() {
  const draft = useMemo(loadDraft, []);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [children, setChildren] = useState<Child[]>(draft?.children?.length ? draft.children : [emptyChild()]);
  const [guardians, setGuardians] = useState<GuardianForm[]>(draft?.guardians?.length ? draft.guardians : [emptyGuardian()]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [honorAttested, setHonorAttested] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/registration`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setInfo)
      .catch(() => setLoadError('Le formulaire ne peut pas être chargé pour le moment. Réessayez dans quelques instants.'));
  }, []);

  // Keeps the answers on this device until the file is sent (not the commitments).
  useEffect(() => {
    if (result) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ children, guardians }));
    } catch {
      // Storage unavailable (private browsing): the form still works.
    }
  }, [children, guardians, result]);

  useEffect(() => {
    // Braces matter: recent browsers return a promise from scrollTo, and an effect must not return one.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step, result]);

  const classById = useMemo(() => new Map((info?.classes ?? []).map((c) => [String(c.id), c])), [info]);
  const latest = info ? latestBirthDate(info.minAge, info.ageReferenceDate) : '';

  const setChild = (i: number, patch: Partial<Child>) => {
    setChildren((prev) => prev.map((c, k) => (k === i ? { ...c, ...patch } : c)));
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !Object.keys(patch).some((f) => k === `c${i}.${f}`))));
  };
  const setGuardian = (i: number, patch: Partial<GuardianForm>) => {
    setGuardians((prev) => prev.map((g, k) => (k === i ? { ...g, ...patch } : g)));
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !Object.keys(patch).some((f) => k === `g${i}.${f}`))));
  };
  const setChildCount = (n: number) => {
    if (n < 1 || n > 8) return;
    setChildren((prev) => (n > prev.length ? [...prev, ...Array.from({ length: n - prev.length }, () => emptyChild(prev[0]?.lastName ?? ''))] : prev.slice(0, n)));
  };

  const validateStep = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0) {
      children.forEach((c, i) => {
        if (!c.firstName.trim()) e[`c${i}.firstName`] = 'Indiquez le prénom';
        if (!c.lastName.trim()) e[`c${i}.lastName`] = 'Indiquez le nom';
        if (!c.birthDate) e[`c${i}.birthDate`] = 'Indiquez la date de naissance';
        else if (info && c.birthDate > latest) e[`c${i}.birthDate`] = `L'enfant doit avoir ${info.minAge} ans au ${frenchDate(info.ageReferenceDate)}`;
        if (!c.gender) e[`c${i}.gender`] = 'Choisissez fille ou garçon';
        if (!c.firstEnrollment) e[`c${i}.firstEnrollment`] = 'Répondez à cette question';
        if (!c.classId) e[`c${i}.classId`] = 'Choisissez une classe';
      });
    }
    if (s === 1) {
      guardians.forEach((g, i) => {
        if (!g.firstName.trim()) e[`g${i}.firstName`] = 'Indiquez le prénom';
        if (!g.lastName.trim()) e[`g${i}.lastName`] = 'Indiquez le nom';
        if (!isPhone(g.phone)) e[`g${i}.phone`] = 'Numéro de téléphone invalide';
        if (!isEmail(g.email)) e[`g${i}.email`] = 'Adresse email invalide';
        if (i === 0 && !g.address.trim()) e[`g${i}.address`] = "Indiquez l'adresse";
      });
    }
    if (s === 3) {
      if (!rulesAccepted) e.rules = 'Cochez cette case pour continuer';
      if (!honorAttested) e.honor = 'Cochez cette case pour continuer';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep(step + 1); };

  // Children whose class is already full go on the waiting list and are not due for now.
  const lines = children.map((c) => {
    const cls = classById.get(c.classId);
    return { child: c, cls, waitlisted: !!cls?.full };
  });
  const quote = familyQuote(lines.filter((l) => l.cls && !l.waitlisted).map((l) => l.cls!.feeCents));

  const submit = async () => {
    if (!validateStep(3)) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`${API_BASE}/api/public/registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          children: children.map((c) => ({
            firstName: c.firstName, lastName: c.lastName, birthDate: c.birthDate, gender: c.gender,
            firstEnrollment: c.firstEnrollment === 'yes', classId: Number(c.classId),
            medicalInfo: c.medicalInfo, photoOptOut: c.photoOptOut, canLeaveAlone: c.canLeaveAlone,
          })),
          guardians,
          rulesAccepted,
          honorAttested,
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || `Envoi impossible (erreur ${res.status}). Réessayez.`);
        return;
      }
      setResult(data as Result);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    } catch {
      setSubmitError('Envoi impossible : vérifiez votre connexion internet et réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const contact = info?.contactEmail;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="no-print bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <img src="/logo.png" alt="Logo de l'association" className="h-14 w-auto object-contain mobile:h-11" />
          <div className="min-w-0">
            <p className="text-lg font-black text-slate-900 leading-tight mobile:text-base">Association Musulmane Audomaroise</p>
            <p className="text-sm text-slate-500">Pré-inscriptions {info?.schoolYear ?? ''}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6 mobile:py-5 mobile:space-y-4">
        {loadError && <div className={`${card} text-center text-slate-600`}>{loadError}</div>}
        {!info && !loadError && (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="w-8 h-8 animate-spin" /></div>
        )}

        {info && !info.isOpen && !result && (
          <div className={`${card} text-center py-12`}>
            <Info className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h1 className="text-xl font-bold text-slate-900">Les pré-inscriptions sont fermées pour le moment</h1>
            {contact && <p className="mt-2 text-sm text-slate-500">Pour toute question : <a className="text-primary font-semibold" href={`mailto:${contact}`}>{contact}</a></p>}
          </div>
        )}

        {info && info.isOpen && !result && (
          <>
            {/* Steps */}
            <ol className="no-print grid grid-cols-4 gap-2">
              {STEPS.map((s, i) => (
                <li key={s.label} className="flex flex-col items-center gap-1.5 text-center">
                  <span className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-colors ${i < step ? 'bg-primary border-primary text-white' : i === step ? 'border-primary text-primary bg-white' : 'border-slate-200 text-slate-400 bg-white'}`}>
                    {i < step ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                  </span>
                  <span className={`text-xs font-semibold ${i === step ? 'text-primary' : 'text-slate-500'} ${i === step ? '' : 'mobile:hidden'}`}>{s.label}</span>
                </li>
              ))}
            </ol>

            {step === 0 && (
              <>
                <div className={card}>
                  <h1 className="text-xl font-bold text-slate-900">Vos enfants</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Âge minimum : {info.minAge} ans au {frenchDate(info.ageReferenceDate)}.
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-slate-700">Nombre d'enfants à inscrire</span>
                    <div className="flex items-center gap-3">
                      <button type="button" aria-label="Un enfant de moins" onClick={() => setChildCount(children.length - 1)} disabled={children.length <= 1}
                        className="h-10 w-10 rounded-xl border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">−</button>
                      <span className="w-6 text-center text-xl font-black text-slate-900">{children.length}</span>
                      <button type="button" aria-label="Un enfant de plus" onClick={() => setChildCount(children.length + 1)} disabled={children.length >= 8}
                        className="h-10 w-10 rounded-xl border border-slate-200 text-lg font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">+</button>
                    </div>
                  </div>
                </div>

                {children.map((c, i) => {
                  const err = (f: string) => errors[`c${i}.${f}`];
                  const cls = classById.get(c.classId);
                  return (
                    <section key={i} className={`${card} space-y-4`}>
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                          <span className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-black">{i + 1}</span>
                          {c.firstName.trim() || `Enfant ${i + 1}`}
                        </h2>
                        {children.length > 1 && (
                          <button type="button" onClick={() => setChildren((prev) => prev.filter((_, k) => k !== i))}
                            className="text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Retirer</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
                        <Field label="Prénom" htmlFor={`c${i}-firstName`} error={err('firstName')}>
                          <input id={`c${i}-firstName`} className={inputCls(err('firstName'))} value={c.firstName} autoComplete="off" onChange={(e) => setChild(i, { firstName: e.target.value })} />
                        </Field>
                        <Field label="Nom" htmlFor={`c${i}-lastName`} error={err('lastName')}>
                          <input id={`c${i}-lastName`} className={inputCls(err('lastName'))} value={c.lastName} autoComplete="off" onChange={(e) => setChild(i, { lastName: e.target.value })} />
                        </Field>
                        <Field label="Date de naissance" htmlFor={`c${i}-birthDate`} error={err('birthDate')}
                          hint={c.birthDate && c.birthDate <= latest ? `${ageOn(c.birthDate, info.ageReferenceDate)} ans au ${frenchDate(info.ageReferenceDate)}` : undefined}>
                          <input id={`c${i}-birthDate`} type="date" max={latest} className={inputCls(err('birthDate'))} value={c.birthDate} onChange={(e) => setChild(i, { birthDate: e.target.value })} />
                        </Field>
                        <Field label="Genre" error={err('gender')}>
                          <Choice value={c.gender} onChange={(v) => setChild(i, { gender: v })} error={err('gender')}
                            options={[{ value: 'F', label: 'Fille' }, { value: 'M', label: 'Garçon' }]} />
                        </Field>
                      </div>
                      <Field label="Première inscription à la mosquée ?" error={err('firstEnrollment')}>
                        <Choice value={c.firstEnrollment} onChange={(v) => setChild(i, { firstEnrollment: v })} error={err('firstEnrollment')}
                          options={[{ value: 'yes', label: 'Oui' }, { value: 'no', label: 'Non, déjà inscrit(e)' }]} />
                      </Field>
                      <Field label="Classe et créneau" htmlFor={`c${i}-classId`} error={err('classId')}
                        hint={<>Nouvelle inscription : choisissez le niveau 1. Vous ne connaissez pas le niveau ? Contactez la mosquée{contact ? <> (<a className="text-primary font-semibold" href={`mailto:${contact}`}>{contact}</a>)</> : ''}.</>}>
                        <select id={`c${i}-classId`} className={inputCls(err('classId'))} value={c.classId} onChange={(e) => setChild(i, { classId: e.target.value })}>
                          <option value="">-- Choisir une classe --</option>
                          {info.classes.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.name}{k.scheduleLabel ? ` — ${k.scheduleLabel}` : ''} — {euros(k.feeCents)}{k.full ? " (complet : liste d'attente)" : ''}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {cls?.full && (
                        <p className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Cette classe est complète : votre enfant sera inscrit sur liste d'attente.
                        </p>
                      )}
                      <Field label="Informations médicales" htmlFor={`c${i}-medicalInfo`} optional hint="Allergies, traitement, problème de santé à connaître…">
                        <textarea id={`c${i}-medicalInfo`} rows={2} maxLength={1000} className={inputCls()} value={c.medicalInfo} onChange={(e) => setChild(i, { medicalInfo: e.target.value })} />
                      </Field>
                      <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                        <Check checked={c.photoOptOut} onChange={(v) => setChild(i, { photoOptOut: v })}>Je refuse que mon enfant soit photographié</Check>
                        <Check checked={c.canLeaveAlone} onChange={(v) => setChild(i, { canLeaveAlone: v })}>Mon enfant est autorisé à rentrer seul</Check>
                      </div>
                    </section>
                  );
                })}
              </>
            )}

            {step === 1 && (
              <>
                {guardians.map((g, i) => {
                  const err = (f: string) => errors[`g${i}.${f}`];
                  return (
                    <section key={i} className={`${card} space-y-4`}>
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-900">{i === 0 ? 'Responsable légal' : 'Second responsable'}</h2>
                        {i === 1 && (
                          <button type="button" onClick={() => setGuardians((prev) => prev.slice(0, 1))}
                            className="text-sm text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Retirer</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
                        <Field label="Lien de parenté" htmlFor={`g${i}-relationship`}>
                          <select id={`g${i}-relationship`} className={inputCls()} value={g.relationship} onChange={(e) => setGuardian(i, { relationship: e.target.value })}>
                            {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </Field>
                        <div className="mobile:hidden" />
                        <Field label="Nom" htmlFor={`g${i}-lastName`} error={err('lastName')}>
                          <input id={`g${i}-lastName`} className={inputCls(err('lastName'))} autoComplete="family-name" value={g.lastName} onChange={(e) => setGuardian(i, { lastName: e.target.value })} />
                        </Field>
                        <Field label="Prénom" htmlFor={`g${i}-firstName`} error={err('firstName')}>
                          <input id={`g${i}-firstName`} className={inputCls(err('firstName'))} autoComplete="given-name" value={g.firstName} onChange={(e) => setGuardian(i, { firstName: e.target.value })} />
                        </Field>
                        <Field label="Téléphone" htmlFor={`g${i}-phone`} error={err('phone')}>
                          <input id={`g${i}-phone`} type="tel" inputMode="tel" autoComplete="tel" className={inputCls(err('phone'))} placeholder="06 12 34 56 78" value={g.phone} onChange={(e) => setGuardian(i, { phone: e.target.value })} />
                        </Field>
                        <Field label="Email" htmlFor={`g${i}-email`} error={err('email')}>
                          <input id={`g${i}-email`} type="email" inputMode="email" autoComplete="email" className={inputCls(err('email'))} placeholder="prenom.nom@email.fr" value={g.email} onChange={(e) => setGuardian(i, { email: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Adresse" htmlFor={`g${i}-address`} optional={i > 0} error={err('address')}>
                        <input id={`g${i}-address`} autoComplete="street-address" className={inputCls(err('address'))} placeholder="12 rue des Tilleuls, 62500 Saint-Omer" value={g.address} onChange={(e) => setGuardian(i, { address: e.target.value })} />
                      </Field>
                      <Field label="Profession" htmlFor={`g${i}-profession`} optional>
                        <input id={`g${i}-profession`} className={inputCls()} value={g.profession} onChange={(e) => setGuardian(i, { profession: e.target.value })} />
                      </Field>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <Check checked={g.volunteer} onChange={(v) => setGuardian(i, { volunteer: v })}>Je souhaite participer comme bénévole</Check>
                      </div>
                    </section>
                  );
                })}
                {guardians.length < 2 && (
                  <button type="button" onClick={() => setGuardians((prev) => [...prev, emptyGuardian(prev[0].relationship === 'Mère' ? 'Père' : 'Mère', prev[0].lastName)])}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-primary hover:text-primary bg-white mobile:min-h-[52px]">
                    <Plus className="w-4 h-4" /> Ajouter un second responsable
                  </button>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <Info className="w-5 h-5 mt-0.5 shrink-0" />
                  <p><span className="font-bold">Ceci est une pré-inscription.</span> L'inscription ne sera définitive qu'après validation par la mosquée et réception du paiement.</p>
                </div>
                <section className={card}>
                  <h1 className="text-xl font-bold text-slate-900">Récapitulatif du dossier</h1>
                  <ul className="mt-4 divide-y divide-slate-100">
                    {lines.map(({ child, cls, waitlisted }, i) => (
                      <li key={i} className="py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{child.firstName} <span className="uppercase">{child.lastName}</span></p>
                          <p className="text-sm text-slate-500">
                            {cls ? `${cls.name}${cls.scheduleLabel ? ` · ${cls.scheduleLabel}` : ''}` : '—'}
                            {child.birthDate && ` · ${ageOn(child.birthDate, info.ageReferenceDate)} ans`}
                          </p>
                        </div>
                        <p className={`shrink-0 font-semibold ${waitlisted ? 'text-amber-700 text-sm' : 'text-slate-900'}`}>
                          {waitlisted ? "Liste d'attente" : cls ? euros(cls.feeCents) : ''}
                        </p>
                      </li>
                    ))}
                    {quote.applies && (
                      <li className="py-3 flex justify-between text-emerald-700 font-semibold">
                        <span>Réduction famille ({info.familyDiscount.percent} %, dès {info.familyDiscount.minChildren} enfants)</span>
                        <span>−{euros(quote.discountCents)}</span>
                      </li>
                    )}
                  </ul>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3">
                    <span className="font-bold text-slate-900">Cotisation totale due</span>
                    <span className="text-2xl font-black text-primary">{euros(quote.totalCents)}</span>
                  </div>
                  {lines.some((l) => l.waitlisted) && (
                    <p className="mt-2 text-xs text-slate-500">Un enfant sur liste d'attente ne sera à régler que si une place se libère.</p>
                  )}
                </section>

                <section className={card}>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Wallet className="w-5 h-5 text-primary" /> Paiement</h2>
                  <p className="mt-2 text-sm text-slate-600">{info.paymentMeans}</p>
                  <p className="mt-2 text-sm text-slate-600">Le paiement se fait après la validation du dossier par la mosquée.</p>
                  {info.helloAssoUrl && (
                    <a href={info.helloAssoUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                      Voir la page HelloAsso de l'association <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </section>

                <section className={card}>
                  <h2 className="text-lg font-bold text-slate-900">Responsable{guardians.length > 1 ? 's' : ''}</h2>
                  <ul className="mt-2 space-y-2 text-sm text-slate-600">
                    {guardians.map((g, i) => (
                      <li key={i}><span className="font-semibold text-slate-900">{g.firstName} {g.lastName.toUpperCase()}</span> ({g.relationship.toLowerCase()}) · {g.phone} · {g.email}</li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {step === 3 && (
              <>
                <section className={`${card} print-area`}>
                  <div className="flex items-center justify-between gap-3">
                    <h1 className="text-xl font-bold text-slate-900">Règlement intérieur</h1>
                    <button type="button" onClick={() => window.print()} className="no-print flex items-center gap-2 text-sm font-semibold text-primary hover:bg-primary/5 rounded-lg px-3 py-2">
                      <Printer className="w-4 h-4" /> <span className="mobile:hidden">Imprimer ou enregistrer en PDF</span><span className="hidden mobile:inline">PDF</span>
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line max-h-80 overflow-y-auto print:max-h-none print:overflow-visible">
                    {info.rulesText}
                  </div>
                </section>
                <section className={`${card} space-y-4`}>
                  <div>
                    <Check checked={rulesAccepted} onChange={(v) => { setRulesAccepted(v); setErrors((p) => ({ ...p, rules: '' })); }}>J'ai lu et j'accepte le règlement intérieur</Check>
                    {errors.rules && <p className="mt-1 ml-8 text-xs font-medium text-red-600">{errors.rules}</p>}
                  </div>
                  <div>
                    <Check checked={honorAttested} onChange={(v) => { setHonorAttested(v); setErrors((p) => ({ ...p, honor: '' })); }}>J'atteste sur l'honneur l'exactitude des informations fournies</Check>
                    {errors.honor && <p className="mt-1 ml-8 text-xs font-medium text-red-600">{errors.honor}</p>}
                  </div>
                  {/* Honeypot: invisible to people, filled by bots. */}
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)}
                    className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
                  <p className="text-xs leading-relaxed text-slate-500">
                    Les informations recueillies sont utilisées uniquement par l'Association Musulmane Audomaroise pour la gestion des
                    inscriptions et le suivi des élèves, y compris les informations médicales pour la sécurité de votre enfant. Elles ne
                    sont jamais transmises à des tiers. Vous pouvez y accéder, les rectifier ou demander leur suppression
                    {contact ? <> en écrivant à <a className="text-primary" href={`mailto:${contact}`}>{contact}</a></> : ' en contactant la mosquée'}.
                  </p>
                </section>
                {submitError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {submitError}
                  </div>
                )}
              </>
            )}

            {Object.values(errors).some(Boolean) && step < 3 && (
              <p className="text-sm font-medium text-red-600 text-center">Certains champs sont à compléter (en rouge).</p>
            )}

            <div className="no-print flex gap-3">
              {step > 0 && (
                <button type="button" onClick={() => { setErrors({}); setStep(step - 1); }}
                  className="flex items-center justify-center gap-1 px-5 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 mobile:min-h-[52px]">
                  <ChevronLeft className="w-4 h-4" /> Retour
                </button>
              )}
              {step < 3 ? (
                <button type="button" onClick={next}
                  className="flex-1 flex items-center justify-center gap-1 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-blue-600 mobile:min-h-[52px] mobile:text-[15px]">
                  Continuer <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="button" onClick={submit} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-sm font-bold shadow-md shadow-primary/20 hover:bg-blue-600 disabled:opacity-60 mobile:min-h-[52px] mobile:text-[15px]">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {submitting ? 'Envoi en cours…' : 'Envoyer ma pré-inscription'}
                </button>
              )}
            </div>
          </>
        )}

        {result && (
          <section className={`${card} print-area text-center py-10 mobile:py-8`}>
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h1 className="mt-4 text-2xl font-black text-slate-900">Pré-inscription envoyée</h1>
            <p className="mt-1 text-slate-600">Dossier n° <span className="font-bold text-slate-900">{result.reference}</span></p>
            <p className="mt-3 text-sm text-slate-600">
              {result.emailStatus === 'SENT'
                ? <>Un email de confirmation a été envoyé à <span className="font-semibold">{result.emails.join(' et ')}</span>.</>
                : result.emailStatus === 'SIMULATED'
                  ? <>Email de confirmation préparé pour <span className="font-semibold">{result.emails.join(' et ')}</span> (envoi simulé : l'envoi d'emails n'est pas encore configuré).</>
                  : <>L'email de confirmation n'a pas pu être envoyé : notez bien votre numéro de dossier.</>}
            </p>
            <ul className="mt-6 mx-auto max-w-md text-left divide-y divide-slate-100 border-y border-slate-100">
              {result.children.map((c, i) => (
                <li key={i} className="py-2.5 flex justify-between gap-4 text-sm">
                  <span><span className="font-semibold text-slate-900">{c.firstName} {c.lastName.toUpperCase()}</span><br />
                    <span className="text-slate-500">{c.className}{c.scheduleLabel ? ` · ${c.scheduleLabel}` : ''}</span></span>
                  <span className={`shrink-0 font-semibold ${c.waitlisted ? 'text-amber-700' : 'text-slate-900'}`}>{c.waitlisted ? "Liste d'attente" : euros(c.feeCents)}</span>
                </li>
              ))}
              {result.discountCents > 0 && (
                <li className="py-2.5 flex justify-between text-sm font-semibold text-emerald-700"><span>Réduction famille</span><span>−{euros(result.discountCents)}</span></li>
              )}
              <li className="py-3 flex justify-between font-bold text-slate-900"><span>Cotisation totale due</span><span className="text-primary">{euros(result.totalCents)}</span></li>
            </ul>
            <p className="mt-6 mx-auto max-w-md rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              La mosquée va étudier votre dossier. L'inscription sera définitive après sa validation et la réception du paiement.
            </p>
            <button type="button" onClick={() => window.print()} className="no-print mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Printer className="w-4 h-4" /> Imprimer le récapitulatif
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
