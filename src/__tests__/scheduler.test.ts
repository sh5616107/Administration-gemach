/**
 * בדיקות יחידה לפונקציות scheduler
 * הבדיקות משתמשות בתאריכים מדומים כדי לבדוק לוגיקה תלוית-זמן
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the database module - use real implementations, only wrap with vi.fn for inspection
vi.mock('../services/database', async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    loansService: {
      ...actual.loansService,
      getAll: vi.fn(actual.loansService.getAll),
      getById: vi.fn(actual.loansService.getById),
      create: vi.fn(actual.loansService.create),
      update: vi.fn(actual.loansService.update),
    },
    repaymentsService: {
      ...actual.repaymentsService,
      create: vi.fn(actual.repaymentsService.create),
      getByLoan: vi.fn(actual.repaymentsService.getByLoan),
    },
    db: {
      ...actual.db,
      query: vi.fn(actual.db.query),
      run: vi.fn(),
    },
  }
})

// Import after mocking
import { loansService, repaymentsService, db, resetDatabase, borrowersService } from '../services/database'

// ========================================
// פונקציות עזר לבדיקות
// ========================================

/**
 * יוצר הלוואה מדומה לבדיקות
 */
function createMockLoan(overrides: Partial<any> = {}) {
  return {
    id: 1,
    borrower_id: 1,
    borrower_name: 'ישראל ישראלי',
    amount: 10000,
    loan_date: '2026-01-01',
    loan_type: 'fixed',
    due_date: '2026-06-01',
    status: 'active',
    is_recurring: 0,
    recurring_months: 0,
    recurring_day: 1,
    auto_repayment: 0,
    repayment_amount: 0,
    repayment_day: 1,
    repayment_start_date: null,
    remaining: 10000,
    total_repaid: 0,
    created_at: '2026-01-01',
    ...overrides,
  }
}

// ========================================
// בדיקות: הפעלת הלוואות מתוכננות
// ========================================

describe('activatePlannedLoans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should activate a planned loan when loan_date arrives', async () => {
    // מדמים שהיום הוא 15.1.2026
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15'))

    const plannedLoan = createMockLoan({
      id: 1,
      status: 'planned',
      loan_date: '2026-01-15', // היום!
    })

    vi.mocked(loansService.getAll).mockResolvedValue([plannedLoan])
    vi.mocked(loansService.update).mockResolvedValue()

    // מייבאים את הפונקציה אחרי ה-mock
    const { activatePlannedLoans } = await import('../services/scheduler')
    
    const activated = await activatePlannedLoans()

    expect(activated).toBe(1)
    expect(loansService.update).toHaveBeenCalledWith(1, { status: 'active' })
  })

  it('should NOT activate a planned loan before loan_date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const plannedLoan = createMockLoan({
      id: 1,
      status: 'planned',
      loan_date: '2026-01-15', // עוד 5 ימים
    })

    vi.mocked(loansService.getAll).mockResolvedValue([plannedLoan])

    const { activatePlannedLoans } = await import('../services/scheduler')
    
    const activated = await activatePlannedLoans()

    expect(activated).toBe(0)
    expect(loansService.update).not.toHaveBeenCalled()
  })

  it('should activate multiple planned loans on the same day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01'))

    const loans = [
      createMockLoan({ id: 1, status: 'planned', loan_date: '2026-02-01' }),
      createMockLoan({ id: 2, status: 'planned', loan_date: '2026-02-01' }),
      createMockLoan({ id: 3, status: 'planned', loan_date: '2026-03-01' }), // לא היום
    ]

    vi.mocked(loansService.getAll).mockResolvedValue(loans)
    vi.mocked(loansService.update).mockResolvedValue()

    const { activatePlannedLoans } = await import('../services/scheduler')
    
    const activated = await activatePlannedLoans()

    expect(activated).toBe(2)
    expect(loansService.update).toHaveBeenCalledTimes(2)
  })
})

// ========================================
// בדיקות: הלוואות מחזוריות
// ========================================

