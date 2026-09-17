import { getAllItems } from '../database'
import type { Repayment } from '../database'

/**
 * Repository דק לפירעונות - הכנה למעבר ל-SQLite עתידי
 * מספק שכבת הפשטה מעל database.ts
 */
export const repaymentRepository = {
  /**
   * קבלת כל הפירעונות (ללא מחוקים)
   */
  async getAll(): Promise<Repayment[]> {
    return getAllItems<Repayment>('repayments')
      .filter(r => !r.is_deleted)
  },

  /**
   * שליפת פירעונות להלוואה בטווח תאריכים
   * @param loanId מזהה ההלוואה
   * @param from תאריך התחלה (ISO format)
   * @param to תאריך סיום (ISO format)
   * @returns רשימת פירעונות מסוננת
   */
  async getForLoanInDateRange(loanId: string, from: string, to: string): Promise<Repayment[]> {
    return getAllItems<Repayment>('repayments')
      .filter(r => !r.is_deleted)
      .filter(r => r.loan_id === loanId)
      .filter(r => r.payment_date >= from && r.payment_date <= to)
  },

  /**
   * קבלת פירעונות להלוואה ספציפית
   */
  async getByLoan(loanId: string): Promise<Repayment[]> {
    return getAllItems<Repayment>('repayments')
      .filter(r => !r.is_deleted)
      .filter(r => r.loan_id === loanId)
      .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
  },

  /**
   * קבלת כל הפירעונות (כולל מחוקים)
   */
  async getAllIncludingDeleted(): Promise<Repayment[]> {
    return getAllItems<Repayment>('repayments')
  }
}
