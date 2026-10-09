import type { Prisma } from '@prisma/client';

/** Renvoie l'id de l'année scolaire active, ou null s'il n'y en a pas. */
export const getActiveSchoolYearId = async (tx: Prisma.TransactionClient): Promise<number | null> => {
  const year = await tx.schoolYear.findFirst({ where: { active: true }, select: { id: true } });
  return year?.id ?? null;
};

/** Rend `yearId` la seule année scolaire active de la base. */
export const setActiveSchoolYear = async (
  tx: Prisma.TransactionClient,
  yearId: number,
): Promise<void> => {
  await tx.schoolYear.updateMany({ where: { active: true, NOT: { id: yearId } }, data: { active: false } });
  await tx.schoolYear.update({ where: { id: yearId }, data: { active: true } });
};