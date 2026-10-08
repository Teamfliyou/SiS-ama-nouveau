// Pré-inscriptions en ligne : types partagés et calculs d'affichage.
// Le serveur recalcule toujours les montants, les places et l'âge minimum.
import { formatCurrency } from './format';

export type PublicClass = { id: number; name: string; scheduleLabel: string | null; feeCents: number; full: boolean };

export type PublicInfo = {
  isOpen: boolean;
  schoolYear: string;
  minAge: number;
  ageReferenceDate: string;
  contactEmail: string | null;
  helloAssoUrl: string | null;
  rulesText: string;
  paymentMeans: string;
  familyDiscount: { percent: number; minChildren: number };
  classes: PublicClass[];
};

export type Guardian = {
  id?: number;
  relationship: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string | null;
  profession: string | null;
  volunteer: boolean;
};

export type PreRegistrationStatus = 'NEW' | 'WAITLIST' | 'VALIDATED' | 'REFUSED';

export type PreRegistrationFile = {
  id: number;
  reference: string;
  status: PreRegistrationStatus;
  schoolYear: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  rulesAccepted: boolean;
  honorAttested: boolean;
  emailStatus: 'SENT' | 'SIMULATED' | 'FAILED' | null;
  emailText: string | null;
  adminNote: string | null;
  createdAt: string;
  children: {
    id: number;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: 'F' | 'M';
    firstEnrollment: boolean;
    classId: number | null;
    class: { id: number; name: string; scheduleLabel: string | null } | null;
    feeCents: number;
    waitlisted: boolean;
    medicalInfo: string | null;
    photoOptOut: boolean;
    canLeaveAlone: boolean;
    studentId: number | null;
  }[];
  guardians: Guardian[];
};

export const STATUS_INFO: Record<PreRegistrationStatus, { label: string; badge: string }> = {
  NEW: { label: 'À traiter', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  WAITLIST: { label: "Liste d'attente", badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  VALIDATED: { label: 'Validé', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REFUSED: { label: 'Refusé', badge: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const RELATIONSHIPS = ['Mère', 'Père', 'Tuteur', 'Tutrice', 'Autre'];

export const euros = (cents: number) => formatCurrency(cents / 100);

/** "2026-10-31" -> "31/10/2026". */
export const frenchDate = (iso: string) => iso.split('-').reverse().join('/');

/** Latest birth date allowed: the child must be `minAge` on the reference date. */
export function latestBirthDate(minAge: number, referenceDate: string): string {
  const [y, m, d] = referenceDate.split('-');
  return `${Number(y) - minAge}-${m}-${d}`;
}

/** Age in full years on a date ("YYYY-MM-DD" strings). */
export function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const isPhone = (v: string) => /^[0-9+().\s-]{6,30}$/.test(v.trim());
