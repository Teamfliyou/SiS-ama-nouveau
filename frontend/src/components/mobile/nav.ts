import type { ComponentType } from 'react';
import { LayoutDashboard, Users, ClipboardList, CreditCard } from 'lucide-react';

export type NavItem = { name: string; href: string; icon: ComponentType<{ className?: string }> };

// Sections les plus utilisées au quotidien : accessibles au pouce.
export const TAB_ITEMS: (NavItem & { short: string })[] = [
  { name: 'Tableau de bord', short: 'Accueil',  href: '/dashboard',  icon: LayoutDashboard },
  { name: 'Élèves',          short: 'Élèves',   href: '/students',   icon: Users },
  { name: 'Appel',           short: 'Appel',    href: '/attendance', icon: ClipboardList },
  { name: 'Finances',        short: 'Finances', href: '/finances',   icon: CreditCard },
];
