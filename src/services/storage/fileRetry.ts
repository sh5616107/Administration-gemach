/**
 * ב-Windows החלפת קובץ קיים (rename על גבי הקובץ הראשי) נכשלת עם "Access is denied" (os error 5)
 * או "used by another process" (os error 32) כשתוכנה אחרת מחזיקה אותו פתוח באותו רגע:
 * אנטי-וירוס שסורק את הקובץ שנכתב זה עתה, מאנדקס חיפוש, תצוגה מקדימה בסייר הקבצים, או תוכנה
 * שפתחה את הקובץ (למשל DB Browser). לרוב הנעילה קצרה, ולכן מנסים כמה פעמים לפני שמוותרים.
 */

const LOCK_PATTERN = /access is denied|os error 5\b|os error 32\b|being used by another process|EBUSY|EPERM/i

export function isLockError(e: unknown): boolean {
  return LOCK_PATTERN.test(e instanceof Error ? e.message : String(e))
}

export const DEFAULT_LOCK_RETRY_DELAYS_MS = [100, 250, 500, 1000, 2000]

/** מריץ fn; אם נכשלה בשגיאת נעילה - מנסה שוב לפי ההשהיות. שגיאה אחרת נזרקת מיד. */
export async function retryOnLock<T>(
  fn: () => Promise<T>,
  delaysMs: number[] = DEFAULT_LOCK_RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (!isLockError(e) || i >= delaysMs.length) throw e
      await sleep(delaysMs[i])
    }
  }
}

/** מוסיף לשגיאת נעילה הסבר בעברית למשתמש (שאר השגיאות לא משתנות) */
export function explainLockError(e: unknown): Error {
  const err = e instanceof Error ? e : new Error(String(e))
  if (!isLockError(err)) return err
  return new Error(
    `${err.message} — כנראה שהקובץ נעול על ידי תוכנה אחרת (אנטי-וירוס, תוכנת גיבוי, DB Browser, תצוגה מקדימה בסייר הקבצים). ` +
      'סגור תוכנות שפתחו את תיקיית הנתונים ולחץ "נסה שוב עכשיו".'
  )
}
