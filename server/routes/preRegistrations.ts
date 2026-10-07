import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import {
  validate,
  parseId,
  registrationSettingsSchema,
  classRegistrationSchema,
  preRegistrationStatusSchema,
  preRegistrationValidateSchema,
} from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { mailConfigured, sendMail } from '../lib/mailer';
import { confirmationEmail, getRegistrationSettings, takenPlaces } from '../lib/preRegistration';

// Mosque side of the online pre-registration: files sent by families, their
// validation into students, and the settings of the public form.
const router = Router();

router.use(authenticate);

const fileInclude = {
  children: {
    include: {
      class: { select: { id: true, name: true, scheduleLabel: true } },
      student: { select: { id: true, classId: true } },
    },
    orderBy: { id: 'asc' },
  },
  guardians: { orderBy: { id: 'asc' } },
} satisfies Prisma.PreRegistrationInclude;

// GET /api/pre-registrations?status= — files, latest first, with the count per status.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
    const [files, counts] = await Promise.all([
      prisma.preRegistration.findMany({
        where: status ? { status } : {},
        include: fileInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.preRegistration.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    res.json({ files, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
  })
);

// GET /api/pre-registrations/settings — form settings and the classes offered, with their places.
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await getRegistrationSettings(prisma);
    const [classes, taken, waiting] = await Promise.all([
      prisma.class.findMany({ orderBy: { name: 'asc' } }),
      takenPlaces(prisma, settings.schoolYear),
      prisma.preRegistrationChild.groupBy({
        by: ['classId'],
        where: { waitlisted: true, studentId: null, preRegistration: { schoolYear: settings.schoolYear, status: { in: ['NEW', 'WAITLIST'] } } },
        _count: { _all: true },
      }),
    ]);
    const waitingByClass = new Map(waiting.map((w) => [w.classId, w._count._all]));
    res.json({
      settings,
      mailConfigured: mailConfigured(),
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        tuitionFeeCents: c.tuitionFeeCents,
        openForRegistration: c.openForRegistration,
        scheduleLabel: c.scheduleLabel,
        capacity: c.capacity,
        taken: taken.get(c.id) ?? 0,
        waitlisted: waitingByClass.get(c.id) ?? 0,
      })),
    });
  })
);

// PUT /api/pre-registrations/settings
router.put(
  '/settings',
  validate(registrationSettingsSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as Prisma.RegistrationSettingsUpdateInput;
    await getRegistrationSettings(prisma);
    const settings = await prisma.registrationSettings.update({ where: { id: 1 }, data });
    res.json(settings);
  })
);

// PUT /api/pre-registrations/classes/:id — whether the class is offered, its time slot and places.
router.put(
  '/classes/:id',
  validate(classRegistrationSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de classe invalide');
    const { openForRegistration, scheduleLabel, capacity } = req.body as {
      openForRegistration: boolean;
      scheduleLabel: string | null;
      capacity: number | null;
    };
    const cls = await prisma.class.update({ where: { id }, data: { openForRegistration, scheduleLabel, capacity } });
    res.json({ id: cls.id, openForRegistration: cls.openForRegistration, scheduleLabel: cls.scheduleLabel, capacity: cls.capacity });
  })
);

/** Validated files are final: their children are already students. */
async function editableFile(id: number) {
  const file = await prisma.preRegistration.findUnique({ where: { id } });
  if (!file) throw new AppError(404, 'Dossier introuvable');
  if (file.status === 'VALIDATED') throw new AppError(409, 'Ce dossier est déjà validé');
  return file;
}

// PUT /api/pre-registrations/:id/status — waiting list, refusal, or back to "new".
router.put(
  '/:id/status',
  validate(preRegistrationStatusSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de dossier invalide');
    await editableFile(id);
    const { status, adminNote } = req.body as { status: string; adminNote: string | null };
    const file = await prisma.preRegistration.update({ where: { id }, data: { status, adminNote }, include: fileInclude });
    res.json(file);
  })
);

