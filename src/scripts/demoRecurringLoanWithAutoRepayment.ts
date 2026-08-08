/**
 * סקריפט דמו: הלוואה מחזורית + פירעון אוטומטי
 * 
 * מדגים את התיקון של מספור פירעונות מחזוריים על משפחת הלוואות.
 * 
 * השתמש בזה כדי לבדוק את התיקון באפליקציה עצמה:
 * - יוצר לווה
 * - יוצר הלוואה מחזורית + פירעון אוטומטי
 * - מדמה 3 חודשים (יצירת 3 הלוואות + 3 פירעונות)
 * - מאמת שהמספור נכון (1/N, 2/N, 3/N)
 */

import { 
  borrowersService, 
  loansService, 
  repaymentsService,
  getAllItems 
} from '../services/database'
import { createRecurringLoan } from '../services/scheduler'
import { calculateNextRepaymentNumber, getLoanFamily } from '../services/recurringRepaymentsService'

interface DemoResult {
  success: boolean
  borrowerId: string
  borrowerName: string
  loans: Array<{
    id: string
    loanNumber: number
    recurringNumber: number
    loanDate: string
    amount: number
    seriesId: string
  }>
  repayments: Array<{
    id: string
    loanId: string
    paymentDate: string
    amount: number
    recurringNumber: number
    recurringCount: number
  }>
  summary: {
    totalLoans: number
    totalRepayments: number
    numberingCorrect: boolean
    expectedPattern: string
    actualPattern: string
  }
  errors: string[]
}

/**
 * מריץ את הדמו המלא
 */
