import { describe, it, expect, beforeEach } from 'vitest'
import { parseBackupJson } from '../services/fullBackupService'

describe('parseBackupJson - funds support', () => {
  it('צריך לשמר funds מגיבוי', () => {
    const backup = {
      exportDate: '2026-01-01',
      version: '1.0',
      funds: {
        'fund-1': { id: 'fund-1', name: 'קופה ראשית', is_default: true, is_active: true, created_at: '2026-01-01' },
        'fund-2': { id: 'fund-2', name: 'קרן חתונות', is_default: false, is_active: true, created_at: '2026-01-02' }
      },
      borrowers: {},
      loans: {}
    }
    
    const { importData } = parseBackupJson(JSON.stringify(backup))
    
    expect(importData.funds).toBeDefined()
    expect(Object.keys(importData.funds)).toHaveLength(2)
    expect(importData.funds['fund-1'].name).toBe('קופה ראשית')
  })

  it('צריך להחזיר אובייקט ריק אם אין funds בגיבוי ישן', () => {
    const oldBackup = {
      exportDate: '2025-01-01',
      borrowers: {},
      loans: {}
      // אין funds
    }
    
    const { importData } = parseBackupJson(JSON.stringify(oldBackup))
    
    expect(importData.funds).toBeDefined()
    expect(importData.funds).toEqual({})
  })
})
