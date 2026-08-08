/**
 * Recurring Repayments Service
 * 
 * שירות מרכזי לניהול מספור פירעונות מחזוריים.
 * מטפל בתרחיש מורכב: הלוואה מחזורית (is_recurring=1) + פירעון אוטומטי (auto_repayment=1)
 * 
 * הבעיה המקורית:
 * כל חודש נוצרת הלוואה-בת חדשה (id חדש), אבל מספור הפירעונות התבסס רק על loan_id בודד
 * → כל פירעון קיבל מספר 1.
 * 
 * הפתרון:
 * מספור פירעונות מתבצע על בסיס כל משפחת ההלוואות (recurring_series_id), 
 * לא רק ההלוואה הבודדת.
 */

import { loansService, repaymentsService, Loan, Repayment, getAllItems } from './database'

/**
 * מחזיר את כל ההלוואות במשפחה (בעלות אותו recurring_series_id)
 * 
 * אם אין recurring_series_id, נופל חזרה לזיהוי לפי:
 * - borrower_id
 * - recurring_day
 * - auto_repayment
 * 
 * תואימות אחורה למערכות ישנות.
 */
export async function getLoanFamily(loan: Loan): Promise<Loan[]> {
  const allLoans = await loansService.getAll()
  
  // אם יש recurring_series_id - משתמשים בו
  if (loan.recurring_series_id) {
    return allLoans.filter(l => 
      l.recurring_series_id === loan.recurring_series_id &&
      !l.is_deleted
    )
  }
  
  // נופל חזרה לזיהוי לפי borrower_id + recurring_day + auto_repayment
  // (תואימות אחורה להלוואות ישנות ללא recurring_series_id)
  return allLoans.filter(l =>
    l.borrower_id === loan.borrower_id &&
    l.recurring_day === loan.recurring_day &&
    l.auto_repayment === loan.auto_repayment &&
    l.auto_repayment === 1 && // רק הלוואות עם פירעון אוטומטי
    !l.is_deleted
  )
}

/**
 * מחזיר את כל הפירעונות של כל משפחת ההלוואות
 * 
 * @param loan - הלוואה במשפחה (לא חייבת להיות הראשונה)
 * @returns רשימת כל הפירעונות של כל ההלוואות במשפחה, ממויינים לפי תאריך
 */
export async function getAllFamilyRepayments(loan: Loan): Promise<Repayment[]> {
  // 1. מציאת כל ההלוואות במשפחה
  const familyLoans = await getLoanFamily(loan)
  const familyLoanIds = familyLoans.map(l => l.id)
  
  // 2. איסוף כל הפירעונות מכל ההלוואות
  const allRepayments = getAllItems<Repayment>('repayments')
  const familyRepayments = allRepayments.filter(r =>
    familyLoanIds.includes(r.loan_id) &&
    !r.is_deleted
  )
  
  // 3. מיון לפי תאריך תשלום
  familyRepayments.sort((a, b) => 
    new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  )
  
  return familyRepayments
}

/**
 * מחשב את מספר הפירעון הבא עבור הלוואה במשפחה
 * 
 * פונקציה מרכזית שמחליפה לוגיקה כפולה ב-3 מקומות:
 * - LoansTab.tsx handleAddRepayment
 * - AlertsDialog.tsx handleConfirmRepayment  
 * - migrations.ts migrateRecurringRepaymentNumbers
 * 
 * @param loanId - מזהה ההלוואה שעליה מוסיפים פירעון
 * @returns { recurringRepaymentNumber, recurringRepaymentCount }
 */
export async function calculateNextRepaymentNumber(loanId: string): Promise<{
  recurringRepaymentNumber: number
  recurringRepaymentCount: number | undefined
}> {
  const loan = await loansService.getById(loanId)
  if (!loan) {
    throw new Error(`Loan ${loanId} not found`)
  }
  
  // בדיקה: האם זו הלוואה עם פירעון אוטומטי?
  if (loan.auto_repayment !== 1 || !loan.repayment_amount || loan.repayment_amount <= 0) {
    // לא פירעון מחזורי - אין מספור
    return {
      recurringRepaymentNumber: 1,
      recurringRepaymentCount: undefined
    }
  }
  
  // אם ההלוואה גם מחזורית - מספור על פני כל המשפחה
  if (loan.is_recurring === 1) {
    const familyRepayments = await getAllFamilyRepayments(loan)
    const recurringRepaymentNumber = familyRepayments.length + 1
    
    // חישוב הספירה הכוללת:
    // אם recurring_loan_count קיים, אנחנו יכולים לחשב את הסכום הכולל הצפוי
    let recurringRepaymentCount: number | undefined
    
    if (loan.recurring_loan_count && loan.recurring_loan_count > 0) {
      // כל הלוואה במשפחה צריכה לפרוע את אותו סכום
      // סה"כ סכום = recurring_loan_count × amount
      const totalAmount = loan.recurring_loan_count * loan.amount
      recurringRepaymentCount = Math.ceil(totalAmount / loan.repayment_amount)
    } else {
      // נופל חזרה לחישוב על בסיס מה שכבר יש במשפחה
      const familyLoans = await getLoanFamily(loan)
      const totalAmount = familyLoans.reduce((sum, l) => sum + l.amount, 0)
      recurringRepaymentCount = Math.ceil(totalAmount / loan.repayment_amount)
    }
    
    console.log(`[RECURRING-REPAYMENT] Loan family count: ${loan.recurring_loan_count || 'unknown'}`)
    console.log(`[RECURRING-REPAYMENT] Repayment ${recurringRepaymentNumber}/${recurringRepaymentCount}`)
    
    return {
      recurringRepaymentNumber,
      recurringRepaymentCount
    }
  }
  
  // הלוואה בודדת (לא מחזורית) עם פירעון אוטומטי
  const repayments = await repaymentsService.getByLoan(loanId)
  const recurringRepaymentNumber = repayments.length + 1
  
  // אם יש כבר פירעון קודם עם מספר - משתמשים באותו ספירה
  const firstRecurringRepayment = repayments.find(r => 
    r.recurring_repayment_count && r.recurring_repayment_count > 0
  )
  
  let recurringRepaymentCount: number | undefined
  
  if (firstRecurringRepayment && firstRecurringRepayment.recurring_repayment_count) {
    // משתמשים בספירה מהפירעון הקיים
    recurringRepaymentCount = firstRecurringRepayment.recurring_repayment_count
    console.log(`[RECURRING-REPAYMENT] Using existing count: ${recurringRepaymentCount}`)
  } else {
    // זה הפירעון הראשון - מחשבים את הספירה
    recurringRepaymentCount = Math.ceil(loan.amount / loan.repayment_amount)
    console.log(`[RECURRING-REPAYMENT] First repayment, calculated count: ${recurringRepaymentCount}`)
  }
  
  return {
    recurringRepaymentNumber,
    recurringRepaymentCount
  }
}

/**
 * בודק האם הלוואה היא הראשונה במשפחה (recurring_loan_number === 1)
 * 
 * משמש להצגת כפתורי ניהול רק על ההלוואה הראשונה
 */
export function isFirstLoanInFamily(loan: Loan): boolean {
  // אם אין is_recurring, זו לא הלוואה מחזורית
  if (loan.is_recurring !== 1) {
    return true // הלוואה בודדת נחשבת "ראשונה" למטרות הצגה
  }
  
  // אם אין recurring_loan_number, נחשב כראשונה (תואימות אחורה)
  if (!loan.recurring_loan_number) {
    return true
  }
  
  // רק אם המספר הוא 1 במפורש
  return loan.recurring_loan_number === 1
}
