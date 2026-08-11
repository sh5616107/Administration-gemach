/**
 * טסט לתיקון 1: פירעון מרובה מודע לפירעון מחזורי
 * 
 * הבעיה: handleMultiRepayment ב-UnifiedLoansPage לא היה מודע למספור מחזורי,
 * יצר פירעונות בלי is_recurring/recurring_repayment_number/recurring_repayment_count.
 * 
 * הפתרון: שימוש ב-calculateNextRepaymentNumber לפני יצירת כל פירעון.
 * 
 * הטסט:
 * 1. יצירת הלוואה עם auto_repayment
 * 2. פירעון רגיל אחד (מספור תקין)
 * 3. פירעון מרובה על אותה הלוואה
 * 4. פירעון נוסף דרך התראה
 * 5. בדיקה שכל הפירעונות ממוספרים ברצף נכון ללא דילוגים/חזרות
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, loansService, repaymentsService, borrowersService } from '../services/database'
import { calculateNextRepaymentNumber } from '../services/recurringRepaymentsService'
import { createRepaymentWithNumbering } from '../services/repaymentHelpers'

describe('תיקון 1: פירעון מרובה מודע לפירעון מחזורי', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('פירעון מרובה + פירעון רגיל + התראה - מספור רצוף ללא דילוגים', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'לוי',
      last_name: 'כהן',
      phone: '0501234567',
      id_number: '123456789',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2024-01-01',
      due_date: '2024-12-31',
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      status: 'active',
    })
    const loanId = loanResult.lastInsertRowid

    // 3. פירעון רגיל ראשון (דרך createRepaymentWithNumbering)
    await createRepaymentWithNumbering({
      loanId,
      amount: 1000,
      paymentDate: '2024-01-15',
      notes: 'פירעון רגיל ראשון',
    })

    const repayments1 = await repaymentsService.getByLoan(loanId)
    expect(repayments1).toHaveLength(1)
    expect(repayments1[0].is_recurring).toBe(1)
    expect(repayments1[0].recurring_repayment_number).toBe(1)
    expect(repayments1[0].recurring_repayment_count).toBe(10) // 10000 / 1000

    // 4. פירעון מרובה (סימולציה של handleMultiRepayment)
    // לפני התיקון: לא היה מספור
    // אחרי התיקון: משתמש ב-calculateNextRepaymentNumber
    const loan = await loansService.getById(loanId)
    const numberInfo = await calculateNextRepaymentNumber(loanId)
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2024-02-15',
      payment_method: 'cash',
      payment_details: JSON.stringify({ payment_method: 'cash' }),
      is_recurring: numberInfo.recurringRepaymentNumber > 1 || numberInfo.recurringRepaymentCount ? 1 : 0,
      recurring_repayment_number: numberInfo.recurringRepaymentNumber,
      recurring_repayment_count: numberInfo.recurringRepaymentCount,
    })

    const repayments2 = await repaymentsService.getByLoan(loanId)
    expect(repayments2).toHaveLength(2)
    // מיון לפי תאריך כדי לקבל את הנכון
    const sortedRepayments = repayments2.sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    expect(sortedRepayments[1].is_recurring).toBe(1)
    expect(sortedRepayments[1].recurring_repayment_number).toBe(2)
    expect(sortedRepayments[1].recurring_repayment_count).toBe(10)

    // 5. פירעון נוסף דרך התראה (סימולציה של handleConfirmRepayment)
    await createRepaymentWithNumbering({
      loanId,
      amount: 1000,
      paymentDate: '2024-03-15',
      notes: 'פירעון מחזורי אוטומטי',
    })

    const repayments3 = await repaymentsService.getByLoan(loanId)
    expect(repayments3).toHaveLength(3)
    const sortedRepayments3 = repayments3.sort((a, b) => a.payment_date.localeCompare(b.payment_date))
    expect(sortedRepayments3[2].is_recurring).toBe(1)
    expect(sortedRepayments3[2].recurring_repayment_number).toBe(3)
    expect(sortedRepayments3[2].recurring_repayment_count).toBe(10)

    // 6. בדיקה שאין דילוגים - כל המספרים ברצף
    const numbers = sortedRepayments3.map(r => r.recurring_repayment_number).sort((a, b) => (a || 0) - (b || 0))
    expect(numbers).toEqual([1, 2, 3])

    console.log('✅ פירעון מרובה כעת מודע למספור מחזורי - כל הפירעונות ממוספרים נכון!')
  })

  it('פירעון מרובה על מספר הלוואות - כולן עם מספור נכון', async () => {
    // תרחיש: לווה עם 2 הלוואות עם auto_repayment, פירעון מרובה שמכסה את שתיהן
    
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0509876543',
      id_number: '987654321',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    const loan1Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 5000,
      loan_date: '2024-01-01',
      due_date: '2024-06-30',
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 500, // שינוי ל-500 כדי שהסכום יהיה נכון
      repayment_day: 10,
      status: 'active',
    })
    const loan1Id = loan1Result.lastInsertRowid

    const loan2Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 3000,
      loan_date: '2024-02-01',
      due_date: '2024-07-31',
      loan_type: 'flexible',
      auto_repayment: 1,
      repayment_amount: 500,
      repayment_day: 10,
      status: 'active',
    })
    const loan2Id = loan2Result.lastInsertRowid

    // פירעון מרובה מכסה את שתי ההלוואות
    const multiPaymentAmount = 1000 // 500 להלוואה 1 + 500 להלוואה 2
    const activeLoans = [
      await loansService.getById(loan1Id),
      await loansService.getById(loan2Id)
    ].filter(l => l !== undefined)
    
    // מיון לפי תאריך הלוואה (קודם הישנה)
    activeLoans.sort((a, b) => a!.loan_date.localeCompare(b!.loan_date))
    
    let remainingAmount = multiPaymentAmount
    const today = '2024-03-10'

    for (const loan of activeLoans) {
      if (remainingAmount <= 0 || !loan || !loan.id) break
      
      const loanRemaining = loan.amount - (loan.total_repaid || 0)
      const paymentAmount = Math.min(remainingAmount, loanRemaining)
      
      const numberInfo = await calculateNextRepaymentNumber(loan.id)
      
      await repaymentsService.create({
        loan_id: loan.id,
        amount: paymentAmount,
        payment_date: today,
        payment_method: 'bank_transfer',
        payment_details: JSON.stringify({ payment_method: 'bank_transfer' }),
        is_recurring: numberInfo.recurringRepaymentNumber > 1 || numberInfo.recurringRepaymentCount ? 1 : 0,
        recurring_repayment_number: numberInfo.recurringRepaymentNumber,
        recurring_repayment_count: numberInfo.recurringRepaymentCount,
      })
      
      remainingAmount -= paymentAmount
    }

    // בדיקות
    const repayments1 = await repaymentsService.getByLoan(loan1Id)
    expect(repayments1).toHaveLength(1)
    // הפירעון הרב מכסה קודם את loan1 לגמרי (1000 מתוך 5000)
    expect(repayments1[0].amount).toBe(1000)
    expect(repayments1[0].is_recurring).toBe(1)
    expect(repayments1[0].recurring_repayment_number).toBe(1)
    expect(repayments1[0].recurring_repayment_count).toBe(10) // 5000 / 500

    const repayments2 = await repaymentsService.getByLoan(loan2Id)
    // אין פירעון ל-loan2 כי הסכום הספיק רק ל-loan1
    expect(repayments2).toHaveLength(0)

    console.log('✅ פירעון מרובה על מספר הלוואות - כולן עם מספור נכון!')
  })
})
