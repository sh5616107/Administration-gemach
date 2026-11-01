import { alpha } from '@mui/material/styles';

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
} as const;

// צבעי קלנדר (אירועים)
export const calendarTokens = {
  loanDue: '#d32f2f',          // אדום - פירעון הלוואה
  repayment: '#795548',         // חום - פירעון שבוצע
  recurringDeposit: '#2e7d32',  // ירוק - הפקדה מחזורית
  plannedLoan: '#0288d1',       // כחול - הלוואה מתוכננת
  depositDue: '#ed6c02',        // ענבר - הפקדה להחזרה
  regularLoan: '#9c27b0',       // שזיף - הלוואה רגילה
} as const;

// צבעי רמת ביטחון (bank matching)
export const confidenceTokens = {
  excellent: '#2e7d32',  // ירוק
  high: '#1565c0',       // כחול
  medium: '#f57f17',     // כתום
  low: '#e65100',        // כתום כהה
  suspect: '#b71c1c',    // אדום כהה
} as const;

/**
 * Helper: יצירת רקע בהיר מצבע palette
 * משמש במקום X.50 שלא קיים ב-MUI
 */
export function getLightBg(paletteColor: string) {
  return (theme: any) => alpha(theme.palette[paletteColor]?.main || paletteColor, 0.08);
}
