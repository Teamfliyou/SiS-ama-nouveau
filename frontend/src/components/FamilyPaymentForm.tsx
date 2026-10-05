import { useMemo, useState } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { familyQuote, FAMILY_DISCOUNT_PERCENT } from '../utils/familyDiscount';
import { toast } from '../utils/toast';
import { mInput, mPrimaryBtn } from './mobile/styles';

export type PayableStudent = {
  id: number;
  firstName: string;
  lastName: string;
  classId: number | null;
  class: { id: number; name: string } | null;
  /** Montant encore dû, calculé par le serveur (frais de la classe − paiements − remises). */
  remainingCents: number;
};

type Props = {
  students: PayableStudent[];
  classes: { id: number; name: string }[];
  /** Paiement enregistré. */
  onPaid: () => void;
  /** Échec : les soldes ont pu changer, il faut les recharger. */
  onRefresh: () => void;
};

const cents = (c: number) => formatCurrency(c / 100);

/**
 * Paiement de plusieurs enfants en une seule transaction.
 * Les montants affichés viennent de /api/students ; le serveur les recalcule au paiement.
 */
export default function FamilyPaymentForm({ students, classes, onPaid, onRefresh }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [classId, setClassId] = useState('');
  const [method, setMethod] = useState('Espèces');
  const [loading, setLoading] = useState(false);

  const payable = useMemo(() => students.filter(s => s.remainingCents > 0), [students]);
  const byId = useMemo(() => new Map(payable.map(s => [s.id, s])), [payable]);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr-FR');
    return payable.filter(s =>
      selected.includes(s.id) || // un enfant coché reste toujours visible
      ((!classId || s.classId === parseInt(classId)) &&
        (!q || `${s.firstName} ${s.lastName}`.toLocaleLowerCase('fr-FR').includes(q)))
    );
  }, [payable, query, classId, selected]);

  // Ignore un enfant entre-temps soldé (liste rechargée).
  const selectedStudents = selected.map(id => byId.get(id)).filter((s): s is PayableStudent => !!s);
  const quote = familyQuote(selectedStudents.map(s => s.remainingCents));
  const count = quote.childCount;

  const toggle = (id: number) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const handlePay = async () => {
    if (count === 0) return;
    setLoading(true);
    try {
      const res = await authFetch('/api/finances/group', {
        method: 'POST',
        body: JSON.stringify({
          studentIds: selectedStudents.map(s => s.id),
          method,
          // Le serveur refuse si le total réel diffère de celui affiché.
          expectedTotalCents: quote.totalCents,
        }),
      });
      const data = await safeJson<{ childCount: number; totalCents: number }>(res);
      toast.success(`Paiement enregistré : ${data.childCount} enfant${data.childCount > 1 ? 's' : ''} — ${cents(data.totalCents)}`);
      setSelected([]);
      onPaid();
    } catch (err) {
      toast.error(apiErrorMessage(err));
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 mobile:px-5">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher un enfant" aria-label="Rechercher un enfant"
            className={`${mInput} pl-9`}
          />
        </div>
        <div className="w-[112px] shrink-0">
          <select aria-label="Filtrer par classe" value={classId} onChange={e => setClassId(e.target.value)} className={`${mInput} px-2 truncate`}>
            <option value="">Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {payable.length === 0 ? (
        <p className="glass-surface rounded-2xl px-4 py-8 text-center text-[14px] text-slate-500">Aucun enfant avec un montant dû.</p>
      ) : (
        <ul className="glass-surface rounded-2xl divide-y divide-slate-100 overflow-y-auto max-h-[40vh] mobile:max-h-[38dvh]" aria-label="Enfants à payer">
          {visible.length === 0 && <li className="px-4 py-6 text-center text-[14px] text-slate-400">Aucun résultat.</li>}
          {visible.map(s => {
            const on = selected.includes(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button" role="checkbox" aria-checked={on} onClick={() => toggle(s.id)}
                  className={`w-full flex items-center gap-3 px-4 min-h-[60px] py-2.5 text-left transition-colors ${on ? 'bg-primary/5' : 'active:bg-slate-50'}`}
                >
                  <span className={`h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${on ? 'bg-primary border-primary' : 'border-slate-300 bg-white'}`}>
                    {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-slate-900 truncate">{s.firstName} <span className="uppercase">{s.lastName}</span></span>
                    <span className="block text-[13px] text-slate-500 truncate">{s.class?.name || 'Sans classe'}</span>
                  </span>
                  <span className="shrink-0 text-[15px] font-semibold text-slate-800 tabular-nums">{cents(s.remainingCents)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {count > 0 && (
        <div className="glass-surface rounded-2xl px-4 py-3 space-y-1.5 text-[14px]" aria-live="polite">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
            <Users className="w-4 h-4" /> {count} enfant{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
          </p>
          <div className="flex justify-between text-slate-600">
            <span>Sous-total</span><span className="tabular-nums">{cents(quote.subtotalCents)}</span>
          </div>
          {quote.applies && (
            <div className="flex justify-between font-medium text-emerald-600">
              <span>Réduction famille −{FAMILY_DISCOUNT_PERCENT} %</span><span className="tabular-nums">−{cents(quote.discountCents)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-slate-200/70 text-[16px] font-bold text-slate-900">
            <span>Total</span><span className="tabular-nums">{cents(quote.totalCents)}</span>
          </div>
        </div>
      )}

      <select aria-label="Méthode de paiement" value={method} onChange={e => setMethod(e.target.value)} className={mInput}>
        <option>Espèces</option>
        <option>Virement</option>
        <option>Chèque</option>
        <option>Mobile Money</option>
      </select>

      <button type="button" onClick={handlePay} disabled={loading || count === 0} className={mPrimaryBtn}>
        {count === 0
          ? 'Sélectionnez des enfants'
          : `Payer ${count} enfant${count > 1 ? 's' : ''} — ${cents(quote.totalCents)}`}
      </button>
    </div>
  );
}
