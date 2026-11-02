/**
 * מערכת ערכות נושא (Multi-Theme)
 * 5 ערכות: tealGold (ברירת מחדל), classic, royalNavy, burgundy, indigo
 */

import { createAppTheme } from './theme';
import type { PaletteSpec } from './palettes';
import {
  tealGoldPalette,
  classicPalette,
  royalNavyPalette,
  burgundyPalette,
  indigoPalette,
} from './palettes';

// מזהי ערכות
export type ThemeId = 'tealGold' | 'classic' | 'royalNavy' | 'burgundy' | 'indigo';

// ערכת מחדל
export const DEFAULT_THEME_ID: ThemeId = 'tealGold';

/**
 * רשימת כל הערכות
 */
export const THEMES = [
  {
    id: 'tealGold' as ThemeId,
    label: 'Teal וזהב',
    labelEn: 'Teal & Gold',
    description: 'ערכת ברירת המחדל – צבעים חמים ומקצועיים',
    spec: tealGoldPalette,
  },
  {
    id: 'classic' as ThemeId,
    label: 'קלאסי מנוגש',
    labelEn: 'Accessible Classic',
    description: 'עיצוב קלאסי בהשראת MUI עם ניגודיות משופרת (WCAG AA)',
    spec: classicPalette,
  },
  {
    id: 'royalNavy' as ThemeId,
    label: 'נייבי מלכותי',
    labelEn: 'Royal Navy',
    description: 'מראה בנקאי וסמכותי בגוון כחול-כהה',
    spec: royalNavyPalette,
  },
  {
    id: 'burgundy' as ThemeId,
    label: 'בורדו',
    labelEn: 'Burgundy',
    description: 'קלאסי ומכובד בגוון אדום-חום',
    spec: burgundyPalette,
  },
  {
    id: 'indigo' as ThemeId,
    label: 'אינדיגו',
    labelEn: 'Indigo',
    description: 'מודרני ונקי בגוון סגול-כחול',
    spec: indigoPalette,
  },
];

/**
 * קבלת spec לפי מזהה
 * @param id מזהה ערכה
 * @returns spec של הערכה, או ברירת מחדל אם לא נמצא
 */
export function getThemeSpec(id: ThemeId | string): PaletteSpec {
  const theme = THEMES.find(t => t.id === id);
  return theme ? theme.spec : tealGoldPalette;
}

/**
 * יצירת theme לפי מזהה
 * @param id מזהה ערכה
 * @returns Theme אובייקט
 */
export function createThemeById(id: ThemeId | string) {
  return createAppTheme(getThemeSpec(id));
}
