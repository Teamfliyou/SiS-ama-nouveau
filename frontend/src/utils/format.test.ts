import { describe, it, expect } from 'vitest';
import { formatCurrency, parseAmount } from './format';

describe('formatCurrency', () => {
  it('formats whole euros and decimals in French style', () => {
    expect(formatCurrency(150)).toBe('150,00 €');
    expect(formatCurrency(125.5)).toBe('125,50 €');
    expect(formatCurrency(0)).toBe('0,00 €');
  });

  it('tolerates null/undefined/NaN', () => {
    expect(formatCurrency(null)).toBe('0,00 €');
    expect(formatCurrency(undefined)).toBe('0,00 €');
    expect(formatCurrency(NaN)).toBe('0,00 €');
  });

  it('rounds to the cent without base-10 drift', () => {
    expect(formatCurrency(19.99)).toBe('19,99 €');
    expect(formatCurrency(0.1 + 0.2)).toBe('0,30 €');
  });
});

describe('parseAmount', () => {
  it('accepts fr and en decimal separators and trims spaces', () => {
    expect(parseAmount('150')).toBe(150);
    expect(parseAmount('125,50')).toBe(125.5);
    expect(parseAmount('125.50')).toBe(125.5);
    expect(parseAmount('  19,99 ')).toBe(19.99);
  });

  it('rejects invalid or negative values', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });
});