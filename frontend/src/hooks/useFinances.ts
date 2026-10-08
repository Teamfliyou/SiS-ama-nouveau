import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type PaymentGroup = {
  id: number;
  date: string;
  method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  totalCents: number;
};

export type Payment = {
  id: number;
  amount: number;
  amountCents: number;
  /** Part de la remise familiale imputée à cette ligne (paiement groupé). */
  discount: number;
  date: string;
  method: string;
  /** Renseigné quand la ligne fait partie d'un paiement de plusieurs enfants. */
  groupId: number | null;
  group: PaymentGroup | null;
  studentId: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    classId: number | null;
    class: { id: number; name: string } | null;
  };
};

export type PaymentInput = { amount: number; studentId: number; method: string };
export type PaymentUpdate = { amount: number; method: string };

/** Historique des paiements + écritures (la logique financière reste côté serveur). */
export function useFinances() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPayments(await safeJson<Payment[]>(await authFetch('/api/finances')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const create = useCallback(
    async (input: PaymentInput) => {
      const res = await authFetch('/api/finances', { method: 'POST', body: JSON.stringify(input) });
      const created = await safeJson<Payment>(res);
      await reload();
      return created;
    },
    [reload]
  );

  const update = useCallback(
    async (id: number, input: PaymentUpdate) => {
      const res = await authFetch(`/api/finances/${id}`, { method: 'PUT', body: JSON.stringify(input) });
      const updated = await safeJson<Payment>(res);
      await reload();
      return updated;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: number) => {
      await safeJson(await authFetch(`/api/finances/${id}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  /** Annule un paiement groupé complet (toutes ses lignes). */
  const removeGroup = useCallback(
    async (groupId: number) => {
      await safeJson(await authFetch(`/api/finances/groups/${groupId}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  return { payments, loading, reload, create, update, remove, removeGroup };
}
