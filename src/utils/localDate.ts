/**
 * עזרי תאריך לפי שעון מקומי.
 *
 * למה זה קיים: `date.toISOString().split('T')[0]` מחזיר את התאריך לפי UTC.
 * בישראל (UTC+2/+3) זה מחזיר "אתמול" בין חצות ל-02:00/03:00, וכש-date הוא
 * חצות מקומי (למשל `new Date(year, month, 1)`) התוצאה היא היום *הקודם*.
 * כל חישובי "היום" / "ראשון בחודש" / תאריכי פירעון חייבים להיעשות לפי שעון מקומי.
 *
 * הקובץ בלי תלויות בכוונה כדי שאפשר יהיה לייבא אותו מכל שכבה (כולל database.ts).
 */

/** מחזיר YYYY-MM-DD לפי שעון מקומי (ברירת מחדל: היום). */
export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** מחזיר YYYY-MM-DD של היום הראשון בחודש של התאריך הנתון, לפי שעון מקומי. */
export function firstDayOfMonthStr(date: Date = new Date()): string {
  return toLocalDateStr(new Date(date.getFullYear(), date.getMonth(), 1))
}
