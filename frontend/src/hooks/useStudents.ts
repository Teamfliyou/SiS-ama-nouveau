import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type Payment = {
  id: number;
  amount: number;
  amountCents: number;
  date: string;
  method: string | null;
};

export type StudentFamily = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type Student = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  ageInOctober2026: number | null;
  wasEnrolled2025_2026: boolean | null;
  arabicCourse: string | null;
  quranCourse: string | null;
  classId: number | null;
  familyId: number | null;
  family: StudentFamily | null;
  class: { id: number; name: string; tuitionFee: number; tuitionFeeCents: number } | null;
  payments: Payment[];
  totalPaid: number;
  totalAmountDue: number;
  remaining: number;
};

export type StudentParentInput = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type StudentInput = {
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth?: string | null;
  wasEnrolled2025_2026?: boolean | null;
  arabicCourse?: string | null;
  quranCourse?: string | null;
  classId: number | null;
  familyId?: number | null;
  parent?: StudentParentInput;
};

/** Source de vérité partagée pour les élèves (liste + écritures). */
export function useStudents() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStudents(await safeJson<Student[]>(await authFetch('/api/students')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const create = useCallback(
    async (input: StudentInput) => {
      const res = await authFetch('/api/students', { method: 'POST', body: JSON.stringify(input) });
      const created = await safeJson<Student>(res);
      await reload();
      return created;
    },
    [reload]
  );

  const update = useCallback(
    async (id: number, input: StudentInput) => {
      const res = await authFetch(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(input) });
      const updated = await safeJson<Student>(res);
      await reload();
      return updated;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: number) => {
      await safeJson(await authFetch(`/api/students/${id}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  return { students, loading, reload, create, update, remove };
}
