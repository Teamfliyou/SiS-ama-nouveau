import type { Prisma } from '@prisma/client';
import { normalizeKey } from './dedupe';

/**
 * Une classe est identifiée par (nom, année scolaire) : deux classes peuvent
 * porter le même nom si elles appartiennent à des années différentes.
 * La clé normalisée ci-dessous sert de clé de déduplication dans les imports.
 */
export const classKey = (name: string, schoolYearName?: string | null): string =>
  `${normalizeKey(name)}|${normalizeKey(schoolYearName ?? '')}`;

/**
 * Retrouve une classe par nom, en privilégiant la classe de l'année scolaire
 * active (cible d'inscription courante), puis la classe unique portant ce nom.
 * Renvoie null quand le nom est ambigu (plusieurs classes du même nom dans des
 * années différentes, sans année active pour trancher) : on préfère ne pas
 * deviner plutôt que d'associer une inscription à la mauvaise classe.
 */
export const findClassIdByName = async (
  tx: Prisma.TransactionClient,
  name: string,
  activeYearId?: number | null
): Promise<number | null> => {
  const candidates = await tx.class.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true, schoolYearId: true },
  });
  const matches = candidates.filter((c) => normalizeKey(c.name) === normalizeKey(name));
  if (matches.length === 0) return null;
  if (activeYearId != null) {
    const active = matches.find((m) => m.schoolYearId === activeYearId);
    if (active) return active.id;
  }
  return matches.length === 1 ? matches[0].id : null;
};