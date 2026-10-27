import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { db, depositsService, fundsService, resetDatabase } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()
// @ts-ignore
globalThis.localStorage = localStorageMock

async function twoFunds() {
  const a = await fundsService.create({ name: 'A', description: '', is_default: true, is_active: true } as any)
  const b = await fundsService.create({ name: 'B', description: '', is_default: false, is_active: true } as any)
  return { a: a.id as string, b: b.id as string }
}

describe('db.run UPDATE handlers - regression', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('deposit edit with fund_id (8 params) saves all fields including fund_id', async () => {
    const { a, b } = await twoFunds()
    const created = await depositsService.create({
      depositor_id: 1, amount: 100, deposit_date: '2026-01-01', period_type: 'flexible',
      due_date: null, notes: 'old', status: 'active', fund_id: a
    } as any)
    const id = String(created.lastInsertRowid)

    await db.run(
      'UPDATE deposits SET amount = ?, deposit_date = ?, period_type = ?, due_date = ?, notes = ?, status = ?, fund_id = ? WHERE id = ?',
      [250, '2026-02-02', 'flexible', null, 'new', 'active', b, id]
    )

    const d = await depositsService.getById(id)
    expect(d?.amount).toBe(250)
    expect(d?.notes).toBe('new')
    expect(d?.deposit_date).toBe('2026-02-02')
    expect(d?.fund_id).toBe(b)
  })

  it('deposit edit without fund_id (7 params) still works', async () => {
    const { a } = await twoFunds()
    const created = await depositsService.create({
      depositor_id: 1, amount: 100, deposit_date: '2026-01-01', period_type: 'flexible',
      due_date: null, notes: 'old', status: 'active', fund_id: a
    } as any)
    const id = String(created.lastInsertRowid)

    await db.run(
      'UPDATE deposits SET amount = ?, deposit_date = ?, period_type = ?, due_date = ?, notes = ?, status = ? WHERE id = ?',
      [300, '2026-01-01', 'flexible', null, 'x', 'active', id]
    )
    const d = await depositsService.getById(id)
    expect(d?.amount).toBe(300)
    expect(d?.fund_id).toBe(a)
  })

  it('donation edit with fund_id saves fund_id', async () => {
    const { a, b } = await twoFunds()
    const ins = await db.run(
      'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details, fund_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 50, '2026-01-01', '', 'cash', '{}', a]
    )
    const id = String(ins.lastInsertRowid)

    await db.run(
      'UPDATE donations SET amount = ?, donation_date = ?, notes = ?, payment_method = ?, payment_details = ?, fund_id = ? WHERE id = ?',
      [75, '2026-01-05', 'n', 'cash', '{}', b, id]
    )
    const all = await db.query('SELECT * FROM donations') as any[]
    const d = all.find(x => String(x.id) === id)
    expect(d.amount).toBe(75)
    expect(d.fund_id).toBe(b)
  })

  it('bank verification update on a donation does NOT overwrite amount/date/notes', async () => {
    const { a } = await twoFunds()
    const ins = await db.run(
      'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details, fund_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, 50, '2026-01-01', 'keep', 'cash', '{}', a]
    )
    const id = String(ins.lastInsertRowid)

    await db.run(
      'UPDATE donations SET bank_verified = ?, bank_transaction_id = ?, verified_at = ? WHERE id = ?',
      [true, 'tx1', '2026-03-03T00:00:00.000Z', id]
    )
    const all = await db.query('SELECT * FROM donations') as any[]
    const d = all.find(x => String(x.id) === id)
    expect(d.amount).toBe(50)
    expect(d.donation_date).toBe('2026-01-01')
    expect(d.notes).toBe('keep')
    expect(d.bank_verified).toBe(true)
    expect(d.bank_transaction_id).toBe('tx1')
  })

  it('bank verification update on a deposit is persisted', async () => {
    const { a } = await twoFunds()
    const created = await depositsService.create({
      depositor_id: 1, amount: 100, deposit_date: '2026-01-01', period_type: 'flexible',
      due_date: null, notes: '', status: 'active', fund_id: a
    } as any)
    const id = String(created.lastInsertRowid)

    await db.run(
      'UPDATE deposits SET bank_verified = ?, bank_transaction_id = ?, verified_at = ? WHERE id = ?',
      [true, 'tx2', '2026-03-03T00:00:00.000Z', id]
    )
    const d: any = await depositsService.getById(id)
    expect(d.bank_verified).toBe(true)
    expect(d.bank_transaction_id).toBe('tx2')
    expect(d.amount).toBe(100)
  })
})
