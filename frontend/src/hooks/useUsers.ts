import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type User = { id: number; email: string; role: string; createdAt: string };
export type UserInput = { email: string; password: string; role: string };

/** Comptes utilisateurs (ADMIN uniquement côté serveur). */
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await safeJson<User[]>(await authFetch('/api/users')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const create = useCallback(
    async (input: UserInput) => {
      const res = await authFetch('/api/users', { method: 'POST', body: JSON.stringify(input) });
      const created = await safeJson<User>(res);
      await reload();
      return created;
    },
    [reload]
  );

  const setRole = useCallback(
    async (id: number, role: string) => {
      const res = await authFetch(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
      const updated = await safeJson<User>(res);
      await reload();
      return updated;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: number) => {
      await safeJson(await authFetch(`/api/users/${id}`, { method: 'DELETE' }));
      await reload();
    },
    [reload]
  );

  return { users, loading, reload, create, setRole, remove };
}
