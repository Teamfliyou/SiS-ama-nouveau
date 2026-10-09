import type { Prisma } from '@prisma/client';
import { getActiveSchoolYearId } from './schoolYears';

/**
 * Garde l'historique d'inscriptions cohérent avec `Student.classId` (classe
 * courante dénormalisée) : un seul enregistrement `Enrollment` actif par élève.
 *
 * - classId identique → rien à faire (idempotent, ré-import sûrs).
 * - classId null → on clôt l'inscription active en cours.
 * - sinon → on clôt l'inscription active et on en ouvre une nouvelle dans la
 *   nouvelle classe (rattachée à l'année scolaire active si elle existe).
 */
export const syncEnrollment = async (
  tx: Prisma.TransactionClient,
  studentId: number,
  classId: number | null,
): Promise<void> => {
  const today = new Date();

  if (classId === null) {
    await tx.enrollment.updateMany({
      where: { studentId, isActive: true },
      data: { isActive: false, endDate: today },
    });
    return;
  }

  const existing = await tx.enrollment.findFirst({
    where: { studentId, isActive: true },
    select: { classId: true },
  });
  if (existing?.classId === classId) return;

  await tx.enrollment.updateMany({
    where: { studentId, isActive: true },
    data: { isActive: false, endDate: today },
  });

  const schoolYearId = await getActiveSchoolYearId(tx);
  await tx.enrollment.create({
    data: { studentId, classId, schoolYearId, isActive: true, startDate: today },
  });
};