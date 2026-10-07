import { useEffect, useState } from 'react';
import { authFetch, safeJson, apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import type { Teacher } from '../../utils/schedule';

/** Loads the teachers used by the timetable and the cahier de textes. */
export function useTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  useEffect(() => {
    authFetch('/api/teachers')
      .then((r) => safeJson<Teacher[]>(r))
      .then(setTeachers)
      .catch((err) => toast.error(apiErrorMessage(err)));
  }, []);

  return teachers;
}
