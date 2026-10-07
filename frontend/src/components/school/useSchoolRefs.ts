import { useCallback, useEffect, useState } from 'react';
import { authFetch, safeJson, apiErrorMessage } from '../../utils/api';
import { toast } from '../../utils/toast';
import type { ClassItem, Subject, Term } from '../../utils/school';

/** Loads the classes, terms and subjects used by the school-record pages. */
export function useSchoolRefs() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [c, t, s] = await Promise.all([
        authFetch('/api/classes').then((r) => safeJson<ClassItem[]>(r)),
        authFetch('/api/terms').then((r) => safeJson<Term[]>(r)),
        authFetch('/api/subjects').then((r) => safeJson<Subject[]>(r)),
      ]);
      setClasses(c);
      setTerms(t);
      setSubjects(s);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
     
    void reload();
  }, [reload]);

  return { classes, terms, subjects, loaded, reload };
}

/** Term containing today, else the most recent one. */
export function currentTermId(terms: Term[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const t = terms.find((x) => x.startDate <= today && today <= x.endDate) ?? terms[terms.length - 1];
  return t ? String(t.id) : '';
}
