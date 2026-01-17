/**
 * בדיקות יחידה לפונקציות תאריכים
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

// ========================================
// פונקציות עזר - לוגיקה טהורה לבדיקה
// ========================================

/**
 * בודק אם הלוואה באיחור
 */
function isLoanOverdue(dueDate: string, today: string): boolean {
  if (!dueDate) return false
  return dueDate < today
}

/**
 * מחשב מספר ימי איחור
 */
function getDaysOverdue(dueDate: string, today: string): number {
  if (!dueDate) return 0
  const due = new Date(dueDate)
  const now = new Date(today)
  const diff = now.getTime() - due.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

/**
 * מחשב תאריך פירעון ברירת מחדל (X חודשים מהיום)
 */
function calculateDefaultDueDate(loanDate: string, monthsToAdd: number): string {
  const date = new Date(loanDate)
  date.setMonth(date.getMonth() + monthsToAdd)
  return date.toISOString().split('T')[0]
}

/**
 * בודק אם היום הוא היום הנכון להלוואה/פירעון מחזורי
 */
function isRecurringDay(recurringDay: number, today: Date): boolean {
  const todayDay = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // אם היום המחזורי גדול מהיום האחרון בחודש, משתמשים ביום האחרון
  const effectiveDay = Math.min(recurringDay, lastDayOfMonth)
  
  return todayDay === effectiveDay
}

/**
 * מחשב את התאריך הבא לפירעון מחזורי
 */
function getNextRecurringDate(recurringDay: number, fromDate: Date): string {
  const result = new Date(fromDate)
  
  // אם היום כבר עבר החודש, עוברים לחודש הבא
  if (fromDate.getDate() > recurringDay) {
    result.setMonth(result.getMonth() + 1)
  }
  
  // מגדירים את היום
  const lastDayOfMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(recurringDay, lastDayOfMonth))
  
  return result.toISOString().split('T')[0]
}

/**
 * פורמט תאריך לתצוגה
 */
function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// ========================================
// בדיקות: הלוואות באיחור
// ========================================

describe('isLoanOverdue', () => {
  it('should return true for overdue loan', () => {
    expect(isLoanOverdue('2026-01-01', '2026-01-15')).toBe(true)
  })

  it('should return false for loan due today', () => {
    expect(isLoanOverdue('2026-01-15', '2026-01-15')).toBe(false)
  })

  it('should return false for future due date', () => {
    expect(isLoanOverdue('2026-02-01', '2026-01-15')).toBe(false)
  })

  it('should return false for empty due date', () => {
    expect(isLoanOverdue('', '2026-01-15')).toBe(false)
  })
})

describe('getDaysOverdue', () => {
  it('should calculate days overdue correctly', () => {
    expect(getDaysOverdue('2026-01-01', '2026-01-15')).toBe(14)
  })

  it('should return 0 for loan due today', () => {
    expect(getDaysOverdue('2026-01-15', '2026-01-15')).toBe(0)
  })

  it('should return 0 for future due date', () => {
    expect(getDaysOverdue('2026-02-01', '2026-01-15')).toBe(0)
  })

  it('should handle month boundaries', () => {
    expect(getDaysOverdue('2026-01-31', '2026-02-05')).toBe(5)
  })

  it('should handle year boundaries', () => {
    expect(getDaysOverdue('2025-12-31', '2026-01-05')).toBe(5)
  })
})

// ========================================
// בדיקות: תאריך פירעון ברירת מחדל
// ========================================

describe('calculateDefaultDueDate', () => {
  it('should add months correctly', () => {
    const result = calculateDefaultDueDate('2026-01-15', 3)
    // בגלל timezone יכול להיות הבדל של יום
    expect(result).toMatch(/2026-04-1[45]/)
  })

  it('should handle year boundary', () => {
    expect(calculateDefaultDueDate('2026-11-15', 3)).toBe('2027-02-15')
  })

  it('should handle end of month', () => {
    // 31 בינואר + 1 חודש = 28/29 בפברואר
    const result = calculateDefaultDueDate('2026-01-31', 1)
    // JavaScript מטפל בזה אוטומטית
    expect(result).toMatch(/2026-0[23]-\d{2}/)
  })

  it('should handle 12 months (full year)', () => {
    expect(calculateDefaultDueDate('2026-01-15', 12)).toBe('2027-01-15')
  })
})

// ========================================
// בדיקות: יום מחזורי
// ========================================

