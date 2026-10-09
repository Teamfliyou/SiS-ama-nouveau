// Account invitations. A teacher (and later a family) receives a link valid for
// a few days to choose their own password: nobody else ever knows it. Only a
// SHA-256 hash of the random token is stored, so a database leak gives no
// usable link. Sending the same invitation again replaces the previous link.
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from './prisma';
import { AppError } from './errors';
import { sendMail, type MailStatus } from './mailer';

export const INVITATION_DAYS = 7;
const BCRYPT_ROUNDS = 12; // same cost as routes/users.ts

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Link of the password page, on the address of the application. */
export function invitationLink(token: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
  return `${base}/invitation?token=${encodeURIComponent(token)}`;
}

export type AccountStatus = 'ACTIVE' | 'INVITED' | 'EXPIRED';

/** Status of an account: active, invitation waiting, or invitation expired. */
export function accountStatus(user: { inviteTokenHash: string | null; inviteExpiresAt: Date | null }, now = new Date()): AccountStatus {
  if (!user.inviteTokenHash) return 'ACTIVE';
  return user.inviteExpiresAt && user.inviteExpiresAt > now ? 'INVITED' : 'EXPIRED';
}

export type InvitationResult = {
  email: string;
  emailStatus: MailStatus;
  expiresAt: string;
  /** Only when the email did not leave (not configured, or refused): to send it another way. */
  link?: string;
};

function invitationMail(to: string, firstName: string, link: string) {
  const text = [
    `Bonjour ${firstName},`,
    '',
    "Un accès professeur a été créé pour vous sur SiS AMA, l'application de l'Association Musulmane Audomaroise.",
    'Vous y ferez l\'appel, le cahier de textes, les notes et le suivi du Coran de vos classes.',
    '',
    `Choisissez votre mot de passe en ouvrant ce lien (valable ${INVITATION_DAYS} jours) :`,
    link,
    '',
    `Vous vous connecterez ensuite avec votre adresse e-mail : ${to}`,
    '',
    "Si vous n'attendiez pas ce message, ignorez-le simplement.",
  ].join('\n');
  const html = `<p>Bonjour ${escapeHtml(firstName)},</p>
<p>Un accès professeur a été créé pour vous sur <b>SiS AMA</b>, l'application de l'Association Musulmane Audomaroise.
Vous y ferez l'appel, le cahier de textes, les notes et le suivi du Coran de vos classes.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Choisir mon mot de passe</a></p>
<p style="color:#64748b;font-size:13px">Ce lien est valable ${INVITATION_DAYS} jours. Vous vous connecterez ensuite avec votre adresse e-mail : ${escapeHtml(to)}.<br>
Si vous n'attendiez pas ce message, ignorez-le simplement.</p>`;
  return { to: [to], subject: 'Votre accès professeur à SiS AMA', text, html };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Creates the Prof account of a teacher if needed (linked to the teacher record,
 * with the teacher's email) and sends a new invitation. Also used when a teacher
 * forgot their password: the new link lets them choose another one.
 */
export async function inviteTeacher(teacherId: number): Promise<InvitationResult> {
  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, firstName: true, email: true, user: { select: { id: true, email: true, inviteTokenHash: true } } },
  });
  if (!teacher) throw new AppError(404, 'Professeur introuvable');
  const email = teacher.email?.trim().toLowerCase();
  if (!email) throw new AppError(400, "Ajoutez d'abord l'adresse e-mail du professeur sur sa fiche");

  const token = crypto.randomBytes(32).toString('base64url');
  const invite = { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000) };

  const sameEmail = await prisma.user.findUnique({ where: { email }, select: { id: true, teacherId: true, role: true } });
  let accountEmail = email;
  if (teacher.user) {
    // An account still waiting for its first password follows the email of the record.
    const pending = !!teacher.user.inviteTokenHash;
    const emailFree = !sameEmail || sameEmail.id === teacher.user.id;
    accountEmail = pending && emailFree ? email : teacher.user.email;
    await prisma.user.update({ where: { id: teacher.user.id }, data: { ...invite, email: accountEmail } });
  } else if (sameEmail) {
    // An unlinked Prof account with this email is linked to the record; any other account keeps it.
    if (sameEmail.role !== 'TEACHER' || (sameEmail.teacherId !== null && sameEmail.teacherId !== teacher.id)) {
      throw new AppError(409, 'Cette adresse e-mail est déjà utilisée par un autre compte');
    }
    await prisma.user.update({ where: { id: sameEmail.id }, data: { ...invite, teacherId: teacher.id } });
  } else {
    // No usable password until the teacher chooses one.
    const unusable = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), BCRYPT_ROUNDS);
    await prisma.user.create({ data: { email, password: unusable, role: 'TEACHER', teacherId: teacher.id, ...invite } });
  }

  const link = invitationLink(token);
  const emailStatus = await sendMail(invitationMail(accountEmail, teacher.firstName, link));
  return {
    email: accountEmail,
    emailStatus,
    expiresAt: invite.inviteExpiresAt.toISOString(),
    ...(emailStatus === 'SENT' ? {} : { link }),
  };
}

/** The pending invitation of a token, or a clear error. */
export async function findInvitation(token: string) {
  const user = await prisma.user.findUnique({
    where: { inviteTokenHash: hashToken(token) },
    select: { id: true, email: true, inviteExpiresAt: true, teacher: { select: { firstName: true, lastName: true } } },
  });
  if (!user) throw new AppError(404, "Ce lien n'est plus valable : il a déjà servi ou a été remplacé par une nouvelle invitation");
  if (!user.inviteExpiresAt || user.inviteExpiresAt <= new Date()) {
    throw new AppError(410, "Ce lien a expiré : demandez une nouvelle invitation à l'administration");
  }
  return user;
}

/** Sets the chosen password and closes the invitation. */
export async function acceptInvitation(token: string, password: string): Promise<string> {
  const user = await findInvitation(token);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, BCRYPT_ROUNDS), inviteTokenHash: null, inviteExpiresAt: null },
  });
  return user.email;
}
