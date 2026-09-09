/**
 * Regression test: fail-closed SQL fix (database.ts) vs. scheduler.ts's
 * "UPDATE deposits SET recurring_months" call vs. AlertsDialog.tsx's
 * recurring-deposit alert query.
 *
 * היסטוריה:
 * - עד ל-8.9 (קומיט c9a1e9c, "fix(P0): fail-closed SQL"), ל-database.ts לא
 *   היה handler לתבנית 'UPDATE deposits SET recurring_months' — הקריאה ב-
 *   scheduler.ts (createRecurringDeposit) "הצליחה" אבל לא כתבה כלום בפועל.
 *   scheduler.ts תיעד את זה בהערה שהניחה שזה אינרטי, כי "אף אחד לא קורא
 *   recurring_months משורה שהיא לא ה-latest בסדרה".
 * - c9a1e9c הוסיף handler אמיתי לתבנית הזו (כחלק מכיסוי SQL patterns כדי
 *   שה-fail-closed לא ישבור פעולות קיימות) — בלי מודעות לכך שההנחה בהערה
 *   של scheduler.ts תלויה בכך שה-UPDATE הזה לא עובד.
 * - AlertsDialog.tsx כן קורא recurring_months מכל הפקדה עם
 *   is_recurring=1 AND status='active' (לא רק מה-"latest") כדי להחליט אם
 *   ליצור התראת "הפקדה מחזורית". השורה הישנה בסדרה נשארת status='active'
 *   בכוונה (ניסיון להעביר אותה ל-'superseded' הוסר כי שבר טסטים אחרים).
 *
 * המשמעות: ה-UPDATE שהיה "מת" הפך פעיל בשקט, וההנחה בהערה הישנה כבר לא
 * נכונה. הטסט הזה נועד "לנעול" את ההתנהגות הנוכחית בפועל, כדי ששינוי עתידי
 * ב-database.ts (או ב-scheduler.ts) שמשנה אותה שוב בשקט - ייכשל כאן במפורש,
 * במקום להישאר תופעת לוואי לא-מתועדת.
 *
 * הטסט לא קובע אם ההתנהגות "נכונה" - רק מתעד מה קורה בפועל היום.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, db } from '../services/database'
import { createRecurringDeposit } from '../services/scheduler'

describe('אינטראקציה סמויה: fail-closed UPDATE recurring_months <-> AlertsDialog query', () => {
  let depositorId: string

  beforeEach(async () => {
    resetDatabase()

    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['משה', 'כהן', '0501112233', '', '', '', '']
    )
    depositorId = String(depositorResult.lastInsertRowid)
  })

  it('createRecurringDeposit מפחית בפועל את recurring_months על ההפקדה הקודמת (לא no-op)', async () => {
    // הפקדה מחזורית ראשונה: recurring_months = 2 (עוד 2 הפקדות אחרי זו)
    const depositResult = await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 500, '2026-01-05', 'indefinite', null, 1, 5, 2, 1, 3, '', 'active', '', '']
    )
    const originalDepositId = String(depositResult.lastInsertRowid)

    const success = await createRecurringDeposit(originalDepositId)
    expect(success).toBe(true)

    // אם ה-UPDATE עדיין היה no-op (ההנחה הישנה), recurring_months על ההפקדה
    // המקורית היה נשאר 2. בפועל, מאז c9a1e9c, הוא כן יורד ל-1.
    const [originalAfter] = await db.query(
      'SELECT * FROM deposits WHERE id = ?',
      [originalDepositId]
    ) as any[]
    expect(originalAfter.recurring_months).toBe(1)

    // וגם: ההפקדה הישנה עדיין status='active', כפי שההערה ב-scheduler.ts
    // מציינת בכוונה (כדי לא לשבור טסטים אחרים) — ולכן היא עדיין נכנסת
    // לשאילתת ההתראות של AlertsDialog.tsx.
    expect(originalAfter.status).toBe('active')
    expect(originalAfter.is_recurring).toBe(1)
  })

  it('אחרי מספיק סבבים, recurring_months=0 מוציא את ההפקדה הישנה משאילתת ההתראות של AlertsDialog', async () => {
    // recurring_months = 1: הפקדה אחת נוספת בלבד אמורה להיווצר
    const depositResult = await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 500, '2026-01-05', 'indefinite', null, 1, 5, 1, 1, 2, '', 'active', '', '']
    )
    const originalDepositId = String(depositResult.lastInsertRowid)

    await createRecurringDeposit(originalDepositId)

    // שאילתה זהה במפורש לזו שב-AlertsDialog.tsx (WHERE is_recurring=1 AND
    // status='active'), כדי לוודא שאנחנו בודקים את אותה תמונה שהדיאלוג רואה.
    const alertCandidates = await db.query(
      `SELECT d.* FROM deposits d WHERE d.is_recurring = 1 AND d.status = 'active'`
    ) as any[]

    const originalRow = alertCandidates.find(d => d.id === originalDepositId)

    // ההפקדה הישנה עדיין מופיעה בתוצאה (status נשאר 'active')...
    expect(originalRow).toBeDefined()
    // ...אבל recurring_months שלה כבר 0, ולכן AlertsDialog.tsx
    // (`if (!deposit.recurring_months || deposit.recurring_months <= 0) return`)
    // ידלג עליה ולא ייצור לה יותר התראת "הפקדה מחזורית".
    expect(originalRow.recurring_months).toBe(0)
  })
})
