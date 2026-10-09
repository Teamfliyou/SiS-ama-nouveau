import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type ClassItem = {
  id: number;
  name: string;
  tuitionFee: number;
  tuitionFeeCents: number;
  schoolYearId: number | null;
  schoolYear: { id: number; name: string } | null;
  _count: { students: number };
};

export type ClassInput = { name: string; tuitionFee: number; schoolYearId?: number | null };

/** Source de vérité partagée pour les classes (liste + écritures). */
export function useClasses() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setClasses(await safeJson<ClassItem[]>(await authFetch('/api/classes')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const create = useCallback(
    async (input: ClassInput) => {
      const res = await authFetch('/api/classes', { method: 'POST', body: JSON.stringify(input) });
      const created = await safeJson<ClassItem>(res);
      await reload();
      return created;
    },
    [reload]
  );

  const update = useCallback(
    async (id: number, input: ClassInput) => {
      const res = await authFetch(`/api/classes/${id}`, { method: 'PUT', body: JSON.stringify(input) });
      const updated = await safeJson<ClassItem>(res);
      await reload();
      return updated;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: number) => {
      await safeJson(await authFetch(`/api/classes/${id}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  return { classes, loading, reload, create, update, remove };
}
