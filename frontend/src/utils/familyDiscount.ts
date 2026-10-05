// Aperçu instantané de la réduction famille, pour l'affichage uniquement.
// Le serveur recalcule TOUJOURS les montants dus et la remise (server/lib/billing.ts)
// et refuse le paiement si le total affiché ne correspond plus (expectedTotalCents).

export const FAMILY_DISCOUNT_PERCENT = 10;
export const FAMILY_DISCOUNT_MIN_CHILDREN = 2;

export function familyQuote(dueCents: number[]) {
  const subtotalCents = dueCents.reduce((a, b) => a + b, 0);
  const applies = dueCents.length >= FAMILY_DISCOUNT_MIN_CHILDREN;
  const discountCents = applies ? Math.round((subtotalCents * FAMILY_DISCOUNT_PERCENT) / 100) : 0;
  return { childCount: dueCents.length, applies, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}
