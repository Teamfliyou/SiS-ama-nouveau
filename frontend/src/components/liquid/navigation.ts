import {
  CalendarDays,
  NotebookText,
  UserPlus,
  BookMarked,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  GraduationCap,
  Home,
  Megaphone,
  NotebookPen,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { canOpen } from '../../utils/roles';

export type NavItem = { name: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation Liquid regroupée par intention, selon le rôle du compte : un Prof
 * n'a que le travail en classe, seul un administrateur gère les utilisateurs.
 */
export function buildNavigation(role: string): NavGroup[] {
  const groups: NavGroup[] = [
    { label: 'Accueil', items: [{ name: 'Tableau de bord', href: '/dashboard', icon: Home }] },
    {
      label: 'Gestion',
      items: [
        { name: 'Pré-inscriptions', href: '/pre-registrations', icon: UserPlus },
        { name: 'Élèves', href: '/students', icon: Users },
        { name: 'Classes', href: '/classes', icon: BookOpen },
        { name: 'Professeurs', href: '/teachers', icon: GraduationCap },
      ],
    },
    {
      label: 'Suivi',
      items: [
        { name: 'Appel', href: '/attendance', icon: ClipboardList },
        { name: 'Finances', href: '/finances', icon: CreditCard },
      ],
    },
    {
      label: 'Scolarité',
      items: [
        { name: 'Emploi du temps', href: '/timetable', icon: CalendarDays },
        { name: 'Cahier de textes', href: '/lessons', icon: NotebookText },
        { name: 'Notes', href: '/grades', icon: NotebookPen },
        { name: 'Coran', href: '/competencies', icon: Sparkles },
        { name: 'Bulletins', href: '/report-cards', icon: FileText },
        { name: 'Matières & périodes', href: '/school-settings', icon: BookMarked },
      ],
    },
    {
      label: 'Communication',
      items: [
        { name: 'Messagerie', href: '/messagerie', icon: Megaphone },
        { name: 'Documents', href: '/documents', icon: FolderOpen },
      ],
    },
    { label: 'Outils', items: [{ name: 'Import CSV', href: '/import-csv', icon: UploadCloud }] },
    {
      label: 'Administration',
      items: [
        ...(role === 'ADMIN' ? [{ name: 'Utilisateurs', href: '/users', icon: ShieldCheck }] : []),
        { name: 'Paramètres', href: '/settings', icon: Settings },
      ],
    },
  ];
  return groups
    .map((g) => ({ ...g, items: g.items.filter((item) => canOpen(role, item.href)) }))
    .filter((g) => g.items.length > 0);
}

export type MobileNavItem = { name: string; href: string; icon: LucideIcon };

/** Onglets de la barre basse mobile. */
export const MOBILE_PRIMARY: MobileNavItem[] = [
  { name: 'Accueil', href: '/dashboard', icon: Home },
  { name: 'Élèves', href: '/students', icon: Users },
  { name: 'Appel', href: '/attendance', icon: ClipboardList },
  { name: 'Finances', href: '/finances', icon: CreditCard },
];

/** Pour un compte Prof : le travail en classe. */
export const TEACHER_MOBILE_PRIMARY: MobileNavItem[] = [
  { name: 'Appel', href: '/attendance', icon: ClipboardList },
  { name: 'Cahier', href: '/lessons', icon: NotebookText },
  { name: 'Notes', href: '/grades', icon: NotebookPen },
  { name: 'Coran', href: '/competencies', icon: Sparkles },
];

export const mobilePrimaryFor = (role: string) => (role === 'TEACHER' ? TEACHER_MOBILE_PRIMARY : MOBILE_PRIMARY);

/** Titre contextuel affiché dans le header Liquid. */
export const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/students': 'Élèves',
  '/classes': 'Classes',
  '/teachers': 'Professeurs',
  '/attendance': 'Appel',
  '/finances': 'Finances',
  '/timetable': 'Emploi du temps',
  '/lessons': 'Cahier de textes',
  '/pre-registrations': 'Pré-inscriptions',
  '/grades': 'Notes',
  '/competencies': 'Coran',
  '/report-cards': 'Bulletins',
  '/school-settings': 'Matières & périodes',
  '/messagerie': 'Messagerie',
  '/documents': 'Documents',
  '/import-csv': 'Import CSV',
  '/users': 'Utilisateurs',
  '/settings': 'Paramètres',
};

export function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? 'SiS AMA';
}