export async function runRecurringLoanAutoRepaymentDemo(): Promise<DemoResult> {
  const errors: string[] = []
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🚀 דמו: הלוואה מחזורית + פירעון אוטומטי')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  
  try {
    // שלב 1: יצירת לווה
    console.log('📝 שלב 1: יצירת לווה דמו...')
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'כהן (דמו)',
      phone: '0501111111',
      id_number: '123456789',
      address: 'רחוב הדמו 1, תל אביב'
    })
    const borrowerId = borrowerResult.lastInsertRowid
    console.log(`   ✅ נוצר לווה: דוד כהן (ID: ${borrowerId})`)
    console.log('')
    
    // שלב 2: יצירת הלוואה מחזורית + פירעון אוטומטי
    console.log('💰 שלב 2: יצירת הלוואה מחזורית עם פירעון אוטומטי...')
    console.log('   📋 פרטי ההלוואה:')
    console.log('      • סכום: 1,000 ₪')
    console.log('      • מחזורית: 11 חודשים (סה"כ 12)')
    console.log('      • יום מחזורי: 5 בחודש')
    console.log('      • פירעון אוטומטי: 100 ₪ ביום 15')
    console.log('')
    
    const today = new Date()
    const loanDate = new Date(today.getFullYear(), today.getMonth(), 5).toISOString().split('T')[0]
    
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: loanDate,
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_months: 11, // עוד 11 חודשים (סה"כ 12)
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 12,
      auto_repayment: 1,
      repayment_amount: 100,
      repayment_day: 15,
      repayment_start_date: new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split('T')[0]
    })
    const originalLoanId = loanResult.lastInsertRowid
    console.log(`   ✅ נוצרה הלוואה #1: ${originalLoanId}`)
    console.log('')
    
    // שלב 3: יצירת פירעון ראשון
    console.log('💵 שלב 3: יצירת פירעון ראשון...')
    const repaymentDate1 = new Date(today.getFullYear(), today.getMonth(), 15).toISOString().split('T')[0]
    
    const { recurringRepaymentNumber: num1, recurringRepaymentCount: count1 } = 
      await calculateNextRepaymentNumber(originalLoanId)
    
    await repaymentsService.create({
      loan_id: originalLoanId,
      amount: 100,
      payment_date: repaymentDate1,
      notes: 'פירעון מחזורי אוטומטי - דמו',
      is_recurring: 1,
      recurring_repayment_number: num1,
      recurring_repayment_count: count1
    })
    
    console.log(`   ✅ נוצר פירעון: ${num1}/${count1}`)
    if (num1 !== 1 || count1 !== 120) {
      errors.push(`פירעון 1 שגוי: קיבלנו ${num1}/${count1}, ציפינו ל-1/120`)
    }
    console.log('')
    
    // שלב 4: יצירת הלוואה-בת שנייה (חודש 2)
    console.log('🔄 שלב 4: יצירת הלוואה מחזורית שנייה (חודש 2)...')
    const success2 = await createRecurringLoan(originalLoanId)
    if (!success2) {
      throw new Error('נכשל ביצירת הלוואה מחזורית שנייה')
    }
    
    const allLoans1 = await loansService.getAll()
    const secondLoan = allLoans1.find(l => 
      l.borrower_id === borrowerId && 
      l.recurring_loan_number === 2
    )
    
    if (!secondLoan) {
      throw new Error('הלוואה שנייה לא נמצאה')
    }
    
    console.log(`   ✅ נוצרה הלוואה #2: ${secondLoan.id}`)
    console.log(`   🔗 Series ID: ${secondLoan.recurring_series_id}`)
    
    // וידוא שההלוואה המקורית קיבלה את אותו series_id
    const updatedOriginal = await loansService.getById(originalLoanId)
    if (updatedOriginal?.recurring_series_id !== secondLoan.recurring_series_id) {
      errors.push('ההלוואה המקורית לא קיבלה את ה-series_id המשותף')
    }
    console.log('')
    
    // שלב 5: יצירת פירעון שני
    console.log('💵 שלב 5: יצירת פירעון שני (להלוואה #2)...')
    const repaymentDate2 = new Date(today.getFullYear(), today.getMonth() + 1, 15).toISOString().split('T')[0]
    
    const { recurringRepaymentNumber: num2, recurringRepaymentCount: count2 } = 
      await calculateNextRepaymentNumber(secondLoan.id)
    
    await repaymentsService.create({
      loan_id: secondLoan.id,
      amount: 100,
      payment_date: repaymentDate2,
      notes: 'פירעון מחזורי אוטומטי - דמו',
      is_recurring: 1,
      recurring_repayment_number: num2,
      recurring_repayment_count: count2
    })
    
    console.log(`   ✅ נוצר פירעון: ${num2}/${count2}`)
    if (num2 !== 2 || count2 !== 120) {
      errors.push(`פירעון 2 שגוי: קיבלנו ${num2}/${count2}, ציפינו ל-2/120`)
    }
    console.log('')
    
    // שלב 6: יצירת הלוואה-בת שלישית (חודש 3)
    console.log('🔄 שלב 6: יצירת הלוואה מחזורית שלישית (חודש 3)...')
    const success3 = await createRecurringLoan(secondLoan.id)
    if (!success3) {
      throw new Error('נכשל ביצירת הלוואה מחזורית שלישית')
    }
    
    const allLoans2 = await loansService.getAll()
    const thirdLoan = allLoans2.find(l => 
      l.borrower_id === borrowerId && 
      l.recurring_loan_number === 3
    )
    
    if (!thirdLoan) {
      throw new Error('הלוואה שלישית לא נמצאה')
    }
    
    console.log(`   ✅ נוצרה הלוואה #3: ${thirdLoan.id}`)
    console.log(`   🔗 Series ID: ${thirdLoan.recurring_series_id}`)
    console.log('')
    
    // שלב 7: יצירת פירעון שלישי
    console.log('💵 שלב 7: יצירת פירעון שלישי (להלוואה #3)...')
    const repaymentDate3 = new Date(today.getFullYear(), today.getMonth() + 2, 15).toISOString().split('T')[0]
    
    const { recurringRepaymentNumber: num3, recurringRepaymentCount: count3 } = 
      await calculateNextRepaymentNumber(thirdLoan.id)
    
    await repaymentsService.create({
      loan_id: thirdLoan.id,
      amount: 100,
      payment_date: repaymentDate3,
      notes: 'פירעון מחזורי אוטומטי - דמו',
      is_recurring: 1,
      recurring_repayment_number: num3,
      recurring_repayment_count: count3
    })
    
    console.log(`   ✅ נוצר פירעון: ${num3}/${count3}`)
    if (num3 !== 3 || count3 !== 120) {
      errors.push(`פירעון 3 שגוי: קיבלנו ${num3}/${count3}, ציפינו ל-3/120`)
    }
    console.log('')
    
    // שלב 8: אימות סופי
    console.log('✔️  שלב 8: אימות המספור על כל המשפחה...')
    
    const family = await getLoanFamily(updatedOriginal!)
    console.log(`   📊 משפחת הלוואות: ${family.length} הלוואות`)
    
    const allRepayments = getAllItems<any>('repayments')
    const familyRepayments = allRepayments.filter(r => 
      family.some(l => l.id === r.loan_id) && !r.is_deleted
    ).sort((a, b) => 
      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
    )
    
    console.log(`   📊 פירעונות: ${familyRepayments.length}`)
    console.log('')
    console.log('   📋 מספור הפירעונות:')
    
    let numberingCorrect = true
    familyRepayments.forEach((r, index) => {
      const expected = index + 1
      const actual = r.recurring_repayment_number
      const status = actual === expected ? '✅' : '❌'
      console.log(`      ${status} פירעון ${index + 1}: ${actual}/${r.recurring_repayment_count} ${actual !== expected ? `(צפוי: ${expected})` : ''}`)
      if (actual !== expected) {
        numberingCorrect = false
        errors.push(`פירעון ${index + 1} שגוי: קיבלנו ${actual}, ציפינו ל-${expected}`)
      }
    })
    
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📈 סיכום:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   • הלוואות נוצרו: ${family.length}`)
    console.log(`   • פירעונות נוצרו: ${familyRepayments.length}`)
    console.log(`   • דפוס צפוי: 1/120, 2/120, 3/120`)
    console.log(`   • דפוס בפועל: ${familyRepayments.map(r => `${r.recurring_repayment_number}/${r.recurring_repayment_count}`).join(', ')}`)
    console.log(`   • מספור נכון: ${numberingCorrect ? '✅ כן' : '❌ לא'}`)
    
    if (errors.length > 0) {
      console.log('')
      console.log('⚠️  שגיאות:')
      errors.forEach(err => console.log(`   • ${err}`))
    } else {
      console.log('')
      console.log('✅ הדמו עבר בהצלחה! התיקון עובד כראוי.')
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    
    // בניית התוצאה
    return {
      success: errors.length === 0,
      borrowerId,
      borrowerName: 'דוד כהן (דמו)',
      loans: family.map(l => ({
        id: l.id,
        loanNumber: l.loan_number,
        recurringNumber: l.recurring_loan_number || 0,
        loanDate: l.loan_date,
        amount: l.amount,
        seriesId: l.recurring_series_id || ''
      })),
      repayments: familyRepayments.map((r: any) => ({
        id: r.id,
        loanId: r.loan_id,
        paymentDate: r.payment_date,
        amount: r.amount,
        recurringNumber: r.recurring_repayment_number,
        recurringCount: r.recurring_repayment_count
      })),
      summary: {
        totalLoans: family.length,
        totalRepayments: familyRepayments.length,
        numberingCorrect,
        expectedPattern: '1/120, 2/120, 3/120',
        actualPattern: familyRepayments.map((r: any) => `${r.recurring_repayment_number}/${r.recurring_repayment_count}`).join(', ')
      },
      errors
    }
    
  } catch (error: any) {
    console.error('❌ שגיאה בהרצת הדמו:', error.message)
    errors.push(`שגיאה כללית: ${error.message}`)
    
    return {
      success: false,
      borrowerId: '',
      borrowerName: '',
      loans: [],
      repayments: [],
      summary: {
        totalLoans: 0,
        totalRepayments: 0,
        numberingCorrect: false,
        expectedPattern: '1/120, 2/120, 3/120',
        actualPattern: 'שגיאה'
      },
      errors
    }
  }
}

/**
 * ניקוי נתוני הדמו
 */
export async function cleanupDemo(borrowerId: string): Promise<void> {
  try {
    console.log('🧹 מנקה נתוני דמו...')
    
    // מחיקת כל ההלוואות של הלווה
    const loans = await loansService.getByBorrower(borrowerId)
    for (const loan of loans) {
      // מחיקת פירעונות
      const repayments = await repaymentsService.getByLoan(loan.id)
      for (const repayment of repayments) {
        await repaymentsService.delete(repayment.id)
      }
      // מחיקת הלוואה
      await loansService.delete(loan.id)
    }
    
    // מחיקת הלווה
    await borrowersService.delete(borrowerId)
    
    console.log('✅ נתוני הדמו נוקו בהצלחה')
  } catch (error: any) {
    console.error('❌ שגיאה בניקוי:', error.message)
  }
}
