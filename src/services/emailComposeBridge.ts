/**
 * גשר בין שכבת השירותים (documents.ts) לבין חלון עריכת המייל (EmailComposeDialog).
 *
 * שליחה ישירה דרך חשבון Google (gmail_oauth) לא פותחת חלון חיצוני שבו המשתמש
 * יכול לראות ולערוך את ההודעה, ולכן ללא שלב אישור הודעה יכולה לצאת בלי שהמשתמש
 * ראה אותה (למשל לחיצה על כתובת מייל בכרטיס לווה שיצרה הודעה ריקה).
 * לפני כל שליחה ישירה, ההודעה מוצגת למשתמש לעריכה ולאישור.
 */
import type { EmailData } from './documents'

export type EmailComposeHandler = (data: EmailData) => Promise<EmailData | null>

let handler: EmailComposeHandler | null = null

export function registerEmailComposeHandler(next: EmailComposeHandler | null): void {
  handler = next
}

/**
 * מציג את ההודעה למשתמש לעריכה. מחזיר את ההודעה הערוכה, או null אם בוטלה.
 * אם אין חלון רשום (למשל בבדיקות) ההודעה מוחזרת כמו שהיא.
 */
export async function requestEmailCompose(data: EmailData): Promise<EmailData | null> {
  if (!handler) return data
  return handler(data)
}

/** הודעה ללא נושא וללא תוכן — לעולם לא נשלחת ישירות. */
export function isEmailContentEmpty(data: Pick<EmailData, 'subject' | 'body'>): boolean {
  return !data.subject?.trim() && !data.body?.trim()
}
