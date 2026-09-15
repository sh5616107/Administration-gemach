/**
 * טסטים שמוכיחים את הבעיות ב-persistence ו-scheduler
 * הטסטים האלה צריכים להיכשל על הקוד הנוכחי (red), ולעבור רק אחרי התיקון
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, repaymentsService, resetDatabase, commitData } from '../services/database'
import { checkAutoRepayments } from '../services/scheduler'
import { saveAppData } from '../services/persistence'

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// @ts-ignore - global is available in test environment
globalThis.localStorage = localStorageMock

describe('באגים קריטיים ב-persistence ו-scheduler', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
  })

  describe('טסט 1: פירעון של הלוואה אחת לא אמור לחסום התראה על הלוואה אחרת', () => {
    it('שתי הלוואות עם auto_repayment, פירעון רק לאחת - השנייה צריכה לקבל התראה', async () => {
      // שלב 1: יצירת שני לווים
      const borrower1Result = await borrowersService.create({
        first_name: 'ראובן',
        last_name: 'כהן',
        phone: '0501111111',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrower1Id = borrower1Result.lastInsertRowid

      const borrower2Result = await borrowersService.create({
        first_name: 'שמעון',
        last_name: 'לוי',
        phone: '0502222222',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrower2Id = borrower2Result.lastInsertRowid

      // שלב 2: יצירת שתי הלוואות עם auto_repayment=1, status='active'
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      const loan1Result = await loansService.create({
        borrower_id: borrower1Id,
        amount: 10000,
        loan_date: firstDayOfMonth,
        loan_type: 'fixed',
        status: 'active',
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_start_date: firstDayOfMonth,
        repayment_day: today.getDate(),
        is_recurring: 0
      })
      const loan1Id = loan1Result.lastInsertRowid

      const loan2Result = await loansService.create({
        borrower_id: borrower2Id,
        amount: 5000,
        loan_date: firstDayOfMonth,
        loan_type: 'fixed',
        status: 'active',
        auto_repayment: 1,
        repayment_amount: 500,
        repayment_start_date: firstDayOfMonth,
        repayment_day: today.getDate(),
        is_recurring: 0
      })
      const loan2Id = loan2Result.lastInsertRowid

      // שלב 3: יצירת פירעון החודש רק עבור הלוואה 1
      await repaymentsService.create({
        loan_id: loan1Id,
        payment_date: todayStr,
        amount: 1000,
        payment_method: 'cash',
        notes: ''
      })

      // שלב 4: הרצת בדיקת פירעון אוטומטי
      const alerts = await checkAutoRepayments()

      // שלב 5: ודא שההלוואה השנייה (שאין לה פירעון החודש) כן מקבלת התראה
      const loan2Alerts = alerts.filter(a => a.loan_id === loan2Id)
      expect(loan2Alerts.length).toBeGreaterThan(0)
      expect(loan2Alerts[0].type).toBe('auto_repayment')
      expect(loan2Alerts[0].borrower_name).toContain('שמעון')
    })
  })

  describe('טסט 2: הלוואות לא-פעילות/בלי auto_repayment לא אמורות להיכלל', () => {
    it('הלוואה עם auto_repayment=0 לא צריכה להיכלל בבדיקה', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'לוי',
        last_name: 'ישראל',
        phone: '0503333333',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

      // יצירת הלוואה עם auto_repayment=0
      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 8000,
        loan_date: firstDayOfMonth,
        loan_type: 'fixed',
        status: 'active',
        auto_repayment: 0, // ללא פירעון אוטומטי
        repayment_amount: 0,
        repayment_start_date: firstDayOfMonth,
        repayment_day: today.getDate(),
        is_recurring: 0
      })
      const loanId = loanResult.lastInsertRowid

      // הרצת בדיקת פירעון אוטומטי
      const alerts = await checkAutoRepayments()

      // ודא שההלוואה הזו לא מופיעה בהתראות
      const loanAlerts = alerts.filter(a => a.loan_id === loanId)
      expect(loanAlerts.length).toBe(0)
    })

    it('הלוואה עם status != active לא צריכה להיכלל בבדיקה', async () => {
      const borrowerResult = await borrowersService.create({
        first_name: 'יהודה',
        last_name: 'כהן',
        phone: '0504444444',
        id_number: '',
        address: '',
        email: '',
        notes: ''
      })
      const borrowerId = borrowerResult.lastInsertRowid

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      // תאריך הלוואה בעתיד כדי שהסטטוס יהיה planned
      const futureLoanDate = new Date(today)
      futureLoanDate.setDate(today.getDate() + 7)
      const futureDateStr = futureLoanDate.toISOString().split('T')[0]

      // יצירת הלוואה מתוכננת (planned) עם פירעון אוטומטי
      const loanResult = await loansService.create({
        borrower_id: borrowerId,
        amount: 6000,
        loan_date: futureDateStr, // תאריך בעתיד
        loan_type: 'fixed',
        auto_repayment: 1,
        repayment_amount: 600,
        repayment_start_date: firstDayOfMonth,
        repayment_day: today.getDate(),
        is_recurring: 0
      })
      const loanId = loanResult.lastInsertRowid

      // הרצת בדיקת פירעון אוטומטי
      const alerts = await checkAutoRepayments()

      // ודא שההלוואה הזו לא מופיעה בהתראות
      const loanAlerts = alerts.filter(a => a.loan_id === loanId)
      expect(loanAlerts.length).toBe(0)
    })
  })

  describe('טסט 3: שמירה כושלת אמורה לגרום ל-commitData להיכשל', () => {
    it('commitData צריך לזרוק שגיאה אם saveAppData נכשל', async () => {
      // Mock של saveAppData כך שהוא יזרוק שגיאה
      const mockSaveAppData = vi.mocked(saveAppData)
      mockSaveAppData.mockRejectedValueOnce(new Error('שגיאת שמירה מדומה'))

      // ניסיון לבצע commit ישירות - צריך להיכשל
      // לא יוצרים שינויים לפני כדי שלא יהיה pendingSave קודם
      await expect(commitData()).rejects.toThrow('שגיאת שמירה מדומה')
    })
  })
})
