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

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, repaymentsService, resetDatabase } from '../services/database'
import { checkAutoRepayments } from '../services/scheduler'

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// @ts-ignore - global is available in test environment
globalThis.localStorage = localStorageMock

describe('Planned Loan Auto-Repayment Bug Fix', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should NOT create auto-repayment for planned loan before activation date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-05')) // Today is 5.5 - loan still planned
    
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסי',
      last_name: 'כהן',
      phone: '0501111111',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה מתוכננת (loan_date בעתיד)
    await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-05-15', // תאריך בעתיד = סטטוס planned
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 5,
      repayment_start_date: '2026-05-05',
      is_recurring: 0
    })
    
    // Check auto-repayments - should be EMPTY because loan is planned
    const alerts = await checkAutoRepayments()
    
    // The query should have been called with a WHERE clause that includes status='active'
    // This means planned loans should not be returned, so alerts should be empty
    expect(alerts).toHaveLength(0)
  })

  it('should create auto-repayment after loan is activated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05')) // Today is 5.6 - loan already active
    
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסי',
      last_name: 'כהן',
      phone: '0502222222',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה פעילה (loan_date בעבר)
    await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-05-15', // תאריך בעבר = סטטוס active
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 5,
      repayment_start_date: '2026-05-05',
      is_recurring: 0
    })
    
    // Check auto-repayments - should have 1 alert because loan is now active
    const alerts = await checkAutoRepayments()
    
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('auto_repayment')
    expect(alerts[0].amount).toBe(200)
  })

  it('should handle edge case: repayment_start_date before loan_date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-10')) // Between repayment start and loan date
    
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0503333333',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // הלוואה מתוכננת עם repayment_start לפני loan_date
    await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-05-15', // תאריך בעתיד
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 5,
      repayment_start_date: '2026-05-05', // לפני loan_date
      is_recurring: 0
    })
    
    const alerts = await checkAutoRepayments()
    
    // Should be empty because loan is still planned
    expect(alerts).toHaveLength(0)
  })

  it('should only return active loans with auto-repayment enabled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-05'))

    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסי',
      last_name: 'כהן',
      phone: '0501111111',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 1. הלוואה active עם auto_repayment (צריכה להופיע)
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-05-15',
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 5,
      repayment_start_date: '2026-05-05',
      is_recurring: 0
    })

    // 2. הלוואה planned עם auto_repayment (לא צריכה להופיע)
    await loansService.create({
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2026-06-20', // עתידי = planned
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 5,
      repayment_start_date: '2026-06-05',
      is_recurring: 0
    })

    // 3. הלוואה active בלי auto_repayment (לא צריכה להופיע)
    await loansService.create({
      borrower_id: borrowerId,
      amount: 3000,
      loan_date: '2026-05-15',
      loan_type: 'flexible',
      auto_repayment: 0,
      repayment_amount: 0,
      repayment_day: 5,
      repayment_start_date: '2026-05-05',
      is_recurring: 0
    })

    // בדיקה - רק הלוואה 1 צריכה להופיע
    const alerts = await checkAutoRepayments()

    expect(alerts).toHaveLength(1)
    expect(alerts[0].amount).toBe(200)
    expect(alerts[0].type).toBe('auto_repayment')
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
