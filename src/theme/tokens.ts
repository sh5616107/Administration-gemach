import { alpha, Theme } from '@mui/material/styles';

/**
 * טוקני צבע מותאמים לפרויקט
 */

// צבעי תפריט צד (sidebar)
export const sidebarTokens = {
  bg: '#0F4A4A',
  text: '#E6EFEC',
  textInactive: '#D3E2DE',
  textActive: '#FFFFFF',
  selected: 'rgba(255, 255, 255, 0.14)',
  selectedHover: 'rgba(255, 255, 255, 0.20)',
  hover: 'rgba(230, 239, 236, 0.08)',
  divider: 'rgba(255, 255, 255, 0.14)',
} as const;

// צבעי קלנדר (אירועים) - כל צבע שונה בגוון ובהירות
export const calendarTokens = {
  loanDue: '#A63A2B',          // אדום כהה - פירעון הלוואה
  repayment: '#7A5C3E',         // חום - פירעון שבוצע
  recurringDeposit: '#2F7D57',  // ירוק - הפקדה מחזורית
  plannedLoan: '#2C6E8A',       // כחול - הלוואה מתוכננת
  depositDue: '#9A6A00',        // ענבר כהה - הפקדה להחזרה
  regularLoan: '#7B4B8A',       // שזיף - הלוואה רגילה
  unknown: '#879491',           // אפור-teal ניטרלי - אירוע לא ידוע
} as const;

// צבעי רמת ביטחון (bank matching)
export const confidenceTokens = {
  excellent: '#2F7D57',  // ירוק
  high: '#2C6E8A',       // כחול
  medium: '#9A6A00',     // ענבר
  low: '#B4530A',        // כתום כהה
  suspect: '#8E2A1F',    // אדום כהה
} as const;

// מפתחות צבע מותרים ב-palette
type PaletteColorKey = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

/**
 * Helper: יצירת גוון בהיר מצבע palette עם alpha מותאם
 * @param paletteColor - צבע מה-palette
 * @param amount - עוצמת השקיפות (0.08 = .50, 0.16 = .100, 0.30 = .200)
 * @returns פונקציה שמקבלת theme ומחזירה צבע עם alpha
 */
export function getTint(paletteColor: PaletteColorKey, amount: number = 0.08) {
  return (theme: Theme) => alpha(theme.palette[paletteColor].main, amount);
}

/**
 * Alias: רקע בהיר (0.08 alpha) - משמש במקום X.50
 */
export function getLightBg(paletteColor: PaletteColorKey) {
  return getTint(paletteColor, 0.08);
}
