import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, db } from '../services/database'
import { runStartupChecks } from '../services/scheduler'

describe('Soft-Delete Deposits - Duplicate Prevention', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
  })

  describe('✅ תרחיש 1: Soft-Delete מונע יצירת הפקדות כפולות', () => {
    it('should not recreate deposit after soft-delete', async () => {
      // Set date to April 24, 2026
      vi.setSystemTime(new Date('2026-04-24'))
      
      // Create depositor
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['יוסי', 'כהן', '0501234567', '123456789', 'תל אביב', 'yossi@example.com', '']
      )
      
      // Create recurring deposit from March 5 (should trigger creation)
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 5000, '2026-03-05', 'monthly', '2027-03-05', 1, 5, 11, 1, 12, 'הפקדה מחזורית', 'active', 'cash', '']
      )
      
      // First run: should create April deposit
      await runStartupChecks()
      
      let allDeposits = await db.query('SELECT * FROM deposits') as any[]
      let recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
      expect(recurringDeposits).toHaveLength(2) // March + April
      
      // Find the April deposit
      const aprilDeposit = recurringDeposits.find(d => d.recurring_deposit_number === 2)
      expect(aprilDeposit).toBeDefined()
      expect(aprilDeposit?.deposit_date).toBe('2026-04-24')
      
      // User deletes the April deposit (soft-delete)
      await db.run('DELETE FROM deposits WHERE id = ?', [aprilDeposit!.id])
      
      // Verify deposit is soft-deleted (not visible in query)
      allDeposits = await db.query('SELECT * FROM deposits') as any[]
      recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
      expect(recurringDeposits).toHaveLength(1) // Only March remains visible
      
      // Second run: should NOT recreate April deposit
      await runStartupChecks()
      
      allDeposits = await db.query('SELECT * FROM deposits') as any[]
      recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
      expect(recurringDeposits).toHaveLength(1) // Still only March
      
      // Verify no April deposit was created
      const aprilDeposits = recurringDeposits.filter(d => 
        d.deposit_date >= '2026-04-01' && d.deposit_date <= '2026-04-30'
      )
      expect(aprilDeposits).toHaveLength(0)
    })
  })

  describe('✅ תרחיש 2: הפקדות רגילות ממשיכות לעבוד', () => {
    it('should continue creating deposits for non-deleted recurring deposits', async () => {
      // Set date to April 5, 2026
      vi.setSystemTime(new Date('2026-04-05'))
      
      // Create depositor
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['רחל', 'לוי', '0509876543', '987654321', 'ירושלים', 'rachel@example.com', '']
      )
      
      // Create recurring deposit from March 5
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 3000, '2026-03-05', 'monthly', '2027-03-05', 1, 5, 11, 1, 12, 'הפקדה מחזורית', 'active', 'transfer', '']
      )
      
      // First run: create April deposit
      await runStartupChecks()
      
      let allDeposits = await db.query('SELECT * FROM deposits') as any[]
      let recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
      expect(recurringDeposits).toHaveLength(2)
      
      // Move to May 5
      vi.setSystemTime(new Date('2026-05-05'))
      
      // Second run: should create May deposit (no deletion happened)
      await runStartupChecks()
      
      allDeposits = await db.query('SELECT * FROM deposits') as any[]
      recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
      
      // Should have at least 3 deposits created
      expect(recurringDeposits.length).toBeGreaterThanOrEqual(3)
      
      // Verify we have deposits from different months
      const uniqueMonths = new Set(recurringDeposits.map(d => d.deposit_date.substring(0, 7)))
      expect(uniqueMonths.size).toBeGreaterThanOrEqual(2) // At least March and April
    })
  })

  describe('✅ תרחיש 3: בדיקת is_deleted בממשק', () => {
    it('should set is_deleted to false on create', async () => {
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['משה', 'אברהם', '0501112233', '111222333', 'חיפה', 'moshe@example.com', '']
      )
      
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 5000, '2026-04-01', 'monthly', '2027-04-01', 0, null, null, null, null, 'הפקדה רגילה', 'active', 'cash', '']
      )
      
      const deposits = await db.query('SELECT * FROM deposits') as any[]
      expect(deposits[0].is_deleted).toBe(false)
      expect(deposits[0].deleted_at).toBeUndefined()
    })

    it('should set is_deleted to true on delete', async () => {
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['שרה', 'כהן', '0504445556', '444555666', 'באר שבע', 'sarah@example.com', '']
      )
      
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 5000, '2026-04-01', 'monthly', '2027-04-01', 0, null, null, null, null, 'הפקדה רגילה', 'active', 'cash', '']
      )
      
      let deposits = await db.query('SELECT * FROM deposits') as any[]
      const depositId = deposits[0].id
      
      // Delete the deposit
      await db.run('DELETE FROM deposits WHERE id = ?', [depositId])
      
      // Query should not return deleted deposits
      deposits = await db.query('SELECT * FROM deposits') as any[]
      expect(deposits).toHaveLength(0)
    })
  })
})
