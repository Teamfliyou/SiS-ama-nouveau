import {
  BookOpen,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Home,
  Printer,
  Settings,
  ShieldCheck,
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
  '/import-csv': 'Import CSV',
  '/users': 'Utilisateurs',
  '/settings': 'Paramètres',
};

export function pageTitle(pathname: string): string {
  return PAGE_TITLES[pathname] ?? 'SiS AMA';
}