// POST /api/pre-registrations/:id/validate — turns the file into students (with their
// guardians), in the class chosen for each child. A child or a guardian already known
// is updated rather than duplicated (re-registration).
router.post(
  '/:id/validate',
  validate(preRegistrationValidateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de dossier invalide');
    const choices = new Map(
      (req.body as { children: { id: number; classId: number | null }[] }).children.map((c) => [c.id, c.classId])
    );

    const result = await prisma.$transaction(async (tx) => {
      const file = await tx.preRegistration.findUnique({
        where: { id },
        include: { children: { orderBy: { id: 'asc' } }, guardians: { orderBy: { id: 'asc' } } },
      });
      if (!file) throw new AppError(404, 'Dossier introuvable');
      if (file.status === 'VALIDATED') throw new AppError(409, 'Ce dossier est déjà validé');
      if (file.children.some((c) => !choices.has(c.id))) throw new AppError(400, 'Indiquez la classe de chaque enfant');
      const classIds = [...new Set([...choices.values()].filter((v): v is number => v !== null))];
      if ((await tx.class.count({ where: { id: { in: classIds } } })) !== classIds.length) {
        throw new AppError(400, 'Classe introuvable');
      }

      const knownGuardians = await tx.guardian.findMany({ select: { id: true, email: true } });
      const guardianIds: number[] = [];
      for (const g of file.guardians) {
        const data = {
          relationship: g.relationship,
          firstName: g.firstName,
          lastName: g.lastName,
          phone: g.phone,
          email: g.email,
          address: g.address,
          profession: g.profession,
          volunteer: g.volunteer,
        };
        const known = knownGuardians.find((k) => normalizeKey(k.email) === normalizeKey(g.email));
        const saved = known ? await tx.guardian.update({ where: { id: known.id }, data }) : await tx.guardian.create({ data });
        guardianIds.push(saved.id);
      }

      const knownStudents = await tx.student.findMany({
        select: { id: true, firstName: true, lastName: true, birthDate: true, phone: true },
      });
      let studentsCreated = 0;
      let studentsUpdated = 0;
      for (const child of file.children) {
        const classId = choices.get(child.id) ?? null;
        const data = {
          firstName: child.firstName,
          lastName: child.lastName,
          birthDate: child.birthDate,
          gender: child.gender,
          medicalInfo: child.medicalInfo,
          photoOptOut: child.photoOptOut,
          canLeaveAlone: child.canLeaveAlone,
          classId,
          guardians: { connect: guardianIds.map((gid) => ({ id: gid })) },
        };
        const sameName = knownStudents.filter((s) => studentKey(s.firstName, s.lastName) === studentKey(child.firstName, child.lastName));
        const known = sameName.find((s) => s.birthDate === child.birthDate) ?? sameName.find((s) => s.birthDate === null);
        const phone = file.guardians[0]?.phone ?? null;
        const student = known
          ? await tx.student.update({ where: { id: known.id }, data: { ...data, phone: known.phone ?? phone } })
          : await tx.student.create({ data: { ...data, phone } });
        if (known) studentsUpdated++;
        else studentsCreated++;
        await tx.preRegistrationChild.update({ where: { id: child.id }, data: { studentId: student.id, classId } });
      }

      const validated = await tx.preRegistration.update({ where: { id }, data: { status: 'VALIDATED' }, include: fileInclude });
      return { file: validated, studentsCreated, studentsUpdated };
    });

    res.json(result);
  })
);

// POST /api/pre-registrations/:id/resend-email — sends the confirmation again.
router.post(
  '/:id/resend-email',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de dossier invalide');
    const file = await prisma.preRegistration.findUnique({
      where: { id },
      include: {
        children: { include: { class: { select: { name: true, scheduleLabel: true } } }, orderBy: { id: 'asc' } },
        guardians: { orderBy: { id: 'asc' } },
      },
    });
    if (!file) throw new AppError(404, 'Dossier introuvable');
    const mail = confirmationEmail(file, await getRegistrationSettings(prisma));
    const emailStatus = await sendMail(mail);
    await prisma.preRegistration.update({ where: { id }, data: { emailStatus, emailText: mail.text } });
    res.json({ emailStatus });
  })
);

// DELETE /api/pre-registrations/:id — students already created from it are kept.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de dossier invalide');
    const existing = await prisma.preRegistration.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Dossier introuvable');
    await prisma.preRegistration.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;
