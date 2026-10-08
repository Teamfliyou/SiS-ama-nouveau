import { describe, expect, it } from 'vitest';
import { normalizeBackupInput } from '../lib/backup';

describe('integration backup compatibility', () => {
  it.each([false, true])('preserves old/new collections and settings (envelope=%s)', (envelope) => {
    const data = {
      classes: [{ name: 'Classe 1' }], schoolYears: [{ name: '2026-2027' }],
      families: [{ name: 'Famille' }], enrollments: [{ studentId: 1 }],
      paymentGroups: [{ totalCents: 13500 }], evaluations: [{ title: 'Arabe' }],
      timetableSlots: [{ id: 1 }], lessons: [{ content: 'Leçon' }],
      guardians: [{ email: 'parent@example.com' }], preRegistrations: [{ reference: 'PI-2026-0001' }],
      registrationSettings: { isOpen: true, schoolYear: '2026-2027' },
    };
    const raw = envelope ? { version: '5', data } : { version: '5', ...data };
    const normalized = normalizeBackupInput(raw);
    for (const [key, value] of Object.entries(data)) expect(normalized.payload[key]).toEqual(value);
  });
});
