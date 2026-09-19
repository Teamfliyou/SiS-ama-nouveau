import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson } from '../utils/api';

export type Stats = {
  studentsCount: number;
  classesCount: number;
  teachersCount: number;
  totalPayments: number;
};

const EMPTY: Stats = { studentsCount: 0, classesCount: 0, teachersCount: 0, totalPayments: 0 };

export function useStats() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await safeJson<Stats>(await authFetch('/api/stats')));
    } catch {
      // Les statistiques ne sont pas critiques : la page reste utilisable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { stats, loading, reload };
}
