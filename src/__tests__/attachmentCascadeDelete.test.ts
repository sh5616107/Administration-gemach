import { describe, it, expect, beforeEach } from 'vitest'
import { db, resetDatabase, loansService, borrowersService, attachmentsService } from '../services/database'

describe('attachment cascade delete', () => {
  beforeEach(() => {
    resetDatabase()
  })

  it('soft-deletes attachments when a loan is soft-deleted (record kept, isDeleted set)', async () => {
    const borrowerResult = await db.run(
      'INSERT INTO borrowers (first_name, last_name, phone, id_number, address, city) VALUES (?, ?, ?, ?, ?, ?)',
      ['ישראל', 'ישראלי', '0500000000', '111111111', '', '']
    )
    const borrowerId = String(borrowerResult.lastInsertRowid)

    const loanResult = await db.run(
      'INSERT INTO loans (borrower_id, amount, loan_date, loan_type, status, is_recurring, auto_repayment) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [borrowerId, 1000, '2026-01-01', 'fixed', 'active', 0, 0]
    )
    const loanId = String(loanResult.lastInsertRowid)

    const attachment = await attachmentsService.create({
      entityType: 'loan',
      entityId: loanId,
      category: 'שטר הלוואה',
      fileName: 'note.pdf',
      storedPathRelative: 'מסמכי_הגמח/loan/x/note.pdf',
    })

    // Sanity: attachment shows up for the loan before deletion
    expect((await attachmentsService.getByEntity('loan', loanId)).map(a => a.id)).toContain(attachment.id)

    await loansService.delete(loanId)

    // After soft-deleting the loan, the attachment should be soft-deleted
    // too (not visible via getByEntity/getAll), but the RECORD should
    // still exist (not hard-deleted) — recoverable if the loan is restored.
    expect(await attachmentsService.getByEntity('loan', loanId)).toEqual([])
    const stillExists = await attachmentsService.getById(attachment.id)
    expect(stillExists).not.toBeNull()
    expect(stillExists?.isDeleted).toBe(true)
  })

  it('hard-deletes attachment records when a borrower is hard-deleted', async () => {
    const borrowerResult = await db.run(
      'INSERT INTO borrowers (first_name, last_name, phone, id_number, address, city) VALUES (?, ?, ?, ?, ?, ?)',
      ['דוד', 'כהן', '0500000001', '222222222', '', '']
    )
    const borrowerId = String(borrowerResult.lastInsertRowid)

    const attachment = await attachmentsService.create({
      entityType: 'borrower',
      entityId: borrowerId,
      category: 'תעודת זהות',
      fileName: 'id.jpg',
      storedPathRelative: 'מסמכי_הגמח/borrower/x/id.jpg',
    })

    await borrowersService.delete(borrowerId)

    // Hard delete: the attachment record itself should be gone entirely,
    // not just soft-deleted — matches the "no orphaned pointer" goal.
    expect(await attachmentsService.getById(attachment.id)).toBeNull()
  })

  it('does not throw or fail when deleting an entity that has no attachments', async () => {
    const borrowerResult = await db.run(
      'INSERT INTO borrowers (first_name, last_name, phone, id_number, address, city) VALUES (?, ?, ?, ?, ?, ?)',
      ['שרה', 'לוי', '0500000002', '333333333', '', '']
    )
    const borrowerId = String(borrowerResult.lastInsertRowid)

    await expect(borrowersService.delete(borrowerId)).resolves.not.toThrow()
  })
})
