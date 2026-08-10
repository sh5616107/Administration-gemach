/**
 * Test: תיקון באג 5 - עריכת פירעון אוטומטי על הלוואה מחזורית
 * 
 * הבעיה:
 * updateSeriesItems עם itemType='auto_repayment' מעדכן רק את ההלוואה הספציפית (itemId),
 * אבל המתזמן (createRecurringLoan) קורא מההלוואה האחרונה במשפחה (getLatestLoanInSeries).
 * 
 * UI תמיד מעביר firstLoan.id, כך שהעריכה משנה את הלוואה #1,
 * אבל הלוואה #3 (האחרונה) נשארת עם הערך הישן → הלוואה #4 יורשת את הערך הישן.
 * 
 * הבדיקה:
 * יצירת משפחה בת 3 הלוואות דרך createRecurringLoan,
 * פירעונות דרך calculateNextRepaymentNumber,
 * עריכת הסכום מהלוואה #1,
 * יצירת הלוואה #4 → וידוא שהיא יורשת את הסכום החדש.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService, repaymentsService } from '../services/database'
import { createRecurringLoan } from '../services/scheduler'
import { recurringItemsService, ItemType } from '../services/recurringItemsService'
import { calculateNextRepaymentNumber } from '../services/recurringRepaymentsService'

describe('תיקון באג 5: עריכת פירעון אוטומטי על משפחת הלוואות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.useFakeTimers()
  })

  it('should update repayment_amount on ALL loans in family, not just itemId', async () => {
    // יצירת לווה
    const borrowerId = crypto.randomUUID()
    await borrowersService.create({
      id: borrowerId,
      name: 'לווה לבדיקת פירעון אוטומטי',
      id_number: '123456789',
      phone: '0501234567',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה מחזורית ראשונה עם פירעון אוטומטי (חודש 1)
    vi.setSystemTime(new Date('2026-01-05'))
    const loan1 = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: new Date().toISOString().split('T')[0],
      status: 'active',
      balance: 10000,
      is_recurring: 1,
      recurring_day: 5,
      recurring_months: 10,
      recurring_loan_number: 1,
      recurring_loan_count: 11,
      recurring_series_id: crypto.randomUUID(),
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_start_date: '2026-01-15'
    } as any)
    const loanId1 = loan1.lastInsertRowid

    console.log('=== הלוואה #1 נוצרה ===')
    console.log('Loan ID:', loanId1)
    console.log('repayment_amount:', 1000)

    // יצירת פירעון ראשון להלוואה #1
    const { recurringRepaymentNumber: num1, recurringRepaymentCount: count1 } = 
      await calculateNextRepaymentNumber(loanId1)
    
    await repaymentsService.create({
      loan_id: loanId1,
      amount: 1000,
      payment_date: '2026-01-15',
      notes: 'פירעון מחזורי אוטומטי #1',
      is_recurring: 1,
      recurring_repayment_number: num1,
      recurring_repayment_count: count1
    })

    console.log('=== פירעון #1 נוצר ===')

    // יצירת הלוואה #2 (חודש 2)
    vi.setSystemTime(new Date('2026-02-05'))
    const success2 = await createRecurringLoan(loanId1)
    expect(success2).toBe(true)

    let allLoans2 = await loansService.getAll()
    let familyLoans2 = allLoans2.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
    const loan2 = familyLoans2.find(l => l.recurring_loan_number === 2)

    console.log('=== הלוואה #2 נוצרה ===')
    console.log('Loan ID:', loan2!.id)
    console.log('repayment_amount:', loan2!.repayment_amount)

    // יצירת פירעון #2
    const { recurringRepaymentNumber: num2, recurringRepaymentCount: count2 } = 
      await calculateNextRepaymentNumber(loan2!.id)
    
    await repaymentsService.create({
      loan_id: loan2!.id,
      amount: 1000,
      payment_date: '2026-02-15',
      notes: 'פירעון מחזורי אוטומטי #2',
      is_recurring: 1,
      recurring_repayment_number: num2,
      recurring_repayment_count: count2
    })

    console.log('=== פירעון #2 נוצר ===')

    // יצירת הלוואה #3 (חודש 3) - צריך לקרוא מההלוואה האחרונה
    vi.setSystemTime(new Date('2026-03-05'))
    const success3 = await createRecurringLoan(loan2!.id) // ← קריאה מהלוואה #2, לא #1
    expect(success3).toBe(true)

    const allLoans3 = await loansService.getAll()
    const familyLoans3 = allLoans3.filter(l => l.borrower_id === borrowerId && l.is_recurring === 1)
    const loan3 = familyLoans3.find(l => l.recurring_loan_number === 3)

    if (!loan3) {
      console.log('ERROR: Loan #3 not found!')
      console.log('All family loans:', familyLoans3.map(l => ({
        id: l.id,
        num: l.recurring_loan_number,
        date: l.loan_date
      })))
      throw new Error('Loan #3 was not created')
    }

    console.log('=== הלוואה #3 נוצרה ===')
    console.log('Loan ID:', loan3.id)
    console.log('repayment_amount:', loan3.repayment_amount)

    // יצירת פירעון #3
    const { recurringRepaymentNumber: num3, recurringRepaymentCount: count3 } = 
      await calculateNextRepaymentNumber(loan3.id)
    
    await repaymentsService.create({
      loan_id: loan3.id,
      amount: 1000,
      payment_date: '2026-03-15',
      notes: 'פירעון מחזורי אוטומטי #3',
      is_recurring: 1,
      recurring_repayment_number: num3,
      recurring_repayment_count: count3
    })

    console.log('=== פירעון #3 נוצר ===')

    // עריכת פירעון אוטומטי מהלוואה #1 (כמו שה-UI עושה)
    console.log('\n=== עריכת repayment_amount מ-1000 ל-1500 ===')
    const result = await recurringItemsService.updateSeriesItems(
      loanId1,
      'auto_repayment' as ItemType,
      {
        recurring_amount: 1500 // מעדכנים את repayment_amount
      }
    )

    console.log('updateSeriesItems result:', result)
    expect(result.success).toBe(true)

    // ✅ תיקון באג 5: וידוא שכל ההלוואות במשפחה קיבלו את הערך החדש
    const allLoansAfterEdit = await loansService.getAll()
    const familyLoans = allLoansAfterEdit.filter(l => 
      l.borrower_id === borrowerId && l.is_recurring === 1
    )

    console.log('\n=== סטטוס אחרי עריכה ===')
    familyLoans.forEach(l => {
      console.log(`Loan #${l.recurring_loan_number}: repayment_amount=${l.repayment_amount}`)
    })

    // כל ההלוואות במשפחה צריכות לקבל את הערך החדש
    expect(familyLoans).toHaveLength(3)
    familyLoans.forEach(l => {
      expect(l.repayment_amount).toBe(1500)
    })

    // יצירת הלוואה #4 (חודש 4) - צריכה לרשת את הערך החדש
    // קריאה מההלוואה האחרונה במשפחה
    vi.setSystemTime(new Date('2026-04-05'))
    const success4 = await createRecurringLoan(loan3.id) // ← קריאה מהלוואה #3
    expect(success4).toBe(true)

    const allLoans4 = await loansService.getAll()
    const loan4 = allLoans4.filter(l => 
      l.borrower_id === borrowerId && 
      l.is_recurring === 1 &&
      l.recurring_loan_number === 4
    )[0]

    console.log('\n=== הלוואה #4 נוצרה ===')
    console.log('Loan ID:', loan4.id)
    console.log('repayment_amount:', loan4.repayment_amount)

    // ✅ הלוואה #4 צריכה לרשת את הערך החדש (1500), לא הישן (1000)
    expect(loan4.repayment_amount).toBe(1500)
  })

  it('should work correctly for standalone loan (not recurring)', async () => {
    // בדיקה שהתיקון לא שובר את המקרה הפשוט - הלוואה בודדת עם פירעון אוטומטי
    
    const borrowerId = crypto.randomUUID()
    await borrowersService.create({
      id: borrowerId,
      name: 'לווה עם הלוואה בודדת',
      id_number: '987654321',
      phone: '0507654321',
      address: '',
      email: '',
      notes: ''
    })

    // הלוואה בודדת (לא מחזורית) עם פירעון אוטומטי
    const loan = await loansService.create({
      borrower_id: borrowerId,
      amount: 5000,
      loan_date: '2026-01-10',
      status: 'active',
      balance: 5000,
      is_recurring: 0, // לא מחזורית
      auto_repayment: 1,
      repayment_amount: 500,
      repayment_day: 20,
      repayment_start_date: '2026-01-20'
    } as any)
    const loanId = loan.lastInsertRowid

    console.log('=== הלוואה בודדת נוצרה ===')
    console.log('repayment_amount:', 500)

    // עריכת פירעון אוטומטי
    const result = await recurringItemsService.updateSeriesItems(
      loanId,
      'auto_repayment' as ItemType,
      {
        recurring_amount: 700
      }
    )

    expect(result.success).toBe(true)

    // וידוא שההלוואה קיבלה את הערך החדש
    const updatedLoan = await loansService.getById(loanId)
    console.log('=== אחרי עריכה ===')
    console.log('repayment_amount:', updatedLoan!.repayment_amount)

    expect(updatedLoan!.repayment_amount).toBe(700)
  })
})
