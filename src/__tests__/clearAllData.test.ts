/**
 * "Delete all" must clear every store in a single step (one save) and never write a half-deleted state.
 * Test names are English on purpose so the patch contains no raw Hebrew.
 */

import { describe, it, expect, vi } from 'vitest'

const savedStates: Array<Record<string, number>> = []
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn(async (d: Record<string, Record<string, unknown>>) => {
    const counts: Record<string, number> = {}
    for (const [store, rows] of Object.entries(d)) counts[store] = Object.keys(rows).length
    savedStates.push(counts)
  }),
  loadAppData: vi.fn().mockResolvedValue(null),
}))

import { commitData, exportAllData, importAllData } from '../services/database'
import { clearAllDataKeepSettings } from '../services/clearAllData'

const ALL_STORES = [
  'borrowers', 'guarantors', 'loans', 'repayments', 'donors', 'donations', 'depositors', 'deposits',
  'depositWithdrawals', 'blacklist', 'expenses', 'guarantorLoans', 'guarantorLoanRepayments',
  'guarantorRefunds', 'waitlist', 'contacts', 'attachments', 'auditLog', 'feePayments', 'funds',
] as const

describe('clearAllDataKeepSettings', () => {
  async function seed() {
    const seeded: Record<string, unknown> = { settings: { gemach_name: 'Custom name', risk_threshold: '123' } }
    for (const store of ALL_STORES) seeded[store] = { '1': { id: 1 }, '2': { id: 2 } }
    await importAllData(seeded as any)
    await commitData()
    savedStates.length = 0
  }

  it('clears every store (including fee payments, guarantor refunds, funds, contacts, audit log)', async () => {
    await seed()
    await clearAllDataKeepSettings()
    await commitData()

    const after = (await exportAllData()) as unknown as Record<string, Record<string, any>>
    for (const store of ALL_STORES) {
      if (store === 'funds') continue // the default fund is recreated, checked below
      expect(Object.keys(after[store]), store).toHaveLength(0)
    }
  })

  it('keeps the settings and recreates exactly one default fund', async () => {
    await seed()
    await clearAllDataKeepSettings()
    await commitData()

    const after = (await exportAllData()) as unknown as Record<string, Record<string, any>>
    expect(after.settings.gemach_name).toBe('Custom name')
    expect(after.settings.risk_threshold).toBe('123')
    const funds = Object.values(after.funds)
    expect(funds).toHaveLength(1)
    expect(funds[0].is_default).toBe(true)
  })

  it('never saves a half-deleted state: every saved state has no leftover records', async () => {
    await seed()
    await clearAllDataKeepSettings()
    await commitData()

    expect(savedStates.length).toBeGreaterThan(0)
    for (const state of savedStates) {
      for (const store of ALL_STORES) {
        if (store === 'funds') continue
        expect(state[store], store).toBe(0)
      }
    }
  })
})
