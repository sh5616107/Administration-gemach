import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService, repaymentsService } from '../services/database'
import { processAutoRepayment } from '../services/scheduler'

describe('Soft-Delete Repayments - Duplicate Prevention', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
  })

  describe('✅ תרחיש 1: Soft-Delete מונע יצירת פירעונות כפולים', () => {
    it('should not recreate repayment after soft-delete', async () => {
      // Set date to April 24, 2026
      vi.setSystemTime(new Date('2026-04-24'))
      
      // Create borrower
      const borrower = await borrowersService.create({
        first_name: 'יוסי',
        last_name: 'כהן',
        id_number: '123456789',
        phone: '0501234567',
      })
      
      // Create loan with auto repayment
      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 12000,
        loan_date: '2026-04-01',
        loan_type: 'fixed',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 24,
        repayment_start_date: '2026-04-24',
      })
      await loansService.update(loan.lastInsertRowid, { status: 'active' })
      
      // First run: create repayment
      const success1 = await processAutoRepayment(loan.lastInsertRowid, 1000)
      expect(success1).toBe(true)
      
      let repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(1)
      expect(repayments[0].payment_date).toBe('2026-04-24')
      
      // User deletes the repayment (soft-delete)
      await repaymentsService.delete(repayments[0].id)
      
      // Verify repayment is soft-deleted (not visible in getByLoan)
      repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(0)
      
      // Second run: should NOT recreate repayment
      const success2 = await processAutoRepayment(loan.lastInsertRowid, 1000)
      expect(success2).toBe(false)
      
      repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(0)
    })
  })

  describe('✅ תרחיש 2: פירעונות רגילים ממשיכים לעבוד', () => {
    it('should continue creating repayments for non-deleted ones', async () => {
      // Set date to April 24, 2026
      vi.setSystemTime(new Date('2026-04-24'))
      
      // Create borrower
      const borrower = await borrowersService.create({
        first_name: 'דוד',
        last_name: 'לוי',
        id_number: '987654321',
        phone: '0509876543',
      })
      
      // Create loan with auto repayment
      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 12000,
        loan_date: '2026-04-01',
        loan_type: 'fixed',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 24,
        repayment_start_date: '2026-04-24',
      })
      await loansService.update(loan.lastInsertRowid, { status: 'active' })
      
      // Create first repayment
      const success1 = await processAutoRepayment(loan.lastInsertRowid, 1000)
      expect(success1).toBe(true)
      
      let repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(1)
      
      // Move to next month
      vi.setSystemTime(new Date('2026-05-24'))
      
      // Create second repayment (should work)
      const success2 = await processAutoRepayment(loan.lastInsertRowid, 1000)
      expect(success2).toBe(true)
      
      repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(2)
      
      // Verify repayment numbers
      const sortedRepayments = repayments.sort((a, b) => 
        (a.recurring_repayment_number || 0) - (b.recurring_repayment_number || 0)
      )
      expect(sortedRepayments[0].recurring_repayment_number).toBe(1)
      expect(sortedRepayments[1].recurring_repayment_number).toBe(2)
    })
  })

  describe('✅ תרחיש 3: בדיקת is_deleted בממשק', () => {
    it('should set is_deleted to false on create', async () => {
      const borrower = await borrowersService.create({
        first_name: 'משה',
        last_name: 'אברהם',
        id_number: '111222333',
        phone: '0501112233',
      })
      
      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 5000,
        loan_date: '2026-04-01',
        loan_type: 'fixed',
        is_recurring: 0,
        auto_repayment: 0,
      })
      
      const repayment = await repaymentsService.create({
        loan_id: loan.lastInsertRowid,
        amount: 1000,
        payment_date: '2026-04-01',
        notes: 'פירעון ראשון',
      })
      
      const repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments[0].is_deleted).toBe(false)
      expect(repayments[0].deleted_at).toBeUndefined()
    })

    it('should set is_deleted to true on delete', async () => {
      const borrower = await borrowersService.create({
        first_name: 'רחל',
        last_name: 'כהן',
        id_number: '444555666',
        phone: '0504445556',
      })
      
      const loan = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 5000,
        loan_date: '2026-04-01',
        loan_type: 'fixed',
        is_recurring: 0,
        auto_repayment: 0,
      })
      
      const repayment = await repaymentsService.create({
        loan_id: loan.lastInsertRowid,
        amount: 1000,
        payment_date: '2026-04-01',
        notes: 'פירעון ראשון',
      })
      
      // Delete the repayment
      await repaymentsService.delete(repayment.lastInsertRowid)
      
      // getByLoan should not return deleted repayments
      const repayments = await repaymentsService.getByLoan(loan.lastInsertRowid)
      expect(repayments).toHaveLength(0)
    })
  })
})
