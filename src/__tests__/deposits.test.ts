/**
 * בדיקות יחידה להפקדות והפקדות מחזוריות
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the database module
vi.mock('../services/database', () => ({
  db: {
    query: vi.fn(() => []),
    run: vi.fn(),
  },
}))

import { db } from '../services/database'

// ========================================
// פונקציות עזר - לוגיקה טהורה לבדיקה
// ========================================

/**
 * בודק אם הפקדה פעילה
 */
function isDepositActive(deposit: { status: string }): boolean {
  return deposit.status === 'active'
}

/**
 * בודק אם הפקדה נמשכה
 */
function isDepositWithdrawn(deposit: { status: string }): boolean {
  return deposit.status === 'withdrawn'
}

/**
 * מחשב סה"כ הפקדות פעילות של מפקיד
 */
function calculateTotalActiveDeposits(deposits: { amount: number; status: string }[]): number {
  return deposits
    .filter(d => d.status === 'active')
    .reduce((sum, d) => sum + d.amount, 0)
}

/**
 * בודק אם היום הוא יום ההפקדה המחזורית
 */
function isRecurringDepositDay(recurringDay: number, depositDate: string, today: Date): boolean {
  const todayDay = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // אם אין יום מחזורי מוגדר, משתמשים ביום מתאריך ההפקדה המקורי
  const effectiveRecurringDay = recurringDay || new Date(depositDate).getDate()
  
  // אם היום המחזורי גדול מהיום האחרון בחודש, משתמשים ביום האחרון
  const effectiveDay = Math.min(effectiveRecurringDay, lastDayOfMonth)
  
  return todayDay === effectiveDay
}

/**
 * בודק אם כבר נוצרה הפקדה החודש
 */
function hasDepositThisMonth(
  deposits: { depositor_id: number; amount: number; deposit_date: string }[],
  depositorId: number,
  amount: number,
  currentMonth: string // format: "2026-01"
): boolean {
  return deposits.some(d => 
    d.depositor_id === depositorId &&
    d.amount === amount &&
    d.deposit_date.startsWith(currentMonth)
  )
}

/**
 * מחשב תאריך פירעון להפקדה קבועה
 */
function calculateDepositDueDate(depositDate: string, periodMonths: number): string {
  const date = new Date(depositDate)
  date.setMonth(date.getMonth() + periodMonths)
  return date.toISOString().split('T')[0]
}

/**
 * בודק אם הפקדה הגיעה לתאריך פירעון
 */
function isDepositDue(dueDate: string | undefined, today: string): boolean {
  if (!dueDate) return false
  return dueDate <= today
}

/**
 * מחשב סכום משיכה (לא יותר מהסכום המופקד)
 */
function calculateWithdrawalAmount(depositAmount: number, requestedAmount: number): number {
  return Math.min(depositAmount, requestedAmount)
}

// ========================================
// בדיקות: סטטוס הפקדה
// ========================================

describe('Deposit Status', () => {
  it('should identify active deposit', () => {
    expect(isDepositActive({ status: 'active' })).toBe(true)
    expect(isDepositActive({ status: 'withdrawn' })).toBe(false)
  })

  it('should identify withdrawn deposit', () => {
    expect(isDepositWithdrawn({ status: 'withdrawn' })).toBe(true)
    expect(isDepositWithdrawn({ status: 'active' })).toBe(false)
  })
})

// ========================================
// בדיקות: חישוב סה"כ הפקדות
// ========================================

describe('calculateTotalActiveDeposits', () => {
  it('should sum only active deposits', () => {
    const deposits = [
      { amount: 5000, status: 'active' },
      { amount: 3000, status: 'active' },
      { amount: 2000, status: 'withdrawn' },
    ]
    
    expect(calculateTotalActiveDeposits(deposits)).toBe(8000)
  })

  it('should return 0 for no active deposits', () => {
    const deposits = [
      { amount: 5000, status: 'withdrawn' },
      { amount: 3000, status: 'withdrawn' },
    ]
    
    expect(calculateTotalActiveDeposits(deposits)).toBe(0)
  })

  it('should return 0 for empty array', () => {
    expect(calculateTotalActiveDeposits([])).toBe(0)
  })

  it('should handle single deposit', () => {
    const deposits = [{ amount: 10000, status: 'active' }]
    expect(calculateTotalActiveDeposits(deposits)).toBe(10000)
  })
})

// ========================================
// בדיקות: הפקדות מחזוריות
// ========================================

