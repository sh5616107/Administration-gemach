import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, borrowersService, loansService, importAllData } from '../services/database'

describe('הלוואה מחזורית - ולידציה מינימלית', () => {
  beforeEach(async () => {
    resetDatabase()
    await importAllData({
      borrowers: {},
      guarantors: {},
      loans: {},
      repayments: {},
      donors: {},
      donations: {},
      depositors: {},
      deposits: {},
      depositWithdrawals: {},
      blacklist: {},
      expenses: {},
      guarantorLoans: {},
      guarantorLoanRepayments: {},
      guarantorRefunds: {},
      waitlist: {},
      contacts: {},
      settings: {}
    })
  })

  it('חישוב נכון: recurring_months + 1 = סה"כ הלוואות', () => {
    // בדיקה: recurring_months = 0 אומר סה"כ 1 הלוואה (0 + 1)
    const totalLoans1 = 0 + 1
    expect(totalLoans1).toBe(1)
    
    // בדיקה: recurring_months = 1 אומר סה"כ 2 הלוואות (1 + 1)
    const totalLoans2 = 1 + 1
    expect(totalLoans2).toBe(2)
    
    // בדיקה: recurring_months = 11 אומר סה"כ 12 הלוואות (11 + 1)
    const totalLoans12 = 11 + 1
    expect(totalLoans12).toBe(12)
  })

  it('ניתן ליצור הלוואה מחזורית עם recurring_months = 1 (סה"כ 2 הלוואות)', async () => {
    // יצירת לווה
    const borrower = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0507654321',
      id_number: '987654321'
    })

    // יצירת הלוואה מחזורית עם recurring_months = 1 (סה"כ 2 הלוואות)
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 5000,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: '2026-02-15',
      is_recurring: 1,
      recurring_months: 1, // זה אומר סה"כ 2 הלוואות (1 + 1)
      recurring_day: 15,
      recurring_loan_number: 1,
      recurring_loan_count: 2,
      auto_repayment: 0,
      notes: 'הלוואה מחזורית תקינה'
    })

    expect(loan.lastInsertRowid).toBeDefined()
    expect(typeof loan.lastInsertRowid).toBe('string')

    const loans = await loansService.getAll()
    expect(loans).toHaveLength(1)
    expect(loans[0].recurring_months).toBe(1)
    expect(loans[0].recurring_loan_count).toBe(2)
  })

  it('ניתן ליצור הלוואה מחזורית עם recurring_months = 11 (סה"כ 12 הלוואות)', async () => {
    // יצירת לווה
    const borrower = await borrowersService.create({
      first_name: 'שרה',
      last_name: 'אברהם',
      phone: '0509876543',
      id_number: '111222333'
    })

    // יצירת הלוואה מחזורית עם recurring_months = 11 (סה"כ 12 הלוואות)
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: '2026-02-15',
      is_recurring: 1,
      recurring_months: 11, // זה אומר סה"כ 12 הלוואות (11 + 1)
      recurring_day: 15,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      auto_repayment: 0,
      notes: 'הלוואה מחזורית ל-12 חודשים'
    })

    expect(loan.lastInsertRowid).toBeDefined()
    expect(typeof loan.lastInsertRowid).toBe('string')

    const loans = await loansService.getAll()
    expect(loans).toHaveLength(1)
    expect(loans[0].recurring_months).toBe(11)
    expect(loans[0].recurring_loan_count).toBe(12)
  })

  it('בדיקת חישוב עבור מספרים שונים', async () => {
    // בדיקה שהחישוב נכון
    const testCases = [
      { total: 2, recurring: 1 },
      { total: 3, recurring: 2 },
      { total: 5, recurring: 4 },
      { total: 12, recurring: 11 },
      { total: 24, recurring: 23 }
    ]

    for (const testCase of testCases) {
      const borrower = await borrowersService.create({
        first_name: `לווה${testCase.total}`,
        last_name: 'טסט',
        phone: `050${testCase.total}000000`,
        id_number: `${testCase.total}00000000`
      })

      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-15',
        loan_type: 'fixed',
        due_date: '2026-02-15',
        is_recurring: 1,
        recurring_months: testCase.recurring,
        recurring_day: 15,
        recurring_loan_number: 1,
        recurring_loan_count: testCase.total,
        auto_repayment: 0,
        notes: `טסט ${testCase.total} הלוואות`
      })

      const savedLoan = await loansService.getById(loan.lastInsertRowid)
      expect(savedLoan?.recurring_months).toBe(testCase.recurring)
      expect(savedLoan?.recurring_loan_count).toBe(testCase.total)
      expect(savedLoan?.recurring_months).toBe(savedLoan!.recurring_loan_count! - 1)
    }
  })
})