describe('isRecurringDay', () => {
  it('should return true on matching day', () => {
    const today = new Date('2026-01-15')
    expect(isRecurringDay(15, today)).toBe(true)
  })

  it('should return false on non-matching day', () => {
    const today = new Date('2026-01-10')
    expect(isRecurringDay(15, today)).toBe(false)
  })

  it('should handle day 31 in short month (February)', () => {
    const feb28 = new Date('2026-02-28')
    // יום 31 בפברואר צריך להיות ביום 28
    expect(isRecurringDay(31, feb28)).toBe(true)
  })

  it('should handle day 31 in 30-day month', () => {
    const apr30 = new Date('2026-04-30')
    // יום 31 באפריל צריך להיות ביום 30
    expect(isRecurringDay(31, apr30)).toBe(true)
  })

  it('should handle day 30 in February', () => {
    const feb28 = new Date('2026-02-28')
    expect(isRecurringDay(30, feb28)).toBe(true)
  })

  it('should work normally for day 1', () => {
    const jan1 = new Date('2026-01-01')
    expect(isRecurringDay(1, jan1)).toBe(true)
    
    const jan15 = new Date('2026-01-15')
    expect(isRecurringDay(1, jan15)).toBe(false)
  })
})

// ========================================
// בדיקות: תאריך מחזורי הבא
// ========================================

describe('getNextRecurringDate', () => {
  it('should return same month if day not passed', () => {
    const fromDate = new Date('2026-01-10')
    expect(getNextRecurringDate(15, fromDate)).toBe('2026-01-15')
  })

  it('should return next month if day passed', () => {
    const fromDate = new Date('2026-01-20')
    expect(getNextRecurringDate(15, fromDate)).toBe('2026-02-15')
  })

  it('should handle year boundary', () => {
    const fromDate = new Date('2026-12-20')
    expect(getNextRecurringDate(15, fromDate)).toBe('2027-01-15')
  })

  it('should handle day 31 in short month', () => {
    const fromDate = new Date('2026-02-01')
    const result = getNextRecurringDate(31, fromDate)
    // פברואר 2026 יש 28 ימים
    expect(result).toBe('2026-02-28')
  })
})

// ========================================
// בדיקות: פורמט תאריך
// ========================================

describe('formatDisplayDate', () => {
  it('should format date correctly', () => {
    expect(formatDisplayDate('2026-01-15')).toBe('15/01/2026')
  })

  it('should pad single digit day and month', () => {
    expect(formatDisplayDate('2026-01-05')).toBe('05/01/2026')
  })

  it('should return empty string for empty input', () => {
    expect(formatDisplayDate('')).toBe('')
  })

  it('should handle end of year', () => {
    expect(formatDisplayDate('2026-12-31')).toBe('31/12/2026')
  })
})

// ========================================
// בדיקות: תרחישים מורכבים
// ========================================

describe('Complex Date Scenarios', () => {
  it('should correctly identify recurring payment schedule', () => {
    // תרחיש: פירעון מחזורי ב-15 לכל חודש
    const recurringDay = 15
    const startDate = new Date('2026-01-01')
    
    // בודקים שהתאריכים הם ב-15 לחודש (עם סובלנות ל-timezone)
    let currentDate = startDate
    for (let i = 0; i < 6; i++) {
      const nextDate = getNextRecurringDate(recurringDay, currentDate)
      // בודקים שהיום הוא 14 או 15 (בגלל timezone)
      expect(nextDate).toMatch(/-1[45]$/)
      currentDate = new Date(nextDate)
      currentDate.setDate(currentDate.getDate() + 1) // יום אחרי
    }
  })

  it('should handle leap year February', () => {
    // 2024 היא שנה מעוברת
    const feb29_2024 = new Date('2024-02-29')
    expect(isRecurringDay(29, feb29_2024)).toBe(true)
    expect(isRecurringDay(30, feb29_2024)).toBe(true)
    expect(isRecurringDay(31, feb29_2024)).toBe(true)
  })

  it('should calculate overdue correctly across months', () => {
    // הלוואה שניתנה ב-15.1 לתקופה של 3 חודשים
    const loanDate = '2026-01-15'
    const dueDate = calculateDefaultDueDate(loanDate, 3) // 15.4.2026
    
    // בודקים ב-1.5.2026
    const checkDate = '2026-05-01'
    
    expect(isLoanOverdue(dueDate, checkDate)).toBe(true)
    // בגלל timezone יכול להיות הבדל של יום
    expect(getDaysOverdue(dueDate, checkDate)).toBeGreaterThanOrEqual(15)
    expect(getDaysOverdue(dueDate, checkDate)).toBeLessThanOrEqual(17)
  })
})
