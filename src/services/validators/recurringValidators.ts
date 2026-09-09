/**
 * Recurring Domain Validators
 * 
 * מכיל את כל ה-invariants של פריטים מחזוריים:
 * - Recurring Loans
 * - Auto Repayments
 * - Recurring Deposits
 * - זיהוי ואימות סדרות
 */

import type { Loan, Repayment } from '../database'
import { validResult, invalidResult, invalidSingle, combineResults, type ValidationResult } from './types'

/**
 * טיפוס כללי לdeposit (לא מוגדר ב-database.ts)
 */
export interface Deposit {
  id: string
  depositor_id: string
  amount: number
  deposit_date: string
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
  status: string
  withdrawn_amount?: number
  is_deleted?: boolean
}

/**
 * וידוא הלוואה מחזורית
 * 
 * Invariants:
 * - אם is_recurring=1, חייב recurring_day (1-31)
 * - אם is_recurring=1, חייב recurring_months >= 0
 * - אם is_recurring=1, חייב recurring_loan_number >= 1
 * - recurring_loan_count >= recurring_loan_number
 */
export function validateRecurringLoan(loan: {
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
  recurring_loan_number?: number
  recurring_loan_count?: number
}): ValidationResult {
  if (loan.is_recurring !== 1) {
    return validResult() // לא מחזורי - אין מה לבדוק
  }

  const errors: string[] = []

  // בדיקת recurring_day
  if (!loan.recurring_day) {
    errors.push('הלוואה מחזורית דורשת יום בחודש (recurring_day)')
  } else {
    if (loan.recurring_day < 1 || loan.recurring_day > 31) {
      errors.push('יום הלוואה מחזורי חייב להיות בין 1 ל-31')
    }
    if (!Number.isInteger(loan.recurring_day)) {
      errors.push('יום הלוואה מחזורי חייב להיות מספר שלם')
    }
  }

  // בדיקת recurring_months
  if (loan.recurring_months === undefined) {
    errors.push('הלוואה מחזורית דורשת מספר חודשים (recurring_months)')
  } else {
    if (loan.recurring_months < 0) {
      errors.push('מספר חודשים חייב להיות 0 או יותר')
    }
    if (!Number.isInteger(loan.recurring_months)) {
      errors.push('מספר חודשים חייב להיות מספר שלם')
    }
  }

  // בדיקת recurring_loan_number
  if (!loan.recurring_loan_number || loan.recurring_loan_number < 1) {
    errors.push('מספר הלוואה בסדרה חייב להיות 1 או יותר')
  } else if (!Number.isInteger(loan.recurring_loan_number)) {
    errors.push('מספר הלוואה בסדרה חייב להיות מספר שלם')
  }

  // בדיקת recurring_loan_count
  if (loan.recurring_loan_count !== undefined && loan.recurring_loan_number !== undefined) {
    if (loan.recurring_loan_count < loan.recurring_loan_number) {
      errors.push(
        `סה"כ בסדרה (${loan.recurring_loan_count}) לא יכול להיות קטן ממספר נוכחי (${loan.recurring_loan_number})`
      )
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא הפקדה מחזורית
 * 
 * דומה להלוואה מחזורית
 */
export function validateRecurringDeposit(deposit: {
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
}): ValidationResult {
  if (deposit.is_recurring !== 1) {
    return validResult()
  }

  const errors: string[] = []

  // בדיקת recurring_day
  if (!deposit.recurring_day) {
    errors.push('הפקדה מחזורית דורשת יום בחודש')
  } else {
    if (deposit.recurring_day < 1 || deposit.recurring_day > 31) {
      errors.push('יום הפקדה חייב להיות בין 1 ל-31')
    }
    if (!Number.isInteger(deposit.recurring_day)) {
      errors.push('יום הפקדה חייב להיות מספר שלם')
    }
  }

  // בדיקת recurring_months
  if (deposit.recurring_months === undefined) {
    errors.push('הפקדה מחזורית דורשת מספר חודשים')
  } else {
    if (deposit.recurring_months < 0) {
      errors.push('מספר חודשים חייב להיות 0 או יותר')
    }
    if (!Number.isInteger(deposit.recurring_months)) {
      errors.push('מספר חודשים חייב להיות מספר שלם')
    }
  }

  // בדיקת recurring_deposit_number
  if (!deposit.recurring_deposit_number || deposit.recurring_deposit_number < 1) {
    errors.push('מספר הפקדה בסדרה חייב להיות 1 או יותר')
  } else if (!Number.isInteger(deposit.recurring_deposit_number)) {
    errors.push('מספר הפקדה בסדרה חייב להיות מספר שלם')
  }

  // בדיקת recurring_deposit_count
  if (deposit.recurring_deposit_count !== undefined && deposit.recurring_deposit_number !== undefined) {
    if (deposit.recurring_deposit_count < deposit.recurring_deposit_number) {
      errors.push(
        `סה"כ בסדרה (${deposit.recurring_deposit_count}) לא יכול להיות קטן ממספר נוכחי (${deposit.recurring_deposit_number})`
      )
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא הגדרות פירעון אוטומטי
 * 
 * (כבר קיים ב-loanValidators, כאן רק alias לנוחות)
 */
export { validateAutoRepaymentSettings as validateAutoRepayment } from './loanValidators'

/**
 * וידוא סדרת הלוואות
 * 
 * Invariants:
 * - כל ההלוואות אותו borrower_id
 * - כל ההלוואות אותו amount
 * - כל ההלוואות אותו recurring_day
 * - מספרים ייחודיים (אין כפילויות)
 * - מספרים מתחילים מ-1 וללא gaps
 * - recurring_loan_count זהה לכולם
 */
export function validateLoanSeries(loans: Loan[]): ValidationResult {
  if (loans.length === 0) {
    return validResult()
  }

  const errors: string[] = []
  const first = loans[0]

  // בדיקה 1: כל ההלוואות אותו borrower
  if (!loans.every(l => l.borrower_id === first.borrower_id)) {
    errors.push('לא כל ההלוואות בסדרה של אותו לווה')
  }

  // בדיקה 2: כל ההלוואות אותו סכום
  if (!loans.every(l => l.amount === first.amount)) {
    errors.push('לא כל ההלוואות בסדרה באותו סכום')
  }

  // בדיקה 3: כל ההלוואות אותו recurring_day
  if (!loans.every(l => l.recurring_day === first.recurring_day)) {
    errors.push('לא כל ההלוואות בסדרה באותו יום מחזורי')
  }

  // בדיקה 4: recurring_loan_count זהה לכולם
  if (!loans.every(l => l.recurring_loan_count === first.recurring_loan_count)) {
    errors.push('לא כל ההלוואות בסדרה עם אותו recurring_loan_count')
  }

  // בדיקה 5: מספרים ייחודיים
  const numbers = loans.map(l => l.recurring_loan_number).filter(n => n !== undefined) as number[]
  const uniqueNumbers = new Set(numbers)
  
  if (numbers.length !== uniqueNumbers.size) {
    errors.push('יש כפילויות במספרי הלוואות בסדרה')
  }

  // בדיקה 6: מספרים מתחילים מ-1
  const sortedNumbers = [...numbers].sort((a, b) => a - b)
  if (sortedNumbers.length > 0 && sortedNumbers[0] !== 1) {
    errors.push(`הסדרה לא מתחילה מ-1 (מתחילה מ-${sortedNumbers[0]})`)
  }

  // בדיקה 7: אין gaps במספור
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i + 1) {
      errors.push(`יש gap במספור הסדרה: חסר מספר ${i + 1}`)
      break
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא סדרת הפקדות
 * 
 * דומה לסדרת הלוואות
 */
export function validateDepositSeries(deposits: Deposit[]): ValidationResult {
  if (deposits.length === 0) {
    return validResult()
  }

  const errors: string[] = []
  const first = deposits[0]

  // בדיקה 1: כל ההפקדות אותו depositor
  if (!deposits.every(d => d.depositor_id === first.depositor_id)) {
    errors.push('לא כל ההפקדות בסדרה של אותו מפקיד')
  }

  // בדיקה 2: כל ההפקדות אותו סכום
  if (!deposits.every(d => d.amount === first.amount)) {
    errors.push('לא כל ההפקדות בסדרה באותו סכום')
  }

  // בדיקה 3: כל ההפקדות אותו recurring_day
  if (!deposits.every(d => d.recurring_day === first.recurring_day)) {
    errors.push('לא כל ההפקדות בסדרה באותו יום מחזורי')
  }

  // בדיקה 4: recurring_deposit_count זהה לכולם
  if (!deposits.every(d => d.recurring_deposit_count === first.recurring_deposit_count)) {
    errors.push('לא כל ההפקדות בסדרה עם אותו recurring_deposit_count')
  }

  // בדיקה 5: מספרים ייחודיים
  const numbers = deposits.map(d => d.recurring_deposit_number).filter(n => n !== undefined) as number[]
  const uniqueNumbers = new Set(numbers)
  
  if (numbers.length !== uniqueNumbers.size) {
    errors.push('יש כפילויות במספרי הפקדות בסדרה')
  }

  // בדיקה 6: מספרים מתחילים מ-1
  const sortedNumbers = [...numbers].sort((a, b) => a - b)
  if (sortedNumbers.length > 0 && sortedNumbers[0] !== 1) {
    errors.push(`הסדרה לא מתחילה מ-1 (מתחילה מ-${sortedNumbers[0]})`)
  }

  // בדיקה 7: אין gaps במספור
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i + 1) {
      errors.push(`יש gap במספור הסדרה: חסר מספר ${i + 1}`)
      break
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult()
}

/**
 * וידוא שאין כפילות במספר הלוואה בסדרה
 * 
 * משמש לפני יצירת הלוואה חדשה
 */
export function validateNoDuplicateLoanNumber(
  loan: { recurring_loan_number?: number; borrower_id: string; recurring_day?: number },
  existingSeries: Loan[]
): ValidationResult {
  if (!loan.recurring_loan_number) {
    return validResult()
  }

  const duplicate = existingSeries.find(
    l =>
      l.recurring_loan_number === loan.recurring_loan_number &&
      l.borrower_id === loan.borrower_id &&
      l.recurring_day === loan.recurring_day &&
      !l.is_deleted
  )

  if (duplicate) {
    return invalidSingle(
      `כבר קיימת הלוואה עם מספר ${loan.recurring_loan_number} בסדרה זו (ID: ${duplicate.id})`
    )
  }

  return validResult()
}

/**
 * וידוא שאין כפילות במספר הפקדה בסדרה
 */
export function validateNoDuplicateDepositNumber(
  deposit: { recurring_deposit_number?: number; depositor_id: string; recurring_day?: number },
  existingSeries: Deposit[]
): ValidationResult {
  if (!deposit.recurring_deposit_number) {
    return validResult()
  }

  const duplicate = existingSeries.find(
    d =>
      d.recurring_deposit_number === deposit.recurring_deposit_number &&
      d.depositor_id === deposit.depositor_id &&
      d.recurring_day === deposit.recurring_day &&
      !d.is_deleted
  )

  if (duplicate) {
    return invalidSingle(
      `כבר קיימת הפקדה עם מספר ${deposit.recurring_deposit_number} בסדרה זו (ID: ${duplicate.id})`
    )
  }

  return validResult()
}

/**
 * חישוב recurring_repayment_count צפוי
 * 
 * מחשב כמה פירעונות צפויים בסה"כ בהתבסס על סכום ההלוואה וסכום הפירעון
 */
export function calculateExpectedRepaymentCount(
  loanAmount: number,
  repaymentAmount: number
): number {
  if (repaymentAmount <= 0) return 0
  return Math.ceil(loanAmount / repaymentAmount)
}

/**
 * וידוא עקביות recurring_months
 * 
 * בודק שה-recurring_months של הלוואה/הפקדה עקבי עם מיקומה בסדרה
 * 
 * כלל: recurring_months = (recurring_count - recurring_number)
 */
export function validateRecurringMonthsConsistency(item: {
  recurring_months?: number
  recurring_loan_number?: number
  recurring_deposit_number?: number
  recurring_loan_count?: number
  recurring_deposit_count?: number
}): ValidationResult {
  const number = item.recurring_loan_number ?? item.recurring_deposit_number
  const count = item.recurring_loan_count ?? item.recurring_deposit_count
  const months = item.recurring_months

  if (number === undefined || count === undefined || months === undefined) {
    return validResult() // לא מספיק מידע לבדיקה
  }

  const expected = count - number
  
  if (months !== expected) {
    return invalidSingle(
      `recurring_months לא עקבי: נמצא ${months}, צפוי ${expected} ` +
      `(count=${count} - number=${number})`
    )
  }

  return validResult()
}
