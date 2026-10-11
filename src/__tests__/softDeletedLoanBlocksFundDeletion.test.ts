import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('מחיקת קופה נחסמת בגלל הלוואה soft-deleted', () => {
  let fundId: string
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    // קופת ברירת מחדל
    await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })
    
    // קופה נוספת
    fundId = (await fundsService.create({
      name: 'קופה משנית',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'יוסף',
      last_name: 'דוד',
      phone: '0503334455'
    } as any)).lastInsertRowid
  })

  it('לא ניתן למחוק קופה עם הלוואה soft-deleted', async () => {
    // יצירת הלוואה
    const loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fundId,
      amount: 2000,
      loan_date: '2026-01-25',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    // מחיקה רכה של ההלוואה
    await loansService.delete(loanId)
    
    const loan = await loansService.getById(loanId)
    expect(loan).toBeNull()  // לא מוחזר ב-getById (soft deleted)
    
    // ניסיון למחוק את הקופה - צריך להיחסם
    await expect(
      fundsService.delete(fundId)
    ).rejects.toThrow('לא ניתן למחוק קופה עם הלוואות')
  })

  it('ניתן למחוק קופה ללא רשומות כלל', async () => {
    await expect(
      fundsService.delete(fundId)
    ).resolves.not.toThrow()
    
    const fund = await fundsService.getById(fundId)
    expect(fund).toBeNull()
  })
})
