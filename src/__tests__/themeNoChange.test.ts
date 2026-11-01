import { describe, it, expect } from 'vitest';
import { createAppTheme } from '../theme/theme';

/**
 * בדיקה: ודא ש-theme שנוצר מ-tealGoldPalette זהה לפני ואחרי שלב 1
 * (sidebar עבר ל-PaletteSpec אבל הערכים עצמם לא השתנו)
 */

describe('Theme Structure Stability - שלב 1', () => {
  it('tealGold theme מכיל את כל הטוקנים הנדרשים (כולל sidebar מה-spec)', () => {
    // יצירת theme מחדש מ-tealGoldPalette
    const tealGoldPalette = {
      primary: {
        main: '#0F5C5C',
        light: '#3F8A87',
        dark: '#0A4242',
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: '#4A5D5A',
        light: '#7A8D8A',
        dark: '#33423F',
        contrastText: '#FFFFFF',
      },
      success: {
        main: '#2F7D57',
        light: '#DDEEE6',
        dark: '#1F5E3E',
        contrastText: '#FFFFFF',
      },
      warning: {
        main: '#9A6A00',
        light: '#F6E7C8',
        dark: '#7A5200',
        contrastText: '#FFFFFF',
      },
      error: {
        main: '#A63A2B',
        light: '#F5DAD6',
        dark: '#8E2A1F',
        contrastText: '#FFFFFF',
      },
      info: {
        main: '#2C6E8A',
        light: '#D9E8EF',
        dark: '#1E5068',
        contrastText: '#FFFFFF',
      },
      background: {
        default: '#F7F5F0',
        paper: '#FFFFFF',
      },
      text: {
        primary: '#1E2B29',
        secondary: '#5B6B68',
      },
      divider: '#E6E1D5',
      grey: {
        50: '#F7F5F0',
        100: '#F1EEE6',
        200: '#E6E1D5',
      },
      accent: '#B8892D',
      sidebar: {
        bg: '#0F4A4A',
        text: '#E6EFEC',
        textInactive: '#D3E2DE',
        textActive: '#FFFFFF',
        selected: 'rgba(255, 255, 255, 0.14)',
        selectedHover: 'rgba(255, 255, 255, 0.20)',
        hover: 'rgba(230, 239, 236, 0.08)',
        divider: 'rgba(255, 255, 255, 0.14)',
      },
    };

    const theme = createAppTheme(tealGoldPalette);
    const { palette } = theme;

    // primary
    expect(palette.primary.main).toBe('#0F5C5C');
    expect(palette.primary.light).toBe('#3F8A87');
    expect(palette.primary.dark).toBe('#0A4242');
    expect(palette.primary.contrastText).toBe('#FFFFFF');

    // accent
    expect(palette.accent).toBe('#B8892D');

    // sidebar (עכשיו מה-spec)
    expect(palette.sidebar).toBeDefined();
    expect(palette.sidebar.bg).toBe('#0F4A4A');
    expect(palette.sidebar.text).toBe('#E6EFEC');
    expect(palette.sidebar.textInactive).toBe('#D3E2DE');
    expect(palette.sidebar.textActive).toBe('#FFFFFF');
    expect(palette.sidebar.selected).toBe('rgba(255, 255, 255, 0.14)');
    expect(palette.sidebar.selectedHover).toBe('rgba(255, 255, 255, 0.20)');
    expect(palette.sidebar.hover).toBe('rgba(230, 239, 236, 0.08)');
    expect(palette.sidebar.divider).toBe('rgba(255, 255, 255, 0.14)');

    // calendar ו-confidence קבועים (לא חלק מ-spec)
    expect(palette.calendar).toBeDefined();
    expect(palette.calendar.loanDue).toBe('#A63A2B');
    expect(palette.confidence).toBeDefined();
    expect(palette.confidence.excellent).toBe('#2F7D57');

    // RTL
    expect(theme.direction).toBe('rtl');
  });
});
