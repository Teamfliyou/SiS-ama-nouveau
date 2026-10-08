// Online pre-registration: settings, places per class, file numbers and emails.
import type { Prisma, PrismaClient, RegistrationSettings } from '@prisma/client';
import { centsToEuros } from './money';

type Db = PrismaClient | Prisma.TransactionClient;

export const PRE_REGISTRATION_STATUSES = ['NEW', 'WAITLIST', 'VALIDATED', 'REFUSED'] as const;

// Shown to families: they are informed, they do not choose (payment happens at the mosque or on HelloAsso).
export const PAYMENT_MEANS =
  'Moyens de paiement : chèque, carte bancaire, espèces ou en ligne avec HelloAsso. ' +
  'Paiement en plusieurs fois possible par chèque, carte bancaire ou HelloAsso (pas en espèces).';

/** The settings row, created with its defaults the first time. */
export const getRegistrationSettings = (db: Db): Promise<RegistrationSettings> =>
  db.registrationSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

/** "PI-2026-0007" for the 7th file of the 2026-2027 year. */
export const formatReference = (schoolYear: string, id: number) =>
  `PI-${schoolYear.slice(0, 4)}-${String(id).padStart(4, '0')}`;

/** Latest birth date allowed: the child must be `minAge` on the reference date. */
export function latestBirthDate(minAge: number, referenceDate: string): string {
  const [y, m, d] = referenceDate.split('-');
  return `${Number(y) - minAge}-${m}-${d}`;
}

/**
 * Places taken in each class for a school year: children of files waiting for
 * validation (not on the waiting list) and children enrolled from validated files.
 */
export async function takenPlaces(db: Db, schoolYear: string): Promise<Map<number, number>> {
  const rows = await db.preRegistrationChild.findMany({
    where: {
      classId: { not: null },
      preRegistration: { schoolYear },
      OR: [
        { waitlisted: false, preRegistration: { status: 'NEW' } },
        { studentId: { not: null }, preRegistration: { status: 'VALIDATED' } },
      ],
    },
    select: { classId: true },
  });
  const taken = new Map<number, number>();
  for (const r of rows) taken.set(r.classId!, (taken.get(r.classId!) ?? 0) + 1);
  return taken;
}

// ─── Emails ────────────────────────────────────────────────────────────

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(centsToEuros(cents));

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type FileForEmail = {
  reference: string;
  schoolYear: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  children: {
    firstName: string;
    lastName: string;
    feeCents: number;
    waitlisted: boolean;
    class: { name: string; scheduleLabel: string | null } | null;
  }[];
  guardians: { firstName: string; lastName: string; email: string; phone: string }[];
};

const childLine = (c: FileForEmail['children'][number]) => {
  const cls = c.class ? `${c.class.name}${c.class.scheduleLabel ? ` (${c.class.scheduleLabel})` : ''}` : 'classe à définir';
  return `${c.firstName} ${c.lastName.toUpperCase()}, ${cls} : ${c.waitlisted ? "liste d'attente" : euros(c.feeCents)}`;
};

/** Confirmation sent to the family right after the file is sent. */
export function confirmationEmail(file: FileForEmail, settings: RegistrationSettings) {
  const g = file.guardians[0];
  const contact = settings.contactEmail ?? '';
  const waitlist = file.children.some((c) => c.waitlisted);
  const lines = [
    `Bonjour ${g.firstName} ${g.lastName},`,
    '',
    `Nous avons bien reçu votre pré-inscription pour l'année ${file.schoolYear}.`,
    `Numéro de dossier : ${file.reference}`,
    '',
    'Enfants :',
    ...file.children.map((c) => `- ${childLine(c)}`),
    '',
    ...(file.discountCents > 0 ? [`Réduction famille : -${euros(file.discountCents)}`] : []),
    `Cotisation totale due : ${euros(file.totalCents)}`,
    ...(waitlist ? ["Un enfant sur liste d'attente ne sera à régler que si une place se libère."] : []),
    '',
    "Attention : ceci est une pré-inscription. L'inscription ne sera définitive qu'après validation par la mosquée et réception du paiement.",
    '',
    PAYMENT_MEANS,
    ...(settings.helloAssoUrl ? [`Payer en ligne : ${settings.helloAssoUrl}`] : []),
    '',
    ...(contact ? [`Pour toute question : ${contact}`, ''] : []),
    'Association Musulmane Audomaroise',
  ];
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${lines
    .map((l) => {
      const safe = escapeHtml(l);
      if (l.startsWith('Numéro de dossier') || l.startsWith('Cotisation totale')) return `<p style="margin:0"><strong>${safe}</strong></p>`;
      if (l.startsWith('Attention')) return `<p style="margin:0;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px">${safe}</p>`;
      if (l.startsWith('Payer en ligne') && settings.helloAssoUrl) {
        return `<p style="margin:0"><a href="${escapeHtml(settings.helloAssoUrl)}">Payer en ligne avec HelloAsso</a></p>`;
      }
      return l === '' ? '<br>' : `<p style="margin:0">${safe}</p>`;
    })
    .join('')}</div>`;
  return {
    to: [...new Set(file.guardians.map((x) => x.email))],
    subject: `Pré-inscription ${file.reference} bien reçue`,
    text,
    html,
    replyTo: contact || null,
  };
}

/** Notice sent to the mosque for each new file. */
export function adminNoticeEmail(file: FileForEmail, settings: RegistrationSettings) {
  const g = file.guardians[0];
  const lines = [
    `Nouvelle pré-inscription ${file.reference} (${file.schoolYear})`,
    `Responsable : ${g.firstName} ${g.lastName.toUpperCase()}, ${g.phone}, ${g.email}`,
    '',
    ...file.children.map((c) => `- ${childLine(c)}`),
    '',
    `Cotisation totale due : ${euros(file.totalCents)}`,
    '',
    "Dossier à traiter dans l'espace Pré-inscriptions.",
  ];
  return {
    to: settings.contactEmail ? [settings.contactEmail] : [],
    subject: `Nouvelle pré-inscription ${file.reference}`,
    text: lines.join('\n'),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">${lines
      .map((l) => (l === '' ? '<br>' : `<p style="margin:0">${escapeHtml(l)}</p>`))
      .join('')}</div>`,
    replyTo: g.email,
  };
}
