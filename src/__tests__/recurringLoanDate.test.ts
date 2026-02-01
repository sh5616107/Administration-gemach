import { describe, it, expect } from 'vitest'

/**
 * טסטים לחישוב תאריך ההלוואה הראשונה בהלוואה מחזורית
 * 
 * הלוגיקה:
 * - אם recurring_day עוד לא הגיע החודש → ההלוואה תהיה החודש
 * - אם recurring_day כבר עבר החודש → ההלוואה תהיה בחודש הבא
 * - טיפול בחודשים קצרים (למשל 31 בפברואר)
 */

// העתקה של הפונקציה מ-LoansTab לצורך הטסט
function calculateFirstRecurringLoanDate(recurringDay: number, currentDate: Date = new Date()): string {
  const today = currentDate
  const currentDay = today.getDate()
  const currentMonth = today.getMonth()
  const currentYear = today.getFullYear()
  
  // בדיקה אם היום קיים בחודש הנוכחי
  const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const effectiveDayThisMonth = Math.min(recurringDay, lastDayOfCurrentMonth)
  
  // אם היום בחודש עוד לא הגיע (והוא קיים בחודש הנוכחי) - ההלוואה תהיה החודש
  if (effectiveDayThisMonth > currentDay) {
    return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(effectiveDayThisMonth).padStart(2, '0')}`
  }
  
  // אם היום בחודש כבר עבר או שווה - ההלוואה תהיה בחודש הבא
  // טיפול בחודשים קצרים (למשל 31 בפברואר)
  const nextMonth = currentMonth + 1
  const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear
  const adjustedMonth = nextMonth > 11 ? 0 : nextMonth
  const lastDayOfNextMonth = new Date(nextYear, adjustedMonth + 1, 0).getDate()
  const effectiveDay = Math.min(recurringDay, lastDayOfNextMonth)
  return `${nextYear}-${String(adjustedMonth + 1).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`
}

describe('Recurring Loan Date Calculation', () => {
  it('should schedule loan for current month if recurring_day has not passed', () => {
    // היום: 31 בינואר, recurring_day: 15
    // התוצאה: 15 בפברואר (כי ה-15 של ינואר כבר עבר)
    const currentDate = new Date('2026-01-31')
    const recurringDay = 15
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-02-15')
  })

  it('should schedule loan for current month if recurring_day is today', () => {
    // היום: 15 בינואר, recurring_day: 15
    // התוצאה: 15 בפברואר (כי היום כבר עבר)
    const currentDate = new Date('2026-01-15')
    const recurringDay = 15
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-02-15')
  })

  it('should schedule loan for current month if recurring_day is in the future', () => {
    // היום: 10 בינואר, recurring_day: 15
    // התוצאה: 15 בינואר (כי ה-15 עוד לא הגיע)
    const currentDate = new Date('2026-01-10')
    const recurringDay = 15
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-01-15')
  })

  it('should schedule loan for next month if recurring_day has passed', () => {
    // היום: 20 בינואר, recurring_day: 15
    // התוצאה: 15 בפברואר (כי ה-15 של ינואר כבר עבר)
    const currentDate = new Date('2026-01-20')
    const recurringDay = 15
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-02-15')
  })

  it('should handle short months correctly (31 in February)', () => {
    // היום: 31 בינואר, recurring_day: 31
    // התוצאה: 28 בפברואר (כי פברואר אין בו 31 ימים)
    const currentDate = new Date('2026-01-31')
    const recurringDay = 31
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-02-28')
  })

  it('should handle leap year February correctly', () => {
    // היום: 31 בינואר 2024 (שנה מעוברת), recurring_day: 31
    // התוצאה: 29 בפברואר (כי 2024 שנה מעוברת)
    const currentDate = new Date('2024-01-31')
    const recurringDay = 31
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2024-02-29')
  })

  it('should handle end of year correctly', () => {
    // היום: 31 בדצמבר, recurring_day: 15
    // התוצאה: 15 בינואר של השנה הבאה
    const currentDate = new Date('2025-12-31')
    const recurringDay = 15
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-01-15')
  })

  it('should handle first day of month', () => {
    // היום: 1 בינואר, recurring_day: 1
    // התוצאה: 1 בפברואר (כי היום כבר עבר)
    const currentDate = new Date('2026-01-01')
    const recurringDay = 1
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-02-01')
  })

  it('should handle last day of month', () => {
    // היום: 30 בינואר, recurring_day: 31
    // התוצאה: 31 בינואר (כי ה-31 עוד לא הגיע)
    const currentDate = new Date('2026-01-30')
    const recurringDay = 31
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-01-31')
  })

  it('should handle 30-day month correctly', () => {
    // היום: 30 באפריל, recurring_day: 31
    // התוצאה: 31 במאי (כי באפריל אין 31 ימים)
    const currentDate = new Date('2026-04-30')
    const recurringDay = 31
    const result = calculateFirstRecurringLoanDate(recurringDay, currentDate)
    expect(result).toBe('2026-05-31')
  })
})
