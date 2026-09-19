import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type Teacher = {
  id: number;
  firstName: string;
  lastName: string;
  subject: string | null;
  email: string | null;
  phone: string | null;
  classId: number | null;
  class: { id: number; name: string } | null;
  classes: { id: number; name: string; subject: string | null }[];
  createdAt: string;
};

export type TeacherInput = {
  firstName: string;
  lastName: string;
  subject: string | null;
  email: string | null;
  phone: string | null;
  classId: number | null;
  classIds: number[];
};

/** Source de vérité partagée pour les professeurs (liste + écritures). */
export function useTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTeachers(await safeJson<Teacher[]>(await authFetch('/api/teachers')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const create = useCallback(
    async (input: TeacherInput) => {
      const res = await authFetch('/api/teachers', { method: 'POST', body: JSON.stringify(input) });
      const created = await safeJson<Teacher>(res);
      await reload();
      return created;
    },
    [reload]
  );

  const update = useCallback(
    async (id: number, input: TeacherInput) => {
      const res = await authFetch(`/api/teachers/${id}`, { method: 'PUT', body: JSON.stringify(input) });
      const updated = await safeJson<Teacher>(res);
      await reload();
      return updated;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: number) => {
      await safeJson(await authFetch(`/api/teachers/${id}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  return { teachers, loading, reload, create, update, remove };
}
