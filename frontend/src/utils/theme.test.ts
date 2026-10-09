import { describe, it, expect } from 'vitest';
import { THEME_STORAGE_KEY, THEMES, isUiTheme } from './theme';

describe('isUiTheme', () => {
  it('accepts only the two known themes', () => {
    expect(isUiTheme('classic')).toBe(true);
    expect(isUiTheme('liquid')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isUiTheme('dark')).toBe(false);
    expect(isUiTheme(null)).toBe(false);
    expect(isUiTheme(undefined)).toBe(false);
    expect(isUiTheme(1)).toBe(false);
  });
});

describe('theme metadata', () => {
  it('exposes a stable storage key', () => {
    expect(THEME_STORAGE_KEY).toBe('sis-ui-theme');
  });

  it('describes both themes with a label', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['classic', 'liquid']);
    THEMES.forEach((t) => expect(t.label.length).toBeGreaterThan(0));
  });
});
