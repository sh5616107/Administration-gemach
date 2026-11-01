/**
 * מערכת ערכות נושא (Multi-Theme)
 * 5 ערכות: tealGold (ברירת מחדל), classic, royalNavy, burgundy, indigo
 */

import { createAppTheme } from './theme';

// מזהי ערכות
export type ThemeId = 'tealGold' | 'classic' | 'royalNavy' | 'burgundy' | 'indigo';

// ערכת מחדל
export const DEFAULT_THEME_ID: ThemeId = 'tealGold';

/**
 * מפרט פלטה
 */
interface PaletteSpec {
  primary: { main: string; light: string; dark: string; contrastText: string };
  secondary: { main: string; light: string; dark: string; contrastText: string };
  success: { main: string; light: string; dark: string; contrastText: string };
  warning: { main: string; light: string; dark: string; contrastText: string };
  error: { main: string; light: string; dark: string; contrastText: string };
  info: { main: string; light: string; dark: string; contrastText: string };
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
  divider: string;
  grey: { 50: string; 100: string; 200: string };
  accent: string;
  sidebar: {
    bg: string;
    text: string;
    textInactive: string;
    textActive: string;
    selected: string;
    selectedHover: string;
    hover: string;
    divider: string;
  };
}

/**
 * צבעי סטטוס משותפים (לכל הערכות מלבד classic)
 */
const commonStatusColors = {
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
};

/**
 * Helper: מילוי spec עם צבעי סטטוס משותפים
 */
function makeSpec(overrides: Partial<PaletteSpec>): PaletteSpec {
  return {
    ...commonStatusColors,
    background: { default: '#FFFFFF', paper: '#FFFFFF' },
    text: { primary: '#000000', secondary: '#666666' },
    divider: '#E0E0E0',
    grey: { 50: '#FAFAFA', 100: '#F5F5F5', 200: '#EEEEEE' },
    accent: '#000000',
    sidebar: {
      bg: '#000000',
      text: '#FFFFFF',
      textInactive: '#CCCCCC',
      textActive: '#FFFFFF',
      selected: 'rgba(255,255,255,0.14)',
      selectedHover: 'rgba(255,255,255,0.20)',
      hover: 'rgba(255,255,255,0.08)',
      divider: 'rgba(255,255,255,0.14)',
    },
    primary: { main: '#000000', light: '#333333', dark: '#000000', contrastText: '#FFFFFF' },
    secondary: { main: '#666666', light: '#888888', dark: '#444444', contrastText: '#FFFFFF' },
    ...overrides,
  } as PaletteSpec;
}

/**
 * ערכת Teal + זהב (ברירת מחדל)
 */
const tealGoldSpec: PaletteSpec = makeSpec({
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
});

/**
 * ערכה קלאסית (שחזור המראה לפני המיגרציה)
 */
const classicSpec: PaletteSpec = {
  primary: {
    main: '#1976D2',
    light: '#42A5F5',
    dark: '#1565C0',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#424242',
    light: '#6D6D6D',
    dark: '#1B1B1B',
    contrastText: '#FFFFFF',
  },
  // צבעי סטטוס מותאמים לקלאסית
  success: {
    main: '#2E7D32',
    light: '#E8F5E9',
    dark: '#1B5E20',
    contrastText: '#FFFFFF',
  },
  warning: {
    main: '#B85C00',
    light: '#FFF3E0',
    dark: '#8A4400',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#D32F2F',
    light: '#FDECEA',
    dark: '#9A0007',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#00838F',
    light: '#E0F7FA',
    dark: '#005662',
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#FFFFFF',
    paper: '#FFFFFF',
  },
  text: {
    primary: '#212121',
    secondary: '#757575',
  },
  divider: '#E0E0E0',
  grey: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
  },
  accent: '#1976D2', // אין זהב בעיצוב הקלאסי
  sidebar: {
    bg: '#FAFAFA',
    text: '#424242',
    textInactive: '#666666',
    textActive: '#1565C0',
    selected: '#E3F2FD',
    selectedHover: '#BBDEFB',
    hover: '#F5F5F5',
    divider: '#EEEEEE',
  },
};

/**
 * ערכת נייבי מלכותי
 */
