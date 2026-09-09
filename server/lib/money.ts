// Money is stored as integer cents to avoid floating-point rounding errors.
// An amount of 125.50 € is stored as 12550.

export const eurosToCents = (euros: number): number => Math.round(euros * 100);

export const centsToEuros = (cents: number): number => cents / 100;

/** Format a euro amount (number of euros) as "125,50 €". */
export const formatCurrency = (euros: number): string =>
  `${(Math.round(euros * 100) / 100).toFixed(2).replace('.', ',')} €`;

/** Format an amount stored in cents as "125,50 €". */
export const formatCents = (cents: number): string => formatCurrency(cents / 100);