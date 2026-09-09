/**
 * Deposit & Withdrawal Domain Validators
 * 
 * מכיל את כל ה-invariants הקריטיים של הפקדות ומשיכות:
 * - סכומים חיוביים
 * - יתרות זמינות
 * - עקביות withdrawals vs deposits
 */

import { validResult, invalidResult, invalidSingle, combineResults, type ValidationResult } from './types'

/**
 * וידוא סכום הפקדה תקין
 * 
 * Invariants:
 * - סכום > 0
 * - סכום סופי (לא NaN, Infinity)
 * - דיוק מטבע (2 ספרות)
 */
export function validateDepositAmount(amount: number): ValidationResult {
  const errors: string[] = []

  if (!Number.isFinite(amount)) {
    errors.push('סכום ההפקדה חייב להיות מספר תקין')
    return invalidResult(errors)
  }

  if (amount <= 0) {
    errors.push('סכום ההפקדה חייב להיות גדול מ-0')
  }

  // בדיקת דיוק מטבע
  const rounded = Math.round(amount * 100) / 100
  if (Math.abs(amount - rounded) > 0.0001) {
    errors.push('סכום ההפקדה יכול להכיל עד 2 ספרות אחרי הנקודה')
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא סכום משיכה תקין
 * 
 * Invariants:
 * - סכום > 0
 * - סכום <= זמין למשיכה
 * - סכום סופי
 * - דיוק מטבע
 */
export function validateWithdrawal(
  withdrawalAmount: number,
  depositAmount: number,
  alreadyWithdrawn: number
): ValidationResult {
  const errors: string[] = []

  if (!Number.isFinite(withdrawalAmount)) {
    errors.push('סכום המשיכה חייב להיות מספר תקין')
    return invalidResult(errors)
  }

  if (withdrawalAmount <= 0) {
    errors.push('סכום המשיכה חייב להיות גדול מ-0')
  }

  // חישוב זמין
  const available = depositAmount - alreadyWithdrawn
  const tolerance = 0.01

  if (!Number.isFinite(available)) {
    errors.push('יתרת ההפקדה לא תקינה')
    return invalidResult(errors)
  }

  if (withdrawalAmount > available + tolerance) {
    errors.push(
      `סכום המשיכה (${withdrawalAmount.toFixed(2)}) גדול מהסכום הזמין (${available.toFixed(2)})`
    )
  }

  // בדיקת דיוק מטבע
  const rounded = Math.round(withdrawalAmount * 100) / 100
  if (Math.abs(withdrawalAmount - rounded) > 0.0001) {
    errors.push('סכום המשיכה יכול להכיל עד 2 ספרות אחרי הנקודה')
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא יתרת הפקדה תקינה
 * 
 * Invariants:
 * - withdrawn_amount <= deposit_amount
 * - withdrawn_amount >= 0
 * - אם withdrawn_amount = deposit_amount, status = 'withdrawn'
 */
export function validateDepositBalance(deposit: {
  amount: number
  withdrawn_amount?: number
  status: string
}): ValidationResult {
  const errors: string[] = []
  const withdrawn = deposit.withdrawn_amount || 0
  const tolerance = 0.01

  // בדיקה 1: משיכות לא עולות על ההפקדה
  if (withdrawn > deposit.amount + tolerance) {
    errors.push(
      `נמשך יותר מסכום ההפקדה: withdrawn=${withdrawn.toFixed(2)}, deposit=${deposit.amount.toFixed(2)}`
    )
  }

  // בדיקה 2: משיכות לא שליליות
  if (withdrawn < -tolerance) {
    errors.push(`סכום משיכות שלילי: ${withdrawn.toFixed(2)}`)
  }

  // בדיקה 3: עקביות status
  const fullyWithdrawn = Math.abs(withdrawn - deposit.amount) <= tolerance
  
  if (fullyWithdrawn && deposit.status !== 'withdrawn') {
    errors.push(`ההפקדה נמשכה במלואה אך status=${deposit.status} (צריך להיות 'withdrawn')`)
  }

  if (!fullyWithdrawn && deposit.status === 'withdrawn') {
    errors.push(
      `ההפקדה מסומנת כנמשכה אך יש יתרה: ${(deposit.amount - withdrawn).toFixed(2)}`
    )
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא תאריך הפקדה תקין
 */
export function validateDepositDate(depositDate: string): ValidationResult {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  
  if (!dateRegex.test(depositDate)) {
    return invalidSingle(`תאריך הפקדה לא תקין: ${depositDate}. פורמט נדרש: YYYY-MM-DD`)
  }

  const date = new Date(depositDate)
  if (isNaN(date.getTime())) {
    return invalidSingle(`תאריך הפקדה לא תקף: ${depositDate}`)
  }

  return validResult()
}

/**
 * וידוא פרמטרי הפקדה מחזורית
 * 
 * Invariants:
 * - אם is_recurring = 1, חייב להיות recurring_day (1-31)
 * - אם is_recurring = 1, חייב להיות recurring_months >= 0
 */
export function validateRecurringDepositSettings(deposit: {
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
}): ValidationResult {
  const errors: string[] = []

  if (deposit.is_recurring !== 1) {
    return validResult() // לא מחזורי - אין מה לבדוק
  }

  // בדיקת recurring_day
  if (!deposit.recurring_day) {
    errors.push('הפקדה מחזורית דורשת יום בחודש')
  } else if (deposit.recurring_day < 1 || deposit.recurring_day > 31) {
    errors.push('יום הפקדה חייב להיות בין 1 ל-31')
  } else if (!Number.isInteger(deposit.recurring_day)) {
    errors.push('יום הפקדה חייב להיות מספר שלם')
  }

  // בדיקת recurring_months
  if (deposit.recurring_months !== undefined) {
    if (deposit.recurring_months < 0) {
      errors.push('מספר חודשים חייב להיות 0 או יותר')
    }
    if (!Number.isInteger(deposit.recurring_months)) {
      errors.push('מספר חודשים חייב להיות מספר שלם')
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא הפקדה מלאה (כל הבדיקות ביחד)
 */
export function validateDeposit(deposit: {
  amount: number
  deposit_date: string
  withdrawn_amount?: number
  status: string
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
}): ValidationResult {
  return combineResults(
    validateDepositAmount(deposit.amount),
    validateDepositDate(deposit.deposit_date),
    validateDepositBalance(deposit),
    validateRecurringDepositSettings(deposit)
  )
}
