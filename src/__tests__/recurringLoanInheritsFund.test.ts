import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService } from '../services/database'
import { createRecurringLoan } from '../services/scheduler'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('הלוואה מחזורית יורשת fund_id', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    fund2Id = (await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'ראובן',
      last_name: 'שמעון',
      phone: '0501112233'
    } as any)).lastInsertRowid
  })

  it('הלוואה מחזורית חדשה יורשת fund_id מההלוואה המקורית', async () => {
    // יצירת הלוואה מחזורית ראשונה בקופה 2
    const originalLoanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund2Id,
      amount: 5000,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 15,
      recurring_loan_number: 1,
      recurring_loan_count: 3,
      recurring_series_id: crypto.randomUUID(),
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    const originalLoan = await loansService.getById(originalLoanId)
    expect(originalLoan?.fund_id).toBe(fund2Id)
    
    // יצירת ההלוואה המחזורית הבאה
    const nextLoanId = await createRecurringLoan(originalLoanId)
    
    expect(nextLoanId).toBeDefined()
    const nextLoan = await loansService.getById(nextLoanId!)
    
    // בדיקה שההלוואה החדשה יורשת את אותו fund_id
    expect(nextLoan?.fund_id).toBe(fund2Id)
  })

  it('לא צריך לייצר כפילויות - הלוואה מחזורית קיימת לא נוצרת פעם נוספת', async () => {
    const originalLoanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 3000,
      loan_date: '2026-01-01',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 1,
      recurring_loan_number: 1,
      recurring_loan_count: 2,
      recurring_series_id: crypto.randomUUID(),
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    // יצירת ההלוואה השנייה
    const nextLoanId = await createRecurringLoan(originalLoanId)
    expect(nextLoanId).toBeDefined()
    
    // ניסיון שני - לא צריך ליצור כפילות
    const duplicateAttempt = await createRecurringLoan(originalLoanId)
    expect(duplicateAttempt).toBeNull()
  })
})