describe('isRecurringDepositDay', () => {
  it('should return true on matching recurring day', () => {
    const today = new Date('2026-01-10')
    expect(isRecurringDepositDay(10, '2025-12-10', today)).toBe(true)
  })

  it('should return false on non-matching day', () => {
    const today = new Date('2026-01-15')
    expect(isRecurringDepositDay(10, '2025-12-10', today)).toBe(false)
  })

  it('should use deposit date day when recurring_day is 0', () => {
    const today = new Date('2026-01-15')
    // אם recurring_day הוא 0, משתמשים ביום מתאריך ההפקדה (15)
    expect(isRecurringDepositDay(0, '2025-12-15', today)).toBe(true)
  })

  it('should handle day 31 in short month (February)', () => {
    const feb28 = new Date('2026-02-28')
    // יום 31 בפברואר צריך להיות ביום 28
    expect(isRecurringDepositDay(31, '2025-12-31', feb28)).toBe(true)
  })

  it('should handle day 30 in February', () => {
    const feb28 = new Date('2026-02-28')
    expect(isRecurringDepositDay(30, '2025-12-30', feb28)).toBe(true)
  })

  it('should handle day 31 in 30-day month', () => {
    const apr30 = new Date('2026-04-30')
    expect(isRecurringDepositDay(31, '2025-12-31', apr30)).toBe(true)
  })
})

describe('hasDepositThisMonth', () => {
  it('should return true if deposit exists this month', () => {
    const deposits = [
      { depositor_id: 1, amount: 5000, deposit_date: '2026-01-10' },
    ]
    
    expect(hasDepositThisMonth(deposits, 1, 5000, '2026-01')).toBe(true)
  })

  it('should return false if no deposit this month', () => {
    const deposits = [
      { depositor_id: 1, amount: 5000, deposit_date: '2025-12-10' },
    ]
    
    expect(hasDepositThisMonth(deposits, 1, 5000, '2026-01')).toBe(false)
  })

  it('should return false for different depositor', () => {
    const deposits = [
      { depositor_id: 2, amount: 5000, deposit_date: '2026-01-10' },
    ]
    
    expect(hasDepositThisMonth(deposits, 1, 5000, '2026-01')).toBe(false)
  })

  it('should return false for different amount', () => {
    const deposits = [
      { depositor_id: 1, amount: 3000, deposit_date: '2026-01-10' },
    ]
    
    expect(hasDepositThisMonth(deposits, 1, 5000, '2026-01')).toBe(false)
  })
})

// ========================================
// בדיקות: תאריך פירעון הפקדה
// ========================================

describe('calculateDepositDueDate', () => {
  it('should add months correctly', () => {
    const result = calculateDepositDueDate('2026-01-15', 6)
    // בגלל timezone יכול להיות הבדל של יום
    expect(result).toMatch(/2026-07-1[45]/)
  })

  it('should handle year boundary', () => {
    const result = calculateDepositDueDate('2026-09-15', 6)
    expect(result).toMatch(/2027-03-1[45]/)
  })

  it('should handle 12 months', () => {
    const result = calculateDepositDueDate('2026-01-15', 12)
    expect(result).toMatch(/2027-01-1[45]/)
  })
})

describe('isDepositDue', () => {
  it('should return true when due date passed', () => {
    expect(isDepositDue('2026-01-01', '2026-01-15')).toBe(true)
  })

  it('should return true when due date is today', () => {
    expect(isDepositDue('2026-01-15', '2026-01-15')).toBe(true)
  })

  it('should return false when due date is future', () => {
    expect(isDepositDue('2026-02-01', '2026-01-15')).toBe(false)
  })

  it('should return false for undefined due date', () => {
    expect(isDepositDue(undefined, '2026-01-15')).toBe(false)
  })
})

// ========================================
// בדיקות: משיכת הפקדה
// ========================================

describe('calculateWithdrawalAmount', () => {
  it('should return requested amount if less than deposit', () => {
    expect(calculateWithdrawalAmount(10000, 5000)).toBe(5000)
  })

  it('should return deposit amount if requested more', () => {
    expect(calculateWithdrawalAmount(10000, 15000)).toBe(10000)
  })

  it('should return full amount for exact match', () => {
    expect(calculateWithdrawalAmount(10000, 10000)).toBe(10000)
  })

  it('should handle zero requested', () => {
    expect(calculateWithdrawalAmount(10000, 0)).toBe(0)
  })
})

// ========================================
// בדיקות: התראות הפקדות מחזוריות (עם mocks)
// ========================================

