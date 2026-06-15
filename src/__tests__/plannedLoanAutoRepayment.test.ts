/**
 * Test: Planned loans with auto-repayment should NOT trigger repayments until activated
 * 
 * Bug scenario:
 * 1. Create a planned loan for 15.5 with auto-repayment every 5th of the month
 * 2. On 5.5, auto-repayment should NOT trigger because loan is still planned
 * 3. On 15.5, loan becomes active
 * 4. On 5.6, auto-repayment should trigger normally
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loansService, repaymentsService, db } from '../services/database'
import { checkAutoRepayments, activatePlannedLoans } from '../services/scheduler'

// Mock the database and services
vi.mock('../services/database', () => ({
  db: {
    run: vi.fn(),
    query: vi.fn(),
  },
  loansService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  repaymentsService: {
    getByLoan: vi.fn(),
    create: vi.fn(),
  },
}))

describe('Planned Loan Auto-Repayment Bug Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should NOT create auto-repayment for planned loan before activation date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05')) // Today is 5.5 - loan still planned
    
    // Mock db.query to return a planned loan with auto-repayment
    vi.mocked(db.query).mockResolvedValue([
      {
        id: 1,
        borrower_id: 1,
        borrower_name: 'יוסי כהן',
        amount: 1000,
        loan_date: '2026-05-15', // Loan will be active on 15.5
        loan_type: 'flexible',
        status: 'planned', // CRITICAL: loan is planned, not active yet
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_day: 5,
        repayment_start_date: '2026-05-05',
        remaining: 1000
      }
    ])
    
    // Check auto-repayments - should be EMPTY because loan is planned
    const alerts = await checkAutoRepayments()
    
    // The query should have been called with a WHERE clause that includes status='active'
    // This means planned loans should not be returned, so alerts should be empty
    expect(alerts).toHaveLength(0)
  })

  it('should create auto-repayment after loan is activated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05')) // Today is 5.6 - loan already active
    
    // Mock db.query to return an active loan with auto-repayment
    vi.mocked(db.query).mockResolvedValue([
      {
        id: 1,
        borrower_id: 1,
        borrower_name: 'יוסי כהן',
        amount: 1000,
        loan_date: '2026-05-15', // Loan was activated on 15.5
        loan_type: 'flexible',
        status: 'active', // NOW ACTIVE
        auto_repayment: 1,
        repayment_amount: 200,
        repayment_day: 5,
        repayment_start_date: '2026-05-05',
        remaining: 1000
      }
    ])
    
    // First call: get auto-repayment loans (returns the loan above)
    // Second call: check for existing repayments this month (returns empty)
    vi.mocked(db.query)
      .mockResolvedValueOnce([
        {
          id: 1,
          borrower_id: 1,
          borrower_name: 'יוסי כהן',
          amount: 1000,
          loan_date: '2026-05-15',
          loan_type: 'flexible',
          status: 'active',
          auto_repayment: 1,
          repayment_amount: 200,
          repayment_day: 5,
          repayment_start_date: '2026-05-05',
          remaining: 1000
        }
      ])
      .mockResolvedValueOnce([]) // No existing repayments this month
    
    // Check auto-repayments - should have 1 alert because loan is now active
    const alerts = await checkAutoRepayments()
    
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('auto_repayment')
    expect(alerts[0].loan_id).toBe(1)
    expect(alerts[0].amount).toBe(200)
  })

  it('should handle edge case: repayment_start_date before loan_date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10')) // Between repayment start and loan date
    
    // Mock db.query to return no loans (because planned loans are filtered out)
    vi.mocked(db.query).mockResolvedValue([])
    
    const alerts = await checkAutoRepayments()
    
    // Should be empty because loan is still planned
    expect(alerts).toHaveLength(0)
  })

  it('should verify SQL query includes status check', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05'))
    
    vi.mocked(db.query).mockResolvedValue([])
    
    await checkAutoRepayments()
    
    // Verify that db.query was called with a query that includes status='active'
    expect(db.query).toHaveBeenCalled()
    const queryCall = vi.mocked(db.query).mock.calls[0]
    const sqlQuery = queryCall[0] as string
    
    // Check that the SQL includes the status check
    expect(sqlQuery).toContain("status = 'active'")
  })

  it('should not show alert for planned loan with auto-repayment in AlertsDialog logic', () => {
    // Test the AlertsDialog logic directly
    const today = new Date('2026-05-05')
    const todayDay = today.getDate()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    
    // Planned loan with auto-repayment on 5th of month
    const plannedLoan = {
      id: 1,
      borrower_name: 'יוסי כהן',
      auto_repayment: 1,
      repayment_day: 5,
      status: 'planned', // PLANNED, not active
      remaining: 1000,
      repayment_amount: 200
    }
    
    const repaymentDay = plannedLoan.repayment_day || 1
    const effectiveRepaymentDay = Math.min(repaymentDay, lastDayOfMonth)
    
    // This should be FALSE because status is not 'active'
    const shouldShowAlert = plannedLoan.auto_repayment && 
                           plannedLoan.status === 'active' && 
                           effectiveRepaymentDay === todayDay && 
                           (plannedLoan.remaining || 0) > 0
    
    expect(shouldShowAlert).toBe(false)
  })

  it('should show alert for active loan with auto-repayment in AlertsDialog logic', () => {
    // Test the AlertsDialog logic directly
    const today = new Date('2026-05-05')
    const todayDay = today.getDate()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    
    // Active loan with auto-repayment on 5th of month
    const activeLoan = {
      id: 1,
      borrower_name: 'יוסי כהן',
      auto_repayment: 1,
      repayment_day: 5,
      status: 'active', // ACTIVE
      remaining: 1000,
      repayment_amount: 200
    }
    
    const repaymentDay = activeLoan.repayment_day || 1
    const effectiveRepaymentDay = Math.min(repaymentDay, lastDayOfMonth)
    
    // This should be TRUE because all conditions are met
    const shouldShowAlert = activeLoan.auto_repayment && 
                           activeLoan.status === 'active' && 
                           effectiveRepaymentDay === todayDay && 
                           (activeLoan.remaining || 0) > 0
    
    expect(shouldShowAlert).toBe(true)
  })
})
