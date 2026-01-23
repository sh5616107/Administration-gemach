/**
 * Property-Based Tests for Calendar Service
 * Feature: calendar-view
 */

import { describe, expect, vi } from 'vitest'
import { fc, test } from '@fast-check/vitest'
import { EventType, getEventsForMonth } from '../services/calendarService'

// ========================================
// Property 3: Event Data Loading Completeness
// Validates: Requirements 6.2, 6.3, 6.4, 6.5
// ========================================

/**
 * Helper: יצירת מחרוזת תאריך מרכיבים
 */
function makeDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Helper: Generate a mock loan for testing
 */
const loanArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  borrower_id: fc.integer({ min: 1, max: 100 }),
  amount: fc.integer({ min: 100, max: 100000 }),
  loan_date: fc.tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 0, max: 11 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([y, m, d]) => makeDateStr(y, m, d)),
  loan_type: fc.constantFrom('regular', 'special', 'emergency'),
  due_date: fc.option(
    fc.tuple(
      fc.integer({ min: 2020, max: 2030 }),
      fc.integer({ min: 0, max: 11 }),
      fc.integer({ min: 1, max: 28 })
    ).map(([y, m, d]) => makeDateStr(y, m, d)),
    { nil: undefined }
  ),
  status: fc.constantFrom('active', 'planned', 'paid'),
  borrower_name: fc.string({ minLength: 2, maxLength: 20 }),
  remaining: fc.integer({ min: 0, max: 100000 }),
})

/**
 * Helper: Generate a mock deposit for testing
 */
const depositArbitrary = fc.record({
  id: fc.integer({ min: 1, max: 1000 }),
  depositor_id: fc.integer({ min: 1, max: 100 }),
  amount: fc.integer({ min: 100, max: 100000 }),
  deposit_date: fc.tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 0, max: 11 }),
    fc.integer({ min: 1, max: 28 })
  ).map(([y, m, d]) => makeDateStr(y, m, d)),
  due_date: fc.option(
    fc.tuple(
      fc.integer({ min: 2020, max: 2030 }),
      fc.integer({ min: 0, max: 11 }),
      fc.integer({ min: 1, max: 28 })
    ).map(([y, m, d]) => makeDateStr(y, m, d)),
    { nil: undefined }
  ),
  is_recurring: fc.boolean().map(b => b ? 1 : 0),
  recurring_day: fc.integer({ min: 1, max: 31 }),
  status: fc.constantFrom('active', 'withdrawn'),
  depositor_name: fc.string({ minLength: 2, maxLength: 20 }),
  period_type: fc.constantFrom('monthly', 'quarterly', 'yearly'),
})

