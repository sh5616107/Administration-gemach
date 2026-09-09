/**
 * טיפוסים משותפים ל-validators
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface ValidationError {
  field: string
  message: string
}

/**
 * יצירת תוצאת validation מוצלחת
 */
export function validResult(): ValidationResult {
  return { valid: true, errors: [] }
}

/**
 * יצירת תוצאת validation כושלת
 */
export function invalidResult(errors: string[]): ValidationResult {
  return { valid: false, errors }
}

/**
 * יצירת תוצאת validation כושלת עם שגיאה אחת
 */
export function invalidSingle(error: string): ValidationResult {
  return { valid: false, errors: [error] }
}

/**
 * שילוב תוצאות validation מרובות
 */
export function combineResults(...results: ValidationResult[]): ValidationResult {
  const allErrors = results.flatMap(r => r.errors)
  return allErrors.length > 0 
    ? invalidResult(allErrors)
    : validResult()
}
