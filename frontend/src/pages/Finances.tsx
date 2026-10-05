import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreditCard, Plus, Pencil, Trash2, X, Save, AlertCircle, CheckCircle2, Filter, Users } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { formatCurrency, parseAmount } from '../utils/format';
import { toast } from '../utils/toast';
import { useIsMobile } from '../hooks/useIsMobile';
import Sheet from '../components/mobile/Sheet';
import ActionMenu from '../components/mobile/ActionMenu';
import { mList, mInput, mPrimaryBtn } from '../components/mobile/styles';
import FamilyPaymentForm from '../components/FamilyPaymentForm';

type PaymentGroup = { id: number; date: string; method: string; subtotal: number; discount: number; total: number };
type Payment = {
  id: number;
  amount: number;
  discount: number;
  date: string;
  method: string;
  studentId: number;
  groupId: number | null;
  group: PaymentGroup | null;
  student: { id: number; firstName: string; lastName: string; classId: number | null; class: { id: number; name: string } | null };
};
type Student = { id: number; firstName: string; lastName: string; classId: number | null; class: { id: number; name: string; tuitionFee: number } | null; totalPaid: number; totalDiscount: number; totalAmountDue: number; remaining: number; remainingCents: number };
/** Une ligne d'historique : paiement individuel, ou paiement groupé (plusieurs enfants, une transaction). */
type HistoryItem =
  | { kind: 'single'; key: string; date: string; method: string; amount: number; pay: Payment }
  | { kind: 'group'; key: string; date: string; method: string; amount: number; group: PaymentGroup; lines: Payment[] };
type ClassItem = { id: number; name: string; tuitionFee: number; _count: { students: number } };

