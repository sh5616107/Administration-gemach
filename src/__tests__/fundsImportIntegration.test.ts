import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService, importAllData } from '../services/database'
import { parseBackupJson } from '../services/fullBackupService'
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

describe('ייבוא גיבוי ישן ללא קופות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('גיבוי ישן בלי funds צריך לעבור מיגרציה אוטומטית', async () => {
    const oldBackup = {
      exportDate: '2025-01-01',
      version: '1.0',
      borrowers: {
        'b1': { id: 'b1', first_name: 'יוסף', last_name: 'אברהם', phone: '0501111111' }
      },
      loans: {
        'l1': { id: 'l1', borrower_id: 'b1', amount: 5000, loan_date: '2025-12-01', status: 'active' }
        // ← אין fund_id
      }
    }
    
    const { importData } = parseBackupJson(JSON.stringify(oldBackup))
    await importAllData(importData)
    await ensureFundsIntegrity()
    
    // בדיקה שנוצרה קופת ברירת מחדל
    const funds = await fundsService.getAll()
    expect(funds.length).toBeGreaterThan(0)
    
    // בדיקה שההלוואה קיבלה fund_id
    const loan = await loansService.getById('l1')
    expect(loan?.fund_id).toBeDefined()
    
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('גיבוי חדש עם funds נשמר נכון', async () => {
    const newBackup = {
      exportDate: '2026-01-01',
      version: '1.0',
      funds: {
        'f1': { id: 'f1', name: 'קופה ראשית', is_default: true, is_active: true, created_at: '2026-01-01' },
        'f2': { id: 'f2', name: 'קרן חתונות', is_default: false, is_active: true, created_at: '2026-01-02' }
      },
      borrowers: {
        'b1': { id: 'b1', first_name: 'משה', last_name: 'כהן', phone: '0502222222' }
      },
      loans: {
        'l1': { id: 'l1', borrower_id: 'b1', fund_id: 'f1', amount: 3000, loan_date: '2026-01-10', status: 'active' },
        'l2': { id: 'l2', borrower_id: 'b1', fund_id: 'f2', amount: 2000, loan_date: '2026-01-15', status: 'active' }
      }
    }
    
    const { importData } = parseBackupJson(JSON.stringify(newBackup))
    await importAllData(importData)
    await ensureFundsIntegrity()
    
    const funds = await fundsService.getAll()
    expect(funds).toHaveLength(2)
    
    const loan1 = await loansService.getById('l1')
    const loan2 = await loansService.getById('l2')
    
    expect(loan1?.fund_id).toBe('f1')
    expect(loan2?.fund_id).toBe('f2')
  })
})
