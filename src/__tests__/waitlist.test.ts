import { describe, it, expect, beforeEach } from 'vitest'
import { waitlistService, borrowersService, loansService, exportAllData, importAllData } from '../services/database'

describe('Waitlist Service', () => {
  beforeEach(async () => {
    // Reset database
    await importAllData({
      borrowers: {},
      waitlist: {},
      loans: {},
      repayments: {},
      guarantors: {},
      donors: {},
      donations: {},
      depositors: {},
      deposits: {},
      blacklist: {},
      expenses: {},
      guarantorLoans: {},
    })
  })

  describe('Create and Retrieve', () => {
    it('should create a waitlist entry', async () => {
      const borrower = await borrowersService.create({
        first_name: 'יוסי',
        last_name: 'כהן',
        phone: '0501234567',
      })

      const entry = await waitlistService.create({
        borrower_id: borrower.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        requested_months: 12,
        notes: 'בקשה ראשונה',
        priority: 'normal',
        status: 'waiting',
      })

      expect(entry.id).toBeDefined()
      expect(typeof entry.id).toBe('string')

      const retrieved = await waitlistService.getById(entry.id)
      expect(retrieved).toBeTruthy()
      expect(retrieved?.borrower_id).toBe(borrower.lastInsertRowid)
      expect(retrieved?.requested_amount).toBe(5000)
      expect(retrieved?.position).toBe(1)
    })

    it('should assign position 1 to urgent entries', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'דוד',
        last_name: 'לוי',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'משה',
        last_name: 'כהן',
        phone: '0502222222',
      })

      // Create normal entry
      await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      // Create urgent entry - should jump to position 1
      const urgentEntry = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-16',
        loan_type: 'fixed',
        priority: 'urgent',
        status: 'waiting',
      })

      const retrieved = await waitlistService.getById(urgentEntry.id)
      expect(retrieved?.position).toBe(1)

      const all = await waitlistService.getAll()
      expect(all[0].id).toBe(urgentEntry.id)
      expect(all[1].position).toBe(2)
    })
  })

  describe('Position Management', () => {
    it('should move entry up in queue', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'ראובן',
        last_name: 'שמעון',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'לוי',
        last_name: 'יהודה',
        phone: '0502222222',
      })

      const entry1 = await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry2 = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 4000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      // Move entry2 up
      await waitlistService.moveUp(entry2.id)

      const updated1 = await waitlistService.getById(entry1.id)
      const updated2 = await waitlistService.getById(entry2.id)

      expect(updated2?.position).toBe(1)
      expect(updated1?.position).toBe(2)
    })

    it('should move entry down in queue', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'יששכר',
        last_name: 'זבולון',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'דן',
        last_name: 'נפתלי',
        phone: '0502222222',
      })

      const entry1 = await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry2 = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 4000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      // Move entry1 down
      await waitlistService.moveDown(entry1.id)

      const updated1 = await waitlistService.getById(entry1.id)
      const updated2 = await waitlistService.getById(entry2.id)

      expect(updated1?.position).toBe(2)
      expect(updated2?.position).toBe(1)
    })

    it('should not move first entry up', async () => {
      const borrower = await borrowersService.create({
        first_name: 'גד',
        last_name: 'אשר',
        phone: '0501111111',
      })

      const entry = await waitlistService.create({
        borrower_id: borrower.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      await waitlistService.moveUp(entry.id)

      const updated = await waitlistService.getById(entry.id)
      expect(updated?.position).toBe(1)
    })
  })

  describe('Delete and Reorder', () => {
    it('should reorder positions after deletion', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'בנימין',
        last_name: 'יוסף',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'אפרים',
        last_name: 'מנשה',
        phone: '0502222222',
      })

      const borrower3 = await borrowersService.create({
        first_name: 'משה',
        last_name: 'אהרון',
        phone: '0503333333',
      })

      const entry1 = await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry2 = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 4000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry3 = await waitlistService.create({
        borrower_id: borrower3.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-17',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      // Delete middle entry
      await waitlistService.delete(entry2.id)

      const updated1 = await waitlistService.getById(entry1.id)
      const updated3 = await waitlistService.getById(entry3.id)

      expect(updated1?.position).toBe(1)
      expect(updated3?.position).toBe(2)
    })
  })

  describe('Statistics', () => {
    it('should calculate waitlist statistics', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'שמעון',
        last_name: 'לוי',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'יהודה',
        last_name: 'יששכר',
        phone: '0502222222',
      })

      await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'urgent',
        status: 'waiting',
      })

      await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const stats = await waitlistService.getStats()

      expect(stats.total).toBe(2)
      expect(stats.waiting).toBe(2)
      expect(stats.totalRequested).toBe(8000)
      expect(stats.urgent).toBe(1)
    })

    it('should get next in line', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'זבולון',
        last_name: 'דן',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'נפתלי',
        last_name: 'גד',
        phone: '0502222222',
      })

      await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry2 = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'urgent',
        status: 'waiting',
      })

      const next = await waitlistService.getNextInLine()

      expect(next?.id).toBe(entry2.id)
      expect(next?.position).toBe(1)
    })
  })

  describe('Approval Flow', () => {
    it('should approve entry and link to loan', async () => {
      const borrower = await borrowersService.create({
        first_name: 'אשר',
        last_name: 'בנימין',
        phone: '0501234567',
      })

      const entry = await waitlistService.create({
        borrower_id: borrower.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 5000,
        loan_date: '2024-01-20',
        loan_type: 'flexible',
        is_recurring: 0,
        auto_repayment: 0,
      })

      await waitlistService.approveEntry(entry.id, loan.lastInsertRowid)

      const updated = await waitlistService.getById(entry.id)
      expect(updated?.status).toBe('approved')
      expect(updated?.notes).toContain(`הלוואה #${loan.lastInsertRowid}`)
    })
  })

  describe('Update Priority', () => {
    it('should move to top when priority changed to urgent', async () => {
      const borrower1 = await borrowersService.create({
        first_name: 'יוסף',
        last_name: 'אפרים',
        phone: '0501111111',
      })

      const borrower2 = await borrowersService.create({
        first_name: 'מנשה',
        last_name: 'משה',
        phone: '0502222222',
      })

      await waitlistService.create({
        borrower_id: borrower1.lastInsertRowid,
        requested_amount: 3000,
        request_date: '2024-01-15',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      const entry2 = await waitlistService.create({
        borrower_id: borrower2.lastInsertRowid,
        requested_amount: 5000,
        request_date: '2024-01-16',
        loan_type: 'flexible',
        priority: 'normal',
        status: 'waiting',
      })

      // Change priority to urgent
      await waitlistService.update(entry2.id, { priority: 'urgent' })

      const updated = await waitlistService.getById(entry2.id)
      expect(updated?.position).toBe(1)
      expect(updated?.priority).toBe('urgent')
    })
  })
})
