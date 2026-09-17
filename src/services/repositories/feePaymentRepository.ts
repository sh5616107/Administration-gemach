import { getAllItems } from '../database'

export interface FeePayment {
  id: string
  borrower_id: string
  loan_id?: string
  amount: number
  payment_date: string
  fee_type: string
  notes?: string
  is_deleted?: boolean
  deleted_at?: string
}

/**
 * Repository לעמלות - הכנה למעבר ל-SQLite עתידי
 */
export const feePaymentRepository = {
  /**
   * קבלת כל העמלות (ללא מחוקות)
   */
  async getAll(): Promise<FeePayment[]> {
    return getAllItems<FeePayment>('feePayments')
      .filter(f => !f.is_deleted)
      .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
  },

  /**
   * קבלת עמלה לפי ID
   */
  async getById(id: string): Promise<FeePayment | undefined> {
    const fees = getAllItems<FeePayment>('feePayments')
    return fees.find(f => f.id === id && !f.is_deleted)
  },

  /**
   * קבלת עמלות לפי לווה
   */
  async getByBorrower(borrowerId: string): Promise<FeePayment[]> {
    return getAllItems<FeePayment>('feePayments')
      .filter(f => !f.is_deleted)
      .filter(f => f.borrower_id === borrowerId)
      .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
  },

  /**
   * קבלת עמלות לפי הלוואה
   */
  async getByLoan(loanId: string): Promise<FeePayment[]> {
    return getAllItems<FeePayment>('feePayments')
      .filter(f => !f.is_deleted)
      .filter(f => f.loan_id === loanId)
      .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
  },

  /**
   * קבלת כל העמלות (כולל מחוקות)
   */
  async getAllIncludingDeleted(): Promise<FeePayment[]> {
    return getAllItems<FeePayment>('feePayments')
  }
}
