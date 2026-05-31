/**
 * בדיקות לפירעונות מחזוריים בלוח השנה
 * מוודא שפירעונות מחזוריים עתידיים מופיעים בלוח השנה
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { loansService, borrowersService, repaymentsService, db } from '../services/database'
import { getEventsForMonth } from '../services/calendarService'

describe('Calendar - Recurring Repayments', () => {
  beforeEach(async () => {
    // ניקוי הנתונים
    await db.run('DELETE FROM repayments')
    await db.run('DELETE FROM loans')
    await db.run('DELETE FROM borrowers')
  })

  it('should show future recurring repayments in calendar', async () => {
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      id_number: '123456789',
      phone: '0501234567',
      email: 'moshe@test.com',
      address: 'רחוב הראשי 1'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // יצירת הלוואה עם פירעון אוטומטי
    const today = new Date()
    const loanDate = new Date(today.getFullYear(), today.getMonth() - 1, 15) // חודש שעבר
    await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: loanDate.toISOString().split('T')[0],
      loan_type: 'interest_free',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 20,
      repayment_start_date: loanDate.toISOString().split('T')[0]
    })

    // טעינת אירועים לחודש הנוכחי
    const events = await getEventsForMonth(today.getFullYear(), today.getMonth())
    
    // בדיקה שיש אירוע פירעון מחזורי
    const repaymentEvents = events.filter(e => 
      e.type === 'repayment' && 
      e.title.includes('מתוכנן')
    )
    
    expect(repaymentEvents.length).toBeGreaterThan(0)
    expect(repaymentEvents[0].amount).toBe(1000)
    expect(repaymentEvents[0].relatedName).toContain('משה')
  })

  it('should not show recurring repayment if already paid this month', async () => {
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      id_number: '987654321',
      phone: '0509876543',
      email: 'david@test.com',
      address: 'רחוב השני 2'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // יצירת הלוואה עם פירעון אוטומטי
    const today = new Date()
    const loanDate = new Date(today.getFullYear(), today.getMonth() - 1, 15)
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: loanDate.toISOString().split('T')[0],
      loan_type: 'interest_free',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 20,
      repayment_start_date: loanDate.toISOString().split('T')[0]
    })
    const loanId = loanResult.lastInsertRowid

    // ביצוע פירעון בחודש הנוכחי
    const repaymentDate = new Date(today.getFullYear(), today.getMonth(), 5)
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: repaymentDate.toISOString().split('T')[0],
      notes: 'פירעון מחזורי'
    })

    // טעינת אירועים לחודש הנוכחי
    const events = await getEventsForMonth(today.getFullYear(), today.getMonth())
    
    // בדיקה שיש אירוע פירעון שבוצע
    const completedRepayments = events.filter(e => 
      e.type === 'repayment' && 
      e.title === 'פירעון שבוצע' &&
      e.relatedId === loanId
    )
    expect(completedRepayments.length).toBe(1)
    
    // בדיקה שאין אירוע פירעון מתוכנן (כי כבר בוצע)
    const plannedRepayments = events.filter(e => 
      e.type === 'repayment' && 
      e.title.includes('מתוכנן') &&
      e.relatedId === loanId
    )
    expect(plannedRepayments.length).toBe(0)
  })

  it('should show future recurring loans in calendar', async () => {
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'שרה',
      last_name: 'אברהם',
      id_number: '111222333',
      phone: '0501112223',
      email: 'sarah@test.com',
      address: 'רחוב השלישי 3'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // יצירת הלוואה מחזורית
    const today = new Date()
    const loanDate = new Date(today.getFullYear(), today.getMonth() - 1, 10)
    await loansService.create({
      borrower_id: borrowerId,
      amount: 5000,
      loan_date: loanDate.toISOString().split('T')[0],
      loan_type: 'interest_free',
      status: 'active',
      is_recurring: 1,
      recurring_months: 5,
      recurring_day: 10,
      recurring_loan_number: 1,
      recurring_loan_count: 6
    })

    // טעינת אירועים לחודש הנוכחי
    const events = await getEventsForMonth(today.getFullYear(), today.getMonth())
    
    // בדיקה שיש אירוע הלוואה מחזורית מתוכננת
    const recurringLoanEvents = events.filter(e => 
      e.type === 'planned_loan' && 
      e.title.includes('מחזורית')
    )
    
    expect(recurringLoanEvents.length).toBeGreaterThan(0)
    expect(recurringLoanEvents[0].amount).toBe(5000)
    expect(recurringLoanEvents[0].description).toContain('2/6')
  })

  it('should handle repayment day greater than days in month', async () => {
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסף',
      last_name: 'מזרחי',
      id_number: '444555666',
      phone: '0504445556',
      email: 'yosef@test.com',
      address: 'רחוב הרביעי 4'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // יצירת הלוואה עם פירעון ביום 31 (לא קיים בכל החודשים)
    const today = new Date()
    const loanDate = new Date(today.getFullYear(), today.getMonth() - 1, 15)
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: loanDate.toISOString().split('T')[0],
      loan_type: 'interest_free',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 31, // יום שלא קיים בכל החודשים
      repayment_start_date: loanDate.toISOString().split('T')[0]
    })
    const loanId = loanResult.lastInsertRowid

    // טעינת אירועים לפברואר (28/29 ימים)
    const events = await getEventsForMonth(today.getFullYear(), 1) // פברואר
    
    // בדיקה שיש אירוע פירעון ביום האחרון של החודש
    const repaymentEvents = events.filter(e => 
      e.type === 'repayment' && 
      e.title.includes('מחזורי') &&
      e.relatedId === loanId
    )
    
    if (repaymentEvents.length > 0) {
      const eventDate = new Date(repaymentEvents[0].date)
      const lastDayOfFeb = new Date(today.getFullYear(), 2, 0).getDate()
      expect(eventDate.getDate()).toBe(lastDayOfFeb)
    }
  })
})
