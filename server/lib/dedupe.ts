export const normalizeKey = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

export const studentKey = (firstName: string, lastName: string): string =>
  `${normalizeKey(firstName)}|${normalizeKey(lastName)}`;