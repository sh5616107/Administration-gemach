/**
 * טסט למיגרציית מספרי פירעון מחזורי
 * מוודא שהמיגרציה כותבת בפועל לנתונים
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { loansService, repaymentsService, borrowersService, resetDatabase } from '../services/database'
import { migrateRecurringRepaymentNumbers } from '../services/migrations'

describe('Recurring Repayment Numbers Migration', () => {
  beforeEach(() => {
    resetDatabase()
  })

  it('צריך לתייג פירעונות עם מספרים נכונים', async () => {
    // יצירת לווה
    const borrower = await borrowersService.create({
      first_name: 'יוסי',
      last_name: 'כהן',
      phone: '0501234567',
    })

    // יצירת הלוואה עם פירעון מחזורי
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 10000,
      loan_date: '2024-01-01',
      loan_type: 'standard',
      auto_repayment: 1, // פירעון מחזורי מופעל
      repayment_amount: 1000,
      repayment_day: 1,
      repayment_frequency: 'monthly',
      is_recurring: 0,
      notes: '',
    })

    // יצירת 3 פירעונות ללא מספור (מדמה פירעונות ישנים)
    const repayment1 = await repaymentsService.create({
      loan_id: loan.lastInsertRowid,
      amount: 1000,
      payment_date: '2024-01-01',
    })

    const repayment2 = await repaymentsService.create({
      loan_id: loan.lastInsertRowid,
      amount: 1000,
      payment_date: '2024-02-01',
    })

    const repayment3 = await repaymentsService.create({
      loan_id: loan.lastInsertRowid,
      amount: 1000,
      payment_date: '2024-03-01',
    })

    // אימות שאין מספרים לפני המיגרציה
    const beforeMigration = await repaymentsService.getByLoan(loan.lastInsertRowid)
    expect(beforeMigration).toHaveLength(3)
    beforeMigration.forEach((r) => {
      expect(r.recurring_repayment_number).toBeUndefined()
    })

    // הרצת המיגרציה
    const result = await migrateRecurringRepaymentNumbers()

    console.log(`[TEST] Migration result: ${result.migrated} migrated, ${result.skipped} skipped`)

    // אימות שהמיגרציה דיווחה על 3 פירעונות שמוגרו
    expect(result.migrated).toBe(3)
    expect(result.skipped).toBe(0)

    // ✅ האימות החשוב: לקרוא מהנתונים בפועל ולוודא שהמספרים נכתבו
    const afterMigration = await repaymentsService.getByLoan(loan.lastInsertRowid)
    expect(afterMigration).toHaveLength(3)

    // מיון לפי תאריך כדי לבדוק את המספור
    const sorted = afterMigration.sort(
      (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    )

    // בדיקה שכל פירעון קיבל מספר נכון
    sorted.forEach((r, i) => {
      expect(r.is_recurring).toBe(1)
      expect(r.recurring_repayment_number).toBe(i + 1)
      expect(r.recurring_repayment_count).toBeGreaterThan(0)
    })

    console.log('[TEST] ✅ כל הפירעונות תויגו נכון!')
  })

  it('לא צריך לשנות פירעונות שכבר מסומנים', async () => {
    // יצירת לווה
    const borrower = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0509876543',
    })

    // יצירת הלוואה
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 5000,
      loan_date: '2024-01-01',
      loan_type: 'standard',
      auto_repayment: 1,
      repayment_amount: 500,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      is_recurring: 0,
      notes: '',
    })

    // יצירת פירעון שכבר מסומן
    await repaymentsService.create({
      loan_id: loan.lastInsertRowid,
      amount: 500,
      payment_date: '2024-01-15',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10,
    })

    // הרצת המיגרציה
    const result = await migrateRecurringRepaymentNumbers()

    // בדיקה שהמיגרציה דילגה על הפירעון
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)

    // בדיקה שהנתונים לא השתנו
    const repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
    expect(repayments[0].recurring_repayment_number).toBe(1)
    expect(repayments[0].recurring_repayment_count).toBe(10)
  })

  it('צריך לטפל נכון בהלוואה ללא פירעון מחזורי', async () => {
    // יצירת לווה
    const borrower = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0507654321',
    })

    // יצירת הלוואה רגילה (ללא פירעון מחזורי)
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 3000,
      loan_date: '2024-01-01',
      loan_type: 'standard',
      auto_repayment: 0, // ללא פירעון מחזורי
      is_recurring: 0,
      notes: '',
    })

    // יצירת פירעון ידני
    await repaymentsService.create({
      loan_id: loan.lastInsertRowid,
      amount: 1000,
      payment_date: '2024-01-15',
    })

    // הרצת המיגרציה
    const result = await migrateRecurringRepaymentNumbers()

    // המיגרציה לא צריכה לגעת בהלוואה הזו
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(0)

    // הפירעון צריך להישאר ללא תיוג
    const repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
    expect(repayments[0].recurring_repayment_number).toBeUndefined()
  })
})
