/**
 * Domain Validators - נקודת כניסה מרכזית
 * 
 * מייצא את כל ה-validators של domains שונים במערכת
 */

// Types
export type { ValidationResult, ValidationError } from './types'
export { validResult, invalidResult, invalidSingle, combineResults } from './types'

// Loan validators
export {
  validateLoanAmount,
  validateRepaymentAmount,
  validateLoanStatus,
  validateLoanStatusTransition,
  validateLoanBalance,
  validateLoanDates,
  validateAutoRepaymentSettings,
  validateLoan,
  validateRepayment
} from './loanValidators'

// Deposit validators
export {
  validateDepositAmount,
  validateWithdrawal,
  validateDepositBalance,
  validateDepositDate,
  validateRecurringDepositSettings,
  validateDeposit
} from './depositValidators'

// Recurring validators
export type { Deposit } from './recurringValidators'
export {
  validateRecurringLoan,
  validateRecurringDeposit,
  validateAutoRepayment,
  validateLoanSeries,
  validateDepositSeries,
  validateNoDuplicateLoanNumber,
  validateNoDuplicateDepositNumber,
  calculateExpectedRepaymentCount,
  validateRecurringMonthsConsistency
} from './recurringValidators'
