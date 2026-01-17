/**
 * Calendar Service - שירות לוח שנה
 * טעינת אירועים פיננסיים לתצוגה בלוח השנה
 */

import { loansService, Loan, repaymentsService } from './database'
import { db } from './database'

// סוגי אירועים
export type EventType = 
  | 'loan_due'        // 🔴 פירעון הלוואה (תאריך יעד)
  | 'repayment'       // 🟤 פירעון שבוצע
  | 'recurring_deposit' // 🟢 הפקדה מחזורית
  | 'planned_loan'    // 🔵 הלוואה מתוכננת
  | 'deposit_due'     // 🟠 הפקדה להחזרה
  | 'regular_loan'    // 🟣 הלוואה רגילה

// ממשק אירוע לוח שנה
export interface CalendarEvent {
  id: string
  type: EventType
  date: string              // YYYY-MM-DD
  title: string
  description: string
  amount: number
  relatedId: number         // loan_id / deposit_id
  relatedName: string       // borrower_name / depositor_name
  metadata?: {
    remaining?: number      // יתרה להלוואה
    loanType?: string
    depositPeriod?: string
  }
}

/**
 * בדיקה אם תאריך נמצא בטווח
 */
function isInRange(date: Date, startDate: Date, endDate: Date): boolean {
  return date >= startDate && date <= endDate
}

/**
 * פרסור תאריך מחרוזת YYYY-MM-DD לתאריך מקומי (לא UTC)
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * טעינת כל האירועים לחודש מסוים
 */
export async function getEventsForMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = []
  const startDate = new Date(year, month, 1)
  const endDate = new Date(year, month + 1, 0) // יום אחרון בחודש

  // 1. טעינת הלוואות
  const loans = await loansService.getAll()
  console.log('📅 Calendar: Found loans:', loans.length)
  
  for (const loan of loans) {
    // נרמול תאריכים - שימוש בפרסור מקומי
    const loanDateStr = loan.loan_date?.split('T')[0]
    const dueDateStr = loan.due_date?.split('T')[0]
    
    // פירעונות הלוואה (loan_due) - הלוואות פעילות עם תאריך פירעון
    if (loan.status === 'active' && dueDateStr) {
      const dueDate = parseLocalDate(dueDateStr)
      if (isInRange(dueDate, startDate, endDate)) {
        events.push({
          id: `loan_due_${loan.id}`,
          type: 'loan_due',
          date: dueDateStr,
          title: 'פירעון הלוואה',
          description: `הלוואה של ${loan.borrower_name || ''}`,
          amount: loan.remaining || loan.amount,
          relatedId: loan.id,
          relatedName: loan.borrower_name || '',
          metadata: { 
            remaining: loan.remaining,
            loanType: loan.loan_type
          }
        })
      }
    }
    
    // הלוואות מתוכננות (planned_loan)
    if (loan.status === 'planned' && loanDateStr) {
      const loanDate = parseLocalDate(loanDateStr)
      if (isInRange(loanDate, startDate, endDate)) {
        events.push({
          id: `planned_loan_${loan.id}`,
          type: 'planned_loan',
          date: loanDateStr,
          title: 'הלוואה מתוכננת',
          description: `הלוואה ל${loan.borrower_name || ''}`,
          amount: loan.amount,
          relatedId: loan.id,
          relatedName: loan.borrower_name || '',
          metadata: { loanType: loan.loan_type }
        })
      }
    }
    
    // הלוואות רגילות (regular_loan) - תאריך מתן ההלוואה
    if (loan.status === 'active' && loanDateStr) {
      const loanDate = parseLocalDate(loanDateStr)
      if (isInRange(loanDate, startDate, endDate)) {
        events.push({
          id: `regular_loan_${loan.id}`,
          type: 'regular_loan',
          date: loanDateStr,
          title: 'הלוואה',
          description: `הלוואה ל${loan.borrower_name || ''}`,
          amount: loan.amount,
          relatedId: loan.id,
          relatedName: loan.borrower_name || '',
          metadata: { 
            remaining: loan.remaining,
            loanType: loan.loan_type
          }
        })
      }
    }
  }

  // 2. טעינת פירעונות שבוצעו
  const allRepayments = await db.query('SELECT * FROM repayments') as any[]
  console.log('📅 Calendar: Found repayments:', allRepayments.length, allRepayments.map(r => ({ id: r.id, date: r.payment_date, amount: r.amount })))
  
  for (const repayment of allRepayments) {
    if (!repayment.payment_date) {
      console.log('⚠️ Repayment without date:', repayment)
      continue
    }
    
    // נרמול התאריך - שימוש בפרסור מקומי
    const dateStr = repayment.payment_date.split('T')[0]
    const repaymentDate = parseLocalDate(dateStr)
    
    if (isInRange(repaymentDate, startDate, endDate)) {
      // מציאת ההלוואה והלווה - גם הלוואות שנסגרו
      const loan = loans.find(l => l.id === repayment.loan_id)
      const borrowerName = loan?.borrower_name || 'לווה לא ידוע'
      
      events.push({
        id: `repayment_${repayment.id}`,
        type: 'repayment',
        date: dateStr,
        title: 'פירעון שבוצע',
        description: `פירעון של ${borrowerName}`,
        amount: repayment.amount,
        relatedId: repayment.loan_id,
        relatedName: borrowerName,
        metadata: {}
      })
    }
  }

  // 3. טעינת הפקדות
  const deposits = await db.query('SELECT * FROM deposits') as any[]
  
  for (const deposit of deposits) {
    // הפקדות מחזוריות (recurring_deposit)
    if (deposit.is_recurring && deposit.status === 'active') {
      const depositDateStr = deposit.deposit_date?.split('T')[0]
      const recurringDay = deposit.recurring_day || (depositDateStr ? parseLocalDate(depositDateStr).getDate() : 1)
      // מחשבים את היום בחודש הנוכחי (מתחשבים בימים בחודש)
      const lastDayOfMonth = endDate.getDate()
      const eventDay = Math.min(recurringDay, lastDayOfMonth)
      const eventDate = new Date(year, month, eventDay)
      
      events.push({
        id: `recurring_deposit_${deposit.id}_${year}_${month}`,
        type: 'recurring_deposit',
        date: eventDate.toISOString().split('T')[0],
        title: 'הפקדה מחזורית',
        description: `הפקדה של ${deposit.depositor_name || ''}`,
        amount: deposit.amount,
        relatedId: deposit.id,
        relatedName: deposit.depositor_name || '',
        metadata: { depositPeriod: deposit.period_type }
      })
    }
    
    // הפקדות להחזרה (deposit_due) - תאריך משיכה
    if (deposit.due_date && deposit.status === 'active') {
      const dueDateStr = deposit.due_date.split('T')[0]
      const dueDate = parseLocalDate(dueDateStr)
      if (isInRange(dueDate, startDate, endDate)) {
        events.push({
          id: `deposit_due_${deposit.id}`,
          type: 'deposit_due',
          date: deposit.due_date,
          title: 'הפקדה להחזרה',
          description: `הפקדה של ${deposit.depositor_name || ''}`,
          amount: deposit.amount,
          relatedId: deposit.id,
          relatedName: deposit.depositor_name || '',
          metadata: { depositPeriod: deposit.period_type }
        })
      }
    }
  }

  return events
}

