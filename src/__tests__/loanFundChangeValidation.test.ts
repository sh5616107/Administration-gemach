import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService, borrowersService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('שינוי קופה של הלוואה', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string
  let loanId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    // יצירת 2 קופות
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
    
    // יצירת לווה
    borrowerId = (await borrowersService.create({
      first_name: 'אברהם',
      last_name: 'יצחק',
      phone: '0501234567'
    } as any)).lastInsertRowid
    
    // יצירת הלוואה
    loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
  })

  it('changeFund: צריך לזרוק שגיאה אם קופת היעד לא קיימת', async () => {
    await expect(
      loansService.changeFund(loanId, 'non-existent-fund', 'טעות')
    ).rejects.toThrow()
  })

  it('changeFund: צריך לזרוק שגיאה אם קופת היעד לא פעילה', async () => {
    // השבתת קופה 2
    await fundsService.deactivate(fund2Id)
    
    await expect(
      loansService.changeFund(loanId, fund2Id, 'ניסיון להעביר לקופה מושבתת')
    ).rejects.toThrow('קופה לא פעילה')
  })

  it('changeFund: צריך לזרוק שגיאה אם הקופה זהה לנוכחית', async () => {
    await expect(
      loansService.changeFund(loanId, fund1Id, 'אותה קופה')
    ).rejects.toThrow('הקופה זהה')
  })

  it('changeFund: צריך לזרוק שגיאה אם לא סופקה סיבה', async () => {
    await expect(
      loansService.changeFund(loanId, fund2Id, '')
    ).rejects.toThrow('סיבה חובה')
  })

  it('changeFund: צריך לעדכן fund_id ולרשום ביומן', async () => {
    await loansService.changeFund(loanId, fund2Id, 'טעות בבחירת קופה')
    
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBe(fund2Id)
    
    // בדיקת audit log
    const { getAllItems } = await import('../services/database')
    const auditLogs = getAllItems<any>('auditLog')
    const relevantLog = auditLogs.find(
      log => log.entity_type === 'loan' && 
             log.entity_id === loanId && 
             log.action === 'loan_fund_change'
    )
    
    expect(relevantLog).toBeDefined()
    expect(JSON.parse(relevantLog.before_data).fund_id).toBe(fund1Id)
    expect(JSON.parse(relevantLog.after_data).fund_id).toBe(fund2Id)
    expect(JSON.parse(relevantLog.metadata).reason).toBe('טעות בבחירת קופה')
  })

  it('loansService.update: fund_id undefined לא צריך לדרוס ערך קיים', async () => {
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBe(fund1Id)
    
    await loansService.update(loanId, { fund_id: undefined })
    
    const updatedLoan = await loansService.getById(loanId)
    expect(updatedLoan?.fund_id).toBe(fund1Id)  // לא השתנה
  })
})
