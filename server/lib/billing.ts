// Single source of truth for what a student still owes, and for the family discount.
// Tuition fees come from Class.tuitionFeeCents; they are never duplicated here.

type BalanceInput = {
  class: { tuitionFeeCents: number } | null;
  payments: { amountCents: number; discountCents?: number }[];
};

/** Amount due, paid and remaining for one student, in integer cents. */
export function studentBalance(s: BalanceInput) {
  const totalAmountDueCents = s.class?.tuitionFeeCents ?? 0;
  const totalPaidCents = s.payments.reduce((acc, p) => acc + p.amountCents, 0);
  // Family discounts granted on grouped payments settle part of the tuition too.
  const totalDiscountCents = s.payments.reduce((acc, p) => acc + (p.discountCents ?? 0), 0);
  const remainingCents = totalAmountDueCents - totalPaidCents - totalDiscountCents;
  return { totalAmountDueCents, totalPaidCents, totalDiscountCents, remainingCents };
}

/** Family discount: 10 % when at least 2 children are paid together. */
export const FAMILY_DISCOUNT_PERCENT = 10;
export const FAMILY_DISCOUNT_MIN_CHILDREN = 2;

/**
 * Applies the family discount to the amounts due (cents) of the selected children.
 * The discount is split across children (largest remainder) so that every line's
 * amount + discount equals exactly what that child owed.
 */
export function computeFamilyPayment(dueCents: number[]) {
  const subtotalCents = dueCents.reduce((a, b) => a + b, 0);
  const applies = dueCents.length >= FAMILY_DISCOUNT_MIN_CHILDREN;
  const discountCents = applies ? Math.round((subtotalCents * FAMILY_DISCOUNT_PERCENT) / 100) : 0;

  // Proportional split of the discount, distributing leftover cents deterministically.
  const exact = dueCents.map((d) => (subtotalCents > 0 ? (d * discountCents) / subtotalCents : 0));
  const shares = exact.map(Math.floor);
  let leftover = discountCents - shares.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    shares[i] += 1;
    leftover -= 1;
  }

  const lines = dueCents.map((d, i) => ({ dueCents: d, discountCents: shares[i], amountCents: d - shares[i] }));
  return {
    childCount: dueCents.length,
    subtotalCents,
    discountPercent: applies ? FAMILY_DISCOUNT_PERCENT : 0,
    discountCents,
    totalCents: subtotalCents - discountCents,
    lines,
  };
}
