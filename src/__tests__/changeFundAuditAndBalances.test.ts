import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService, statsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('changeFund - audit log ועדכון יתרות', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string
  let loanId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    fund1Id = (await fundsService.create({
      name: 'קופה א',
      is_default: true,
      is_active: true
    })).id
    
    fund2Id = (await fundsService.create({
      name: 'קופה ב',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'לוי',
      last_name: 'כהן',
      phone: '0509998877'
    } as any)).lastInsertRowid
    
    loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 8000,
      loan_date: '2026-01-20',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
  })

  it('changeFund צריך לרשום ביומן עם before_data, after_data ו-reason', async () => {
    await loansService.changeFund(loanId, fund2Id, 'תיקון טעות במערכת')
    
    const { getAllItems } = await import('../services/database')
    const auditLogs = getAllItems<any>('auditLog')
    
    const log = auditLogs.find(
      l => l.action === 'loan_fund_change' && 
           l.entity_id === loanId
    )
    
    expect(log).toBeDefined()
    expect(log.entity_type).toBe('loan')
    
    const beforeData = JSON.parse(log.before_data)
    const afterData = JSON.parse(log.after_data)
    const metadata = JSON.parse(log.metadata)
    
    expect(beforeData.fund_id).toBe(fund1Id)
    expect(afterData.fund_id).toBe(fund2Id)
    expect(metadata.reason).toBe('תיקון טעות במערכת')
  })

  it('changeFund צריך לעדכן יתרות של שתי הקופות', async () => {
    // יתרות לפני
    const fund1StatsBefore = await statsService.getStatsByFund(fund1Id)
    const fund2StatsBefore = await statsService.getStatsByFund(fund2Id)
    
    expect(fund1StatsBefore.activeLoans.count).toBe(1)
    expect(fund2StatsBefore.activeLoans.count).toBe(0)
    
    // העברה
    await loansService.changeFund(loanId, fund2Id, 'העברה')
    
    // יתרות אחרי
    const fund1StatsAfter = await statsService.getStatsByFund(fund1Id)
    const fund2StatsAfter = await statsService.getStatsByFund(fund2Id)
    
    expect(fund1StatsAfter.activeLoans.count).toBe(0)
    expect(fund2StatsAfter.activeLoans.count).toBe(1)
    expect(fund2StatsAfter.activeLoans.total).toBe(8000)
  })
})
