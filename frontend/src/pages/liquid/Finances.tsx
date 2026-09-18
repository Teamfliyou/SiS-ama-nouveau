import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Pencil, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { apiErrorMessage } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { toast } from '../../utils/toast';
import { useFinances, type Payment } from '../../hooks/useFinances';
import { useStudents } from '../../hooks/useStudents';
import {
  EmptyState,
  GlassButton,
  GlassModal,
  GlassPanel,
  PageHeader,
  SearchField,
  StatCard,
} from '../../components/liquid';

const METHODS = ['Espèces', 'Virement', 'Chèque', 'Mobile Money'];

export default function LiquidFinances() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { payments, create, update, remove } = useFinances();
  const { students, reload: reloadStudents } = useStudents();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'paid' | 'unpaid'>('');

  const [payOpen, setPayOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [payStudentId, setPayStudentId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState(METHODS[0]);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Payment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = (studentId?: number) => {
    setEditingPayment(null);
    setPayStudentId(studentId ? String(studentId) : '');
    setPayAmount('');
    setPayMethod(METHODS[0]);
    setPayOpen(true);
  };

  // Ouverture depuis une action rapide (/finances?new=1&studentId=..)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const sid = searchParams.get('studentId');
      openCreate(sid ? Number(sid) : undefined);
      searchParams.delete('new');
      searchParams.delete('studentId');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const totals = useMemo(
    () => ({
      due: students.reduce((sum, s) => sum + s.totalAmountDue, 0),
      paid: students.reduce((sum, s) => sum + s.totalPaid, 0),
      remaining: students.reduce((sum, s) => sum + Math.max(s.remaining, 0), 0),
    }),
    [students]
  );

  const filteredStudents = useMemo(() => {
    let list = [...students];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q));
    }
    if (statusFilter === 'paid') list = list.filter((s) => s.remaining <= 0);
    if (statusFilter === 'unpaid') list = list.filter((s) => s.remaining > 0);
    return list;
  }, [students, search, statusFilter]);

  const openEditPayment = (p: Payment) => {
    setEditingPayment(p);
    setPayStudentId(String(p.studentId));
    setPayAmount(String(p.amount));
    setPayMethod(p.method);
    setPayOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment && !payStudentId) return;
    setSaving(true);
    try {
      const amount = Number(payAmount);
      if (editingPayment) {
        await update(editingPayment.id, { amount, method: payMethod });
        toast.success('Paiement mis à jour');
      } else {
        await create({ amount, studentId: Number(payStudentId), method: payMethod });
        toast.success('Paiement enregistré');
      }
      await reloadStudents();
      setPayOpen(false);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await remove(toDelete.id);
      await reloadStudents();
      toast.success('Paiement supprimé');
      setToDelete(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <PageHeader
        title="Finances"
        subtitle="Suivi des règlements et des soldes restants."
        actions={
          <GlassButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => openCreate()}>
            Ajouter un paiement
          </GlassButton>
        }
      />

      {/* Totaux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon={Wallet} label="Total attendu" value={formatCurrency(totals.due)} tone="blue" />
        <StatCard icon={TrendingUp} label="Total encaissé" value={formatCurrency(totals.paid)} tone="emerald" />
        <StatCard icon={TrendingDown} label="Reste à encaisser" value={formatCurrency(totals.remaining)} tone="amber" />
      </div>

      {/* Recherche + filtre */}
      <GlassPanel className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <SearchField value={search} onChange={setSearch} placeholder="Rechercher un élève…" ariaLabel="Rechercher un élève" className="flex-1" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="lg-select sm:w-52" aria-label="Filtrer par situation">
          <option value="">Toutes les situations</option>
          <option value="paid">Entièrement payé</option>
          <option value="unpaid">Solde restant</option>
        </select>
      </GlassPanel>

      {/* Liste par élève */}
      <GlassPanel className="overflow-hidden">
        <div className="px-5 py-3 lg-hairline">
          <p className="lg-section-title">Soldes par élève ({filteredStudents.length})</p>
        </div>
        {filteredStudents.length === 0 ? (
          <EmptyState icon={Receipt} title="Aucun élève ne correspond" description="Modifiez votre recherche ou vos filtres." />
        ) : (
          <ul className="divide-y divide-slate-100/70">
            {filteredStudents.map((s) => {
              const progress = s.totalAmountDue > 0 ? Math.min(100, (s.totalPaid / s.totalAmountDue) * 100) : 100;
              return (
                <li key={s.id} className="lg-row flex-wrap sm:flex-nowrap">
                  <span className="lg-avatar h-11 w-11 text-xs shrink-0">{s.firstName[0]}{s.lastName[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">
                      {s.firstName} <span className="uppercase">{s.lastName}</span>
                    </p>
                    <p className="text-xs text-slate-400 truncate">{s.class?.name || 'Sans classe'}</p>
                  </div>

                  <div className="w-full sm:w-56 shrink-0">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Payé {formatCurrency(s.totalPaid)} / {formatCurrency(s.totalAmountDue)}</span>
                    </div>
                    <div className="lg-progress">
                      <span style={{ width: `${progress}%`, backgroundImage: s.remaining <= 0 ? 'linear-gradient(90deg,#34d399,#059669)' : undefined }} />
                    </div>
                    <p className={`text-xs font-semibold mt-1 ${s.remaining <= 0 ? 'text-emerald-600' : 'text-orange-500'}`}>
                      {s.remaining <= 0 ? 'Entièrement payé' : `Reste ${formatCurrency(s.remaining)}`}
                    </p>
                  </div>

                  <GlassButton className="shrink-0" icon={<Plus className="w-4 h-4" />} onClick={() => openCreate(s.id)}>
                    Ajouter paiement
                  </GlassButton>
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>

      {/* Transactions récentes */}
      <GlassPanel className="overflow-hidden">
        <div className="px-5 py-3 lg-hairline">
          <p className="lg-section-title">Transactions récentes ({payments.length})</p>
        </div>
        {payments.length === 0 ? (
          <EmptyState icon={CreditCard} title="Aucune transaction" description="Les paiements enregistrés apparaîtront ici." />
        ) : (
          <ul className="divide-y divide-slate-100/70 max-h-[28rem] overflow-y-auto">
            {payments.slice(0, 40).map((p) => (
              <li key={p.id} className="lg-row">
                <span className="lg-avatar h-9 w-9 text-[11px]">{p.student.firstName[0]}{p.student.lastName[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700 truncate">
                    {p.student.firstName} {p.student.lastName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} · {p.method}
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-600 shrink-0">+{formatCurrency(p.amount)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => openEditPayment(p)} className="lg-icon-btn" aria-label="Modifier le paiement">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setToDelete(p)} className="lg-icon-btn hover:text-rose-600" aria-label="Supprimer le paiement">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassPanel>

      {/* Modal paiement */}
      <GlassModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={editingPayment ? 'Modifier le paiement' : 'Nouveau paiement'}
        size="sm"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          {!editingPayment ? (
            <div>
              <label className="lg-label" htmlFor="pay-student">Élève</label>
              <select id="pay-student" required value={payStudentId} onChange={(e) => setPayStudentId(e.target.value)} className="lg-select">
                <option value="">Choisir un élève</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.class?.name || 'Sans classe'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-sm text-slate-500 bg-white/60 rounded-xl px-3 py-2">
              Paiement de <strong>{editingPayment.student.firstName} {editingPayment.student.lastName}</strong>
            </p>
          )}
          <div>
            <label className="lg-label" htmlFor="pay-amount">Montant (€)</label>
            <input id="pay-amount" type="number" required step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="lg-input" />
          </div>
          <div>
            <label className="lg-label" htmlFor="pay-method">Méthode</label>
            <select id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="lg-select">
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <GlassButton variant="ghost" onClick={() => setPayOpen(false)}>Annuler</GlassButton>
            <GlassButton type="submit" variant="primary" disabled={saving} icon={<Plus className="w-4 h-4" />}>
              {saving ? 'Enregistrement…' : editingPayment ? 'Sauvegarder' : 'Valider'}
            </GlassButton>
          </div>
        </form>
      </GlassModal>

      {/* Confirmation suppression */}
      <GlassModal open={Boolean(toDelete)} onClose={() => setToDelete(null)} title="Supprimer le paiement" size="sm">
        <p className="text-sm text-slate-600">
          Supprimer le paiement de <strong>{formatCurrency(toDelete?.amount ?? 0)}</strong> pour{' '}
          {toDelete?.student.firstName} {toDelete?.student.lastName} ?
        </p>
        <div className="flex justify-end gap-2 mt-5">
          <GlassButton variant="ghost" onClick={() => setToDelete(null)}>Annuler</GlassButton>
          <GlassButton variant="danger" disabled={deleting} icon={<Trash2 className="w-4 h-4" />} onClick={handleDeletePayment}>
            {deleting ? 'Suppression…' : 'Supprimer'}
          </GlassButton>
        </div>
      </GlassModal>
    </div>
  );
}
