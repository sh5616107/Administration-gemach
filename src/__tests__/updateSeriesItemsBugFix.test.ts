/**
 * Test: תיקון באג 1 ו-2 - updateSeriesItems ו-"סיום סדרה מוקדם"
 * 
 * בדיקת התנהגות אמיתית של updateSeriesItems כאשר:
 * - כל הרשומות במשפחה נוצרו דרך הזרימה האמיתית (createRecurringLoan/createRecurringDeposit)
 * - כל הרשומות מתוארכות ל"היום" בזמן היצירה (לא תאריכים עתידיים ידניים)
 * 
 * זה בדיוק התרחיש שבו הקוד המקורי נכשל - כל הרשומות היו "עבר",
 * ולכן futureItems היה ריק, ו-updateSeriesItems לא עשה כלום.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService, db } from '../services/database'
import { createRecurringLoan, createRecurringDeposit, autoCreateRecurringLoans, autoCreateRecurringDeposits } from '../services/scheduler'
import { recurringItemsService, ItemType } from '../services/recurringItemsService'

describe('תיקון באג 1 ו-2: updateSeriesItems + סיום סדרה מוקדם', () => {
  beforeEach(() => {
    resetDatabase()
    vi.useFakeTimers()
  })

  describe('🔴 באג 1: updateSeriesItems עם הלוואות שנוצרו דרך createRecurringLoan', () => {
    it('should update the latest loan in series even if all dates are past', async () => {
      // יצירת לווה
      const borrowerId = crypto.randomUUID()
      await borrowersService.create({
        id: borrowerId,
        name: 'לווה לבדיקה',
        id_number: '123456789',
        phone: '0501234567',
        address: '',
        email: '',
        notes: ''
      })

      // יצירת הלוואה מחזורית ראשונה (חודש 1)
      vi.setSystemTime(new Date('2026-01-05'))
      const loan1 = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: new Date().toISOString().split('T')[0],
        status: 'active',
        balance: 1000,
        is_recurring: 1,
        recurring_day: 5,
        recurring_months: 10,
        recurring_loan_number: 1,
        recurring_loan_count: 11,
        recurring_series_id: crypto.randomUUID()
      } as any)
      const loanId1 = loan1.lastInsertRowid

      // יצירת הלוואה שנייה דרך createRecurringLoan (חודש 2)
      vi.setSystemTime(new Date('2026-02-05'))
      const success2 = await createRecurringLoan(loanId1)
      expect(success2).toBe(true)

      // יצירת הלוואה שלישית (חודש 3)
      vi.setSystemTime(new Date('2026-03-05'))
      const success3 = await createRecurringLoan(loanId1)
      expect(success3).toBe(true)

      // מעבר להיום (אוגוסט 2026) - כל 3 ההלוואות הן "עבר"
      vi.setSystemTime(new Date('2026-08-09'))

      // קריאת כל ההלוואות במשפחה
      const allLoans = await loansService.getAll()
      const familyLoans = allLoans.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
      
      console.log('LOAN DATES IN FAMILY:', familyLoans.map(l => ({
        num: l.recurring_loan_number,
        date: l.loan_date
      })))

      expect(familyLoans).toHaveLength(3) // וידוא שיש 3 הלוואות

      // ניסיון לעדכן את הסדרה לסכום חדש
      const result = await recurringItemsService.updateSeriesItems(
        loanId1,
        'loan' as ItemType,
        {
          recurring_amount: 1500,
          recurring_day: 5,
          recurring_months: 8
        }
      )

      console.log('updateSeriesItems result:', result)

      // ✅ תיקון באג 1: updatedCount צריך להיות > 0
      expect(result.success).toBe(true)
      expect(result.updatedCount).toBeGreaterThan(0)

      // וידוא שההלוואה האחרונה בסדרה (לפי recurring_loan_number) קיבלה את הערך החדש
      const updatedLoans = await loansService.getAll()
      const latestLoan = updatedLoans
        .filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
        .sort((a, b) => (b.recurring_loan_number || 1) - (a.recurring_loan_number || 1))[0]

      console.log('LATEST LOAN after update:', {
        num: latestLoan.recurring_loan_number,
        amount: latestLoan.amount,
        recurring_months: latestLoan.recurring_months
      })

      expect(latestLoan.amount).toBe(1500) // הסכום החדש
      expect(latestLoan.recurring_months).toBe(8) // החודשים החדשים
    })

    it('should update future loans if they exist', async () => {
      const borrowerId = crypto.randomUUID()
      await borrowersService.create({
        id: borrowerId,
        name: 'לווה מעורב',
        id_number: '987654321',
        phone: '0507654321',
        address: '',
        email: '',
        notes: ''
      })

      // יצירת הלוואה בעבר
      vi.setSystemTime(new Date('2026-01-05'))
      const loan1 = await loansService.create({
        borrower_id: borrowerId,
        amount: 2000,
        loan_date: new Date().toISOString().split('T')[0],
        status: 'active',
        balance: 2000,
        is_recurring: 1,
        recurring_day: 5,
        recurring_months: 10,
        recurring_loan_number: 1,
        recurring_loan_count: 3,
        recurring_series_id: crypto.randomUUID()
      } as any)
      const loanId1 = loan1.lastInsertRowid

      // יצירת הלוואה בעתיד
      vi.setSystemTime(new Date('2026-09-05'))
      await createRecurringLoan(loanId1)

      // חזרה להיום
      vi.setSystemTime(new Date('2026-08-09'))

      // עדכון הסדרה
      const result = await recurringItemsService.updateSeriesItems(
        loanId1,
        'loan' as ItemType,
        {
          recurring_amount: 2500
        }
      )

      expect(result.success).toBe(true)
      expect(result.updatedCount).toBeGreaterThan(0)

      // וידוא: ההלוואה העתידית והאחרונה קיבלו את הערך החדש
      const allLoans = await loansService.getAll()
      const futureLoans = allLoans.filter(l => 
        l.borrower_id === borrowerId && 
        l.loan_date > '2026-08-09'
      )

      expect(futureLoans.length).toBeGreaterThan(0)
      futureLoans.forEach(loan => {
        expect(loan.amount).toBe(2500)
      })
    })
  })

  describe('🔴 באג 2: כפתור "סיום סדרה מוקדם" (תלוי בתיקון באג 1)', () => {
    it('should stop series creation after handleEndSeriesEarly', async () => {
      const borrowerId = crypto.randomUUID()
      await borrowersService.create({
        id: borrowerId,
        name: 'לווה לעצירה',
        id_number: '111222333',
        phone: '0501112233',
        address: '',
        email: '',
        notes: ''
      })

      // יצירת הלוואה מחזורית
      vi.setSystemTime(new Date('2026-01-05'))
      const loan1 = await loansService.create({
        borrower_id: borrowerId,
        amount: 3000,
        loan_date: new Date().toISOString().split('T')[0],
        status: 'active',
        balance: 3000,
        is_recurring: 1,
        recurring_day: 5,
        recurring_months: 10,
        recurring_loan_number: 1,
        recurring_loan_count: 11,
        recurring_series_id: crypto.randomUUID()
      } as any)
      const loanId1 = loan1.lastInsertRowid

      // יצירת הלוואה שנייה
      vi.setSystemTime(new Date('2026-02-05'))
      await createRecurringLoan(loanId1)

      // קריאת ההלוואה האחרונה לפני "סיום סדרה"
      let allLoans = await loansService.getAll()
      let latestLoan = allLoans
        .filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
        .sort((a, b) => (b.recurring_loan_number || 1) - (a.recurring_loan_number || 1))[0]

      console.log('LATEST LOAN recurring_months לפני "סיום סדרה":', latestLoan.recurring_months)

      // סימולציה של לחיצה על "סיום סדרה מוקדם" (כמו handleEndSeriesEarly)
      const result = await recurringItemsService.updateSeriesItems(
        loanId1,
        'loan' as ItemType,
        {
          recurring_months: 0
        }
      )

      console.log('handleEndSeriesEarly() result:', result)

      expect(result.success).toBe(true)
      expect(result.updatedCount).toBeGreaterThan(0) // ✅ תיקון באג 1 פתר את זה

      // קריאת ההלוואה האחרונה אחרי "סיום סדרה"
      allLoans = await loansService.getAll()
      latestLoan = allLoans
        .filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
        .sort((a, b) => (b.recurring_loan_number || 1) - (a.recurring_loan_number || 1))[0]

      console.log('LATEST LOAN recurring_months אחרי "סיום סדרה":', latestLoan.recurring_months)

      expect(latestLoan.recurring_months).toBe(0) // ✅ אישור שהערך השתנה

      // ניסיון ליצור הלוואה נוספת בחודש הבא
      vi.setSystemTime(new Date('2026-03-05'))
      await autoCreateRecurringLoans()

      // וידוא שלא נוצרה הלוואה נוספת
      allLoans = await loansService.getAll()
      const familyLoans = allLoans.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)

      console.log('המתזמן עדיין ייצור הלוואה הבאה:', familyLoans.length > 2 ? 'כן' : 'לא')

      expect(familyLoans).toHaveLength(2) // רק 2 הלוואות (לא 3)
    })
  })

  describe('🔴 באג 1: updateSeriesItems עם הפקדות שנוצרו דרך createRecurringDeposit', () => {
    it('should update the latest deposit in series even if all dates are past', async () => {
      // יצירת מפקיד
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['יוסי', 'כהן', '0501234567', '123456789', 'תל אביב', 'yossi@example.com', '']
      )

      // יצירת הפקדה מחזורית ראשונה (חודש 1)
      vi.setSystemTime(new Date('2026-01-05'))
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 5000, new Date().toISOString().split('T')[0], 'monthly', '2027-01-05', 1, 5, 10, 1, 11, 'הפקדה מחזורית', 'active', 'cash', '']
      )

      const deposits1 = await db.query('SELECT * FROM deposits') as any[]
      const depositId1 = deposits1[0].id

      // יצירת הפקדה שנייה דרך createRecurringDeposit (חודש 2)
      vi.setSystemTime(new Date('2026-02-05'))
      const success2 = await createRecurringDeposit(depositId1)
      expect(success2).toBe(true)

      // יצירת הפקדה שלישית (חודש 3)
      vi.setSystemTime(new Date('2026-03-05'))
      
      // ✅ חשוב: createRecurringDeposit יכול לקבל את ה-ID של כל הפקדה במשפחה
      // הפונקציה תמצא את האחרונה בעצמה
      const success3 = await createRecurringDeposit(depositId1)
      expect(success3).toBe(true)

      // מעבר להיום (אוגוסט 2026) - כל 3 ההפקדות הן "עבר"
      vi.setSystemTime(new Date('2026-08-09'))

      // קריאת כל ההפקדות במשפחה
      const allDeposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ? AND is_recurring = 1', [1]) as any[]
      
      console.log('DEPOSIT DATES IN FAMILY:', allDeposits.map(d => ({
        num: d.recurring_deposit_number,
        date: d.deposit_date
      })))

      expect(allDeposits).toHaveLength(3)

      // ניסיון לעדכן את הסדרה לסכום חדש
      const result = await recurringItemsService.updateSeriesItems(
        depositId1,
        'deposit' as ItemType,
        {
          recurring_amount: 6000,
          recurring_day: 5,
          recurring_months: 8
        }
      )

      console.log('updateSeriesItems result:', result)

      // ✅ תיקון באג 1: updatedCount צריך להיות > 0
      expect(result.success).toBe(true)
      expect(result.updatedCount).toBeGreaterThan(0)

      // וידוא שההפקדה האחרונה בסדרה קיבלה את הערך החדש
      const updatedDeposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ? AND is_recurring = 1', [1]) as any[]
      const latestDeposit = updatedDeposits
        .sort((a, b) => (b.recurring_deposit_number || 1) - (a.recurring_deposit_number || 1))[0]

      console.log('LATEST DEPOSIT after update:', {
        num: latestDeposit.recurring_deposit_number,
        amount: latestDeposit.amount,
        recurring_months: latestDeposit.recurring_months
      })

      expect(latestDeposit.amount).toBe(6000)
      expect(latestDeposit.recurring_months).toBe(8)
    })
  })
})
