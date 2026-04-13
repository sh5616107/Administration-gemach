import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'

// Mock the scheduler to test the logic
const autoCreateRecurringLoans = async () => {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  const allLoans = await loansService.getAll() as any[]
  const createdLoans: number[] = []
  
  for (const loan of allLoans) {
    if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
    
    const recurringDay = loan.recurring_day || 1
    const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
    
    const shouldCreateToday = effectiveRecurringDay === day
    const isPastRecurringDay = day > effectiveRecurringDay
    
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    
    // IMPORTANT: Skip if this loan was created this month!
    if (loan.loan_date >= firstDayOfMonth && loan.loan_date <= todayStr) {
      console.log(`[TEST] Loan #${loan.id} was created this month, skipping`)
      continue
    }
    
    const currentRecurringNumber = loan.recurring_loan_number || 1
    const nextRecurringNumber = currentRecurringNumber + 1
    
    const existingLoanThisMonth = allLoans.find((l: any) => 
      l.borrower_id === loan.borrower_id && 
      l.amount === loan.amount && 
      l.loan_date >= firstDayOfMonth &&
      l.loan_date <= todayStr &&
      l.id !== loan.id &&
      l.is_recurring === 1 &&
      l.recurring_loan_number === nextRecurringNumber
    )
    
    if (existingLoanThisMonth) {
      console.log(`[TEST] Loan #${nextRecurringNumber} already exists for this month: loan #${loan.id}`)
      continue
    }
    
    if (shouldCreateToday || isPastRecurringDay) {
      console.log(`[TEST] Would create recurring loan from loan #${loan.id} (number ${currentRecurringNumber} -> ${nextRecurringNumber})`)
      createdLoans.push(loan.id)
    }
  }
  
  return createdLoans
}

describe('Recurring Loan Duplication Prevention', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
  })

  it('should not create duplicate loans when running scheduler multiple times', async () => {
    // Set date to April 12, 2026
    vi.setSystemTime(new Date('2026-04-12'))
    
    // Create borrower
    const borrower = await borrowersService.create({
      first_name: 'בן',
      last_name: 'ציון',
      id_number: '123456789',
      phone: '0501234567',
    })
    
    // Create loan 2/12 from March 5
    const loan2 = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 1300,
      loan_date: '2026-03-05',
      is_recurring: 1,
      recurring_months: 10, // Still has 10 more to create
      recurring_day: 5,
      recurring_loan_number: 2,
      recurring_loan_count: 12,
      status: 'active',
    })
    
    console.log('Created loan 2/12:', loan2.lastInsertRowid)
    
    // First run - should create loan 3/12
    console.log('\n=== FIRST RUN ===')
    const firstRun = await autoCreateRecurringLoans()
    console.log('First run would create from loans:', firstRun)
    expect(firstRun).toHaveLength(1)
    expect(firstRun[0]).toBe(loan2.lastInsertRowid)
    
    // Simulate creating the loan
    const loan3 = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 1300,
      loan_date: '2026-04-12', // Created today
      is_recurring: 1,
      recurring_months: 9,
      recurring_day: 5,
      recurring_loan_number: 3,
      recurring_loan_count: 12,
      status: 'active',
    })
    
    console.log('Created loan 3/12:', loan3.lastInsertRowid)
    
    // Update loan 2 to have one less recurring month
    await loansService.update(loan2.lastInsertRowid, { recurring_months: 9 })
    
    // Second run - should NOT create anything (loan 3 already exists)
    console.log('\n=== SECOND RUN ===')
    const secondRun = await autoCreateRecurringLoans()
    console.log('Second run would create from loans:', secondRun)
    expect(secondRun).toHaveLength(0) // Should be empty!
    
    // Verify we have exactly 2 loans
    const allLoans = await loansService.getAll()
    const recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    console.log('\nTotal recurring loans:', recurringLoans.length)
    console.log('Loan numbers:', recurringLoans.map(l => l.recurring_loan_number))
    
    expect(recurringLoans).toHaveLength(2)
    expect(recurringLoans.map(l => l.recurring_loan_number).sort()).toEqual([2, 3])
  })
})
