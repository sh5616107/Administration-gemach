import { describe, it, expect } from 'vitest'
import { parseBackupJson } from '../services/fullBackupService'

describe('parseBackupJson — attachments round-trip', () => {
  it('preserves attachment records from an exported backup (regression: previously silently dropped)', () => {
    const exportedBackup = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      borrowers: {
        'b1': { id: 'b1', first_name: 'ישראל', last_name: 'ישראלי' },
      },
      loans: {},
      guarantors: {},
      repayments: {},
      donors: {},
      donations: {},
      depositors: {},
      deposits: {},
      settings: {},
      attachments: {
        'a1': {
          id: 'a1',
          entityType: 'borrower',
          entityId: 'b1',
          category: 'תעודת זהות',
          fileName: 'id.jpg',
          storedPathRelative: 'מסמכי_הגמח/borrower/b1/id.jpg',
          addedDate: new Date().toISOString(),
        },
      },
    }

    const { importData } = parseBackupJson(JSON.stringify(exportedBackup))

    expect(importData.attachments).toBeDefined()
    expect(importData.attachments['a1']).toBeDefined()
    expect(importData.attachments['a1'].fileName).toBe('id.jpg')
    expect(importData.attachments['a1'].entityId).toBe('b1')
  })

  it('defaults attachments to an empty object for old backups that predate the field', () => {
    const oldBackup = {
      exportDate: new Date().toISOString(),
      borrowers: { 'b1': { id: 'b1', first_name: 'דוד' } },
    }

    const { importData } = parseBackupJson(JSON.stringify(oldBackup))
    expect(importData.attachments).toEqual({})
  })

  it('throws on a file that is not a recognizable backup', () => {
    expect(() => parseBackupJson(JSON.stringify({ hello: 'world' }))).toThrow()
  })
})
