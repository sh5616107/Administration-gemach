import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loansService, borrowersService, db } from '../services/database'
import { createRecurringLoan } from '../services/scheduler'

// Mock the database and services
vi.mock('../services/database', () => ({
  db: {
    run: vi.fn(),
    query: vi.fn(),
  },
  loansService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  borrowersService: {
    getAll: vi.fn(),
  },
}))

describe('Recurring Loans Flow - Complete Cycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create loan 2/12 from loan 1/12 with correct numbering', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20'))

    // הלוואה ראשונה: 1/12
    const originalLoan = {
      id: 1,
      borrower_id: 1,
      amount: 5000,
      loan_date: '2026-01-20',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 11, // 12-1=11
      recurring_day: 20,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      status: 'active',
      guarantor1_id: 10,
      guarantor2_id: 20,
      auto_repayment: 0,
    }

    vi.mocked(loansService.getById).mockResolvedValue(originalLoan as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 2 })
    vi.mocked(loansService.update).mockResolvedValue()

    // יצירת הלוואה שנייה
    await createRecurringLoan(1)

    // בדיקה שההלוואה החדשה נוצרה עם הפרמטרים הנכונים
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        borrower_id: 1,
        amount: 5000,
        loan_date: '2026-02-20',
        is_recurring: 1,
        recurring_months: 10, // 11-1=10
        recurring_day: 20,
        recurring_loan_number: 2, // 1+1=2
        recurring_loan_count: 12, // נשאר אותו דבר
        guarantor1_id: 10,
        guarantor2_id: 20,
      })
    )

    // בדיקה שההלוואה המקורית עודכנה
    expect(loansService.update).toHaveBeenCalledWith(1, {
      recurring_months: 10, // 11-1=10
    })
  })

  it('should create loan 3/12 from loan 2/12 with correct numbering', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-20'))

    // הלוואה שנייה: 2/12
    const secondLoan = {
      id: 2,
      borrower_id: 1,
      amount: 5000,
      loan_date: '2026-02-20',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 10, // 12-2=10
      recurring_day: 20,
      recurring_loan_number: 2,
      recurring_loan_count: 12,
      status: 'active',
      guarantor1_id: 10,
      guarantor2_id: 20,
    }

    vi.mocked(loansService.getById).mockResolvedValue(secondLoan as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 3 })
    vi.mocked(loansService.update).mockResolvedValue()

    // יצירת הלוואה שלישית
    await createRecurringLoan(2)

    // בדיקה שההלוואה השלישית נוצרה עם הפרמטרים הנכונים
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        borrower_id: 1,
        amount: 5000,
        loan_date: '2026-03-20',
        recurring_loan_number: 3, // 2+1=3
        recurring_loan_count: 12, // נשאר אותו דבר
        recurring_months: 9, // 10-1=9
      })
    )

    // בדיקה שההלוואה השנייה עודכנה
    expect(loansService.update).toHaveBeenCalledWith(2, {
      recurring_months: 9, // 10-1=9
    })
  })

  it('should create final loan 12/12 with recurring_months=0', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-20'))

    // הלוואה 11/12
    const eleventhLoan = {
      id: 11,
      borrower_id: 1,
      amount: 5000,
      loan_date: '2026-11-20',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 1, // רק עוד הלוואה אחת
      recurring_day: 20,
      recurring_loan_number: 11,
      recurring_loan_count: 12,
      status: 'active',
    }

    vi.mocked(loansService.getById).mockResolvedValue(eleventhLoan as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 12 })
    vi.mocked(loansService.update).mockResolvedValue()

    // יצירת הלוואה אחרונה
    await createRecurringLoan(11)

    // בדיקה שההלוואה האחרונה נוצרה
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recurring_loan_number: 12, // 11+1=12
        recurring_loan_count: 12,
        recurring_months: 0, // 1-1=0 - זו ההלוואה האחרונה!
      })
    )

    // בדיקה שההלוואה ה-11 עודכנה
    expect(loansService.update).toHaveBeenCalledWith(11, {
      recurring_months: 0,
    })
  })

  it('should NOT create loan 13/12 when recurring_months=0', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-20'))

    // הלוואה 12/12 - האחרונה
    const finalLoan = {
      id: 12,
      borrower_id: 1,
      amount: 5000,
      loan_date: '2026-12-20',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 0, // אין יותר הלוואות ליצור
      recurring_day: 20,
      recurring_loan_number: 12,
      recurring_loan_count: 12,
      status: 'active',
    }

    vi.mocked(loansService.getById).mockResolvedValue(finalLoan as any)

    // ניסיון ליצור הלוואה 13 - לא אמור לקרות
    const result = await createRecurringLoan(12)

    // הפונקציה לא אמורה ליצור הלוואה חדשה
    expect(loansService.create).not.toHaveBeenCalled()
    expect(loansService.update).not.toHaveBeenCalled()
  })

  it('should preserve all loan properties in recurring loans', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20'))

    // הלוואה עם כל הפרטים
    const detailedLoan = {
      id: 1,
      borrower_id: 5,
      amount: 10000,
      loan_date: '2026-01-20',
      loan_type: 'fixed',
      due_date: '2027-01-20',
      is_recurring: 1,
      recurring_months: 5,
      recurring_day: 20,
      recurring_loan_number: 1,
      recurring_loan_count: 6,
      status: 'active',
      guarantor1_id: 100,
      guarantor2_id: 200,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 25,
      repayment_start_date: '2026-01-25',
      notes: 'הלוואה מיוחדת',
    }

    vi.mocked(loansService.getById).mockResolvedValue(detailedLoan as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 2 })
    vi.mocked(loansService.update).mockResolvedValue()

    await createRecurringLoan(1)

    // בדיקה שכל הפרטים הועתקו
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        borrower_id: 5,
        amount: 10000,
        loan_type: 'fixed',
        due_date: '2027-01-20',
        guarantor1_id: 100,
        guarantor2_id: 200,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 25,
        repayment_start_date: '2026-01-25',
      })
    )

    // בדיקה שההערות כוללות התייחסות להלוואה המקורית
    const createCall = vi.mocked(loansService.create).mock.calls[0][0]
    expect(createCall.notes).toContain('הלוואה מחזורית מהלוואה #1')
    expect(createCall.notes).toContain('2/6')
  })

  it('should handle short months correctly (day 31 in February)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-28')) // פברואר - 28 ימים

    const loan = {
      id: 1,
      borrower_id: 1,
      amount: 5000,
      loan_date: '2026-01-31',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 31, // יום 31 - לא קיים בפברואר
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      status: 'active',
    }

    vi.mocked(loansService.getById).mockResolvedValue(loan as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 2 })
    vi.mocked(loansService.update).mockResolvedValue()

    await createRecurringLoan(1)

    // בדיקה שההלוואה נוצרה ב-28 בפברואר (היום האחרון של החודש)
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        loan_date: '2026-02-28',
        recurring_day: 31, // נשאר 31 למרות שהתאריך הוא 28
      })
    )
  })

  it('should create complete 12-month cycle correctly', async () => {
    const loans: any[] = []
    let currentLoanId = 1

    // סימולציה של 12 חודשים
    for (let month = 1; month <= 12; month++) {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(`2026-${String(month).padStart(2, '0')}-20`))

      const currentLoan = {
        id: currentLoanId,
        borrower_id: 1,
        amount: 5000,
        loan_date: `2026-${String(month).padStart(2, '0')}-20`,
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_months: 12 - month, // יורד בכל פעם
        recurring_day: 20,
        recurring_loan_number: month,
        recurring_loan_count: 12,
        status: 'active',
      }

      loans.push(currentLoan)

      if (month < 12) {
        // יצירת הלוואה הבאה
        vi.mocked(loansService.getById).mockResolvedValue(currentLoan as any)
        vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: currentLoanId + 1 })
        vi.mocked(loansService.update).mockResolvedValue()

        await createRecurringLoan(currentLoanId)

        // בדיקה שההלוואה הבאה נוצרה
        expect(loansService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            recurring_loan_number: month + 1,
            recurring_loan_count: 12,
            recurring_months: 12 - month - 1,
          })
        )

        currentLoanId++
      }

      vi.useRealTimers()
    }

    // בדיקה שנוצרו 11 הלוואות (ההלוואה הראשונה נוצרה ידנית)
    expect(loansService.create).toHaveBeenCalledTimes(11)

    // בדיקה שההלוואה האחרונה היא 12/12 עם recurring_months=0
    const lastCall = vi.mocked(loansService.create).mock.calls[10][0]
    expect(lastCall.recurring_loan_number).toBe(12)
    expect(lastCall.recurring_loan_count).toBe(12)
    expect(lastCall.recurring_months).toBe(0)
  })

  it('should handle loan with auto_repayment correctly', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-20'))

    const loanWithAutoRepayment = {
      id: 1,
      borrower_id: 1,
      amount: 12000,
      loan_date: '2026-01-20',
      loan_type: 'flexible',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 20,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 25,
      repayment_start_date: '2026-01-25',
    }

    vi.mocked(loansService.getById).mockResolvedValue(loanWithAutoRepayment as any)
    vi.mocked(loansService.create).mockResolvedValue({ lastInsertRowid: 2 })
    vi.mocked(loansService.update).mockResolvedValue()

    await createRecurringLoan(1)

    // בדיקה שהפירעון האוטומטי הועתק
    expect(loansService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 25,
        repayment_start_date: '2026-01-25',
      })
    )
  })
})
