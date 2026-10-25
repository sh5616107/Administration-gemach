import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import {
  loansService,
  borrowersService,
  repaymentsService,
  depositsService,
  depositWithdrawalsService,
  db,
  resetDatabase,
} from '../services/database'
import { createRepaymentWithNumbering } from '../services/repaymentHelpers'
import { validateEventDate } from '../utils/dateValidation'
import { toLocalDateStr } from '../utils/localDate'

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

async function createLoan(overrides: Record<string, any> = {}) {
  const borrower = await borrowersService.create({
    first_name: 'יעקב',
    last_name: 'אברהם',
    phone: '0501112222',
    id_number: '',
    address: '',
    email: '',
    notes: ''
  } as any)
  const loan = await loansService.create({
    borrower_id: borrower.lastInsertRowid,
    amount: 1000,
    loan_date: '2026-01-01',
    loan_type: 'flexible',
    is_recurring: 0,
    auto_repayment: 0,
    ...overrides,
  } as any)
  return loan.lastInsertRowid as string
}

describe('validateEventDate - ולידציית תאריך פירעון/משיכה', () => {
  const today = '2026-10-24'

  it('מקבל תאריך של היום ותאריך בעבר', () => {
    expect(validateEventDate('2026-10-24', undefined, '', today)).toBe('')
    expect(validateEventDate('2026-10-01', '2026-01-01', 'תאריך ההלוואה', today)).toBe('')
  })

  it('מקבל תאריך זהה לתאריך המינימום', () => {
    expect(validateEventDate('2026-01-01', '2026-01-01', 'תאריך ההלוואה', today)).toBe('')
  })

  it('דוחה תאריך ריק, לא תקין ועתידי', () => {
    expect(validateEventDate('', undefined, '', today)).not.toBe('')
    expect(validateEventDate('24/10/2026', undefined, '', today)).not.toBe('')
    expect(validateEventDate('2026-10-25', undefined, '', today)).not.toBe('')
  })

  it('דוחה תאריך מוקדם מתאריך המינימום', () => {
    const err = validateEventDate('2025-12-31', '2026-01-01', 'תאריך ההלוואה', today)
    expect(err).toContain('תאריך ההלוואה')
  })
})

describe('פירעון בתאריך אמיתי (בדיעבד)', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('שומר את התאריך שנבחר ולא את התאריך של היום', async () => {
    const loanId = await createLoan()

    await createRepaymentWithNumbering({ loanId, amount: 300, paymentDate: '2026-03-15' })

    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(1)
    expect(repayments[0].payment_date).toBe('2026-03-15')
  })

  it('בלי paymentDate - ברירת המחדל היא היום', async () => {
    const loanId = await createLoan()

    await createRepaymentWithNumbering({ loanId, amount: 100 })

    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments[0].payment_date).toBe(toLocalDateStr())
  })

  it('פירעון בדיעבד לא משנה את סכום היתרה ולא את הסגירה בפירעון מלא', async () => {
    const loanId = await createLoan()

    await createRepaymentWithNumbering({ loanId, amount: 1000, paymentDate: '2026-02-01' })

    const loan = await loansService.getById(loanId)
    expect(loan?.status).toBe('closed')
  })

  it('מספור פירעונות מחזוריים נשאר תקין כשפירעון נרשם בתאריך מוקדם', async () => {
    const loanId = await createLoan({
      loan_type: 'fixed',
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 10,
      is_recurring: 0,
    })

    await createRepaymentWithNumbering({ loanId, amount: 100, paymentDate: '2026-05-10' })
    // פירעון שני שנרשם אחר כך אבל בתאריך מוקדם יותר
    await createRepaymentWithNumbering({ loanId, amount: 100, paymentDate: '2026-04-10' })

    const repayments = await repaymentsService.getByLoan(loanId)
    const numbers = repayments.map(r => r.recurring_repayment_number).sort()
    expect(numbers).toEqual([1, 2])
    expect(repayments.map(r => r.payment_date).sort()).toEqual(['2026-04-10', '2026-05-10'])
  })
})

describe('משיכה בתאריך אמיתי (בדיעבד)', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  async function createDeposit() {
    const result = await depositsService.create({
      depositor_id: 'depositor-1',
      amount: 1000,
      deposit_date: '2026-01-01',
      period_type: 'flexible',
      due_date: '',
      is_recurring: 0,
      notes: '',
      status: 'active',
    } as any)
    return result.lastInsertRowid as string
  }

  // אותה שאילתה בדיוק ש-Deposits.tsx מריץ אחרי רישום משיכה
  async function markDepositWithdrawn(depositId: string, withdrawalDate: string, totalWithdrawn: number) {
    await db.run(
      'UPDATE deposits SET status = ?, withdrawal_date = ?, withdrawn_amount = ?, withdrawal_payment_method = ?, withdrawal_payment_details = ? WHERE id = ?',
      ['active', withdrawalDate, totalWithdrawn, 'cash', '{}', depositId]
    )
  }

  it('משיכה נשמרת עם התאריך שנבחר', async () => {
    const depositId = await createDeposit()

    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 400,
      withdrawal_date: '2026-02-20',
      payment_method: 'cash',
      payment_details: '{}',
      notes: ''
    })

    const withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawals).toHaveLength(1)
    expect(withdrawals[0].withdrawal_date).toBe('2026-02-20')
  })

  it('מחיקת המשיכה המאוחרת מחזירה את withdrawal_date להפקדה לתאריך המשיכה הנותרת', async () => {
    const depositId = await createDeposit()

    await depositWithdrawalsService.create({
      deposit_id: depositId, amount: 300, withdrawal_date: '2026-03-01', payment_method: 'cash'
    } as any)
    const later = await depositWithdrawalsService.create({
      deposit_id: depositId, amount: 200, withdrawal_date: '2026-06-01', payment_method: 'cash'
    } as any)
    await markDepositWithdrawn(depositId, '2026-06-01', 500)

    await depositWithdrawalsService.delete(later.id)

    const deposit = await depositsService.getById(depositId)
    expect(deposit?.withdrawn_amount).toBe(300)
    expect(deposit?.withdrawal_date).toBe('2026-03-01')
  })

  it('מחיקה כשנשארות כמה משיכות מציבה את המאוחרת מביניהן, גם אם נרשמה קודם', async () => {
    const depositId = await createDeposit()

    // נרשמה קודם אבל בתאריך מאוחר, ואז נרשמה משיכה בדיעבד בתאריך מוקדם
    await depositWithdrawalsService.create({
      deposit_id: depositId, amount: 200, withdrawal_date: '2026-06-01', payment_method: 'cash'
    } as any)
    await depositWithdrawalsService.create({
      deposit_id: depositId, amount: 100, withdrawal_date: '2026-02-01', payment_method: 'cash'
    } as any)
    const toDelete = await depositWithdrawalsService.create({
      deposit_id: depositId, amount: 50, withdrawal_date: '2026-04-01', payment_method: 'cash'
    } as any)
    await markDepositWithdrawn(depositId, '2026-06-01', 350)

    await depositWithdrawalsService.delete(toDelete.id)

    const deposit = await depositsService.getById(depositId)
    expect(deposit?.withdrawn_amount).toBe(300)
    expect(deposit?.withdrawal_date).toBe('2026-06-01')
  })
})
