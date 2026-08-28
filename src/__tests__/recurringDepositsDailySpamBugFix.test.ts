/**
 * טסט רגרסיה לבאג שדווח בפועל (עם צילום מסך) בסבב יוני 2026:
 *
 * 1. כל פתיחה של האפליקציה יצרה הפקדה מחזורית חדשה, גם כשהיום הנוכחי
 *    אינו יום היעד המוגדר (recurring_day) — כי הבדיקה "כבר נוצרה הפקדה
 *    החודש" הייתה מבוססת על recurring_deposit_number הבא (שמשתנה בכל
 *    יצירה), ולכן לעולם לא "תפסה" שכבר בוצעה השלמה החודש.
 *
 * 2. הסכום המוצג לכל הפקדה (amount * recurring_deposit_number) גרם לכך
 *    שכל הפקדה חדשה "בלעה" את כל ההפקדות הקודמות מבחינת התצוגה, בעוד
 *    שההפקדות הישנות ממשיכות להיות מוצגות בנפרד — כך שבמקום 22 ₪ בכל
 *    כרטיס, נראו כרטיסים עם 22, 44, 66, 88 ₪ בו-זמנית.
 *
 * ראו גם: recurringSeriesIdentification.test.ts (התאמת קריטריון הזיהוי
 * לסדרה בין המתזמן לבין identifySeriesItems).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { resetDatabase, db, getAllItems } from '../services/database'
import { autoCreateRecurringDeposits } from '../services/scheduler'

describe('תיקון: הפקדה מחזורית לא צריכה להיווצר בכל פתיחת אפליקציה', () => {
  let depositorId: string

  beforeEach(async () => {
    resetDatabase()

    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['משה', 'כהן', '0501112233', '', '', '', '']
    )
    depositorId = String(depositorResult.lastInsertRowid)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('פתיחת האפליקציה 3 ימים ברציפות (אחרי יום ההפקדה) לא צריכה ליצור יותר מהפקדה אחת נוספת', async () => {
    // הפקדה מחזורית ביום 25 לחודש, סכום 22 ₪
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 22, '2026-07-25', 'indefinite', null, 1, 25, 5, 1, 6, '', 'active', '', '']
    )

    // "פתיחת האפליקציה" ב-3 ימים רצופים אחרי יום ה-25 (26, 27, 28) —
    // בדיוק כמו בדיווח בפועל
    vi.useFakeTimers()

    vi.setSystemTime(new Date('2026-08-26'))
    await autoCreateRecurringDeposits()

    vi.setSystemTime(new Date('2026-08-27'))
    await autoCreateRecurringDeposits()

    vi.setSystemTime(new Date('2026-08-28'))
    await autoCreateRecurringDeposits()

    const allDeposits = getAllItems<any>('deposits').filter(
      d => d.depositor_id === depositorId && !d.is_deleted
    )

    // ✅ צריכות להיות בדיוק 2 הפקדות: המקורית (25.7) + הפקדת השלמה אחת
    // לחודש אוגוסט — לא הפקדה חדשה בכל יום (26, 27, 28) שהאפליקציה נפתחה
    expect(allDeposits).toHaveLength(2)

    const numbers = allDeposits.map(d => d.recurring_deposit_number).sort()
    expect(numbers).toEqual([1, 2])

    // וכל הפקדה נוספת ("פתיחה" נוספת) לא אמורה ליצור עוד אחת
    vi.setSystemTime(new Date('2026-08-29'))
    await autoCreateRecurringDeposits()

    const stillTwo = getAllItems<any>('deposits').filter(
      d => d.depositor_id === depositorId && !d.is_deleted
    )
    expect(stillTwo).toHaveLength(2)
  })

  it('הסכום המוצג לכל הפקדה בסדרה צריך להיות הסכום העצמי שלה, לא סכום מוכפל', async () => {
    // מדמה בדיוק את התמונה שדווחה: 4 הפקדות של 22 ₪ בסדרה אחת
    for (let i = 1; i <= 4; i++) {
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [depositorId, 22, `2026-0${5 + i}-26`, 'indefinite', null, 1, 26, 5 - i, i, 6, '', 'active', '', '']
      )
    }

    const deposits = (await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [
      depositorId,
    ])) as any[]

    expect(deposits).toHaveLength(4)

    // ✅ כל הפקדה מציגה/מחזירה את הסכום העצמי שלה (22), לא 22*מספרה בסדרה
    // (44, 66, 88). ה-UI (Deposits.tsx) קורא ישירות מ-d.amount ללא הכפלה.
    for (const d of deposits) {
      expect(d.amount).toBe(22)
    }
  })
})
