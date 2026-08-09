/**
 * Test: Edit recurring series should only affect future items
 * 
 * Verifies that editing recurring parameters (amount, day) does not
 * change items that were already created in the past, only future ones.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'
import { recurringItemsService, ItemType } from '../services/recurringItemsService'
import type { Loan } from '../services/database'

describe('Edit Recurring - Future Only', () => {
  let testBorrowerId: string
  let testLoanId: string

  beforeEach(async () => {
    resetDatabase()
    
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

    // Create recurring loan with 3 children (total 4)
    const seriesId = crypto.randomUUID()
    const baseDate = new Date('2024-01-15') // Past date
    
    const loanIds: string[] = []
    
    for (let i = 0; i < 4; i++) {
      const loanDate = new Date(baseDate)
      loanDate.setMonth(loanDate.getMonth() + i)
      
      const loan: Partial<Loan> = {
        borrower_id: testBorrowerId,
        amount: 1000,
        loan_date: loanDate.toISOString().split('T')[0],
        status: 'active',
        balance: 1000,
        is_recurring: 1,
        recurring_day: 15,
        recurring_months: 4 - i - 1, // Decreases: 3, 2, 1, 0
        recurring_loan_number: i + 1,
        recurring_loan_count: 4,
        recurring_series_id: seriesId
      }
      
      const created = await loansService.create(loan as any)
      loanIds.push(created.lastInsertRowid)
    }
    
    testLoanId = loanIds[0]
  })

  it('should update only future loans when editing series', async () => {
    // Verify loans were created
    const allLoans = await loansService.getAll()
    const testLoans = allLoans.filter(l => l.borrower_id === testBorrowerId)
    expect(testLoans.length).toBe(4)
    
    // Get all loans in series before update
    const beforeLoans = await recurringItemsService.getSeriesItems(testLoanId, 'loan' as ItemType)
    expect(beforeLoans.length).toBe(4)

    // Today is August 2026 (from system date in context)
    // All 4 loans from 2024 are in the past
    const pastLoans = beforeLoans.filter(item => item.isPast)
    const futureLoans = beforeLoans.filter(item => !item.isPast)
    
    // All should be past (2024 dates)
    expect(pastLoans.length).toBe(4)
    expect(futureLoans.length).toBe(0)

    // Update: change amount from 1000 to 1500
    const result = await recurringItemsService.updateSeriesItems(
      testLoanId,
      'loan' as ItemType,
      {
        recurring_amount: 1500,
        recurring_day: 15,
        recurring_months: 3
      }
    )

    expect(result.success).toBe(true)

    // Get loans after update
    const afterLoans = await loansService.getAll()
    const seriesLoansAfter = afterLoans.filter(l => 
      l.borrower_id === testBorrowerId && l.is_recurring === 1
    )
    
    expect(seriesLoansAfter.length).toBe(4)

    // ✅ תיקון באג 1: ההלוואה האחרונה בסדרה (לפי recurring_loan_number) צריכה להשתנות
    // כי היא זו שממנה המתזמן יקרא בפעם הבאה
    const latestLoan = seriesLoansAfter.reduce((latest, current) => 
      (current.recurring_loan_number || 1) > (latest.recurring_loan_number || 1) ? current : latest
    , seriesLoansAfter[0])

    // Past loans (except the latest) should NOT change
    const nonLatestLoans = seriesLoansAfter.filter(l => l.id !== latestLoan.id)
    for (const seriesLoan of nonLatestLoans) {
      expect(seriesLoan.amount).toBe(1000) // Original amount, not changed
    }

    // The latest loan should change to the new amount
    expect(latestLoan.amount).toBe(1500) // Updated amount
    expect(latestLoan.recurring_months).toBe(3) // Updated months
  })

  it('should update only future items in mixed past/future series', async () => {
    // Create a new series with mixed dates
    const seriesId = crypto.randomUUID()
    const borrowerId = crypto.randomUUID()
    
    await borrowersService.create({
      id: borrowerId,
      name: 'לווה מעורב',
      id_number: '987654321',
      phone: '0507654321',
      address: '',
      email: '',
      notes: ''
    })

    const loans: string[] = []
    
    // Create 2 past loans (2024)
    for (let i = 0; i < 2; i++) {
      const loanDate = new Date('2024-06-10')
      loanDate.setMonth(loanDate.getMonth() + i)
      
      const created = await loansService.create({
        borrower_id: borrowerId,
        amount: 2000,
        loan_date: loanDate.toISOString().split('T')[0],
        status: 'active',
        balance: 2000,
        is_recurring: 1,
        recurring_day: 10,
        recurring_months: 3 - i,
        recurring_loan_number: i + 1,
        recurring_loan_count: 4,
        recurring_series_id: seriesId
      } as any)
      loans.push(created.lastInsertRowid)
    }

    // Create 2 future loans (2026-09, 2026-10)
    for (let i = 2; i < 4; i++) {
      const loanDate = new Date('2026-09-10')
      loanDate.setMonth(loanDate.getMonth() + (i - 2))
      
      const created = await loansService.create({
        borrower_id: borrowerId,
        amount: 2000,
        loan_date: loanDate.toISOString().split('T')[0],
        status: 'active',
        balance: 2000,
        is_recurring: 1,
        recurring_day: 10,
        recurring_months: 3 - i,
        recurring_loan_number: i + 1,
        recurring_loan_count: 4,
        recurring_series_id: seriesId
      } as any)
      loans.push(created.lastInsertRowid)
    }

    // Update series: change amount to 2500
    const result = await recurringItemsService.updateSeriesItems(
      loans[0],
      'loan' as ItemType,
      {
        recurring_amount: 2500,
        recurring_day: 10,
        recurring_months: 1
      }
    )

    expect(result.success).toBe(true)

    // Verify: past loans unchanged, future loans + latest updated
    const allLoans = await loansService.getAll()
    const seriesLoans = allLoans.filter(l => l.recurring_series_id === seriesId)

    // ✅ תיקון באג 1: מציאת ההלוואה האחרונה בסדרה
    const latestLoan = seriesLoans.reduce((latest, current) => 
      (current.recurring_loan_number || 1) > (latest.recurring_loan_number || 1) ? current : latest
    , seriesLoans[0])

    // Past loans (index 0, 1) - לא עתידיות ולא האחרונה - should remain 2000
    expect(seriesLoans.find(l => l.id === loans[0])!.amount).toBe(2000)
    expect(seriesLoans.find(l => l.id === loans[1])!.amount).toBe(2000)

    // Future loans (index 2, 3) - should be 2500
    // שתיהן עתידיות (ספטמבר ואוקטובר 2026), וגם loan 3 היא האחרונה
    expect(seriesLoans.find(l => l.id === loans[2])!.amount).toBe(2500)
    expect(seriesLoans.find(l => l.id === loans[3])!.amount).toBe(2500)
    expect(latestLoan.id).toBe(loans[3]) // וידוא שהאחרונה היא אכן #4
  })
})
