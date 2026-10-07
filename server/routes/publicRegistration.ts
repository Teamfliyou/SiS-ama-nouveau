import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, preRegistrationSchema } from '../lib/validate';
import { publicFormLimiter } from '../lib/rateLimit';
import { computeFamilyPayment, FAMILY_DISCOUNT_MIN_CHILDREN, FAMILY_DISCOUNT_PERCENT } from '../lib/billing';
import { sendMail } from '../lib/mailer';
import {
  PAYMENT_MEANS,
  adminNoticeEmail,
  confirmationEmail,
  formatReference,
  getRegistrationSettings,
  latestBirthDate,
  takenPlaces,
} from '../lib/preRegistration';

// Public routes (no account): the online pre-registration form used by families.
const router = Router();

type Body = z.infer<typeof preRegistrationSchema>;

const frenchDate = (iso: string) => iso.split('-').reverse().join('/');

// GET /api/public/registration — what the form needs. Never returns personal data.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getRegistrationSettings(prisma);
    const [classes, taken] = await Promise.all([
      prisma.class.findMany({ where: { openForRegistration: true }, orderBy: { name: 'asc' } }),
      takenPlaces(prisma, settings.schoolYear),
    ]);
    res.json({
      isOpen: settings.isOpen,
      schoolYear: settings.schoolYear,
      minAge: settings.minAge,
      ageReferenceDate: settings.ageReferenceDate,
      contactEmail: settings.contactEmail,
      helloAssoUrl: settings.helloAssoUrl,
      rulesText: settings.rulesText,
      paymentMeans: PAYMENT_MEANS,
      familyDiscount: { percent: FAMILY_DISCOUNT_PERCENT, minChildren: FAMILY_DISCOUNT_MIN_CHILDREN },
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        scheduleLabel: c.scheduleLabel,
        feeCents: c.tuitionFeeCents,
        full: c.capacity !== null && (taken.get(c.id) ?? 0) >= c.capacity,
      })),
    });
  })
);

// POST /api/public/registration — a family sends its file. Amounts and places are
// always computed here, never trusted from the browser.
router.post(
  '/',
  publicFormLimiter,
  validate(preRegistrationSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as Body;

    const file = await prisma.$transaction(
      async (tx) => {
        const settings = await getRegistrationSettings(tx);
        if (!settings.isOpen) throw new AppError(403, 'Les pré-inscriptions sont fermées pour le moment');
        const classes = new Map(
          (await tx.class.findMany({ where: { openForRegistration: true } })).map((c) => [c.id, c])
        );
        const latest = latestBirthDate(settings.minAge, settings.ageReferenceDate);
        const taken = await takenPlaces(tx, settings.schoolYear);

        const children = body.children.map((c) => {
          const cls = classes.get(c.classId);
          if (!cls) throw new AppError(400, `La classe choisie pour ${c.firstName} n'est pas proposée`);
          if (c.birthDate > latest) {
            throw new AppError(
              400,
              `${c.firstName} doit avoir ${settings.minAge} ans au ${frenchDate(settings.ageReferenceDate)} (né(e) au plus tard le ${frenchDate(latest)})`
            );
          }
          // First come, first served: beyond the places of the class, the child goes on the waiting list.
          const used = taken.get(cls.id) ?? 0;
          const waitlisted = cls.capacity !== null && used >= cls.capacity;
          if (!waitlisted) taken.set(cls.id, used + 1);
          return { ...c, feeCents: cls.tuitionFeeCents, waitlisted };
        });

        // Only children with a place are due; the family discount applies to them.
        const quote = computeFamilyPayment(children.filter((c) => !c.waitlisted).map((c) => c.feeCents));
        const created = await tx.preRegistration.create({
          data: {
            reference: `tmp-${randomUUID()}`,
            schoolYear: settings.schoolYear,
            subtotalCents: quote.subtotalCents,
            discountCents: quote.discountCents,
            totalCents: quote.totalCents,
            rulesAccepted: body.rulesAccepted,
            honorAttested: body.honorAttested,
            children: { create: children },
            guardians: { create: body.guardians },
          },
        });
        return tx.preRegistration.update({
          where: { id: created.id },
          data: { reference: formatReference(settings.schoolYear, created.id) },
          include: {
            children: { include: { class: { select: { name: true, scheduleLabel: true } } }, orderBy: { id: 'asc' } },
            guardians: { orderBy: { id: 'asc' } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    // Emails are sent once the file is safely stored: a mail failure never loses a file.
    const settings = await getRegistrationSettings(prisma);
    const confirmation = confirmationEmail(file, settings);
    const emailStatus = await sendMail(confirmation);
    await prisma.preRegistration.update({
      where: { id: file.id },
      data: { emailStatus, emailText: confirmation.text },
    });
    const notice = adminNoticeEmail(file, settings);
    if (notice.to.length > 0) await sendMail(notice);

    res.status(201).json({
      reference: file.reference,
      schoolYear: file.schoolYear,
      subtotalCents: file.subtotalCents,
      discountCents: file.discountCents,
      totalCents: file.totalCents,
      emailStatus,
      emails: confirmation.to,
      children: file.children.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName,
        className: c.class?.name ?? null,
        scheduleLabel: c.class?.scheduleLabel ?? null,
        feeCents: c.feeCents,
        waitlisted: c.waitlisted,
      })),
    });
  })
);

export default router;
