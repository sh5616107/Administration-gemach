import { describe, it, expect } from 'vitest';
import { defaultTheme } from '../theme';

/**
 * חישוב יחס ניגודיות (contrast ratio) בין שני צבעים
 * לפי WCAG 2.0
 */
function getContrastRatio(foreground: string, background: string): number {
  const getLuminance = (color: string): number => {
    // המרה מ-hex ל-RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    // חישוב luminance יחסית
    const [rs, gs, bs] = [r, g, b].map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const lum1 = getLuminance(foreground);
  const lum2 = getLuminance(background);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

describe('Theme Contrast Tests', () => {
  const { palette } = defaultTheme;

  it('ה-theme נוצר תקין ויש לו את כל המאפיינים הנדרשים', () => {
    expect(palette).toBeDefined();
    expect(palette.primary.main).toBeDefined();
    expect(palette.accent).toBeDefined();
    expect(palette.sidebar).toBeDefined();
    expect(palette.calendar).toBeDefined();
    expect(palette.confidence).toBeDefined();
  });

  it('primary.contrastText על primary.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.primary.contrastText, palette.primary.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('text.primary על background.default - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.text.primary, palette.background.default);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('success.contrastText על success.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.success.contrastText, palette.success.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('warning.contrastText על warning.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.warning.contrastText, palette.warning.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('error.contrastText על error.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.error.contrastText, palette.error.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('info.contrastText על info.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.info.contrastText, palette.info.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('secondary.contrastText על secondary.main - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.secondary.contrastText, palette.secondary.main);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('sidebar.textActive על sidebar.bg - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.sidebar.textActive, palette.sidebar.bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('sidebar.text על sidebar.bg - ניגודיות מינימלית 4.5:1', () => {
    const ratio = getContrastRatio(palette.sidebar.text, palette.sidebar.bg);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('accent מוגדר כזהב ולא נועד לטקסט', () => {
    expect(palette.accent).toBe('#B8892D');
  });

  it('צבעי קלנדר מוגדרים ושונים זה מזה', () => {
    const calendarColors = Object.values(palette.calendar);
    const uniqueColors = new Set(calendarColors);
    expect(uniqueColors.size).toBe(calendarColors.length);
  });

  it('grey.50/100/200 הם גוונים חמים', () => {
    expect(palette.grey[50]).toBe('#F7F5F0');
    expect(palette.grey[100]).toBe('#F1EEE6');
    expect(palette.grey[200]).toBe('#E6E1D5');
  });
});
