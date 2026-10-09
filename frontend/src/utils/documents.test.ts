import { describe, it, expect } from 'vitest';
import { canPreview, formatFileSize } from './documents';

describe('documents helpers', () => {
  it('formats file sizes the French way', () => {
    expect(formatFileSize(512)).toBe('512 o');
    expect(formatFileSize(52_000)).toBe('51 Ko');
    expect(formatFileSize(2_400_000)).toBe('2,3 Mo');
  });

  it('previews only PDF and images', () => {
    expect(canPreview('application/pdf')).toBe(true);
    expect(canPreview('image/png')).toBe(true);
    expect(canPreview('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
  });
});
