import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateFundsSystem } from '../services/migrations/fundsMigration'
import { fundsService, resetDatabase } from '../services/database'
import { loadAppData, saveAppData } from '../services/persistence'

describe('Funds Migration', () => {
  beforeEach(async () => {
    // ניקוי מלא
    resetDatabase()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('בדיקה 1: מיגרציה על מסד ריק יוצרת קופת ברירת מחדל', async () => {
    const emptyData = {
      loans: {},
      donations: {},
      deposits: {},
      expenses: {},
      funds: {},
    }
    await saveAppData(emptyData)

    await migrateFundsSystem()

    const allFunds = await fundsService.getAll()
    expect(allFunds.length).toBe(1)
    
    const defaultFund = allFunds[0]
    expect(defaultFund.is_default).toBe(true)
    expect(defaultFund.name).toBe('קופה ראשית')
    expect(defaultFund.is_active).toBe(true)
  })

  it('בדיקה 2: כל ההלוואות מקבלות fund_id', async () => {
    const dataWithLoans = {
      loans: {
        'loan-1': { id: 'loan-1', borrower_id: 'b1', amount: 1000, loan_date: '2026-01-01' },
        'loan-2': { id: 'loan-2', borrower_id: 'b2', amount: 2000, loan_date: '2026-01-02' },
      },
      donations: {},
      deposits: {},
      expenses: {},
      funds: {},
      settings: {},
      borrowers: {},
      guarantors: {},
      repayments: {},
      donors: {},
      depositors: {},
      depositWithdrawals: {},
      blacklist: {},
      guarantorLoans: {},
      guarantorLoanRepayments: {},
      guarantorRefunds: {},
      waitlist: {},
      contacts: {},
      attachments: {},
      auditLog: {},
      feePayments: {},
    }
    await saveAppData(dataWithLoans)

    await migrateFundsSystem()

    const data = await loadAppData()
    expect(data.loans).toBeDefined()
    expect(data.loans['loan-1']).toBeDefined()
    expect(data.loans['loan-1'].fund_id).toBeDefined()
    expect(data.loans['loan-2'].fund_id).toBeDefined()
    
    // שתי ההלוואות צריכות להצביע לאותה קופת ברירת מחדל
    expect(data.loans['loan-1'].fund_id).toBe(data.loans['loan-2'].fund_id)
  })

  it('בדיקה 3: מיגרציה חוזרת לא משנה דבר (אידמפוטנטיות)', async () => {
    const initialData = {
      loans: {
        'loan-1': { id: 'loan-1', borrower_id: 'b1', amount: 1000, loan_date: '2026-01-01' },
      },
      donations: {},
      deposits: {},
      expenses: {},
      funds: {},
    }
    await saveAppData(initialData)

    // ריצה ראשונה
    await migrateFundsSystem()
    const dataAfterFirst = await loadAppData()
    const fundsCountAfterFirst = Object.keys(dataAfterFirst.funds || {}).length

    // ריצה שנייה
    await migrateFundsSystem()
    const dataAfterSecond = await loadAppData()
    const fundsCountAfterSecond = Object.keys(dataAfterSecond.funds || {}).length

    // אותה כמות קופות
    expect(fundsCountAfterSecond).toBe(fundsCountAfterFirst)
    
    // fund_id לא השתנה
    expect(dataAfterSecond.loans['loan-1'].fund_id).toBe(dataAfterFirst.loans['loan-1'].fund_id)
  })

  it('בדיקה 4: תרומות, הפקדות והוצאות מקבלות fund_id', async () => {
    const data = {
      loans: {},
      donations: {
        'don-1': { id: 'don-1', donor_id: 'd1', amount: 500, donation_date: '2026-01-01' },
      },
      deposits: {
        'dep-1': { id: 'dep-1', depositor_id: 'dp1', amount: 300, deposit_date: '2026-01-01' },
      },
      expenses: {
        'exp-1': { id: 'exp-1', description: 'test', amount: 100, expense_date: '2026-01-01', paid_by: 'gemach' },
      },
      funds: {},
      settings: {},
      borrowers: {},
      guarantors: {},
      repayments: {},
      donors: {},
      depositors: {},
      depositWithdrawals: {},
      blacklist: {},
      guarantorLoans: {},
      guarantorLoanRepayments: {},
      guarantorRefunds: {},
      waitlist: {},
      contacts: {},
      attachments: {},
      auditLog: {},
      feePayments: {},
    }
    await saveAppData(data)

    await migrateFundsSystem()

    const result = await loadAppData()
    
    expect(result.donations['don-1']).toBeDefined()
    expect(result.donations['don-1'].fund_id).toBeDefined()
    expect(result.deposits['dep-1'].fund_id).toBeDefined()
    expect(result.expenses['exp-1'].fund_id).toBeDefined()
    
    // כולם צריכים להצביע לאותה קופת ברירת מחדל
    const defaultFundId = result.donations['don-1'].fund_id
    expect(result.deposits['dep-1'].fund_id).toBe(defaultFundId)
    expect(result.expenses['exp-1'].fund_id).toBe(defaultFundId)
  })

  it('מיגרציה לא משנה רשומות שכבר יש להן fund_id', async () => {
    // יצירת קופה קיימת
    const existingFundId = 'existing-fund-123'
    const data = {
      loans: {
        'loan-1': { id: 'loan-1', borrower_id: 'b1', amount: 1000, loan_date: '2026-01-01', fund_id: existingFundId },
      },
      funds: {
        [existingFundId]: {
          id: existingFundId,
          name: 'קופה קיימת',
          is_default: true,
          is_active: true,
          created_at: '2025-01-01T00:00:00.000Z',
        },
      },
      donations: {},
      deposits: {},
      expenses: {},
      settings: {},
      borrowers: {},
      guarantors: {},
      repayments: {},
      donors: {},
      depositors: {},
      depositWithdrawals: {},
      blacklist: {},
      guarantorLoans: {},
      guarantorLoanRepayments: {},
      guarantorRefunds: {},
      waitlist: {},
      contacts: {},
      attachments: {},
      auditLog: {},
      feePayments: {},
    }
    await saveAppData(data)

    await migrateFundsSystem()

    const result = await loadAppData()
    
    // ההלוואה צריכה לשמור על ה-fund_id המקורי
    expect(result.loans['loan-1']).toBeDefined()
    expect(result.loans['loan-1'].fund_id).toBe(existingFundId)
  })
})
