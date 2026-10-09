import {
  CalendarDays,
  NotebookText,
  UserPlus,
  BookMarked,
  BookOpen,
  ClipboardList,
  CreditCard,
  FileText,
  Megaphone,
  FolderOpen,
  GraduationCap,
  Home,
  NotebookPen,
  Printer,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { name: string; href: string; icon: LucideIcon };
export type NavGroup = { label: string; items: NavItem[] };

/** Navigation Liquid regroupée par intention (identique pour Classic et Liquid). */
export function buildNavigation(isAdmin: boolean): NavGroup[] {
  return [
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
        { name: "Feuilles d'appel", href: '/attendance-sheets', icon: Printer },
        { name: 'Finances', href: '/finances', icon: CreditCard },
      ],
    },
    {
      label: 'Scolarité',
      items: [
        { name: 'Emploi du temps', href: '/timetable', icon: CalendarDays },
        { name: 'Cahier de textes', href: '/lessons', icon: NotebookText },
        { name: 'Notes', href: '/grades', icon: NotebookPen },
        { name: 'Juz Amma', href: '/competencies', icon: Sparkles },
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
        ...(isAdmin ? [{ name: 'Utilisateurs', href: '/users', icon: ShieldCheck }] : []),
        { name: 'Paramètres', href: '/settings', icon: Settings },
      ],
    },
  ];
}

export type MobileNavItem = { name: string; href: string; icon: LucideIcon };

/** Onglets de la barre basse mobile. */
export const MOBILE_PRIMARY: MobileNavItem[] = [
  { name: 'Accueil', href: '/dashboard', icon: Home },
  { name: 'Élèves', href: '/students', icon: Users },
  { name: 'Appel', href: '/attendance', icon: ClipboardList },
  { name: 'Finances', href: '/finances', icon: CreditCard },
];

/** Titre contextuel affiché dans le header Liquid. */
export const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/students': 'Élèves',
  '/classes': 'Classes',
  '/teachers': 'Professeurs',
  '/attendance': 'Appel',
  '/attendance-sheets': "Feuilles d'appel",
  '/finances': 'Finances',
  '/timetable': 'Emploi du temps',
  '/lessons': 'Cahier de textes',
  '/pre-registrations': 'Pré-inscriptions',
  '/grades': 'Notes',
  '/competencies': 'Juz Amma',
  '/report-cards': 'Bulletins',
  '/school-settings': 'Matières & périodes',
  '/import-csv': 'Import CSV',
  '/users': 'Utilisateurs',
  '/settings': 'Paramètres',
  '/messagerie': 'Messagerie',
  '/documents': 'Documents',
};

export function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? 'SiS AMA';
}
