import type { ComponentType } from 'react';
import { LayoutDashboard, Users, ClipboardList, CreditCard, NotebookText, NotebookPen, Sparkles } from 'lucide-react';

export type NavItem = { name: string; href: string; icon: ComponentType<{ className?: string }> };
export type TabItem = NavItem & { short: string };

// Sections les plus utilisées au quotidien : accessibles au pouce.
export const TAB_ITEMS: TabItem[] = [
  { name: 'Tableau de bord', short: 'Accueil',  href: '/dashboard',  icon: LayoutDashboard },
  { name: 'Élèves',          short: 'Élèves',   href: '/students',   icon: Users },
  { name: 'Appel',           short: 'Appel',    href: '/attendance', icon: ClipboardList },
  { name: 'Finances',        short: 'Finances', href: '/finances',   icon: CreditCard },
];

// Pour un compte Prof : le travail en classe.
export const TEACHER_TAB_ITEMS: TabItem[] = [
  { name: 'Appel',            short: 'Appel',  href: '/attendance',   icon: ClipboardList },
  { name: 'Cahier de textes', short: 'Cahier', href: '/lessons',      icon: NotebookText },
  { name: 'Notes',            short: 'Notes',  href: '/grades',       icon: NotebookPen },
  { name: 'Coran',            short: 'Coran',  href: '/competencies', icon: Sparkles },
];

export const tabItemsFor = (role: string) => (role === 'TEACHER' ? TEACHER_TAB_ITEMS : TAB_ITEMS);
