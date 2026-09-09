/**
 * Loan & Repayment Domain Validators
 * 
 * מכיל את כל ה-invariants הקריטיים של הלוואות ופירעונות:
 * - סכומים חיוביים
 * - יתרות תקינות
 * - מעברי סטטוס חוקיים
 * - קשרים בין ישויות
 */

import type { Loan, Repayment } from '../database'
import { validResult, invalidResult, invalidSingle, combineResults, type ValidationResult } from './types'

/**
 * וידוא סכום הלוואה תקין
 * 
 * Invariants:
 * - סכום > 0
 * - סכום סופי (לא NaN, Infinity)
 * - מספר עם עד 2 ספרות אחרי הנקודה (מטבע)
 */
export function validateLoanAmount(amount: number): ValidationResult {
  const errors: string[] = []

  if (!Number.isFinite(amount)) {
    errors.push('סכום ההלוואה חייב להיות מספר תקין')
    return invalidResult(errors)
  }

  if (amount <= 0) {
    errors.push('סכום ההלוואה חייב להיות גדול מ-0')
  }

  // בדיקת דיוק מטבע (עד 2 ספרות אחרי הנקודה)
  const rounded = Math.round(amount * 100) / 100
  if (Math.abs(amount - rounded) > 0.0001) {
    errors.push('סכום ההלוואה יכול להכיל עד 2 ספרות אחרי הנקודה')
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא סכום פירעון תקין
 * 
 * Invariants:
 * - סכום > 0
 * - סכום <= יתרת ההלוואה
 * - סכום סופי
 * - דיוק מטבע
 */
export function validateRepaymentAmount(
  amount: number,
  loanRemaining: number
): ValidationResult {
  const errors: string[] = []

  if (!Number.isFinite(amount)) {
    errors.push('סכום הפירעון חייב להיות מספר תקין')
    return invalidResult(errors)
  }

  if (amount <= 0) {
    errors.push('סכום הפירעון חייב להיות גדול מ-0')
  }

  if (!Number.isFinite(loanRemaining)) {
    errors.push('יתרת ההלוואה לא תקינה')
    return invalidResult(errors)
  }

  // בדיקת חריגה מיתרה (עם tolerance קטן למקרים של floating point)
  const tolerance = 0.01
  if (amount > loanRemaining + tolerance) {
    errors.push(`סכום הפירעון (${amount.toFixed(2)}) גדול מיתרת ההלוואה (${loanRemaining.toFixed(2)})`)
  }

  // בדיקת דיוק מטבע
  const rounded = Math.round(amount * 100) / 100
  if (Math.abs(amount - rounded) > 0.0001) {
    errors.push('סכום הפירעון יכול להכיל עד 2 ספרות אחרי הנקודה')
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא סטטוס הלוואה תקין
 * 
 * Statuses תקינים: 'active', 'closed', 'planned', 'overdue'
 */
export function validateLoanStatus(status: string): ValidationResult {
  const validStatuses = ['active', 'closed', 'planned', 'overdue']
  
  if (!validStatuses.includes(status)) {
    return invalidSingle(`סטטוס לא תקין: ${status}. סטטוסים אפשריים: ${validStatuses.join(', ')}`)
  }

  return validResult()
}

/**
 * וידוא מעבר סטטוס חוקי
 * 
 * Allowed transitions:
 * - planned → active (תאריך ההלוואה הגיע)
 * - active → closed (שולם במלואו)
 * - active → overdue (חרג מתאריך פירעון)
 * - overdue → closed (שולם במלואו)
 * - overdue → active (חזרה למעקב רגיל)
 * 
 * NOT allowed:
 * - closed → active/overdue (לא להחיות הלוואות סגורות)
 * - anything → planned (לא לחזור למתוכנן)
 */
export function validateLoanStatusTransition(
  currentStatus: string,
  newStatus: string
): ValidationResult {
  // אותו סטטוס - תמיד מותר
  if (currentStatus === newStatus) {
    return validResult()
  }

  const allowedTransitions: Record<string, string[]> = {
    planned: ['active'],
    active: ['closed', 'overdue'],
    overdue: ['closed', 'active'],
    closed: [] // אין מעברים מ-closed
  }

  const allowed = allowedTransitions[currentStatus] || []
  
  if (!allowed.includes(newStatus)) {
    return invalidSingle(
      `מעבר סטטוס לא חוקי: ${currentStatus} → ${newStatus}. מעברים מותרים: ${allowed.join(', ') || 'אין'}`
    )
  }

  return validResult()
}

/**
 * וידוא יתרת הלוואה תקינה
 * 
 * Invariants:
 * - remaining = amount - sum(repayments)
 * - remaining >= 0
 * - אם remaining = 0, status צריך להיות 'closed'
 * - אם status = 'closed', remaining צריך להיות 0
 */
export function validateLoanBalance(
  loan: Loan,
  repayments: Repayment[]
): ValidationResult {
  const errors: string[] = []

  const totalRepaid = repayments
    .filter(r => !r.is_deleted)
    .reduce((sum, r) => sum + r.amount, 0)
  
  const calculatedRemaining = loan.amount - totalRepaid
  const tolerance = 0.01 // tolerance ל-floating point

  // בדיקה 1: יתרה מחושבת נכון
  if (loan.remaining !== undefined) {
    const diff = Math.abs(loan.remaining - calculatedRemaining)
    if (diff > tolerance) {
      errors.push(
        `יתרה לא עקבית: remaining=${loan.remaining.toFixed(2)}, ` +
        `צריך להיות ${calculatedRemaining.toFixed(2)} (amount=${loan.amount} - totalRepaid=${totalRepaid.toFixed(2)})`
      )
    }
  }

  // בדיקה 2: יתרה לא שלילית
  if (calculatedRemaining < -tolerance) {
    errors.push(`יתרה שלילית: ${calculatedRemaining.toFixed(2)} (פורעו יותר מסכום ההלוואה)`)
  }

  // בדיקה 3: עקביות status vs remaining
  if (loan.status === 'closed' && calculatedRemaining > tolerance) {
    errors.push(
      `הלוואה מסומנת כסגורה אך יש יתרה: ${calculatedRemaining.toFixed(2)}`
    )
  }

  if (calculatedRemaining <= tolerance && loan.status !== 'closed') {
    errors.push(
      `הלוואה שולמה במלואה אך לא מסומנת כסגורה (status=${loan.status})`
    )
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא תאריכי הלוואה תקינים
 * 
 * Invariants:
 * - loan_date קיים
 * - due_date (אם קיים) >= loan_date
 * - תאריכים בפורמט תקין (YYYY-MM-DD)
 */
export function validateLoanDates(
  loanDate: string,
  dueDate?: string
): ValidationResult {
  const errors: string[] = []

  // בדיקת פורמט loan_date
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(loanDate)) {
    errors.push(`תאריך הלוואה לא תקין: ${loanDate}. פורמט נדרש: YYYY-MM-DD`)
  }

  // בדיקה שהתאריך תקף
  const loanDateObj = new Date(loanDate)
  if (isNaN(loanDateObj.getTime())) {
    errors.push(`תאריך הלוואה לא תקף: ${loanDate}`)
  }

  // בדיקת due_date אם קיים
  if (dueDate) {
    if (!dateRegex.test(dueDate)) {
      errors.push(`תאריך פירעון לא תקין: ${dueDate}. פורמט נדרש: YYYY-MM-DD`)
    } else {
      const dueDateObj = new Date(dueDate)
      if (isNaN(dueDateObj.getTime())) {
        errors.push(`תאריך פירעון לא תקף: ${dueDate}`)
      } else if (dueDateObj < loanDateObj) {
        errors.push('תאריך פירעון לא יכול להיות לפני תאריך ההלוואה')
      }
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא פרמטרי פירעון מחזורי (auto repayment)
 * 
 * Invariants:
 * - אם auto_repayment = 1, חייב להיות repayment_amount > 0
 * - אם auto_repayment = 1, חייב להיות repayment_day (1-31)
 * - אם auto_repayment = 1, חייב להיות repayment_frequency
 */
export function validateAutoRepaymentSettings(loan: {
  auto_repayment: number
  repayment_amount?: number
  repayment_day?: number
  repayment_frequency?: string
}): ValidationResult {
  const errors: string[] = []

  if (loan.auto_repayment !== 1) {
    return validResult() // לא מחזורי - אין מה לבדוק
  }

  // בדיקת repayment_amount
  if (!loan.repayment_amount || loan.repayment_amount <= 0) {
    errors.push('פירעון מחזורי דורש סכום פירעון גדול מ-0')
  }

  // בדיקת repayment_day
  if (!loan.repayment_day) {
    errors.push('פירעון מחזורי דורש יום בחודש')
  } else if (loan.repayment_day < 1 || loan.repayment_day > 31) {
    errors.push('יום פירעון חייב להיות בין 1 ל-31')
  } else if (!Number.isInteger(loan.repayment_day)) {
    errors.push('יום פירעון חייב להיות מספר שלם')
  }

  // בדיקת repayment_frequency
  const validFrequencies = ['monthly', 'biweekly', 'weekly']
  if (!loan.repayment_frequency) {
    errors.push('פירעון מחזורי דורש תדירות')
  } else if (!validFrequencies.includes(loan.repayment_frequency)) {
    errors.push(`תדירות לא תקינה: ${loan.repayment_frequency}. אפשרויות: ${validFrequencies.join(', ')}`)
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא הלוואה מלאה (כל הבדיקות ביחד)
 * 
 * משמש ליצירה ועדכון של הלוואות
 */
export function validateLoan(loan: Loan, repayments?: Repayment[]): ValidationResult {
  const results: ValidationResult[] = [
    validateLoanAmount(loan.amount),
    validateLoanStatus(loan.status),
    validateLoanDates(loan.loan_date, loan.due_date),
    validateAutoRepaymentSettings(loan)
  ]

  // אם יש פירעונות, בדוק גם balance
  if (repayments) {
    results.push(validateLoanBalance(loan, repayments))
  }

  return combineResults(...results)
}

/**
 * וידוא פירעון מלא
 * 
 * משמש ליצירה ועדכון של פירעונות
 */
export function validateRepayment(
  repayment: Omit<Repayment, 'id' | 'created_at'>,
  loan: Loan
): ValidationResult {
  const results: ValidationResult[] = []

  // בדיקת סכום
  const remaining = loan.remaining ?? (loan.amount - (loan.total_repaid || 0))
  results.push(validateRepaymentAmount(repayment.amount, remaining))

  // בדיקת תאריך
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(repayment.payment_date)) {
    results.push(invalidSingle(`תאריך פירעון לא תקין: ${repayment.payment_date}`))
  } else {
    const paymentDate = new Date(repayment.payment_date)
    const loanDate = new Date(loan.loan_date)
    
    if (paymentDate < loanDate) {
      results.push(invalidSingle('תאריך פירעון לא יכול להיות לפני תאריך ההלוואה'))
    }
  }

  return combineResults(...results)
}