/**
 * המרת תאריך למחרוזת YYYY-MM-DD בזמן מקומי
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * טעינת אירועים ליום ספציפי
 */
export async function getEventsForDay(date: Date): Promise<CalendarEvent[]> {
  const year = date.getFullYear()
  const month = date.getMonth()
  const dayStr = formatLocalDate(date)
  
  // טוענים את כל האירועים לחודש ומסננים ליום הספציפי
  const monthEvents = await getEventsForMonth(year, month)
  return monthEvents.filter(event => event.date === dayStr)
}

/**
 * ממשק פילטרים לחיפוש מתקדם
 */
export interface SearchFilters {
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
  eventTypes: EventType[]
  personName: string
}

/**
 * חיפוש מתקדם של אירועים
 */
export async function searchEvents(filters: SearchFilters): Promise<CalendarEvent[]> {
  // קביעת טווח תאריכים לחיפוש
  let startDate: Date
  let endDate: Date
  
  if (filters.dateFrom) {
    startDate = parseLocalDate(filters.dateFrom)
  } else {
    // ברירת מחדל: 3 חודשים אחורה
    startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 3)
  }
  
  if (filters.dateTo) {
    endDate = parseLocalDate(filters.dateTo)
  } else {
    // ברירת מחדל: 12 חודשים קדימה
    endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 12)
  }
  
  // טעינת אירועים מכל החודשים בטווח
  const allEvents: CalendarEvent[] = []
  const currentDate = new Date(startDate)
  
  while (currentDate <= endDate) {
    const monthEvents = await getEventsForMonth(
      currentDate.getFullYear(),
      currentDate.getMonth()
    )
    allEvents.push(...monthEvents)
    currentDate.setMonth(currentDate.getMonth() + 1)
  }
  
  // הסרת כפילויות (אותו אירוע יכול להופיע בכמה חודשים)
  const uniqueEvents = Array.from(
    new Map(allEvents.map(e => [e.id, e])).values()
  )
  
  // סינון לפי הפילטרים
  return uniqueEvents.filter(event => {
    // סינון לפי תאריך
    const eventDate = parseLocalDate(event.date)
    if (filters.dateFrom && eventDate < startDate) return false
    if (filters.dateTo && eventDate > endDate) return false
    
    // סינון לפי סכום
    if (filters.amountMin) {
      const min = parseFloat(filters.amountMin)
      if (!isNaN(min) && event.amount < min) return false
    }
    if (filters.amountMax) {
      const max = parseFloat(filters.amountMax)
      if (!isNaN(max) && event.amount > max) return false
    }
    
    // סינון לפי סוג אירוע
    if (filters.eventTypes.length > 0) {
      if (!filters.eventTypes.includes(event.type)) return false
    }
    
    // סינון לפי שם
    if (filters.personName) {
      const searchTerm = filters.personName.toLowerCase()
      const name = event.relatedName.toLowerCase()
      if (!name.includes(searchTerm)) return false
    }
    
    return true
  })
}

/**
 * ספירת פילטרים פעילים
 */
export function countActiveFilters(filters: SearchFilters): number {
  let count = 0
  if (filters.dateFrom) count++
  if (filters.dateTo) count++
  if (filters.amountMin) count++
  if (filters.amountMax) count++
  if (filters.eventTypes.length > 0) count++
  if (filters.personName) count++
  return count
}

// ייצוא השירות כאובייקט
export const calendarService = {
  getEventsForMonth,
  getEventsForDay,
  searchEvents,
  countActiveFilters
}