const royalNavySpec: PaletteSpec = makeSpec({
  primary: {
    main: '#193B63',
    light: '#4A6A94',
    dark: '#0F2744',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#6B5F52',
    light: '#958A7E',
    dark: '#4A4136',
    contrastText: '#FFFFFF',
  },
  accent: '#B58A4A',
  background: {
    default: '#F4F6F9',
    paper: '#FFFFFF',
  },
  text: {
    primary: '#1C2430',
    secondary: '#5A6575',
  },
  grey: {
    50: '#F4F6F9',
    100: '#ECEFF4',
    200: '#DEE3EA',
  },
  divider: '#DEE3EA',
  sidebar: {
    bg: '#142D4B',
    text: '#E6EFEC',
    textInactive: '#D3E2DE',
    textActive: '#FFFFFF',
    selected: 'rgba(255,255,255,0.14)',
    selectedHover: 'rgba(255,255,255,0.20)',
    hover: 'rgba(230,239,236,0.08)',
    divider: 'rgba(255,255,255,0.14)',
  },
});

/**
 * ערכת בורדו
 */
const burgundySpec: PaletteSpec = makeSpec({
  primary: {
    main: '#702F43',
    light: '#A0586D',
    dark: '#4E1F2E',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#855D68',
    light: '#AE8A94',
    dark: '#5E3E48',
    contrastText: '#FFFFFF',
  },
  accent: '#C49A62',
  background: {
    default: '#F8F3F3',
    paper: '#FFFFFF',
  },
  text: {
    primary: '#2A2023',
    secondary: '#6A5A5E',
  },
  grey: {
    50: '#F8F3F3',
    100: '#F1E9E9',
    200: '#E6DBDB',
  },
  divider: '#E6DBDB',
  sidebar: {
    bg: '#512333',
    text: '#E6EFEC',
    textInactive: '#D3E2DE',
    textActive: '#FFFFFF',
    selected: 'rgba(255,255,255,0.14)',
    selectedHover: 'rgba(255,255,255,0.20)',
    hover: 'rgba(230,239,236,0.08)',
    divider: 'rgba(255,255,255,0.14)',
  },
});

/**
 * ערכת אינדיגו
 */
const indigoSpec: PaletteSpec = makeSpec({
  primary: {
    main: '#4B3F8F',
    light: '#7A6EB8',
    dark: '#332A66',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#6F63A6',
    light: '#9C92C7',
    dark: '#4D4378',
    contrastText: '#FFFFFF',
  },
  accent: '#C9A24B',
  background: {
    default: '#F5F4FA',
    paper: '#FFFFFF',
  },
  text: {
    primary: '#22202E',
    secondary: '#5E5B72',
  },
  grey: {
    50: '#F5F4FA',
    100: '#ECEAF4',
    200: '#E0DDEC',
  },
  divider: '#E0DDEC',
  sidebar: {
    bg: '#352C6B',
    text: '#E6EFEC',
    textInactive: '#D3E2DE',
    textActive: '#FFFFFF',
    selected: 'rgba(255,255,255,0.14)',
    selectedHover: 'rgba(255,255,255,0.20)',
    hover: 'rgba(230,239,236,0.08)',
    divider: 'rgba(255,255,255,0.14)',
  },
});

/**
 * רשימת כל הערכות
 */
export const THEMES = [
  {
    id: 'tealGold' as ThemeId,
    label: 'Teal וזהב',
    labelEn: 'Teal & Gold',
    description: 'ערכת ברירת המחדל – צבעים חמים ומקצועיים',
    spec: tealGoldSpec,
  },
  {
    id: 'classic' as ThemeId,
    label: 'קלאסי',
    labelEn: 'Classic',
    description: 'שחזור המראה המקורי עם כחול MUI ותפריט בהיר',
    spec: classicSpec,
  },
  {
    id: 'royalNavy' as ThemeId,
    label: 'נייבי מלכותי',
    labelEn: 'Royal Navy',
    description: 'מראה בנקאי וסמכותי בגוון כחול-כהה',
    spec: royalNavySpec,
  },
  {
    id: 'burgundy' as ThemeId,
    label: 'בורדו',
    labelEn: 'Burgundy',
    description: 'קלאסי ומכובד בגוון אדום-חום',
    spec: burgundySpec,
  },
  {
    id: 'indigo' as ThemeId,
    label: 'אינדיגו',
    labelEn: 'Indigo',
    description: 'מודרני ונקי בגוון סגול-כחול',
    spec: indigoSpec,
  },
];

/**
 * קבלת spec לפי מזהה
 * @param id מזהה ערכה
 * @returns spec של הערכה, או ברירת מחדל אם לא נמצא
 */
export function getThemeSpec(id: ThemeId | string): PaletteSpec {
  const theme = THEMES.find(t => t.id === id);
  return theme ? theme.spec : tealGoldSpec;
}

/**
 * יצירת theme לפי מזהה
 * @param id מזהה ערכה
 * @returns Theme אובייקט
 */
export function createThemeById(id: ThemeId | string) {
  return createAppTheme(getThemeSpec(id));
}
