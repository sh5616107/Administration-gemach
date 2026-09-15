import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, resetDatabase } from '../services/database'
import { closeLoanIfFullyRepaid, createRepaymentWithNumbering } from '../services/repaymentHelpers'
import { addRepaymentAtomic } from '../services/transactional'
import { processAutoRepayment } from '../services/scheduler'

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

async function createTestBorrower() {
  const result = await borrowersService.create({
    first_name: 'יעקב',
    last_name: 'אברהם',
    phone: '0501112222',
    id_number: '',
    address: '',
    email: '',
    notes: ''
  } as any)
  return result.lastInsertRowid
}

describe('סגירת הלוואה אוטומטית עם פירעון מלא', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('closeLoanIfFullyRepaid: לא סוגר הלוואה עם יתרה', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)

    const closed = await closeLoanIfFullyRepaid(loanResult.lastInsertRowid)
    expect(closed).toBe(false)

    const loan = await loansService.getById(loanResult.lastInsertRowid)
    expect(loan?.status).toBe('active')
  })

  it('addRepaymentAtomic (פירעון בודד רגיל): סוגר את ההלוואה כשהיא נפרעת במלואה', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    const partial = await addRepaymentAtomic(loanId, {
      amount: 400,
      payment_date: '2026-02-01'
    } as any)
    expect(partial.success).toBe(true)
    expect((await loansService.getById(loanId))?.status).toBe('active')

    const full = await addRepaymentAtomic(loanId, {
      amount: 600,
      payment_date: '2026-03-01'
    } as any)
    expect(full.success).toBe(true)

    const loan = await loansService.getById(loanId)
    expect(loan?.remaining).toBe(0)
    expect(loan?.status).toBe('closed')
  })

  it('createRepaymentWithNumbering (פירעון בודד דרך AlertsDialog/UnifiedLoansPage): סוגר הלוואה מחזורית שנפרעה במלואה', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 400,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: undefined,
      auto_repayment: 1,
      repayment_amount: 400,
      repayment_start_date: '2026-02-01',
      repayment_day: 15,
      is_recurring: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    await createRepaymentWithNumbering({
      loanId,
      amount: 400,
      paymentDate: '2026-02-15'
    })

    const loan = await loansService.getById(loanId)
    expect(loan?.remaining).toBe(0)
    expect(loan?.status).toBe('closed')
  })

  it('processAutoRepayment (פירעון מחזורי אוטומטי מהסקדולר): סוגר הלוואה כשהתשלום האחרון מגיע', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 400,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: undefined,
      auto_repayment: 1,
      repayment_amount: 400,
      repayment_start_date: '2026-02-01',
      repayment_day: 15,
      is_recurring: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    const created = await processAutoRepayment(loanId, 400)
    expect(created).toBe(true)

    const loan = await loansService.getById(loanId)
    expect(loan?.remaining).toBe(0)
    expect(loan?.status).toBe('closed')
  })

  it('הלוואה סגורה לא נכללת יותר בחישוב הכספים הצפויים (expectedFundsCalculator)', async () => {
    const { calculateExpectedFunds } = await import('../services/expectedFundsCalculator')

    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 400,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: undefined,
      auto_repayment: 1,
      repayment_amount: 400,
      repayment_start_date: '2026-02-01',
      repayment_day: 15,
      is_recurring: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    await createRepaymentWithNumbering({ loanId, amount: 400, paymentDate: '2026-02-15' })

    const allLoans = await loansService.getAll()
    const result = calculateExpectedFunds(allLoans as any, [], new Date('2026-02-16'))

    // ההלוואה נסגרה (status='closed') ולכן ה-filter על 'active' מוציא אותה מהחישוב לגמרי
    expect(result.week).toBe(0)
    expect(result.month).toBe(0)
    expect(result.threeMonths).toBe(0)
  })
})
