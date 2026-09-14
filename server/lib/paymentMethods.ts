import type { PaymentMethod } from '@prisma/client';

export const PAYMENT_METHOD_DEFAULT: PaymentMethod = 'CASH';

/** Labels français affichés par le frontend (indépendants des clés d'enum). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  CARD: 'Carte bancaire',
  TRANSFER: 'Virement',
  CHEQUE: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  OTHER: 'Autre',
};

const LABEL_TO_ENUM: Record<string, PaymentMethod> = {
  [PAYMENT_METHOD_LABELS.CASH.toLowerCase()]: 'CASH',
  especes: 'CASH',
  liquide: 'CASH',
  cash: 'CASH',
  espèces: 'CASH',
  [PAYMENT_METHOD_LABELS.CARD.toLowerCase()]: 'CARD',
  carte: 'CARD',
  cb: 'CARD',
  [PAYMENT_METHOD_LABELS.TRANSFER.toLowerCase()]: 'TRANSFER',
  transfert: 'TRANSFER',
  transfer: 'TRANSFER',
  [PAYMENT_METHOD_LABELS.CHEQUE.toLowerCase()]: 'CHEQUE',
  [PAYMENT_METHOD_LABELS.MOBILE_MONEY.toLowerCase()]: 'MOBILE_MONEY',
  mobilemoney: 'MOBILE_MONEY',
  momo: 'MOBILE_MONEY',
  [PAYMENT_METHOD_LABELS.OTHER.toLowerCase()]: 'OTHER',
  autre: 'OTHER',
};

/**
 * Mappe n'importe quelle entrée acceptée (label français historique ou clé de
 * l'enum) vers la valeur d'enum stockée en base. Valeur inconnue → OTHER
 * (aucune insertion ne peut échouer à cause de la méthode), null → null.
 */
export const toEnumMethod = (value: string | null | undefined): PaymentMethod | null => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (upper in PAYMENT_METHOD_LABELS) return upper as PaymentMethod;
  return LABEL_TO_ENUM[raw.toLowerCase()] ?? 'OTHER';
};

/** Mappe la valeur d'enum stockée vers le label français du frontend. */
export const toLabelMethod = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const upper = String(value).trim().toUpperCase();
  if (upper in PAYMENT_METHOD_LABELS) return PAYMENT_METHOD_LABELS[upper as PaymentMethod];
  return value;
};