import { getAllItems } from '../database'
import type { Loan, Repayment } from '../database'

/**
 * Repository דק להלוואות - הכנה למעבר ל-SQLite עתידי
 * מספק שכבת הפשטה מעל database.ts
 */
export const loanRepository = {
  /**
   * שליפת הלוואות שמועמדות לפירעון אוטומטי
   * @param date תאריך הבדיקה (ISO format)
   * @returns רשימת הלוואות מסוננות לפי כל התנאים הבאים:
   * - לא מחוקות
   * - פירעון אוטומטי מופעל
   * - יש סכום פירעון מוגדר
   * - תאריך התחלת פירעון עבר
   * - סטטוס פעיל
   * - יש יתרה
   */
  async getAutoRepaymentDue(date: string): Promise<Loan[]> {
    const loans = getAllItems<Loan>('loans')
    const repayments = getAllItems<Repayment>('repayments')
    
    // חישוב remaining לכל הלוואה
    const loansWithRemaining = loans.map(loan => {
      const loanRepayments = repayments.filter(r => r.loan_id === loan.id && !r.is_deleted)
      const totalRepaid = loanRepayments.reduce((sum, r) => sum + r.amount, 0)
      const remaining = loan.amount - totalRepaid
      return { ...loan, remaining }
    })
    
    return loansWithRemaining
      .filter(l => !l.is_deleted)
      .filter(l => l.auto_repayment === 1)
      .filter(l => (l.repayment_amount ?? 0) > 0)
      .filter(l => (l.repayment_start_date ?? '') <= date)
      .filter(l => l.status === 'active')
      .filter(l => l.remaining > 0)
  },

  /**
   * שליפת הלוואות מחזוריות שמועמדות ליצירה
   * @returns רשימת הלוואות מסוננות לפי כל התנאים הבאים:
   * - לא מחוקות
   * - הלוואה מחזורית (is_recurring = 1)
   * - יש עוד חודשים ליצור (recurring_months > 0)
   * - סטטוס פעיל
   */
  async getRecurringLoansDue(): Promise<Loan[]> {
    return getAllItems<Loan>('loans')
      .filter(l => !l.is_deleted)
      .filter(l => l.is_recurring === 1)
      .filter(l => (l.recurring_months ?? 0) > 0)
      .filter(l => l.status === 'active')
  }
}