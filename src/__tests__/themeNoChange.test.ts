import { describe, it, expect } from 'vitest';
import { defaultTheme } from '../theme/theme';
import { createThemeById } from '../theme/themes';

/**
 * בדיקה: ודא ש-defaultTheme זהה ל-tealGold
 * ושהערכים תואמים לערכי הקומיט 99b8a97
 */

describe('Theme Structure Stability', () => {
  it('defaultTheme.palette זהה ל-createThemeById("tealGold").palette', () => {
    const tealGoldTheme = createThemeById('tealGold');

    // השוואת פלטה מלאה
    expect(defaultTheme.palette.primary).toEqual(tealGoldTheme.palette.primary);
    expect(defaultTheme.palette.secondary).toEqual(tealGoldTheme.palette.secondary);
    expect(defaultTheme.palette.success).toEqual(tealGoldTheme.palette.success);
    expect(defaultTheme.palette.warning).toEqual(tealGoldTheme.palette.warning);
    expect(defaultTheme.palette.error).toEqual(tealGoldTheme.palette.error);
    expect(defaultTheme.palette.info).toEqual(tealGoldTheme.palette.info);
    expect(defaultTheme.palette.background).toEqual(tealGoldTheme.palette.background);
    expect(defaultTheme.palette.text).toEqual(tealGoldTheme.palette.text);
    expect(defaultTheme.palette.divider).toEqual(tealGoldTheme.palette.divider);
    expect(defaultTheme.palette.grey).toEqual(tealGoldTheme.palette.grey);
    expect(defaultTheme.palette.accent).toEqual(tealGoldTheme.palette.accent);
    expect(defaultTheme.palette.sidebar).toEqual(tealGoldTheme.palette.sidebar);
  });

  it('defaultTheme מכיל את הערכים הקבועים מקומיט 99b8a97', () => {
    const { palette } = defaultTheme;

    // primary
    expect(palette.primary.main).toBe('#0F5C5C');
    expect(palette.primary.light).toBe('#3F8A87');
    expect(palette.primary.dark).toBe('#0A4242');
    expect(palette.primary.contrastText).toBe('#FFFFFF');

    // secondary
    expect(palette.secondary.main).toBe('#4A5D5A');
    expect(palette.secondary.light).toBe('#7A8D8A');
    expect(palette.secondary.dark).toBe('#33423F');
    expect(palette.secondary.contrastText).toBe('#FFFFFF');

    // success
    expect(palette.success.main).toBe('#2F7D57');
    expect(palette.success.light).toBe('#DDEEE6');
    expect(palette.success.dark).toBe('#1F5E3E');
    expect(palette.success.contrastText).toBe('#FFFFFF');

    // warning
    expect(palette.warning.main).toBe('#9A6A00');
    expect(palette.warning.light).toBe('#F6E7C8');
    expect(palette.warning.dark).toBe('#7A5200');
    expect(palette.warning.contrastText).toBe('#FFFFFF');

    // error
    expect(palette.error.main).toBe('#A63A2B');
    expect(palette.error.light).toBe('#F5DAD6');
    expect(palette.error.dark).toBe('#8E2A1F');
    expect(palette.error.contrastText).toBe('#FFFFFF');

    // info
    expect(palette.info.main).toBe('#2C6E8A');
    expect(palette.info.light).toBe('#D9E8EF');
    expect(palette.info.dark).toBe('#1E5068');
    expect(palette.info.contrastText).toBe('#FFFFFF');

    // background
    expect(palette.background.default).toBe('#F7F5F0');
    expect(palette.background.paper).toBe('#FFFFFF');

    // text
    expect(palette.text.primary).toBe('#1E2B29');
    expect(palette.text.secondary).toBe('#5B6B68');

    // divider
    expect(palette.divider).toBe('#E6E1D5');

    // grey
    expect(palette.grey[50]).toBe('#F7F5F0');
    expect(palette.grey[100]).toBe('#F1EEE6');
    expect(palette.grey[200]).toBe('#E6E1D5');

    // accent
    expect(palette.accent).toBe('#B8892D');

    // RTL
    expect(defaultTheme.direction).toBe('rtl');
  });
});
