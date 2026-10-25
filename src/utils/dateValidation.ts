/**
 * ולידציה של תאריך אירוע כספי (פירעון / משיכה) שהמשתמש בוחר ידנית.
 *
 * מאפשר רישום בדיעבד (תאריך אמיתי בעבר), אבל לא תאריך עתידי ולא תאריך
 * מוקדם מהאירוע שאליו הרשומה קשורה (הלוואה / הפקדה).
 *
 * מחזיר מחרוזת שגיאה בעברית, או מחרוזת ריקה כשהתאריך תקין.
 * הקובץ בלי תלויות בכוונה (חוץ מ-localDate) כדי שיהיה קל לבדוק אותו.
 */
import { toLocalDateStr } from './localDate'

export function validateEventDate(
  date: string,
  minDate?: string,
  minDateLabel: string = '',
  today: string = toLocalDateStr()
): string {
  if (!date) return 'נא לבחור תאריך'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'תאריך לא תקין'
  if (date > today) return 'לא ניתן לבחור תאריך עתידי'
  if (minDate && date < minDate) {
    return minDateLabel
      ? `התאריך לא יכול להיות לפני ${minDateLabel} (${minDate})`
      : `התאריך לא יכול להיות לפני ${minDate}`
  }
  return ''
}