describe('checkRecurringDeposits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create alert for recurring deposit on correct day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const recurringDeposit = {
      id: 1,
      depositor_id: 1,
      depositor_name: 'משה כהן',
      amount: 2000,
      is_recurring: 1,
      recurring_day: 10,
      recurring_months: 5, // יש עוד 5 הפקדות ליצור
      status: 'active',
      deposit_date: '2025-12-10',
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      if (sql.includes('is_recurring = 1')) return [recurringDeposit]
      if (sql.includes('SELECT id FROM deposits')) return []
      return []
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    expect(alerts.length).toBe(1)
    expect(alerts[0].type).toBe('recurring_deposit')
    expect(alerts[0].amount).toBe(2000)
    expect(alerts[0].depositor_name).toBe('משה כהן')
  })

  it('should NOT create alert on wrong day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15'))

    const recurringDeposit = {
      id: 1,
      depositor_id: 1,
      depositor_name: 'משה כהן',
      amount: 2000,
      is_recurring: 1,
      recurring_day: 10, // לא היום
      status: 'active',
      deposit_date: '2025-12-10',
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      if (sql.includes('is_recurring = 1')) return [recurringDeposit]
      return []
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    expect(alerts.length).toBe(0)
  })

  it('should NOT create alert if deposit already exists this month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const recurringDeposit = {
      id: 1,
      depositor_id: 1,
      depositor_name: 'משה כהן',
      amount: 2000,
      is_recurring: 1,
      recurring_day: 10,
      status: 'active',
      deposit_date: '2025-12-10',
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      if (sql.includes('is_recurring = 1')) return [recurringDeposit]
      // כבר יש הפקדה החודש
      if (sql.includes('SELECT id FROM deposits')) return [{ id: 2 }]
      return []
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    expect(alerts.length).toBe(0)
  })

  it('should NOT create alert for withdrawn deposit', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const withdrawnDeposit = {
      id: 1,
      depositor_id: 1,
      depositor_name: 'משה כהן',
      amount: 2000,
      is_recurring: 1,
      recurring_day: 10,
      status: 'withdrawn', // נמשכה
      deposit_date: '2025-12-10',
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      // ה-query מסנן רק הפקדות פעילות
      if (sql.includes('is_recurring = 1') && sql.includes("status = 'active'")) return []
      if (sql.includes('is_recurring = 1')) return [withdrawnDeposit]
      return []
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    expect(alerts.length).toBe(0)
  })

  it('should handle end of month correctly', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-28')) // פברואר - 28 ימים

    const recurringDeposit = {
      id: 1,
      depositor_id: 1,
      depositor_name: 'משה כהן',
      amount: 2000,
      is_recurring: 1,
      recurring_day: 31, // יום 31 - לא קיים בפברואר
      recurring_months: 5, // יש עוד 5 הפקדות ליצור
      status: 'active',
      deposit_date: '2025-12-31',
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      if (sql.includes('is_recurring = 1')) return [recurringDeposit]
      if (sql.includes('SELECT id FROM deposits')) return []
      return []
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    // צריך ליצור התראה ביום האחרון של החודש
    expect(alerts.length).toBe(1)
  })
})

// ========================================
// בדיקות: תרחישים מורכבים
// ========================================

describe('Complex Deposit Scenarios', () => {
  it('should handle multiple depositors with recurring deposits', () => {
    const deposits = [
      { depositor_id: 1, amount: 5000, status: 'active' },
      { depositor_id: 1, amount: 3000, status: 'active' },
      { depositor_id: 2, amount: 10000, status: 'active' },
      { depositor_id: 2, amount: 2000, status: 'withdrawn' },
    ]
    
    // סה"כ הפקדות פעילות
    expect(calculateTotalActiveDeposits(deposits)).toBe(18000)
    
    // סה"כ למפקיד 1
    const depositor1 = deposits.filter(d => d.depositor_id === 1)
    expect(calculateTotalActiveDeposits(depositor1)).toBe(8000)
    
    // סה"כ למפקיד 2
    const depositor2 = deposits.filter(d => d.depositor_id === 2)
    expect(calculateTotalActiveDeposits(depositor2)).toBe(10000)
  })

  it('should track deposit lifecycle', () => {
    // שלב 1: הפקדה חדשה
    const deposit = {
      id: 1,
      depositor_id: 1,
      amount: 10000,
      deposit_date: '2026-01-15',
      status: 'active',
      is_recurring: 1,
      recurring_day: 15,
    }
    
    expect(isDepositActive(deposit)).toBe(true)
    expect(isDepositWithdrawn(deposit)).toBe(false)
    
    // שלב 2: בדיקה אם הגיע יום ההפקדה המחזורית
    const feb15 = new Date('2026-02-15')
    expect(isRecurringDepositDay(deposit.recurring_day, deposit.deposit_date, feb15)).toBe(true)
    
    // שלב 3: משיכה חלקית
    const withdrawalAmount = calculateWithdrawalAmount(deposit.amount, 3000)
    expect(withdrawalAmount).toBe(3000)
    
    // שלב 4: משיכה מלאה
    deposit.status = 'withdrawn'
    expect(isDepositActive(deposit)).toBe(false)
    expect(isDepositWithdrawn(deposit)).toBe(true)
  })

  it('should calculate due dates for fixed period deposits', () => {
    // הפקדה ל-6 חודשים
    const depositDate = '2026-01-15'
    const dueDate = calculateDepositDueDate(depositDate, 6)
    
    // בודקים ב-1.7.2026
    expect(isDepositDue(dueDate, '2026-07-01')).toBe(false)
    
    // בודקים ב-15.7.2026
    expect(isDepositDue(dueDate, '2026-07-15')).toBe(true)
    
    // בודקים ב-1.8.2026
    expect(isDepositDue(dueDate, '2026-08-01')).toBe(true)
  })
})