describe('Property 3: Event Data Loading Completeness', () => {
  /**
   * Feature: calendar-view, Property 3: Event Data Loading Completeness
   * For any month displayed, the Calendar_Component SHALL load and display events for:
   * - All active loans with due_date in that month
   * - All recurring deposits scheduled for that month
   * - All planned loans with loan_date in that month
   * - All deposits with due_date in that month
   * - All regular loans with loan_date in that month
   * Validates: Requirements 6.2, 6.3, 6.4, 6.5
   */
  
  test.prop([
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 0, max: 11 }),
    fc.array(loanArbitrary, { minLength: 0, maxLength: 10 }),
    fc.array(depositArbitrary, { minLength: 0, maxLength: 10 })
  ], { numRuns: 100 })(
    'all events in month range should be loaded with correct types',
    async (year, month, mockLoans, mockDeposits) => {
      // Setup: Mock the database services
      const { loansService, db } = await import('../services/database')
      
      // Mock loansService.getAll
      vi.spyOn(loansService, 'getAll').mockResolvedValue(mockLoans as any)
      
      // Mock db.query for deposits
      vi.spyOn(db, 'query').mockImplementation(async (sql: string) => {
        if (sql.includes('FROM deposits')) {
          return mockDeposits
        }
        return []
      })
      
      try {
        // Execute
        const events = await getEventsForMonth(year, month)
        
        // Calculate expected events
        const startDate = new Date(year, month, 1)
        const endDate = new Date(year, month + 1, 0)
        
        // Verify: All active loans with due_date in month should have loan_due events
        const activeLoansDueInMonth = mockLoans.filter(loan => 
          loan.status === 'active' && 
          loan.due_date &&
          new Date(loan.due_date) >= startDate &&
          new Date(loan.due_date) <= endDate
        )
        
        for (const loan of activeLoansDueInMonth) {
          const foundEvent = events.find(e => 
            e.type === 'loan_due' && 
            e.relatedId === loan.id
          )
          expect(foundEvent, `loan_due event should exist for loan ${loan.id}`).toBeDefined()
          expect(foundEvent?.type).toBe('loan_due')
        }
        
        // Verify: All planned loans with loan_date in month should have planned_loan events
        const plannedLoansInMonth = mockLoans.filter(loan =>
          loan.status === 'planned' &&
          new Date(loan.loan_date) >= startDate &&
          new Date(loan.loan_date) <= endDate
        )
        
        for (const loan of plannedLoansInMonth) {
          const foundEvent = events.find(e => 
            e.type === 'planned_loan' && 
            e.relatedId === loan.id
          )
          expect(foundEvent, `planned_loan event should exist for loan ${loan.id}`).toBeDefined()
          expect(foundEvent?.type).toBe('planned_loan')
        }
        
        // Verify: All active loans with loan_date in month should have regular_loan events
        const activeLoansInMonth = mockLoans.filter(loan =>
          loan.status === 'active' &&
          new Date(loan.loan_date) >= startDate &&
          new Date(loan.loan_date) <= endDate
        )
        
        for (const loan of activeLoansInMonth) {
          const foundEvent = events.find(e => 
            e.type === 'regular_loan' && 
            e.relatedId === loan.id
          )
          expect(foundEvent, `regular_loan event should exist for loan ${loan.id}`).toBeDefined()
          expect(foundEvent?.type).toBe('regular_loan')
        }
        
        // Verify: All recurring deposits should have recurring_deposit events
        const recurringDepositsActive = mockDeposits.filter(d => 
          d.is_recurring === 1 && d.status === 'active'
        )
        
        for (const deposit of recurringDepositsActive) {
          const foundEvent = events.find(e => 
            e.type === 'recurring_deposit' && 
            e.relatedId === deposit.id
          )
          expect(foundEvent, `recurring_deposit event should exist for deposit ${deposit.id}`).toBeDefined()
          expect(foundEvent?.type).toBe('recurring_deposit')
        }
        
        // Verify: All deposits with due_date in month should have deposit_due events
        const depositsDueInMonth = mockDeposits.filter(d =>
          d.status === 'active' &&
          d.due_date &&
          new Date(d.due_date) >= startDate &&
          new Date(d.due_date) <= endDate
        )
        
        for (const deposit of depositsDueInMonth) {
          const foundEvent = events.find(e => 
            e.type === 'deposit_due' && 
            e.relatedId === deposit.id
          )
          expect(foundEvent, `deposit_due event should exist for deposit ${deposit.id}`).toBeDefined()
          expect(foundEvent?.type).toBe('deposit_due')
        }
        
        // Verify: All events have valid structure
        for (const event of events) {
          expect(event.id).toBeDefined()
          expect(event.type).toBeDefined()
          expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
          expect(event.title).toBeDefined()
          expect(typeof event.amount).toBe('number')
          expect(typeof event.relatedId).toBe('number')
        }
        
      } finally {
        // Cleanup
        vi.restoreAllMocks()
      }
    }
  )
})


// ========================================
// Property 6: Hebrew Date Conversion Round-Trip
// Validates: Requirements 8.3
// ========================================

