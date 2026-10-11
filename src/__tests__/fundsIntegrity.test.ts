import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService, borrowersService } from '../services/database'
import { ensureFundsIntegrity } from '../services/fundsIntegrity'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('ensureFundsIntegrity', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('צריכה ליצור קופת ברירת מחדל אם אין', async () => {
    // מצב: אין שום קופות
    const fundsBefore = await fundsService.getAll()
    expect(fundsBefore).toHaveLength(0)
    
    await ensureFundsIntegrity()
    
    const fundsAfter = await fundsService.getAll()
    expect(fundsAfter).toHaveLength(1)
    expect(fundsAfter[0].is_default).toBe(true)
    expect(fundsAfter[0].name).toBe('קופה ראשית')
  })

  it('לא צריכה ליצור קופה חדשה אם כבר יש ברירת מחדל', async () => {
    // יצירת קופה
    await fundsService.create({
      name: 'קופה קיימת',
      is_default: true,
      is_active: true
    })
    
    await ensureFundsIntegrity()
    
    const funds = await fundsService.getAll()
    expect(funds).toHaveLength(1)
    expect(funds[0].name).toBe('קופה קיימת')
  })

  it('צריכה לשייך הלוואות ללא fund_id לקופת ברירת מחדל', async () => {
    const borrowerId = (await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567'
    } as any)).lastInsertRowid
    
    // יצירת הלוואה ללא fund_id (עוקף את ה-validation הרגיל)
    const { setItem, generateId } = await import('../services/database')
    const loanId = generateId('loans')
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      status: 'active',
      fund_id: undefined,
      created_at: new Date().toISOString()
    } as any)
    
    await ensureFundsIntegrity()
    
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBeDefined()
    
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('צריכה לשייך הלוואות עם fund_id לא קיים לקופת ברירת מחדל', async () => {
    const borrowerId = (await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0507654321'
    } as any)).lastInsertRowid
    
    const { setItem, generateId } = await import('../services/database')
    const loanId = generateId('loans')
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2026-01-15',
      status: 'active',
      fund_id: 'non-existent-fund-id',
      created_at: new Date().toISOString()
    } as any)
    
    await ensureFundsIntegrity()
    
    const loan = await loansService.getById(loanId)
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('צריכה להיות אידמפוטנטית - ריצה שנייה לא משנה כלום', async () => {
    await ensureFundsIntegrity()
    const fundsAfterFirst = await fundsService.getAll()
    
    await ensureFundsIntegrity()
    const fundsAfterSecond = await fundsService.getAll()
    
    expect(fundsAfterSecond).toHaveLength(fundsAfterFirst.length)
  })
})