export default function Finances() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Filter state
  const [filterClassId, setFilterClassId] = useState('');
  const [formClassId, setFormClassId] = useState('');

  // Form State
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Espèces');
  const [multiMode, setMultiMode] = useState(false);

  // Mobile : formulaire en bottom sheet
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(() => !!(location.state as { openForm?: boolean } | null)?.openForm);

  useEffect(() => {
    fetchPayments();
    fetchStudents();
    fetchClasses();
  }, []);

  // Consomme l'intention « ouvrir le formulaire » venant du tableau de bord.
  useEffect(() => {
    if ((location.state as { openForm?: boolean } | null)?.openForm) navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  const fetchPayments = async () => {
    try {
      setPayments(await safeJson<Payment[]>(await authFetch('/api/finances')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const fetchStudents = async () => {
    try {
      setStudents(await safeJson<Student[]>(await authFetch('/api/students')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const fetchClasses = async () => {
    try {
      setClasses(await safeJson<ClassItem[]>(await authFetch('/api/classes')));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const selectedStudent = students.find(s => s.id === parseInt(studentId));

  // Students filtered by class selected in form
  const studentsForForm = formClassId
    ? students.filter(s => s.classId === parseInt(formClassId))
    : students;

  // Payments filtered by class selected in history filter
  const filteredPayments = filterClassId
    ? payments.filter(p => p.student?.class?.id === parseInt(filterClassId) || p.student?.classId === parseInt(filterClassId))
    : payments;

  // Regroupe les lignes d'un même paiement groupé en une seule transaction.
  const history: HistoryItem[] = [];
  const groupItems = new Map<number, Extract<HistoryItem, { kind: 'group' }>>();
  for (const p of filteredPayments) {
    if (p.groupId !== null && p.group) {
      const existing = groupItems.get(p.groupId);
      if (existing) { existing.lines.push(p); continue; }
      const item = { kind: 'group' as const, key: `g${p.groupId}`, date: p.group.date, method: p.group.method, amount: p.group.total, group: p.group, lines: [p] };
      groupItems.set(p.groupId, item);
      history.push(item);
    } else {
      history.push({ kind: 'single', key: `p${p.id}`, date: p.date, method: p.method, amount: p.amount, pay: p });
    }
  }
  // Avec un filtre de classe, le groupe reste affiché en entier (tous ses enfants).
  if (filterClassId) {
    for (const item of groupItems.values()) item.lines = payments.filter(p => p.groupId === item.group.id);
  }
  const childNames = (lines: Payment[]) => lines.map(l => l.student.firstName).join(', ');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId && !editingId) return;
    // L'API attend des nombres (montant en euros, identifiant d'élève).
    const amountValue = parseAmount(amount);
    if (amountValue === null) { toast.error('Montant invalide'); return; }
    setLoading(true);
    try {
      const body = editingId
        ? JSON.stringify({ amount: amountValue, method })
        : JSON.stringify({ amount: amountValue, studentId: Number(studentId), method });
      const res = editingId
        ? await authFetch(`/api/finances/${editingId}`, { method: 'PUT', body })
        : await authFetch('/api/finances', { method: 'POST', body });
      await safeJson(res);
      toast.success(editingId ? 'Paiement mis à jour' : 'Paiement enregistré');
      resetForm();
      fetchPayments();
      fetchStudents(); // refresh balances
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!window.confirm('Annuler ce paiement groupé ? Tous les enfants concernés redeviendront à payer.')) return;
    try {
      await safeJson(await authFetch(`/api/finances/groups/${groupId}`, { method: 'DELETE' }));
      toast.success('Paiement groupé annulé');
      fetchPayments();
      fetchStudents();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const refreshBalances = () => {
    fetchPayments();
    fetchStudents();
  };

  const handleDelete = async (id: number) => {
    if(!window.confirm("Voulez-vous vraiment supprimer ce paiement ?")) return;
    try {
      await safeJson(await authFetch(`/api/finances/${id}`, { method: 'DELETE' }));
      toast.success('Paiement supprimé');
      fetchPayments();
      fetchStudents();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const openEdit = (pay: Payment) => {
    setMultiMode(false);
    setEditingId(pay.id);
    setStudentId(pay.studentId.toString());
    setAmount(pay.amount.toString());
    setMethod(pay.method);
    setFormOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setStudentId('');
    setAmount('');
    setMethod('Espèces');
    setFormClassId('');
    setMultiMode(false);
    setFormOpen(false);
  };

  const openCreate = () => { resetForm(); setFormOpen(true); };

  const studentSummary = !multiMode && selectedStudent && (
      <div className={`p-5 rounded-2xl border animate-in zoom-in-95 duration-200 ${selectedStudent.remaining <= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-blue-50 border-blue-100'}`}>
         <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center">
           {selectedStudent.remaining <= 0 ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500" /> : <CreditCard className="w-4 h-4 mr-2 text-blue-500" />}
           Résumé : {selectedStudent.firstName}
         </h4>
         <div className="space-y-3">
           <div className="flex justify-between text-xs">
             <span className="text-slate-500">Total dû :</span>
             <span className="font-bold text-slate-700">{formatCurrency(selectedStudent.totalAmountDue)}</span>
           </div>
           <div className="flex justify-between text-xs">
             <span className="text-slate-500">Déjà payé :</span>
             <span className="font-bold text-emerald-600">+{formatCurrency(selectedStudent.totalPaid)}</span>
           </div>
           {selectedStudent.totalDiscount > 0 && (
             <div className="flex justify-between text-xs">
               <span className="text-slate-500">Réduction famille :</span>
               <span className="font-bold text-emerald-600">+{formatCurrency(selectedStudent.totalDiscount)}</span>
             </div>
           )}
           <div className="pt-2 border-t border-blue-200 flex justify-between items-center">
             <span className="text-xs font-bold text-slate-700">Reste à payer :</span>
             <span className={`text-sm font-black ${selectedStudent.remaining <= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
               {formatCurrency(selectedStudent.remaining)}
             </span>
           </div>
         </div>
      </div>
    );

  const paymentForm = (
    <form onSubmit={handleSave} className="space-y-4 mobile:px-5">
      {!editingId && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700">Filtrer par classe</label>
            <select
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg shadow-sm mobile:rounded-xl bg-slate-50 focus:ring-2 focus:ring-primary"
              value={formClassId} onChange={e => { setFormClassId(e.target.value); setStudentId(''); }}
            >
              <option value="">-- Toutes les classes --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Élève</label>
            <select
              required
              className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg shadow-sm mobile:rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-slate-50"
              value={studentId} onChange={e => setStudentId(e.target.value)}
            >
              <option value="">-- Choisir un élève --</option>
              {studentsForForm.map(st => (
                <option key={st.id} value={st.id}>
                  {st.firstName} {st.lastName} ({st.class?.name || 'Sans classe'})
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {editingId && (
         <div className="p-2 bg-white/50 border border-amber-200 rounded-md mb-2">
            <p className="text-xs font-medium text-amber-700">Modification pour : {selectedStudent?.firstName} {selectedStudent?.lastName}</p>
         </div>
      )}
      
      <div>
        <label className="block text-sm font-medium text-slate-700">Montant (€)</label>
        <div className="relative mt-1">
          <input 
            type="number" required step="0.01" inputMode="decimal"
            className="block w-full px-3 py-2 pl-9 border border-slate-200 rounded-lg shadow-sm mobile:rounded-xl focus:ring-2 focus:ring-primary transition-all"
            value={amount} onChange={e => setAmount(e.target.value)}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-slate-700">Méthode</label>
        <select 
          className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg shadow-sm mobile:rounded-xl bg-white"
          value={method} onChange={e => setMethod(e.target.value)}
        >
          <option>Espèces</option>
          <option>Virement</option>
          <option>Chèque</option>
          <option>Mobile Money</option>
        </select>
      </div>
      
      <button 
        type="submit" disabled={loading}
        className={`w-full flex items-center justify-center py-2.5 shadow-sm rounded-lg text-sm font-bold text-white transition-all mobile:min-h-[48px] mobile:rounded-xl mobile:text-[15px] ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
       >
         {editingId ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
         {editingId ? 'Enregistrer les changements' : 'Valider ce paiement'}
      </button>
    </form>
  );

  // Interrupteur « Payer plusieurs enfants » (création uniquement).
  const multiSwitch = !editingId && (
    <div className="mobile:px-5">
      <button
        type="button" role="switch" aria-checked={multiMode}
        onClick={() => { setMultiMode(m => !m); setStudentId(''); }}
        className="w-full flex items-center gap-3 px-4 min-h-[52px] rounded-2xl glass-surface text-left"
      >
        <Users className={`w-5 h-5 shrink-0 ${multiMode ? 'text-primary' : 'text-slate-400'}`} />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-slate-800">Payer plusieurs enfants</span>
          <span className="block text-[12px] text-slate-500">−10 % dès 2 enfants</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${multiMode ? 'bg-primary' : 'bg-slate-300'}`}>
          <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${multiMode ? 'translate-x-5' : ''}`} />
        </span>
      </button>
    </div>
  );

  const activeForm = multiMode && !editingId
    ? <FamilyPaymentForm students={students} classes={classes} onPaid={() => { refreshBalances(); setFormOpen(false); }} onRefresh={refreshBalances} />
    : paymentForm;

  // ── Téléphone ──
  const formatShortDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const filteredTotal = history.reduce((sum, h) => sum + h.amount, 0);

  const mobileView = (
    <div className="space-y-5">
      <button type="button" onClick={openCreate} className={mPrimaryBtn}>
        <Plus className="w-5 h-5" /> Nouveau paiement
      </button>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 px-1">
            <h3 className="text-[15px] font-semibold text-slate-800">Historique</h3>
            <p className="text-[13px] text-slate-500 truncate">{history.length} · <span className="font-medium text-emerald-600">{formatCurrency(filteredTotal)}</span></p>
          </div>
          <div className="relative w-[136px] shrink-0">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select aria-label="Filtrer par classe" value={filterClassId} onChange={e => setFilterClassId(e.target.value)} className={`${mInput} pl-9 pr-2 truncate`}>
              <option value="">Toutes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="glass-surface rounded-2xl px-6 py-12 text-center">
            <AlertCircle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-[15px] font-medium text-slate-500">Aucune transaction.</p>
          </div>
        ) : (
          <ul className={mList}>
            {history.map(item => {
              if (item.kind === 'group') return (
              <li key={item.key} className="flex items-center gap-3 pl-4 pr-3 min-h-[64px]">
                <div className="flex-1 min-w-0 py-3">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900 truncate">{childNames(item.lines)}</span>
                    <span className="shrink-0 text-[15px] font-bold text-emerald-600">+{formatCurrency(item.amount)}</span>
                  </span>
                  <span className="block text-[13px] text-slate-500 truncate">
                    {formatShortDate(item.date)}<span className="mx-1.5 text-slate-300">·</span>{item.method}<span className="mx-1.5 text-slate-300">·</span>
                    <span className="text-primary font-medium">{item.lines.length} enfants · −{formatCurrency(item.group.discount)}</span>
                  </span>
                </div>
                <ActionMenu
                  title={`${formatCurrency(item.amount)} — ${childNames(item.lines)}`}
                  actions={[
                    { label: 'Annuler le paiement groupé', icon: Trash2, onClick: () => handleDeleteGroup(item.group.id), danger: true },
                  ]}
                />
              </li>
              );
              const { pay } = item;
              return (
              <li key={item.key} className="flex items-center gap-3 pl-4 pr-3 min-h-[64px]">
                <button type="button" onClick={() => openEdit(pay)} className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="flex-1 min-w-0 text-[15px] font-semibold text-slate-900 truncate">{pay.student.firstName} <span className="uppercase">{pay.student.lastName}</span></span>
                      <span className="shrink-0 text-[15px] font-bold text-emerald-600">+{formatCurrency(pay.amount)}</span>
                    </span>
                    <span className="block text-[13px] text-slate-500 truncate">
                      {formatShortDate(pay.date)}<span className="mx-1.5 text-slate-300">·</span>{pay.method}<span className="mx-1.5 text-slate-300">·</span>{pay.student.class?.name || 'Sans classe'}
                    </span>
                  </span>
                </button>
                <ActionMenu
                  title={`${formatCurrency(pay.amount)} — ${pay.student.firstName} ${pay.student.lastName.toUpperCase()}`}
                  actions={[
                    { label: 'Corriger', icon: Pencil, onClick: () => openEdit(pay) },
                    { label: 'Supprimer', icon: Trash2, onClick: () => handleDelete(pay.id), danger: true },
                  ]}
                />
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={formOpen} onClose={resetForm} title={editingId ? 'Modifier le paiement' : 'Nouveau paiement'}>
        <div className="space-y-4">
          {multiSwitch}
          {studentSummary && <div className="px-5">{studentSummary}</div>}
          {activeForm}
        </div>
      </Sheet>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end mobile:hidden">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Finances & Paiements</h2>
          <p className="mt-2 text-sm text-slate-500">Gérez les historiques de paiements et les acomptes des étudiants.</p>
        </div>
      </div>

      {isMobile ? mobileView : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Form and Summary */}
        <div className={`${multiMode && !editingId ? 'lg:col-span-2' : 'lg:col-span-1'} space-y-6`}>
          {/* Summary Card */}
          {studentSummary}

          {/* Payment Form */}
          <div className={`rounded-2xl shadow-sm border p-6 transition-all ${editingId ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingId ? 'Modifier paiement' : 'Nouveau paiement'}
              </h3>
              {editingId && (
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5"/>
                </button>
              )}
            </div>
            <div className="space-y-4">
              {multiSwitch}
              {activeForm}
            </div>
          </div>
        </div>

        {/* Right Column: History Table */}
        <div className={multiMode && !editingId ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-3">
                <h3 className="font-bold text-slate-800">Historique des transactions</h3>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary"
                    value={filterClassId} onChange={e => setFilterClassId(e.target.value)}
                  >
                    <option value="">Toutes les classes</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
             </div>
             <table className="min-w-full divide-y divide-slate-200">
               <thead className="bg-white">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Élève / Classe</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Montant</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Mode</th>
                   <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-slate-100">
                 {history.length === 0 ? (
                   <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                       <AlertCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                       Aucune transaction historisée.
                     </td>
                   </tr>
                 ) : (
                   history.map((item) => {
                     if (item.kind === 'group') return (
                     <tr key={item.key} className="hover:bg-slate-50/30 group transition-colors">
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                         {new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                       </td>
                       <td className="px-6 py-4">
                         <div className="text-sm font-semibold text-slate-900">
                           {item.lines.map(l => `${l.student.firstName} ${l.student.lastName}`).join(', ')}
                         </div>
                         <div className="text-xs text-primary font-medium">
                           Paiement famille · {item.lines.length} enfants · sous-total {formatCurrency(item.group.subtotal)} · réduction −{formatCurrency(item.group.discount)}
                         </div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="text-sm font-black text-emerald-600">+{formatCurrency(item.amount)}</span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-black bg-slate-100 text-slate-500 border border-slate-200">
                           {item.method}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-right space-x-2">
                         <button
                           onClick={() => handleDeleteGroup(item.group.id)}
                           className="inline-flex items-center p-1.5 border border-slate-100 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                           title="Annuler le paiement groupé"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                       </td>
                     </tr>
                     );
                     const { pay } = item;
                     return (
                     <tr key={item.key} className="hover:bg-slate-50/30 group transition-colors">
                       <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                         {new Date(pay.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                       </td>
                       <td className="px-6 py-4">
                         <div className="text-sm font-semibold text-slate-900">{pay.student.firstName} {pay.student.lastName}</div>
                         <div className="text-xs text-slate-400">{pay.student.class?.name || 'Sans classe'}</div>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="text-sm font-black text-emerald-600">+{formatCurrency(pay.amount)}</span>
                       </td>
                       <td className="px-6 py-4 whitespace-nowrap">
                         <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-black bg-slate-100 text-slate-500 border border-slate-200">
                           {pay.method}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-right space-x-2">
                         <button 
                           onClick={() => openEdit(pay)}
                           className="inline-flex items-center p-1.5 border border-slate-100 text-slate-400 rounded-lg hover:bg-slate-50 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100"
                           title="Corriger"
                         >
                           <Pencil className="w-3.5 h-3.5" />
                         </button>
                         <button 
                           onClick={() => handleDelete(pay.id)}
                           className="inline-flex items-center p-1.5 border border-slate-100 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                           title="Supprimer"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                       </td>
                     </tr>
                     );
                   })
                 )}
               </tbody>
             </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