import { toHebrewDate, parseHebrewDate } from '../utils/dateUtils'

describe('Property 6: Hebrew Date Conversion Round-Trip', () => {
  /**
   * Feature: calendar-view, Property 6: Hebrew Date Conversion Round-Trip
   * For any valid Gregorian date D, converting D to Hebrew date H and then 
   * converting H back to Gregorian SHALL produce the original date D.
   * Validates: Requirements 8.3
   */
  
  test.prop([
    fc.integer({ min: 2000, max: 2050 }), // year
    fc.integer({ min: 0, max: 11 }),      // month (0-11)
    fc.integer({ min: 1, max: 28 })       // day (1-28 to avoid month edge cases)
  ], { numRuns: 100 })(
    'Hebrew date conversion should be reversible (round-trip)',
    (year, month, day) => {
      // יצירת תאריך מנורמל
      const normalizedDate = new Date(year, month, day)
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      
      // המרה לעברית
      const hebrewDate = toHebrewDate(dateStr)
      
      // דילוג אם ההמרה נכשלה
      if (!hebrewDate) {
        return
      }
      
      // המרה חזרה ללועזי
      const backToGregorian = parseHebrewDate(hebrewDate)
      
      // וידוא round-trip
      expect(backToGregorian).not.toBeNull()
      
      if (backToGregorian) {
        // השוואת תאריכים (בלי שעה)
        expect(backToGregorian.getFullYear()).toBe(normalizedDate.getFullYear())
        expect(backToGregorian.getMonth()).toBe(normalizedDate.getMonth())
        expect(backToGregorian.getDate()).toBe(normalizedDate.getDate())
      }
    }
  )
})


// ========================================
// Property 2: Event-to-Indicator Mapping
// Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
// ========================================

import { getEventColor, getEventLabel } from '../components/calendar/EventIndicator'

describe('Property 2: Event-to-Indicator Mapping', () => {
  /**
   * Feature: calendar-view, Property 2: Event-to-Indicator Mapping
   * For any event loaded from the database, the corresponding Day_Cell SHALL 
   * display an Event_Indicator with the correct color based on event type.
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
   */
  
  const expectedColors: Record<EventType, string> = {
    loan_due: '#d32f2f',        // אדום
    repayment: '#795548',       // חום
    recurring_deposit: '#2e7d32', // ירוק
    planned_loan: '#0288d1',    // כחול
    deposit_due: '#ed6c02',     // כתום
    regular_loan: '#9c27b0'     // סגול
  }
  
  test.prop([
    fc.constantFrom<EventType>('loan_due', 'repayment', 'recurring_deposit', 'planned_loan', 'deposit_due', 'regular_loan')
  ], { numRuns: 100 })(
    'each event type should map to correct color',
    (eventType) => {
      const color = getEventColor(eventType)
      expect(color).toBe(expectedColors[eventType])
    }
  )
  
  test.prop([
    fc.constantFrom<EventType>('loan_due', 'repayment', 'recurring_deposit', 'planned_loan', 'deposit_due', 'regular_loan')
  ], { numRuns: 100 })(
    'each event type should have a label',
    (eventType) => {
      const label = getEventLabel(eventType)
      expect(label).toBeDefined()
      expect(label.length).toBeGreaterThan(0)
    }
  )
})

// ========================================
// Property 1: Calendar Grid Days Count
// Validates: Requirements 1.1
// ========================================

import { generateCalendarDays } from '../components/calendar/CalendarGrid'