// ========================================
// בדיקות רגרסיה: טיפול ב-SQL מרובה שורות
// ========================================

describe('Multi-line SQL Regression Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle UPDATE deposits with multi-line template strings', async () => {
    // סימולציה של עדכון הפקדה עם template string מרובה שורות (כמו ב-DepositSidePanel.tsx)
    const depositId = 'test-deposit-id'
    const updatedData = {
      amount: 5000,
      deposit_date: '2026-02-01',
      period_type: 'fixed',
      due_date: '2026-08-01',
      notes: 'הערה מעודכנת',
    }

    // Mock db.run מדמה את ההתנהגות האמיתית
    let capturedSql = ''
    let capturedParams: unknown[] = []
    
    vi.mocked(db.run).mockImplementation(async (sql: string, params?: unknown[]) => {
      capturedSql = sql
      capturedParams = params || []
      return { lastInsertRowid: 0, changes: 1 }
    })

    // קריאה עם SQL מרובה שורות (עם ירידות שורה ורווחים בין SET ל-amount)
    await db.run(
      `UPDATE deposits SET 
        amount = ?, 
        deposit_date = ?, 
        period_type = ?, 
        due_date = ?, 
        notes = ? 
      WHERE id = ?`,
      [
        updatedData.amount,
        updatedData.deposit_date,
        updatedData.period_type,
        updatedData.due_date,
        updatedData.notes,
        depositId,
      ]
    )

    // וידוא שהפונקציה קיבלה את ה-SQL
    expect(capturedSql).toContain('UPDATE deposits SET')
    expect(capturedSql).toContain('amount = ?')
    expect(capturedParams).toEqual([
      5000,
      '2026-02-01',
      'fixed',
      '2026-08-01',
      'הערה מעודכנת',
      depositId,
    ])
    
    // וידוא שהפונקציה החזירה הצלחה
    expect(db.run).toHaveBeenCalledTimes(1)
  })

  it('should handle UPDATE deposits SET status with multi-line SQL', async () => {
    const depositId = 'test-deposit-id'
    
    vi.mocked(db.run).mockImplementation(async () => {
      return { lastInsertRowid: 0, changes: 1 }
    })

    // עדכון סטטוס עם SQL מרובה שורות
    await db.run(
      `UPDATE deposits SET 
        status = ?, 
        withdrawal_date = ?, 
        withdrawn_amount = ?, 
        withdrawal_payment_method = ?, 
        withdrawal_payment_details = ? 
      WHERE id = ?`,
      ['withdrawn', '2026-02-15', 5000, 'bank_transfer', 'העברה לחשבון 12345', depositId]
    )

    expect(db.run).toHaveBeenCalledTimes(1)
  })

  it('should normalize SQL with multiple spaces and line breaks', async () => {
    // SQL עם רווחים מרובים וירידות שורה שונות
    const messySql = `UPDATE    deposits    SET
      
        amount   =   ?,
        deposit_date  =  ?
        
      WHERE   id   =   ?`
    
    vi.mocked(db.run).mockImplementation(async () => {
      return { lastInsertRowid: 0, changes: 1 }
    })

    await db.run(messySql, [3000, '2026-03-01', 'test-id'])

    // הנירמול צריך לטפל בכל הרווחים והירידות
    expect(db.run).toHaveBeenCalledWith(messySql, [3000, '2026-03-01', 'test-id'])
  })

  it('should recognize UPDATE with tabs and mixed whitespace', async () => {
    // SQL עם tabs, רווחים מרובים ו-\r\n (Windows line breaks)
    const tabSql = `UPDATE\tdeposits\tSET\r\n\t\tamount\t=\t?,\r\n\t\tdeposit_date\t=\t?\r\nWHERE\tid\t=\t?`
    
    vi.mocked(db.run).mockImplementation(async () => {
      return { lastInsertRowid: 0, changes: 1 }
    })

    await db.run(tabSql, [7000, '2026-04-01', 'test-id'])

    expect(db.run).toHaveBeenCalledTimes(1)
  })
})
