import { describe, it, expect } from 'vitest';
import { familyQuote } from './familyDiscount';

describe('familyQuote', () => {
  it('no discount with one child', () => {
    expect(familyQuote([15000])).toMatchObject({ applies: false, subtotalCents: 15000, discountCents: 0, totalCents: 15000 });
  });
  it('10 % from two children', () => {
    expect(familyQuote([15000, 12000])).toMatchObject({ applies: true, subtotalCents: 27000, discountCents: 2700, totalCents: 24300 });
  });
  it('three children and rounding', () => {
    expect(familyQuote([15000, 12000, 9000]).totalCents).toBe(32400);
    expect(familyQuote([3333, 3333, 3335]).discountCents).toBe(1000);
    expect(familyQuote([])).toMatchObject({ subtotalCents: 0, totalCents: 0 });
  });
});