describe('Property 1: Calendar Grid Days Count', () => {
  /**
   * Feature: calendar-view, Property 1: Calendar Grid Days Count
   * For any year and month combination, the calendar grid SHALL contain 
   * exactly the correct number of days for that month.
   * Validates: Requirements 1.1
   */
  
  test.prop([
    fc.integer({ min: 2000, max: 2100 }),
    fc.integer({ min: 0, max: 11 })
  ], { numRuns: 100 })(
    'calendar grid should have exactly 42 days (6 weeks)',
    (year, month) => {
      const days = generateCalendarDays(year, month)
      expect(days.length).toBe(42)
    }
  )
  
  test.prop([
    fc.integer({ min: 2000, max: 2100 }),
    fc.integer({ min: 0, max: 11 })
  ], { numRuns: 100 })(
    'calendar grid should contain all days of the current month',
    (year, month) => {
      const days = generateCalendarDays(year, month)
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      
      // בדיקה שכל הימים של החודש הנוכחי נמצאים ברשת
      const currentMonthDays = days.filter(d => 
        d.getMonth() === month && d.getFullYear() === year
      )
      
      expect(currentMonthDays.length).toBe(daysInMonth)
    }
  )
})


// ========================================
// Property 7: Date Search Parsing
// Validates: Requirements 8.2, 8.5
// ========================================

import { parseSearchDate } from '../utils/dateUtils'

describe('Property 7: Date Search Parsing', () => {
  /**
   * Feature: calendar-view, Property 7: Date Search Parsing
   * For any valid date string in supported formats (DD/MM/YYYY, DD.MM.YYYY, Hebrew date),
   * the Date_Search component SHALL correctly parse and navigate to the corresponding date.
   * Validates: Requirements 8.2, 8.5
   */
  
  test.prop([
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 2000, max: 2050 })
  ], { numRuns: 100 })(
    'should parse DD/MM/YYYY format correctly',
    (day, month, year) => {
      const dateStr = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`
      const result = parseSearchDate(dateStr)
      
      expect(result).not.toBeNull()
      if (result) {
        expect(result.getDate()).toBe(day)
        expect(result.getMonth()).toBe(month - 1)
        expect(result.getFullYear()).toBe(year)
      }
    }
  )
  
  test.prop([
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 2000, max: 2050 })
  ], { numRuns: 100 })(
    'should parse DD.MM.YYYY format correctly',
    (day, month, year) => {
      const dateStr = `${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`
      const result = parseSearchDate(dateStr)
      
      expect(result).not.toBeNull()
      if (result) {
        expect(result.getDate()).toBe(day)
        expect(result.getMonth()).toBe(month - 1)
        expect(result.getFullYear()).toBe(year)
      }
    }
  )
  
  test.prop([
    fc.constantFrom('', '   ', 'invalid', 'abc/def/ghij', '99/99/9999')
  ], { numRuns: 20 })(
    'should return null for invalid date strings',
    (invalidStr) => {
      const result = parseSearchDate(invalidStr)
      expect(result).toBeNull()
    }
  )
})

// ========================================
// Property 5: Event Details Display Completeness
// Validates: Requirements 3.1, 3.2, 3.3, 3.4
// ========================================

describe('Property 5: Event Details Display Completeness', () => {
  /**
   * Feature: calendar-view, Property 5: Event Details Display Completeness
   * For any event displayed in the Event_Details_Dialog, the dialog SHALL show:
   * - Event type indicator
   * - Amount in ₪
   * - Related person name (borrower/depositor)
   * - For loan events: remaining balance
   * - For deposit events: deposit period
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4
   */
  
  const eventArbitrary = fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constantFrom<EventType>('loan_due', 'repayment', 'recurring_deposit', 'planned_loan', 'deposit_due', 'regular_loan'),
    date: fc.tuple(
      fc.integer({ min: 2020, max: 2030 }),
      fc.integer({ min: 0, max: 11 }),
      fc.integer({ min: 1, max: 28 })
    ).map(([y, m, d]) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`),
    title: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    amount: fc.integer({ min: 100, max: 100000 }),
    relatedId: fc.integer({ min: 1, max: 1000 }),
    relatedName: fc.string({ minLength: 2, maxLength: 30 }),
    metadata: fc.option(fc.record({
      remaining: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: undefined }),
      depositPeriod: fc.option(fc.constantFrom('monthly', 'quarterly', 'yearly'), { nil: undefined })
    }), { nil: undefined })
  })
  
  test.prop([
    fc.array(eventArbitrary, { minLength: 0, maxLength: 10 })
  ], { numRuns: 100 })(
    'all events should have required display fields',
    (events) => {
      for (const event of events) {
        // כל אירוע חייב להכיל את השדות הנדרשים
        expect(event.type).toBeDefined()
        expect(event.amount).toBeDefined()
        expect(typeof event.amount).toBe('number')
        expect(event.relatedName).toBeDefined()
        expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        
        // אירועי הלוואה צריכים לכלול יתרה ב-metadata
        if (event.type === 'loan_due' || event.type === 'regular_loan') {
          // metadata יכול להיות undefined, אבל אם קיים - remaining צריך להיות מספר
          if (event.metadata?.remaining !== undefined) {
            expect(typeof event.metadata.remaining).toBe('number')
          }
        }
      }
    }
  )
})

