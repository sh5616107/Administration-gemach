/**
 * Test: End Series Early functionality
 * 
 * Verifies that setting recurring_months = 0 prevents future items from being created
 * while leaving existing items unchanged.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'
import { recurringItemsService, ItemType } from '../services/recurringItemsService'
import { autoCreateRecurringLoans } from '../services/scheduler'
import type { Loan } from '../services/database'

describe('End Series Early', () => {
  let testBorrowerId: string
  let testLoanId: string

  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15')) // קביעת "היום" לתאריך קבוע
    
    // Create borrower
    testBorrowerId = crypto.randomUUID()
    await borrowersService.create({
      id: testBorrowerId,
      name: 'לווה לבדיקה',
      id_number: '123456789',
      phone: '0501234567',
      address: '',
      email: '',
      notes: ''
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should prevent future loans from being created after ending series', async () => {
    // Create recurring loan with 12 months remaining (all in future)
    const seriesId = crypto.randomUUID()
    
    // תאריך עתידי - חודש קדימה מהיום (2026-09-15)
    const today = new Date() // 2026-08-15
    const futureDate = new Date(today)
    futureDate.setMonth(futureDate.getMonth() + 1)
    
    const created = await loansService.create({
      borrower_id: testBorrowerId,
      amount: 1000,
      loan_date: futureDate.toISOString().split('T')[0],
      status: 'planned',
      balance: 1000,
      is_recurring: 1,
      recurring_day: 15,
      recurring_months: 11, // 12 total (this one + 11 more)
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      recurring_series_id: seriesId
    } as any)
    
    testLoanId = created.lastInsertRowid

    // Verify initial state
    let allLoans = await loansService.getAll()
    let seriesLoans = allLoans.filter(l => l.recurring_series_id === seriesId)
    expect(seriesLoans.length).toBe(1)

    // End series early by setting recurring_months = 0
    const result = await recurringItemsService.updateSeriesItems(
      testLoanId,
      'loan' as ItemType,
      {
        recurring_months: 0
      }
    )

    expect(result.success).toBe(true)

    // Verify recurring_months is now 0
    const loan = await loansService.getById(testLoanId)
    expect(loan?.recurring_months).toBe(0)

    // Try to create next loan via scheduler - should not create anything
    await autoCreateRecurringLoans()

    // Verify no new loans were created
    allLoans = await loansService.getAll()
    seriesLoans = allLoans.filter(l => l.recurring_series_id === seriesId)
    expect(seriesLoans.length).toBe(1) // Still only the original loan

    // Verify existing loan is unchanged
    const existingLoan = await loansService.getById(testLoanId)
    expect(existingLoan).toBeDefined()
    expect(existingLoan!.amount).toBe(1000)
    // Status is 'planned' because loan_date is in future
    expect(existingLoan!.status).toBe('planned')
  })

  it('should end series early even when multiple loans already exist', async () => {
    // Create series with 3 existing loans
    const seriesId = crypto.randomUUID()
    const loanIds: string[] = []
    
    const today = new Date() // 2026-08-15
    
    for (let i = 0; i < 3; i++) {
      const loanDate = new Date(today)
      loanDate.setMonth(loanDate.getMonth() + i + 1) // +1, +2, +3 months
      
      const created = await loansService.create({
        borrower_id: testBorrowerId,
        amount: 1500,
        loan_date: loanDate.toISOString().split('T')[0],
        status: 'active',
        balance: 1500,
        is_recurring: 1,
        recurring_day: 15,
        recurring_months: 9 - i, // 12 total - current index
        recurring_loan_number: i + 1,
        recurring_loan_count: 12,
        recurring_series_id: seriesId
      } as any)
      
      loanIds.push(created.lastInsertRowid)
    }
    
    testLoanId = loanIds[0]

    // End series early
    const result = await recurringItemsService.updateSeriesItems(
      testLoanId,
      'loan' as ItemType,
      {
        recurring_months: 0
      }
    )

    expect(result.success).toBe(true)

    // Verify all existing loans have recurring_months = 0
    for (const id of loanIds) {
      const loan = await loansService.getById(id)
      // Only future loans should be updated (all 3 are future)
      expect(loan?.recurring_months).toBe(0)
    }

    // Try scheduler - should not create loan #4
    await autoCreateRecurringLoans()

    // Verify still only 3 loans
    const allLoans = await loansService.getAll()
    const seriesLoans = allLoans.filter(l => l.recurring_series_id === seriesId)
    expect(seriesLoans.length).toBe(3)

    // Verify all existing loans are unchanged in amount/balance
    for (let i = 0; i < loanIds.length; i++) {
      const loan = await loansService.getById(loanIds[i])
      expect(loan?.amount).toBe(1500)
      expect(loan?.recurring_loan_number).toBe(i + 1)
    }
  })
})
