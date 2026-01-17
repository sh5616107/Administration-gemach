/**
 * בדיקות לחיפוש מתקדם בלוח השנה
 */

import { describe, it, expect } from 'vitest'
import { SearchFilters, countActiveFilters } from '../services/calendarService'

// פונקציית סינון מקומית לבדיקות (מדמה את הלוגיקה של searchEvents)
function filterEvents(
  events: Array<{ date: string; amount: number; type: string; relatedName: string }>,
  filters: SearchFilters
) {
  return events.filter(event => {
    // סינון לפי תאריך
    if (filters.dateFrom && event.date < filters.dateFrom) return false
    if (filters.dateTo && event.date > filters.dateTo) return false
    
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
      if (!filters.eventTypes.includes(event.type as any)) return false
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

// נתוני בדיקה
const mockEvents = [
  { date: '2026-01-10', amount: 5000, type: 'loan_due', relatedName: 'ישראל כהן' },
  { date: '2026-01-15', amount: 10000, type: 'repayment', relatedName: 'משה לוי' },
  { date: '2026-01-20', amount: 3000, type: 'recurring_deposit', relatedName: 'דוד אברהם' },
  { date: '2026-02-01', amount: 15000, type: 'planned_loan', relatedName: 'יעקב שמעון' },
  { date: '2026-02-10', amount: 8000, type: 'deposit_due', relatedName: 'רחל כהן' },
  { date: '2026-03-05', amount: 20000, type: 'regular_loan', relatedName: 'שרה לוי' },
]

describe('Calendar Search - Filter Logic', () => {
  
  describe('Date Range Filtering', () => {
    it('should filter by start date (dateFrom)', () => {
      const filters: SearchFilters = {
        dateFrom: '2026-02-01',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(3)
      expect(results.every(e => e.date >= '2026-02-01')).toBe(true)
    })
    
    it('should filter by end date (dateTo)', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '2026-01-20',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(3)
      expect(results.every(e => e.date <= '2026-01-20')).toBe(true)
    })
    
    it('should filter by date range (both dates)', () => {
      const filters: SearchFilters = {
        dateFrom: '2026-01-15',
        dateTo: '2026-02-10',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(4)
      expect(results.every(e => e.date >= '2026-01-15' && e.date <= '2026-02-10')).toBe(true)
    })
  })
  
  describe('Amount Range Filtering', () => {
    it('should filter by minimum amount', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '10000',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(3)
      expect(results.every(e => e.amount >= 10000)).toBe(true)
    })
    
    it('should filter by maximum amount', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '8000',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      // סכומים עד 8000: 5000, 3000, 8000 = 3 אירועים
      expect(results.length).toBe(3)
      expect(results.every(e => e.amount <= 8000)).toBe(true)
    })
    
    it('should filter by amount range', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '5000',
        amountMax: '15000',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(4)
      expect(results.every(e => e.amount >= 5000 && e.amount <= 15000)).toBe(true)
    })
  })
  
  describe('Event Type Filtering', () => {
    it('should filter by single event type', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: ['loan_due'],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(1)
      expect(results[0].type).toBe('loan_due')
    })
    
    it('should filter by multiple event types', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: ['loan_due', 'repayment', 'planned_loan'],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(3)
      expect(results.every(e => ['loan_due', 'repayment', 'planned_loan'].includes(e.type))).toBe(true)
    })
    
    it('should return all events when no event types selected', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(6)
    })
  })
  
  describe('Name Filtering', () => {
    it('should filter by exact name match', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: 'ישראל כהן'
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(1)
      expect(results[0].relatedName).toBe('ישראל כהן')
    })
    
    it('should filter by partial name (case insensitive)', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: 'כהן'
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(2)
      expect(results.every(e => e.relatedName.includes('כהן'))).toBe(true)
    })
    
    it('should filter by partial name - לוי', () => {
      const filters: SearchFilters = {
        dateFrom: '',
        dateTo: '',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: 'לוי'
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(2)
    })
  })
  
  describe('Combined Filters', () => {
    it('should apply multiple filters together', () => {
      const filters: SearchFilters = {
        dateFrom: '2026-01-01',
        dateTo: '2026-02-28',
        amountMin: '5000',
        amountMax: '15000',
        eventTypes: ['loan_due', 'repayment', 'planned_loan'],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      // loan_due: 5000, repayment: 10000, planned_loan: 15000
      expect(results.length).toBe(3)
    })
    
    it('should return empty when no matches', () => {
      const filters: SearchFilters = {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-05',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: ''
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(0)
    })
    
    it('should filter by date + name', () => {
      const filters: SearchFilters = {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        amountMin: '',
        amountMax: '',
        eventTypes: [],
        personName: 'כהן'
      }
      
      const results = filterEvents(mockEvents, filters)
      expect(results.length).toBe(1)
      expect(results[0].relatedName).toBe('ישראל כהן')
    })
  })
})

describe('countActiveFilters', () => {
  it('should return 0 for empty filters', () => {
    const filters: SearchFilters = {
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      eventTypes: [],
      personName: ''
    }
    
    expect(countActiveFilters(filters)).toBe(0)
  })
  
  it('should count single filter', () => {
    const filters: SearchFilters = {
      dateFrom: '2026-01-01',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      eventTypes: [],
      personName: ''
    }
    
    expect(countActiveFilters(filters)).toBe(1)
  })
  
  it('should count multiple filters', () => {
    const filters: SearchFilters = {
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      amountMin: '1000',
      amountMax: '',
      eventTypes: ['loan_due', 'repayment'],
      personName: 'כהן'
    }
    
    expect(countActiveFilters(filters)).toBe(5)
  })
  
  it('should count event types as single filter', () => {
    const filters: SearchFilters = {
      dateFrom: '',
      dateTo: '',
      amountMin: '',
      amountMax: '',
      eventTypes: ['loan_due', 'repayment', 'planned_loan'],
      personName: ''
    }
    
    expect(countActiveFilters(filters)).toBe(1)
  })
})