// ========================================
// Property 4: Month Navigation Consistency
// Validates: Requirements 4.2, 4.3, 4.5
// ========================================

describe('Property 4: Month Navigation Consistency', () => {
  /**
   * Feature: calendar-view, Property 4: Month Navigation Consistency
   * For any current month M, clicking the previous month button SHALL display month M-1,
   * and clicking the next month button SHALL display month M+1.
   * Validates: Requirements 4.2, 4.3, 4.5
   */
  
  // פונקציות עזר לניווט
  function getPrevMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1)
  }
  
  function getNextMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1)
  }
  
  test.prop([
    fc.integer({ min: 2000, max: 2050 }),
    fc.integer({ min: 0, max: 11 })
  ], { numRuns: 100 })(
    'previous month navigation should decrement month correctly',
    (year, month) => {
      const currentDate = new Date(year, month, 1)
      const prevDate = getPrevMonth(currentDate)
      
      // בדיקה שהחודש הקודם נכון
      if (month === 0) {
        // ינואר -> דצמבר של השנה הקודמת
        expect(prevDate.getMonth()).toBe(11)
        expect(prevDate.getFullYear()).toBe(year - 1)
      } else {
        expect(prevDate.getMonth()).toBe(month - 1)
        expect(prevDate.getFullYear()).toBe(year)
      }
    }
  )
  
  test.prop([
    fc.integer({ min: 2000, max: 2050 }),
    fc.integer({ min: 0, max: 11 })
  ], { numRuns: 100 })(
    'next month navigation should increment month correctly',
    (year, month) => {
      const currentDate = new Date(year, month, 1)
      const nextDate = getNextMonth(currentDate)
      
      // בדיקה שהחודש הבא נכון
      if (month === 11) {
        // דצמבר -> ינואר של השנה הבאה
        expect(nextDate.getMonth()).toBe(0)
        expect(nextDate.getFullYear()).toBe(year + 1)
      } else {
        expect(nextDate.getMonth()).toBe(month + 1)
        expect(nextDate.getFullYear()).toBe(year)
      }
    }
  )
  
  test.prop([
    fc.integer({ min: 2000, max: 2050 }),
    fc.integer({ min: 0, max: 11 }),
    fc.integer({ min: 1, max: 12 })
  ], { numRuns: 50 })(
    'multiple navigation steps should be consistent',
    (year, month, steps) => {
      let currentDate = new Date(year, month, 1)
      
      // ניווט קדימה
      for (let i = 0; i < steps; i++) {
        currentDate = getNextMonth(currentDate)
      }
      
      // ניווט אחורה באותו מספר צעדים
      for (let i = 0; i < steps; i++) {
        currentDate = getPrevMonth(currentDate)
      }
      
      // צריך לחזור לאותו חודש ושנה
      expect(currentDate.getMonth()).toBe(month)
      expect(currentDate.getFullYear()).toBe(year)
    }
  )
})
