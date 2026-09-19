import { describe, it, expect } from 'vitest';
import {
  CURRENT_BACKUP_FORMAT_VERSION,
  buildBackupFilename,
  detectBackupVersion,
  getBackupSummary,
  parseBackup,
  parseBackupFileText,
} from './backup';

describe('detectBackupVersion', () => {
  it('reads backupFormatVersion first, then version, defaulting to 1', () => {
    expect(detectBackupVersion({ backupFormatVersion: 3, version: '2' })).toBe(3);
    expect(detectBackupVersion({ version: '2' })).toBe(2);
    expect(detectBackupVersion({ version: 1 })).toBe(1);
    expect(detectBackupVersion({})).toBe(1);
    expect(detectBackupVersion(null)).toBe(1);
  });
});

describe('parseBackup', () => {
  it('unwraps the canonical v3 data envelope', () => {
    const parsed = parseBackup({
      application: 'SiS AMA',
      backupFormatVersion: 3,
      createdAt: '2026-09-13T18:30:00.000Z',
      data: {
        classes: [{ name: 'CM1' }],
        students: [{ firstName: 'Zoe' }],
        teachers: [{ firstName: 'Marie' }],
        payments: [{ amountCents: 100 }],
        attendances: [{ date: '2026-09-09' }],
      },
    });
    expect(parsed.formatVersion).toBe(3);
    expect(parsed.application).toBe('SiS AMA');
    expect(parsed.createdAt).toBe('2026-09-13T18:30:00.000Z');
    expect(parsed.data.classes).toHaveLength(1);
    expect(parsed.data.students).toHaveLength(1);
    // Les collections absentes sont des tableaux vides, jamais undefined.
    expect(parsed.data.schoolYears).toEqual([]);
    expect(parsed.data.enrollments).toEqual([]);
  });

  it('reads a legacy flat v1/v2 backup without a data envelope', () => {
    const parsed = parseBackup({
      version: '2',
      classes: [{ name: 'CE1' }],
      students: [{ firstName: 'Lea' }, { firstName: 'Max' }],
    });
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.createdAt).toBeNull();
    expect(parsed.data.classes).toHaveLength(1);
    expect(parsed.data.students).toHaveLength(2);
    expect(parsed.data.teachers).toEqual([]);
  });

  it('parses raw JSON text and rejects invalid JSON', () => {
    const parsed = parseBackupFileText('{"backupFormatVersion":3,"data":{"classes":[]}}');
    expect(parsed.formatVersion).toBe(3);
    expect(() => parseBackupFileText('not json')).toThrow(SyntaxError);
  });
});

describe('getBackupSummary', () => {
  it('counts every business collection', () => {
    const summary = getBackupSummary(
      parseBackup({
        backupFormatVersion: 3,
        data: {
          classes: [1, 2, 3],
          students: [1, 2],
          teachers: [1],
          payments: [1, 2, 3, 4],
          attendances: [1],
        },
      })
    );
    expect(summary).toEqual({ students: 2, classes: 3, teachers: 1, payments: 4, attendances: 1 });
  });
});

describe('buildBackupFilename', () => {
  it('builds the canonical filename with zero-padding', () => {
    const date = new Date(2026, 8, 13, 18, 30); // 13 septembre 2026 18:30
    expect(buildBackupFilename(date, CURRENT_BACKUP_FORMAT_VERSION)).toBe(
      'SiS-AMA-backup-2026-09-13-18-30-v3.json'
    );
  });
});
