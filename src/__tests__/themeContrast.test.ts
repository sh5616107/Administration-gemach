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

  it('צבעי קלנדר: מרחק CIELAB (ΔE76) מינימלי 25 בין כל זוג', () => {
    // המרת hex ל-RGB
    const hexToRgb = (hex: string) => {
      const h = hex.replace('#', '');
      return {
        r: parseInt(h.substr(0, 2), 16) / 255,
        g: parseInt(h.substr(2, 2), 16) / 255,
        b: parseInt(h.substr(4, 2), 16) / 255,
      };
    };

    // המרת RGB ל-XYZ
    const rgbToXyz = (r: number, g: number, b: number) => {
      const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      const rL = toLinear(r);
      const gL = toLinear(g);
      const bL = toLinear(b);

      return {
        x: rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375,
        y: rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750,
        z: rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041,
      };
    };

    // המרת XYZ ל-LAB
    const xyzToLab = (x: number, y: number, z: number) => {
      const refX = 0.95047, refY = 1.00000, refZ = 1.08883; // D65
      const f = (t: number) => t > 0.008856 ? Math.pow(t, 1 / 3) : (7.787 * t) + (16 / 116);

      const fx = f(x / refX);
      const fy = f(y / refY);
      const fz = f(z / refZ);

      return {
        L: (116 * fy) - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz),
      };
    };

    // חישוב ΔE76
    const deltaE = (color1: string, color2: string) => {
      const rgb1 = hexToRgb(color1);
      const rgb2 = hexToRgb(color2);
      const xyz1 = rgbToXyz(rgb1.r, rgb1.g, rgb1.b);
      const xyz2 = rgbToXyz(rgb2.r, rgb2.g, rgb2.b);
      const lab1 = xyzToLab(xyz1.x, xyz1.y, xyz1.z);
      const lab2 = xyzToLab(xyz2.x, xyz2.y, xyz2.z);

      return Math.sqrt(
        Math.pow(lab2.L - lab1.L, 2) +
        Math.pow(lab2.a - lab1.a, 2) +
        Math.pow(lab2.b - lab1.b, 2)
      );
    };

    const calendarEntries = Object.entries(palette.calendar);
    const minDeltaE = 25;

    for (let i = 0; i < calendarEntries.length; i++) {
      for (let j = i + 1; j < calendarEntries.length; j++) {
        const [key1, color1] = calendarEntries[i];
        const [key2, color2] = calendarEntries[j];
        const de = deltaE(color1, color2);

        if (de < minDeltaE) {
          throw new Error(
            `מרחק צבע לא מספיק בין ${key1} (${color1}) ` +
            `ל-${key2} (${color2}). ΔE=${de.toFixed(1)}, נדרש: ${minDeltaE}`
          );
        }
      }
    }

    expect(true).toBe(true);
  });

  it('צבעי קלנדר: ניגודיות מינימלית 3:1 על רקע לבן', () => {
    const calendarEntries = Object.entries(palette.calendar);
    const white = '#FFFFFF';

    calendarEntries.forEach(([key, color]) => {
      const ratio = getContrastRatio(color, white);
      if (ratio < 3) {
        throw new Error(
          `ניגודיות לא מספיקה עבור ${key} (${color}) על רקע לבן. יחס: ${ratio.toFixed(2)}, נדרש: 3.0`
        );
      }
    });

    expect(true).toBe(true);
  });

  it('grey.50/100/200 הם גוונים חמים', () => {
    expect(palette.grey[50]).toBe('#F7F5F0');
    expect(palette.grey[100]).toBe('#F1EEE6');
    expect(palette.grey[200]).toBe('#E6E1D5');
  });
});
