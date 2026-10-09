// Account roles (same codes as the server). STAFF is shown as « Vie scolaire »;
// a TEACHER (« Prof ») only sees the classes they teach.

export type Role = 'ADMIN' | 'STAFF' | 'TEACHER';

export const ROLES: { code: Role; label: string; description: string; badge: string }[] = [
  {
    code: 'ADMIN',
    label: 'Administrateur',
    description: 'Accès complet : comptes, sauvegardes, publication des informations et documents.',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    code: 'STAFF',
    label: 'Vie scolaire',
    description: 'Élèves, classes, finances, appel, notes, Coran, bulletins… sans les comptes, les sauvegardes ni la publication.',
    badge: 'bg-slate-50 text-slate-600 border-slate-200',
  },
  {
    code: 'TEACHER',
    label: 'Prof',
    description: 'Ses classes seulement : appel du jour, cahier de textes, notes, Coran, bulletins. Pas de finances.',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

export const roleInfo = (role: string | null | undefined) => ROLES.find((r) => r.code === role) ?? ROLES[1];

export const currentRole = (): string => localStorage.getItem('role') || '';

/** Sections a Prof account can open (the others redirect to the roll call). */
export const TEACHER_PATHS = ['/attendance', '/timetable', '/lessons', '/grades', '/competencies', '/report-cards', '/messagerie', '/documents'];

export const canOpen = (role: string, path: string) => role !== 'TEACHER' || TEACHER_PATHS.includes(path);

/** First page after login. */
export const homePath = (role: string) => (role === 'TEACHER' ? '/attendance' : '/dashboard');
