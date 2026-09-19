import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type Payment = {
  id: number;
  amount: number;
  amountCents: number;
  date: string;
  method: string;
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

  return { payments, loading, reload, create, update, remove };
}
