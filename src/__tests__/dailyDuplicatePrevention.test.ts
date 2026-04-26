import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'
import { autoCreateRecurringLoans } from '../services/scheduler'

describe('🔴 באג קריטי: מניעת יצירת הלוואות כל יום', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
    localStorage.removeItem('gemach_missed_loans_repair_log')
  })

  it('לא צריך ליצור הלוואה חדשה כל יום אחרי שעבר היום הקבוע', async () => {
    // יום 5 באפריל - יצירת הלוואה מחזורית
    vi.setSystemTime(new Date('2026-04-05'))
    
    const borrower = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'כהן',
      id_number: '123456789',
      phone: '0501234567',
    })
    
    // הלוואה מחזורית שאמורה להיווצר ב-5 לכל חודש
    const loan1 = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 400,
      loan_date: '2026-03-05',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      auto_repayment: 0,
    })
    await loansService.update(loan1.lastInsertRowid, { status: 'active' })
    
    // יום 5 באפריל - צריך ליצור הלוואה
    await autoCreateRecurringLoans()
    
    let allLoans = await loansService.getAll()
    let recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    expect(recurringLoans).toHaveLength(2) // מרץ + אפריל
    
    const aprilLoan = recurringLoans.find(l => l.loan_date === '2026-04-05')
    expect(aprilLoan).toBeDefined()
    expect(aprilLoan?.recurring_loan_number).toBe(2)
    
    // יום 24 באפריל - לא צריך ליצור הלוואה נוספת!
    vi.setSystemTime(new Date('2026-04-24'))
    await autoCreateRecurringLoans()
    
    allLoans = await loansService.getAll()
    recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    expect(recurringLoans).toHaveLength(2) // עדיין רק 2!
    
    // יום 25 באפריל - עדיין לא צריך ליצור!
    vi.setSystemTime(new Date('2026-04-25'))
    await autoCreateRecurringLoans()
    
    allLoans = await loansService.getAll()
    recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    expect(recurringLoans).toHaveLength(2) // עדיין רק 2!
    
    // יום 26 באפריל - עדיין לא צריך ליצור!
    vi.setSystemTime(new Date('2026-04-26'))
    await autoCreateRecurringLoans()
    
    allLoans = await loansService.getAll()
    recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    expect(recurringLoans).toHaveLength(2) // עדיין רק 2!
    
    // וודא שאין הלוואות מיום 24, 25, 26
    const loansAfter5th = recurringLoans.filter(l => 
      l.loan_date > '2026-04-05' && l.loan_date <= '2026-04-26'
    )
    expect(loansAfter5th).toHaveLength(0)
  })

  it('צריך ליצור הלוואה חדשה רק בחודש הבא', async () => {
    // יום 5 באפריל
    vi.setSystemTime(new Date('2026-04-05'))
    
    const borrower = await borrowersService.create({
      first_name: 'שרה',
      last_name: 'לוי',
      id_number: '987654321',
      phone: '0509876543',
    })
    
    const loan1 = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 400,
      loan_date: '2026-03-05',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      auto_repayment: 0,
    })
    await loansService.update(loan1.lastInsertRowid, { status: 'active' })
    
    // יצירת הלוואת אפריל
    await autoCreateRecurringLoans()
    
    let allLoans = await loansService.getAll()
    expect(allLoans.filter(l => l.is_recurring === 1)).toHaveLength(2)
    
    // קפיצה ליום 5 במאי - עכשיו כן צריך ליצור!
    vi.setSystemTime(new Date('2026-05-05'))
    await autoCreateRecurringLoans()
    
    allLoans = await loansService.getAll()
    const recurringLoans = allLoans.filter(l => l.is_recurring === 1)
    expect(recurringLoans).toHaveLength(3) // מרץ + אפריל + מאי
    
    const mayLoan = recurringLoans.find(l => l.loan_date === '2026-05-05')
    expect(mayLoan).toBeDefined()
    expect(mayLoan?.recurring_loan_number).toBe(3)
  })
})
