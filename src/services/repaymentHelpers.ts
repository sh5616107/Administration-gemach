/**
 * פונקציות עזר לרישום פירעונות עם מספור נכון
 * משותף לשימוש ב-AlertsDialog, UnifiedLoansPage ומקומות נוספים
 */

import { repaymentsService, loansService } from './database'
import { calculateNextRepaymentNumber } from './recurringRepaymentsService'

/**
 * אירוע גלובלי שמשודר בכל פעם שנרשם פירעון, מכל אחת מנקודות היצירה
 * באפליקציה (addRepaymentAtomic, processAutoRepayment, פירעון מרובה,
 * createRepaymentWithNumbering) - דרך closeLoanIfFullyRepaid, שנקרא אחרי
 * כל אחת מהן.
 *
 * הבעיה שהאירוע פותר: מסך "לווים והלוואות" (UnifiedLoansPage) ודף הבית
 * (Dashboard) טוענים את הנתונים שלהם פעם אחת (ב-state מקומי), ואין ביניהם
 * ובין AlertsDialog (הנגיש מכל מקום דרך Layout) שום ערוץ תקשורת. לכן
 * פירעון שנרשם מה-AlertsDialog (או מכל מקום אחר) לא היה משתקף ב"כרטיס
 * הלווה" הפתוח אלא רק אחרי ריענון/בחירה מחדש של הלווה.
 *
 * הפתרון עוקב אחרי התבנית הקיימת ב-useSettings.ts (SETTINGS_CHANGED_EVENT):
 * window.dispatchEvent + window.addEventListener במקום state management גלובלי.
 */
export const REPAYMENT_RECORDED_EVENT = 'gemach-repayment-recorded'

export interface CreateRepaymentParams {
  loanId: string
  amount: number
  paymentDate?: string
  paymentMethod?: string
  paymentDetails?: string
  notes?: string
}

/**
 * יצירת פירעון עם מספור אוטומטי נכון
 * מטפל בכל הלוגיקה של חישוב is_recurring, recurring_repayment_number, recurring_repayment_count
 */
export async function createRepaymentWithNumbering(params: CreateRepaymentParams): Promise<void> {
  const { loanId, amount, paymentDate, paymentMethod, paymentDetails, notes } = params
  
  // קבלת פרטי ההלוואה לחישוב מספרים מחזוריים
  const loan = await loansService.getById(loanId)
  if (!loan) {
    throw new Error(`Loan ${loanId} not found`)
  }
  
  let isRecurring = 0
  let recurringRepaymentNumber: number | undefined
  let recurringRepaymentCount: number | undefined
  
  if (loan.auto_repayment === 1 && loan.repayment_amount && loan.repayment_amount > 0) {
    isRecurring = 1
    
    const result = await calculateNextRepaymentNumber(loanId)
    recurringRepaymentNumber = result.recurringRepaymentNumber
    recurringRepaymentCount = result.recurringRepaymentCount
    
    console.log(`[REPAYMENT-HELPER] Creating recurring repayment ${recurringRepaymentNumber}/${recurringRepaymentCount}`)
  }
  
   await repaymentsService.create({
    loan_id: loanId,
    amount,
    payment_date: paymentDate || new Date().toISOString().split('T')[0],
    payment_method: paymentMethod,
    payment_details: paymentDetails,
    notes,
    is_recurring: isRecurring,
    recurring_repayment_number: recurringRepaymentNumber,
    recurring_repayment_count: recurringRepaymentCount,
  })

  await closeLoanIfFullyRepaid(loanId)
}

/**
 * סוגר הלוואה אוטומטית אם שולמה במלואה (remaining <= 0).
 *
 * נקרא אחרי כל יצירת פירעון, מכל אחת מנקודות היצירה באפליקציה
 * (addRepaymentAtomic, processAutoRepayment, פירעון מרובה, createRepaymentWithNumbering).
 * ללא זה, הלוואה שנפרעה במלואה נשארת עם status='active' לנצח, וממשיכה
 * להופיע כ"פירעון מחזורי צפוי" בתור ההלוואות (עם צפי=0, כי remaining=0).
 *
 * רק active/overdue יכולים לעבור ל-closed, בהתאם ל-validateLoanStatusTransition
 * ב-loanValidators.ts (closed הוא סופי ואין חזרה ממנו).
 */
export async function closeLoanIfFullyRepaid(loanId: string): Promise<boolean> {
  const loan = await loansService.getById(loanId)
  if (!loan) return false

  // משודר תמיד כשמגיעים לכאן עם הלוואה קיימת - כלומר אחרי כל פירעון שנרשם
  // בפועל בכל אחת מנקודות היצירה באפליקציה. ראו תיעוד ה-event למעלה.
  // הבדיקה על dispatchEvent (ולא רק על window) חשובה כי בסביבת הטסטים
  // (vitest, environment: 'node') יש מוק חלקי ל-window בלי dispatchEvent/CustomEvent.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(REPAYMENT_RECORDED_EVENT, {
      detail: { loanId, borrowerId: loan.borrower_id }
    }))
  }

  if (loan.status !== 'active' && loan.status !== 'overdue') return false

  const remaining = loan.remaining ?? (loan.amount - (loan.total_repaid || 0))
  const tolerance = 0.01
  if (remaining > tolerance) return false

  await loansService.update(loanId, { status: 'closed' })
  return true
}