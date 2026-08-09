/**
 * טסט לתרחיש מורכב: הלוואה מחזורית + פירעון אוטומטי
 * 
 * זהו הטסט המרכזי שמוודא שהתיקון פועל כראוי:
 * - כל חודש נוצרת הלוואה-בת חדשה (id חדש)
 * - פירעונות ממוספרים נכון על פני כל המשפחה (1, 2, 3... ולא 1, 1, 1...)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, loansService, repaymentsService, borrowersService } from '../services/database'
import { createRecurringLoan } from '../services/scheduler'
import { calculateNextRepaymentNumber, getLoanFamily } from '../services/recurringRepaymentsService'

describe('הלוואה מחזורית + פירעון אוטומטי', () => {
  let borrowerId: string
  let originalLoanId: string

  beforeEach(async () => {
    resetDatabase()
    
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567'
    })
    borrowerId = borrowerResult.lastInsertRowid
  })

  it('מספור פירעונות נכון על פני 3 הלוואות-בנות (3 חודשים)', async () => {
    // 1. יצירת הלוואה ראשונה: מחזורית + פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 11, // עוד 11 חודשים
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15,
      repayment_start_date: '2024-01-15'
    })
    originalLoanId = loanResult.lastInsertRowid

    // 2. יצירת פירעון ראשון להלוואה הראשונה
    const { recurringRepaymentNumber: num1, recurringRepaymentCount: count1 } = 
      await calculateNextRepaymentNumber(originalLoanId)
    
    await repaymentsService.create({
      loan_id: originalLoanId,
      amount: 100,
      payment_date: '2024-01-15',
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: num1,
      recurring_repayment_count: count1
    })

    console.log(`[TEST] פירעון 1: ${num1}/${count1}`)
    expect(num1).toBe(1)
    expect(count1).toBe(120) // 12 הלוואות × 10 פירעונות כל אחת = 120

    // 3. יצירת הלוואה-בת שנייה (סימולציה לחודש הבא)
    const success2 = await createRecurringLoan(originalLoanId)
    expect(success2).toBe(true)

    const allLoans = await loansService.getAll()
    const secondLoan = allLoans.find(l => 
      l.borrower_id === borrowerId && 
      l.recurring_loan_number === 2
    )
    expect(secondLoan).toBeDefined()
    expect(secondLoan!.recurring_series_id).toBeDefined()
    
    // וידוא שההלוואה המקורית קיבלה גם series_id
    const updatedOriginal = await loansService.getById(originalLoanId)
    expect(updatedOriginal!.recurring_series_id).toBe(secondLoan!.recurring_series_id)

    // 4. יצירת פירעון שני להלוואה השנייה
    const { recurringRepaymentNumber: num2, recurringRepaymentCount: count2 } = 
      await calculateNextRepaymentNumber(secondLoan!.id)
    
    await repaymentsService.create({
      loan_id: secondLoan!.id,
      amount: 100,
      payment_date: '2024-02-15',
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: num2,
      recurring_repayment_count: count2
    })

    console.log(`[TEST] פירעון 2: ${num2}/${count2}`)
    expect(num2).toBe(2) // ✅ לא 1!
    expect(count2).toBe(120)

    // 5. יצירת הלוואה-בת שלישית
    const success3 = await createRecurringLoan(secondLoan!.id)
    expect(success3).toBe(true)

    const allLoans2 = await loansService.getAll()
    const thirdLoan = allLoans2.find(l => 
      l.borrower_id === borrowerId && 
      l.recurring_loan_number === 3
    )
    expect(thirdLoan).toBeDefined()
    expect(thirdLoan!.recurring_series_id).toBe(secondLoan!.recurring_series_id)

    // 6. יצירת פירעון שלישי להלוואה השלישית
    const { recurringRepaymentNumber: num3, recurringRepaymentCount: count3 } = 
      await calculateNextRepaymentNumber(thirdLoan!.id)
    
    await repaymentsService.create({
      loan_id: thirdLoan!.id,
      amount: 100,
      payment_date: '2024-03-15',
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: num3,
      recurring_repayment_count: count3
    })

    console.log(`[TEST] פירעון 3: ${num3}/${count3}`)
    expect(num3).toBe(3) // ✅ לא 1!
    expect(count3).toBe(120)

    // 7. וידוא שכל הפירעונות ממוספרים נכון
    const family = await getLoanFamily(updatedOriginal!)
    expect(family.length).toBe(3) // 3 הלוואות במשפחה

    const { getAllItems } = await import('../services/database')
    const allRepayments = getAllItems<any>('repayments')
    const familyRepayments = allRepayments.filter(r => 
      family.some(l => l.id === r.loan_id) && !r.is_deleted
    ).sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    )

    expect(familyRepayments.length).toBe(3)
    expect(familyRepayments[0].recurring_repayment_number).toBe(1)
    expect(familyRepayments[1].recurring_repayment_number).toBe(2)
    expect(familyRepayments[2].recurring_repayment_number).toBe(3)
  })

  it('הלוואה בודדת (לא מחזורית) עם פירעון אוטומטי - רגרסיה', async () => {
    // טסט רגרסיה: וידוא שהלוואה בודדת עדיין מתנהגת נכון
    
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 0, // לא מחזורית
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15,
      repayment_start_date: '2024-01-15'
    })
    const loanId = loanResult.lastInsertRowid

    // פירעון ראשון
    const { recurringRepaymentNumber: num1, recurringRepaymentCount: count1 } = 
      await calculateNextRepaymentNumber(loanId)
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: 100,
      payment_date: '2024-01-15',
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: num1,
      recurring_repayment_count: count1
    })

    expect(num1).toBe(1)
    expect(count1).toBe(10) // 1000 / 100 = 10

    // פירעון שני
    const { recurringRepaymentNumber: num2, recurringRepaymentCount: count2 } = 
      await calculateNextRepaymentNumber(loanId)
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: 100,
      payment_date: '2024-02-15',
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: num2,
      recurring_repayment_count: count2
    })

    expect(num2).toBe(2)
    expect(count2).toBe(10)

    // וידוא שאין משפחה (רק הלוואה אחת)
    const loan = await loansService.getById(loanId)
    const family = await getLoanFamily(loan!)
    expect(family.length).toBe(1)
  })

  it('זיהוי נכון של משפחת הלוואות עם recurring_series_id', async () => {
    // יצירת 3 הלוואות עם אותו series_id
    const seriesId = crypto.randomUUID()

    const loan1Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 2,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 3,
      recurring_series_id: seriesId,
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15
    })

    const loan2Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-02-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 5,
      recurring_loan_number: 2,
      recurring_loan_count: 3,
      recurring_series_id: seriesId,
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15
    })

    const loan3Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-03-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 0,
      recurring_day: 5,
      recurring_loan_number: 3,
      recurring_loan_count: 3,
      recurring_series_id: seriesId,
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15
    })

    // בדיקה: getLoanFamily מזהה את כל 3 ההלוואות
    const loan1 = await loansService.getById(loan1Result.lastInsertRowid)
    const family = await getLoanFamily(loan1!)

    expect(family.length).toBe(3)
    expect(family.every(l => l.recurring_series_id === seriesId)).toBe(true)
  })

  it('זיהוי fallback למשפחת הלוואות ללא recurring_series_id (תואימות אחורה)', async () => {
    // הלוואות ישנות ללא recurring_series_id
    const loan1Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 2,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 3,
      // אין recurring_series_id!
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15
    })

    const loan2Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-02-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 5,
      recurring_loan_number: 2,
      recurring_loan_count: 3,
      // אין recurring_series_id!
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15
    })

    // בדיקה: getLoanFamily עדיין מזהה את ההלוואות לפי borrower+day
    const loan1 = await loansService.getById(loan1Result.lastInsertRowid)
    const family = await getLoanFamily(loan1!)

    expect(family.length).toBe(2)
    expect(family.every(l => l.borrower_id === borrowerId)).toBe(true)
    expect(family.every(l => l.recurring_day === 5)).toBe(true)
  })

  it('✅ FIX: שתי הלוואות נפרדות עם recurring_series_id שונה לא מתערבבות', async () => {
    // תרחיש מהחיים: לווה לוקח שתי הלוואות שונות, שתיהן מחזוריות עם פירעון אוטומטי,
    // אותו recurring_day אבל סכומים שונים לחלוטין
    
    // הלוואה 1: ₪500 - עם recurring_series_id
    const seriesId1 = crypto.randomUUID()
    const loan1Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      recurring_series_id: seriesId1, // ✅ נוצר ביצירת ההלוואה
      auto_repayment: 1,
      repayment_amount: 50,
      repayment_day: 15
    })
    const loan1Id = loan1Result.lastInsertRowid

    // הלוואה 2: ₪2000 - הלוואה נפרדת לגמרי עם recurring_series_id שונה!
    const seriesId2 = crypto.randomUUID()
    const loan2Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 5,
      recurring_day: 5, // אותו יום
      recurring_loan_number: 1,
      recurring_loan_count: 6,
      recurring_series_id: seriesId2, // ✅ נוצר ביצירת ההלוואה
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 15
    })
    const loan2Id = loan2Result.lastInsertRowid

    // ✅ התיקון: כל משפחה נפרדת!
    const loan1 = await loansService.getById(loan1Id)
    const family1 = await getLoanFamily(loan1!)

    const loan2 = await loansService.getById(loan2Id)
    const family2 = await getLoanFamily(loan2!)

    console.log(`[FIX] משפחת הלוואה 1 (₪500): ${family1.length} הלוואות`)
    console.log(`[FIX] משפחת הלוואה 2 (₪2000): ${family2.length} הלוואות`)

    // ✅ כעת כל הלוואה במשפחה נפרדת
    expect(family1.length).toBe(1)
    expect(family2.length).toBe(1)
    expect(family1[0].recurring_series_id).toBe(seriesId1)
    expect(family2[0].recurring_series_id).toBe(seriesId2)
  })

  it('🐛 BUG: שתי הלוואות נפרדות של אותו לווה באותו יום מתערבבות ללא recurring_series_id', async () => {
    // תרחיש מהחיים: לווה לוקח שתי הלוואות שונות, שתיהן מחזוריות עם פירעון אוטומטי,
    // אותו recurring_day אבל סכומים שונים לחלוטין
    
    // הלוואה 1: ₪500
    const loan1Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 11,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      // ❌ אין recurring_series_id כי זו הלוואה ראשונה שנוצרת דרך UI
      auto_repayment: 1,
      repayment_amount: 50,
      repayment_day: 15
    })
    const loan1Id = loan1Result.lastInsertRowid

    // הלוואה 2: ₪2000 - הלוואה נפרדת לגמרי!
    const loan2Result = await loansService.create({
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 5,
      recurring_day: 5, // אותו יום
      recurring_loan_number: 1,
      recurring_loan_count: 6,
      // ❌ אין recurring_series_id כי זו הלוואה ראשונה שנוצרת דרך UI
      auto_repayment: 1,
      repayment_amount: 200,
      repayment_day: 15
    })
    const loan2Id = loan2Result.lastInsertRowid

    // 🐛 הבעיה: getLoanFamily מערבב את שתיהן!
    const loan1 = await loansService.getById(loan1Id)
    const family1 = await getLoanFamily(loan1!)

    const loan2 = await loansService.getById(loan2Id)
    const family2 = await getLoanFamily(loan2!)

    console.log(`[BUG] משפחת הלוואה 1 (₪500): ${family1.length} הלוואות`)
    console.log(`[BUG] משפחת הלוואה 2 (₪2000): ${family2.length} הלוואות`)

    // ❌ הבאג: שתיהן מחזירות 2 הלוואות במקום 1
    // הזיהוי לפי borrower_id + recurring_day + auto_repayment לא מספיק!
    expect(family1.length).toBe(2) // ⚠️ שגוי! צריך להיות 1
    expect(family2.length).toBe(2) // ⚠️ שגוי! צריך להיות 1

    // ✅ אחרי התיקון, כל הלוואה תקבל recurring_series_id משלה ביצירה,
    // והמשפחות יהיו נפרדות:
    // expect(family1.length).toBe(1)
    // expect(family2.length).toBe(1)
  })
})
