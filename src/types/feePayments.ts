// טיפוסים לניהול עמלות טיפול בהלוואות

export type FeeType = 'processing' | 'guarantor_check' | 'membership' | 'other'

export type FeeStatus = 'paid' | 'pending' | 'waived' | 'cancelled'

export type PaymentMethod = 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'other'

export interface FeePayment {
  id: string // UUID
  borrower_id: string // UUID - חובה
  loan_id?: string | null // UUID - אופציונלי, אם קשור להלוואה ספציפית
  fee_type: FeeType
  amount: number
  payment_date: string // YYYY-MM-DD
  payment_method: PaymentMethod
  status: FeeStatus
  receipt_number?: string | null // מספר קבלה שהופקה
  receipt_document_id?: string | null // UUID - קישור למסמך
  note?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null // שם המשתמש שרשם
  is_deleted?: boolean
  deleted_at?: string | null
}

export interface CreateFeePaymentInput {
  borrower_id: string
  loan_id?: string | null
  fee_type: FeeType
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  status?: FeeStatus // ברירת מחדל: paid
  note?: string | null
}

export interface UpdateFeePaymentInput {
  fee_type?: FeeType
  amount?: number
  payment_date?: string
  payment_method?: PaymentMethod
  status?: FeeStatus
  note?: string | null
  receipt_number?: string
  receipt_document_id?: string
}

// טיפוס מורחב עם מידע מחושב לתצוגה
export interface FeePaymentWithDetails extends FeePayment {
  borrower_name?: string
  loan_number?: number
}

// סטטיסטיקות עמלות
export interface FeePaymentsStats {
  total_fees_collected: number // סה"כ עמלות שנגבו (paid)
  total_fees_pending: number // סה"כ עמלות ממתינות
  count_paid: number
  count_pending: number
  fees_by_type: Record<FeeType, number> // סכום לפי סוג עמלה
}

// פילטרים לדוח עמלות
export interface FeePaymentsFilter {
  borrower_id?: string
  loan_id?: string
  fee_type?: FeeType
  status?: FeeStatus
  date_from?: string
  date_to?: string
  payment_method?: PaymentMethod
}
