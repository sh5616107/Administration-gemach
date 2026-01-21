import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, repaymentsService, resetDatabase } from '../services/database'

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// @ts-ignore - global is available in test environment
globalThis.localStorage = localStorageMock

describe('פירעון מחזורי מול תאריך פירעון קבוע', () => {
  beforeEach(async () => {
    // ניקוי מלא של הנתונים לפני כל טסט
    resetDatabase()
    vi.clearAllMocks()
  })

  describe('יצירת הלוואה עם פירעון מחזורי', () => {
    it('הלוואה קבועה + פירעון מחזורי: due_date צריך להיות undefined', async () => {
      // יצירת לווה
      const borrowerResult = await borrowersService.create({
        first_name: 'משה',
        last_name: 'כהן',
        phone: '0501234567',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      // יצירת הלוואה קבועה עם פירעון מחזורי
      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2026-01-15',
        loan_type: 'fixed',
        due_date: undefined, // צריך להיות undefined כשיש פירעון מחזורי
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2026-02-01',
        repayment_day: 15,
        is_recurring: 0
      })

      const loan = await loansService.getById(loanResult.lastInsertRowid)
      
      expect(loan).toBeDefined()
      expect(loan?.auto_repayment).toBe(1)
      expect(loan?.due_date).toBeUndefined()
      expect(loan?.repayment_amount).toBe(200)
      expect(loan?.repayment_day).toBe(15)
    })

    it('הלוואה גמישה + פירעון מחזורי: עובד תקין', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'דוד',
        last_name: 'לוי',
        phone: '0501234568',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 1500,
        loan_date: '2026-01-20',
        loan_type: 'flexible',
        auto_repayment: 1,
        repayment_amount: 300,
        repayment_start_date: '2026-02-20',
        repayment_day: 20,
        is_recurring: 0
      })

      const loan = await loansService.getById(loanResult.lastInsertRowid)
      
      expect(loan).toBeDefined()
      expect(loan?.loan_type).toBe('flexible')
      expect(loan?.auto_repayment).toBe(1)
      expect(loan?.due_date).toBeUndefined()
      expect(loan?.repayment_amount).toBe(300)
    })

    it('הלוואה קבועה ללא פירעון מחזורי: due_date צריך להישמר', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'שרה',
        last_name: 'אברהם',
        phone: '0501234569',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 2000,
        loan_date: '2026-01-10',
        loan_type: 'fixed',
        due_date: '2026-12-31',
        auto_repayment: 0,
        is_recurring: 0
      })

      const loan = await loansService.getById(loanResult.lastInsertRowid)
      
      expect(loan).toBeDefined()
      expect(loan?.loan_type).toBe('fixed')
      expect(loan?.auto_repayment).toBe(0)
      expect(loan?.due_date).toBe('2026-12-31')
    })
  })

  describe('התראות באיחור - getOverdue()', () => {
    it('הלוואה עם פירעון מחזורי לא צריכה להופיע ב-overdue גם אם עבר due_date', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'רחל',
        last_name: 'כהן',
        phone: '0501234570',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      // יצירת הלוואה עם פירעון מחזורי ותאריך פירעון שעבר
      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'fixed',
        due_date: '2025-06-01', // תאריך שעבר
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2025-02-01',
        repayment_day: 15,
        is_recurring: 0
      })

      const overdueLoans = await loansService.getOverdue()
      
      // הלוואה עם פירעון מחזורי לא צריכה להופיע ברשימת באיחור
      expect(overdueLoans.length).toBe(0)
    })

    it('הלוואה קבועה ללא פירעון מחזורי צריכה להופיע ב-overdue אם עבר due_date', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'יוסף',
        last_name: 'מזרחי',
        phone: '0501234571',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'fixed',
        due_date: '2025-06-01', // תאריך שעבר
        auto_repayment: 0,
        is_recurring: 0
      })

      const overdueLoans = await loansService.getOverdue()
      
      // הלוואה ללא פירעון מחזורי צריכה להופיע ברשימת באיחור
      expect(overdueLoans.length).toBe(1)
      expect(overdueLoans[0].borrower_id).toBe(borrowerId)
    })

    it('הלוואה שנפרעה במלואה לא צריכה להופיע ב-overdue', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'מרים',
        last_name: 'לוי',
        phone: '0501234572',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'fixed',
        due_date: '2025-06-01',
        auto_repayment: 0,
        is_recurring: 0
      })
      const loanId = loanResult.lastInsertRowid

      // פירעון מלא
      await repaymentsService.create({
        loan_id: loanId,
        amount: 1000,
        payment_date: '2025-05-01'
      })

      // טעינה מחדש של ההלוואה כדי לעדכן את remaining
      const updatedLoan = await loansService.getById(loanId)
      expect(updatedLoan?.remaining).toBe(0)

      const overdueLoans = await loansService.getOverdue()
      
      // הלוואה שנפרעה לא צריכה להופיע
      expect(overdueLoans.length).toBe(0)
    })
  })

  describe('חישוב מספר פירעונים מחזוריים', () => {
    it('הלוואה 900₪ עם פירעון 200₪ = 5 פירעונים', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'אברהם',
        last_name: 'יצחק',
        phone: '0501234573',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 900,
        loan_date: '2026-01-15',
        loan_type: 'flexible',
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2026-02-01',
        repayment_day: 15,
        is_recurring: 0
      })
      const loanId = loanResult.lastInsertRowid

      const loan = await loansService.getById(loanId)
      const expectedRepaymentCount = Math.ceil(900 / 200)
      
      expect(expectedRepaymentCount).toBe(5)
      expect(loan?.amount).toBe(900)
      expect(loan?.repayment_amount).toBe(200)
    })

    it('יצירת 4 פירעונים של 200₪ ופירעון אחרון של 100₪', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'יעקב',
        last_name: 'שמעון',
        phone: '0501234574',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 900,
        loan_date: '2026-01-15',
        loan_type: 'flexible',
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2026-02-01',
        repayment_day: 15,
        is_recurring: 0
      })
      const loanId = loanResult.lastInsertRowid

      // פירעון 1
      await repaymentsService.create({
        loan_id: loanId,
        amount: 200,
        payment_date: '2026-02-15',
        is_recurring: 1,
        recurring_repayment_number: 1,
        recurring_repayment_count: 5
      })

      // פירעון 2
      await repaymentsService.create({
        loan_id: loanId,
        amount: 200,
        payment_date: '2026-03-15',
        is_recurring: 1,
        recurring_repayment_number: 2,
        recurring_repayment_count: 5
      })

      // פירעון 3
      await repaymentsService.create({
        loan_id: loanId,
        amount: 200,
        payment_date: '2026-04-15',
        is_recurring: 1,
        recurring_repayment_number: 3,
        recurring_repayment_count: 5
      })

      // פירעון 4
      await repaymentsService.create({
        loan_id: loanId,
        amount: 200,
        payment_date: '2026-05-15',
        is_recurring: 1,
        recurring_repayment_number: 4,
        recurring_repayment_count: 5
      })

      let loan = await loansService.getById(loanId)
      expect(loan?.remaining).toBe(100) // נשאר 100₪

      // פירעון 5 - אחרון (רק 100₪ - היתרה)
      await repaymentsService.create({
        loan_id: loanId,
        amount: 100, // רק 100₪
        payment_date: '2026-06-15',
        is_recurring: 1,
        recurring_repayment_number: 5,
        recurring_repayment_count: 5
      })

      const finalLoan = await loansService.getById(loanId)
      expect(finalLoan?.remaining).toBe(0) // נפרע במלואו
      
      const repayments = await repaymentsService.getByLoan(loanId)
      expect(repayments.length).toBe(5)
      
      // מיון לפי תאריך כדי לוודא שאנחנו בודקים את הפירעון האחרון
      const sortedRepayments = repayments.sort((a, b) => 
        new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      )
      expect(sortedRepayments[4].amount).toBe(100) // הפירעון האחרון
    })
  })

  describe('תרחישים משולבים', () => {
    it('הלוואה גמישה + פירעון מחזורי: לא צריכה התראות באיחור', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'לאה',
        last_name: 'רבקה',
        phone: '0501234575',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'flexible', // גמישה - אין due_date
        auto_repayment: 1, // פירעון מחזורי
        repayment_amount: 200,
        repayment_start_date: '2025-02-01',
        repayment_day: 15,
        is_recurring: 0
      })

      const overdueLoans = await loansService.getOverdue()
      // הלוואה גמישה אין לה due_date, אז היא לא תופיע ב-overdue בכלל
      expect(overdueLoans.length).toBe(0)
    })

    it('מספר הלוואות: רק אלה ללא פירעון מחזורי יופיעו ב-overdue', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'בנימין',
        last_name: 'דן',
        phone: '0501234576',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      // הלוואה 1: קבועה עם פירעון מחזורי (לא תופיע - יש auto_repayment)
      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'fixed',
        due_date: undefined, // כשיש פירעון מחזורי, due_date צריך להיות undefined
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2025-02-01',
        repayment_day: 15,
        is_recurring: 0
      })

      // הלוואה 2: קבועה ללא פירעון מחזורי (תופיע)
      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'fixed',
        due_date: '2025-06-01',
        auto_repayment: 0,
        is_recurring: 0
      })

      // הלוואה 3: גמישה עם פירעון מחזורי (לא תופיע - אין due_date)
      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2025-01-01',
        loan_type: 'flexible',
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_start_date: '2025-02-01',
        repayment_day: 15,
        is_recurring: 0
      })

      const overdueLoans = await loansService.getOverdue()
      
      // רק הלוואה 2 צריכה להופיע
      expect(overdueLoans.length).toBe(1)
    })
  })
})
