import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, resetDatabase } from '../services/database'

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

describe('validateLoan מחובר ל-loansService.create (P1)', () => {
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    const borrower = await borrowersService.create({
      first_name: 'משה', last_name: 'כהן', phone: '0501234567',
      id_number: '', address: '', email: '', notes: ''
    })
    borrowerId = borrower.lastInsertRowid
  })

  it('הלוואה תקינה נוצרת בהצלחה', async () => {
    const result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-15',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0,
    } as any)
    expect(result.lastInsertRowid).toBeTruthy()
  })

  it('הלוואה מחזורית תקינה נוצרת בהצלחה בלי repayment_frequency (השדה הוסר - אין תמיכה בתדירות שאינה חודשית)', async () => {
    const result = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-15',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
    } as any)
    const loan = await loansService.getById(result.lastInsertRowid)
    expect(loan?.auto_repayment).toBe(1)
  })

  it('הלוואה עם סכום שלילי נדחית עם שגיאה ברורה', async () => {
    await expect(loansService.create({
      borrower_id: borrowerId,
      amount: -500,
      loan_date: '2026-01-15',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0,
    } as any)).rejects.toThrow(/סכום ההלוואה חייב להיות גדול מ-0/)
  })

  it('פירעון מחזורי בלי repayment_day נדחה עם שגיאה ברורה', async () => {
    await expect(loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-15',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 200,
      // repayment_day חסר בכוונה
    } as any)).rejects.toThrow(/פירעון מחזורי דורש יום בחודש/)
  })
})
