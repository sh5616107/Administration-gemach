import { getAllItems } from '../database'

export interface Deposit {
  id: string
  depositor_id: string
  amount: number
  deposit_date: string
  period_type?: string
  due_date?: string
  is_recurring?: number
  recurring_day?: number
  recurring_months?: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
  notes?: string
  status?: string
  payment_method?: string
  payment_details?: string
  is_deleted?: boolean
  deleted_at?: string
}

/**
 * Repository להפקדות - הכנה למעבר ל-SQLite עתידי
 * מספק שכבת הפשטה מעל database.ts
 * 
 * עיקרון: כל סינון נעשה בקוד, לא בהסתמכות על db.query() pseudo-SQL
 */
export const depositRepository = {
  /**
   * קבלת כל ההפקדות (ללא מחוקות)
   */
  async getAll(): Promise<Deposit[]> {
    return getAllItems<Deposit>('deposits')
      .filter(d => !d.is_deleted)
  },

  /**
   * קבלת הפקדה לפי ID
   */
  async getById(id: string): Promise<Deposit | undefined> {
    const deposits = getAllItems<Deposit>('deposits')
    return deposits.find(d => String(d.id) === String(id) && !d.is_deleted)
  },

  /**
   * קבלת הפקדות לפי מפקיד
   */
  async getByDepositor(depositorId: string): Promise<Deposit[]> {
    return getAllItems<Deposit>('deposits')
      .filter(d => !d.is_deleted)
      .filter(d => d.depositor_id === depositorId)
      .sort((a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime())
  },

  /**
   * קבלת הפקדות לפי סטטוס
   */
  async getByStatus(status: string): Promise<Deposit[]> {
    return getAllItems<Deposit>('deposits')
      .filter(d => !d.is_deleted)
      .filter(d => d.status === status)
  },

  /**
   * בדיקה אם קיימת הפקדה מחזורית בטווח תאריכים נתון
   * מחליף את db.query() עם כל תנאי WHERE בקוד אמיתי
   * 
   * השימוש העיקרי: בדיקה אם כבר נוצרה הפקדה החודש
   * למניעת כפילויות ב-scheduler
   * 
   * @param depositorId מזהה המפקיד
   * @param amount סכום ההפקדה
   * @param fromDate תאריך התחלה (ISO format)
   * @param toDate תאריך סיום (ISO format)
   * @param excludeId ID להחרגה (אופציונלי - כדי שלא למצוא את ההפקדה המקורית עצמה)
   * @returns true אם נמצאה הפקדה תואמת
   */
  async hasRecurringDepositForPeriod(
    depositorId: string,
    amount: number,
    fromDate: string,
    toDate: string,
    excludeId?: string
  ): Promise<boolean> {
    const deposits = getAllItems<Deposit>('deposits')
    
    const found = deposits.find(d =>
      !d.is_deleted &&
      d.depositor_id === depositorId &&
      d.amount === amount &&
      d.deposit_date >= fromDate &&
      d.deposit_date <= toDate &&
      (excludeId ? String(d.id) !== String(excludeId) : true)
    )
    
    return !!found
  },

  /**
   * קבלת הפקדות מחזוריות פעילות
   * מסנן רק הפקדות עם:
   * - is_recurring = 1
   * - status = 'active'
   * - לא מחוקות
   */
  async getActiveRecurring(): Promise<Deposit[]> {
    return getAllItems<Deposit>('deposits')
      .filter(d => !d.is_deleted)
      .filter(d => d.is_recurring === 1)
      .filter(d => d.status === 'active')
  },

  /**
   * קבלת כל ההפקדות (כולל מחוקות)
   * שימוש פנימי בלבד - לצרכי מיגרציה ובדיקות
   */
  async getAllIncludingDeleted(): Promise<Deposit[]> {
    return getAllItems<Deposit>('deposits')
  }
}
