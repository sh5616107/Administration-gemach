import { getAllItems } from '../database'
import type { Repayment } from '../database'

/**
 * Repository דק לפירעונות - הכנה למעבר ל-SQLite עתידי
 * מספק שכבת הפשטה מעל database.ts
 */
export const repaymentRepository = {
  /**
   * שליפת פירעונות להלוואה בטווח תאריכים
   * @param loanId מזהה ההלוואה
   * @param from תאריך התחלה (ISO format)
   * @param to תאריך סיום (ISO format)
   * @returns רשימת פירעונות מסוננת
   */
  async getForLoanInDateRange(loanId: string, from: string, to: string): Promise<Repayment[]> {
    return getAllItems<Repayment>('repayments')
      .filter(r => r.loan_id === loanId)
      .filter(r => r.payment_date >= from && r.payment_date <= to)
  }
}
