import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDatabase, attachmentsService } from '../services/database'

describe('delete-all-data regressions', () => {
  beforeEach(() => {
    resetDatabase()
  })

  it('DELETE FROM guarantorLoanRepayments actually clears the store (was silently a no-op)', async () => {
    // Insert a row the same way guarantorLoanRepaymentsService.create does,
    // via the public service rather than poking internals directly.
    const { guarantorLoanRepaymentsService } = await import('../services/database')
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: 'gl1',
      amount: 100,
      payment_date: '2026-01-01',
      payment_method: 'cash',
      notes: '',
    } as any)

    expect((await guarantorLoanRepaymentsService.getAll()).length).toBe(1)

    await db.run('DELETE FROM guarantorLoanRepayments')

    expect((await guarantorLoanRepaymentsService.getAll()).length).toBe(0)
  })

  it('attachments can be fully cleared via getAllIncludingDeleted + hardDeleteMany (the "delete all data" pattern)', async () => {
    await attachmentsService.create({
      entityType: 'loan',
      entityId: 'loan1',
      category: 'שטר הלוואה',
      fileName: 'a.pdf',
      storedPathRelative: 'x/a.pdf',
    })
    const created = await attachmentsService.create({
      entityType: 'borrower',
      entityId: 'b1',
      category: 'תעודת זהות',
      fileName: 'b.jpg',
      storedPathRelative: 'x/b.jpg',
    })
    // Also soft-delete one, to make sure getAllIncludingDeleted really
    // includes soft-deleted records too (getAll alone would miss it,
    // which was part of why a plain getAll()+hardDeleteMany would have
    // left soft-deleted attachments behind after "delete all").
    await attachmentsService.softDeleteByEntity('borrower', 'b1')

    const all = await attachmentsService.getAllIncludingDeleted()
    expect(all.length).toBe(2)

    await attachmentsService.hardDeleteMany(all.map(a => a.id))

    expect(await attachmentsService.getAllIncludingDeleted()).toEqual([])
    expect(await attachmentsService.getById(created.id)).toBeNull()
  })
})