describe('checkRecurringLoans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDatabase()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.skip('should create alert for recurring loan on the correct day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15'))

    // Create borrower
    const borrower = await borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      id_number: '123456789',
      phone: '0501234567',
    })

    // Create recurring loan
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 5000,
      loan_date: '2025-12-15', // Last month
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 3,
      recurring_day: 15, // Today!
      recurring_loan_number: 1,
      recurring_loan_count: 4,
      auto_repayment: 0,
    })
    await loansService.update(loan.lastInsertRowid, { status: 'active' })

    const { checkRecurringLoans } = await import('../services/scheduler')
    
    const alerts = await checkRecurringLoans()

    expect(alerts.length).toBe(1)
    expect(alerts[0].type).toBe('recurring_loan')
    expect(alerts[0].amount).toBe(5000)
  })

  it('should NOT create alert on wrong day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const recurringLoan = {
      id: 1,
      borrower_id: 1,
      borrower_name: 'ישראל ישראלי',
      amount: 5000,
      is_recurring: 1,
      recurring_months: 3,
      recurring_day: 15, // לא היום
    }

    vi.mocked(db.query).mockImplementation(async (sql: string) => {
      if (sql.includes('is_recurring = 1')) return [recurringLoan]
      return []
    })

    const { checkRecurringLoans } = await import('../services/scheduler')
    
    const alerts = await checkRecurringLoans()

    expect(alerts.length).toBe(0)
  })

  it.skip('should handle end of month correctly (day 31 in February)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-28')) // פברואר - 28 ימים

    // Create borrower
    const borrower = await borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      id_number: '123456789',
      phone: '0501234567',
    })

    // Create recurring loan with day 31 (doesn't exist in February)
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 5000,
      loan_date: '2026-01-31', // Last month (January 31)
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 3,
      recurring_day: 31, // Day 31 - doesn't exist in February
      recurring_loan_number: 1,
      recurring_loan_count: 4,
      auto_repayment: 0,
    })
    await loansService.update(loan.lastInsertRowid, { status: 'active' })

    const { checkRecurringLoans } = await import('../services/scheduler')
    
    const alerts = await checkRecurringLoans()

    // צריך ליצור התראה ביום האחרון של החודש
    expect(alerts.length).toBe(1)
  })
})

// ========================================
// בדיקות: פירעון אוטומטי
// ========================================

describe('checkAutoRepayments', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create alert for auto repayment on the correct day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-20'))

    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      phone: '0501234567',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה עם פירעון אוטומטי
    await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'fixed',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 20, // היום!
      repayment_start_date: '2026-01-01',
      is_recurring: 0
    })

    const { checkAutoRepayments } = await import('../services/scheduler')
    
    const alerts = await checkAutoRepayments()

    expect(alerts.length).toBe(1)
    expect(alerts[0].type).toBe('auto_repayment')
    expect(alerts[0].amount).toBe(1000)
  })

  it('should NOT create alert before start date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-20'))

    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234568',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה עם תאריך התחלה עתידי
    await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 10000,
      loan_date: '2025-12-01',
      loan_type: 'fixed',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 20,
      repayment_start_date: '2026-01-01', // התחלה בעתיד
      is_recurring: 0
    })

    const { checkAutoRepayments } = await import('../services/scheduler')
    
    const alerts = await checkAutoRepayments()

    expect(alerts.length).toBe(0)
  })

  it('should limit repayment to remaining amount', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-20'))

    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0501234569',
      id_number: '',
      address: '',
      email: '',
      notes: ''
    })

    // יצירת הלוואה
    const loanResult = await loansService.create({
      borrower_id: borrowerResult.lastInsertRowid,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'fixed',
      status: 'active',
      auto_repayment: 1,
      repayment_amount: 1000, // פירעון חודשי 1000
      repayment_day: 20,
      repayment_start_date: '2026-01-01',
      is_recurring: 0
    })

    // יצירת פירעונות שמשאירים רק 500
    await repaymentsService.create({
      loan_id: loanResult.lastInsertRowid,
      payment_date: '2025-12-15', // בחודש קודם, לא בחודש זה
      amount: 9500, // נשאר רק 500
      payment_method: 'cash',
      notes: ''
    })

    const { checkAutoRepayments } = await import('../services/scheduler')
    
    const alerts = await checkAutoRepayments()

    expect(alerts.length).toBe(1)
    expect(alerts[0].amount).toBe(500) // צריך להיות מוגבל ל-500
  })
})

// ========================================
// בדיקות: הפקדות מחזוריות
// ========================================

describe('checkRecurringDeposits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should create alert for recurring deposit on the correct day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-10'))

    const { resetDatabase, setItem } = await import('../services/database')
    await resetDatabase()

    // יצירת מפקיד ישירות ב-storage
    setItem('depositors', '1', {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567',
      city: 'ירושלים',
      notes: '',
      is_deleted: false
    })

    // יצירת הפקדה מחזורית מהחודש שעבר
    setItem('deposits', '1', {
      id: 1,
      depositor_id: 1,
      amount: 2000,
      deposit_date: '2025-12-10',
      is_recurring: 1,
      recurring_day: 10,
      recurring_months: 5,
      status: 'active',
      period_type: 'monthly',
      notes: '',
      is_deleted: false
    })

    const { checkRecurringDeposits } = await import('../services/scheduler')
    
    const alerts = await checkRecurringDeposits()

    expect(alerts.length).toBe(1)
    expect(alerts[0].type).toBe('recurring_deposit')
    expect(alerts[0].amount).toBe(2000)
  })
})
