/**
 * Test: תיקון באג 4 - הלוואה/הפקדה אחרונה שנמחקה יכולה לתקוע סדרה
 * 
 * הבעיה:
 * newerLoanExists/newerDepositExists ב-scheduler.ts סורקים את allLoansIncludingDeleted/allDepositsIncludingDeleted
 * בלי לסנן !is_deleted.
 * 
 * אם ההלוואה/הפקדה האחרונה בסדרה נמחקת (soft-delete), הבדיקות האלה עדיין "רואות" אותה
 * וחושבות שכבר יש רשומה חדשה יותר → אף אחד לא ייצור תחליף → הסדרה נתקעת.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService, db } from '../services/database'
import { createRecurringLoan, autoCreateRecurringLoans, autoCreateRecurringDeposits } from '../services/scheduler'

describe('תיקון באג 4: soft-delete של רשומה אחרונה', () => {
  beforeEach(() => {
    resetDatabase()
    vi.useFakeTimers()
  })

  describe('הלוואות מחזוריות', () => {
    it('should create replacement loan after soft-deleting the latest loan', async () => {
      const borrowerId = crypto.randomUUID()
      await borrowersService.create({
        id: borrowerId,
        name: 'לווה למחיקה',
        id_number: '123456789',
        phone: '0501234567',
        address: '',
        email: '',
        notes: ''
      })

      // יצירת הלוואה מחזורית (חודש 1)
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

      // יצירת הלוואה שנייה (חודש 2)
      vi.setSystemTime(new Date('2026-02-05'))
      const success2 = await createRecurringLoan(loanId1)
      expect(success2).toBe(true)

      const allLoans1 = await loansService.getAll()
      const familyLoans1 = allLoans1.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
      const latestLoan = familyLoans1.sort((a, b) => 
        (b.recurring_loan_number || 1) - (a.recurring_loan_number || 1)
      )[0]

      console.log('=== לפני מחיקה ===')
      console.log('Latest loan:', {
        id: latestLoan.id,
        recurring_loan_number: latestLoan.recurring_loan_number,
        date: latestLoan.loan_date
      })

      // מחיקת ההלוואה האחרונה (soft-delete)
      await loansService.delete(latestLoan.id)

      // וידוא שההלוואה נמחקה
      const allLoans2 = await loansService.getAll()
      const familyLoans2 = allLoans2.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
      
      console.log('=== אחרי מחיקה ===')
      console.log('Visible loans:', familyLoans2.length)
      expect(familyLoans2).toHaveLength(1) // רק ההלוואה הראשונה נראית

      // ניסיון ליצור הלוואה בחודש הבא
      vi.setSystemTime(new Date('2026-03-05'))
      await autoCreateRecurringLoans()

      const allLoans3 = await loansService.getAll()
      const familyLoans3 = allLoans3.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)

      console.log('=== אחרי הרצת המתזמן ===')
      console.log('Total visible loans:', familyLoans3.length)
      familyLoans3.forEach(l => {
        console.log(`  Loan #${l.recurring_loan_number}: date=${l.loan_date}`)
      })

      // ✅ תיקון באג 4: צריכה להיווצר הלוואה חלופית (סה"כ 2 הלוואות)
      expect(familyLoans3.length).toBeGreaterThanOrEqual(2)

      // וידוא שההלוואה החדשה היא חודש 3
      const marchLoans = familyLoans3.filter(l => l.loan_date >= '2026-03-01' && l.loan_date <= '2026-03-31')
      expect(marchLoans).toHaveLength(1)
    })
  })

  describe('הפקדות מחזוריות', () => {
    it('should create replacement deposit after soft-deleting the latest deposit', async () => {
      // יצירת מפקיד
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['שרה', 'כהן', '0504445556', '444555666', 'באר שבע', 'sarah@example.com', '']
      )

      // יצירת הפקדה מחזורית (חודש 1)
      vi.setSystemTime(new Date('2026-01-05'))
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 5000, '2026-01-05', 'monthly', '2027-01-05', 1, 5, 11, 1, 12, 'הפקדה מחזורית', 'active', 'cash', '']
      )

      const deposits1 = await db.query('SELECT * FROM deposits WHERE depositor_id = 1') as any[]
      const depositId1 = deposits1[0].id

      // יצירת הפקדה שנייה (חודש 2)
      vi.setSystemTime(new Date('2026-02-05'))
      await autoCreateRecurringDeposits()

      const allDeposits1 = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
      const latestDeposit = allDeposits1.sort((a, b) => 
        (b.recurring_deposit_number || 1) - (a.recurring_deposit_number || 1)
      )[0]

      console.log('=== לפני מחיקה ===')
      console.log('Latest deposit:', {
        id: latestDeposit.id,
        recurring_deposit_number: latestDeposit.recurring_deposit_number,
        date: latestDeposit.deposit_date
      })

      // מחיקת ההפקדה האחרונה (soft-delete)
      await db.run('DELETE FROM deposits WHERE id = ?', [latestDeposit.id])

      // וידוא שההפקדה נמחקה
      const allDeposits2 = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
      
      console.log('=== אחרי מחיקה ===')
      console.log('Visible deposits:', allDeposits2.length)
      expect(allDeposits2).toHaveLength(1)

      // ניסיון ליצור הפקדה בחודש הבא
      vi.setSystemTime(new Date('2026-03-05'))
      await autoCreateRecurringDeposits()

      const allDeposits3 = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]

      console.log('=== אחרי הרצת המתזמן ===')
      console.log('Total visible deposits:', allDeposits3.length)
      allDeposits3.forEach(d => {
        console.log(`  Deposit #${d.recurring_deposit_number}: date=${d.deposit_date}`)
      })

      // ✅ תיקון באג 4: צריכה להיווצר הפקדה חלופית (סה"כ 2 הפקדות)
      expect(allDeposits3.length).toBeGreaterThanOrEqual(2)

      // וידוא שההפקדה החדשה היא חודש 3
      const marchDeposits = allDeposits3.filter(d => d.deposit_date >= '2026-03-01' && d.deposit_date <= '2026-03-31')
      expect(marchDeposits).toHaveLength(1)
    })
  })
})
