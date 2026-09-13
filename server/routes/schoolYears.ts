import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, schoolYearCreateSchema, schoolYearUpdateSchema, parseId } from '../lib/validate';
import { setActiveSchoolYear } from '../lib/schoolYears';
import { toYmd } from '../lib/dates';

const router = Router();

router.use(authenticate);

const mapYear = (y: { id: number; name: string; startDate: Date; endDate: Date; active: boolean; _count?: { classes: number } }) => ({
  id: y.id,
  name: y.name,
  startDate: toYmd(y.startDate),
  endDate: toYmd(y.endDate),
  active: y.active,
  _count: { classes: y._count?.classes ?? 0 },
});

// GET /api/school-years
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const years = await prisma.schoolYear.findMany({
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      include: { _count: { select: { classes: true } } },
    });
    res.json(years.map(mapYear));
  })
);

// POST /api/school-years
router.post(
  '/',
  validate(schoolYearCreateSchema),
  asyncHandler(async (req, res) => {
    const { name, startDate, endDate, active } = req.body as {
      name: string;
      startDate: string;
      endDate: string;
      active?: boolean;
    };
    const year = await prisma.$transaction(async (tx) => {
      // Toujours inséré inactif : l'activation passe par setActiveSchoolYear,
      // seule voie qui garantit l'unicité (index partiel PostgreSQL) même en cas
      // d'année active déjà présente.
      const created = await tx.schoolYear.create({
        data: { name, startDate: new Date(`${startDate}T00:00:00.000Z`), endDate: new Date(`${endDate}T00:00:00.000Z`), active: false },
      });
      if (active) await setActiveSchoolYear(tx, created.id);
      return created;
    });
    res.status(201).json(mapYear(year));
  })
);

// PUT /api/school-years/:id
router.put(
  '/:id',
  validate(schoolYearUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'année scolaire invalide");
    const { name, startDate, endDate, active } = req.body as {
      name?: string;
      startDate?: string;
      endDate?: string;
      active?: boolean;
    };
    const exists = await prisma.schoolYear.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Année scolaire introuvable');
    const year = await prisma.$transaction(async (tx) => {
      // `active: true` n'est jamais écrit directement (conflit possible avec
      // l'index unique partiel) : l'activation passe par setActiveSchoolYear.
      const updated = await tx.schoolYear.update({
        where: { id },
        data: {
          name,
          startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined,
          endDate: endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined,
          ...(active === true ? {} : active === false ? { active: false } : {}),
        },
      });
      if (active) await setActiveSchoolYear(tx, id);
      return updated;
    });
    res.json(mapYear(year));
  })
);

// DELETE /api/school-years/:id
// Les classes perdent leur rattachement (schoolYearId -> null) ; l'historique
// reste intact dans les inscriptions.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'année scolaire invalide");
    const exists = await prisma.schoolYear.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Année scolaire introuvable');
    await prisma.schoolYear.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;