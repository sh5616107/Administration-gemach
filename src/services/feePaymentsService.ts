import { db, borrowersService, loansService } from './database'
import type {
  FeePayment,
  CreateFeePaymentInput,
  UpdateFeePaymentInput,
  FeePaymentWithDetails,
  FeePaymentsStats,
  FeePaymentsFilter,
  FeeType
} from '../types/feePayments'
import { logAudit } from './auditLog'

/**
 * שירות לניהול עמלות טיפול בהלוואות
 * תומך ב-CRUD, חישוב סטטיסטיקות, ו-Soft Delete
 */

// קבלת כל העמלות (ללא מחוקות)
export async function getAllFeePayments(): Promise<FeePaymentWithDetails[]> {
  const fees = (await db.query('SELECT * FROM fee_payments', [])) as FeePayment[]
  
  // הוספת מידע מחושב (שם לווה, מספר הלוואה)
  const borrowers = await borrowersService.getAll()
  const loans = await loansService.getAll()
  
  return fees.map(fee => {
    const borrower = borrowers.find(b => b.id === fee.borrower_id)
    const loan = fee.loan_id ? loans.find(l => l.id === fee.loan_id) : null
    
    return {
      ...fee,
      borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
      loan_number: loan?.loan_number
    }
  })
}

// קבלת עמלה לפי ID
export async function getFeePaymentById(id: string): Promise<FeePaymentWithDetails | null> {
  const results = (await db.query('SELECT * FROM fee_payments WHERE id = ?', [id])) as FeePayment[]
  if (results.length === 0) return null
  
  const fee = results[0]
  const borrower = await borrowersService.getById(fee.borrower_id)
  const loan = fee.loan_id ? await loansService.getById(fee.loan_id) : null
  
  return {
    ...fee,
    borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
    loan_number: loan?.loan_number
  }
}

// קבלת עמלות לפי לווה
export async function getFeePaymentsByBorrower(borrowerId: string): Promise<FeePaymentWithDetails[]> {
  const fees = (await db.query('SELECT * FROM fee_payments WHERE borrower_id = ?', [borrowerId])) as FeePayment[]
  
  const borrower = await borrowersService.getById(borrowerId)
  const loans = await loansService.getAll()
  
  return fees.map(fee => {
    const loan = fee.loan_id ? loans.find(l => l.id === fee.loan_id) : null
    
    return {
      ...fee,
      borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
      loan_number: loan?.loan_number
    }
  })
}

// קבלת עמלות לפי הלוואה
export async function getFeePaymentsByLoan(loanId: string): Promise<FeePaymentWithDetails[]> {
  const fees = (await db.query('SELECT * FROM fee_payments WHERE loan_id = ?', [loanId])) as FeePayment[]
  
  const loans = await loansService.getAll()
  const borrowers = await borrowersService.getAll()
  
  return fees.map(fee => {
    const borrower = borrowers.find(b => b.id === fee.borrower_id)
    const loan = loans.find(l => l.id === loanId)
    
    return {
      ...fee,
      borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
      loan_number: loan?.loan_number
    }
  })
}

// יצירת עמלה חדשה
export async function createFeePayment(input: CreateFeePaymentInput): Promise<{ id: string }> {
  // ולידציות
  if (input.amount <= 0) {
    throw new Error('סכום העמלה חייב להיות חיובי')
  }
  
  const paymentDate = new Date(input.payment_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  if (paymentDate > today && (!input.status || input.status === 'paid')) {
    throw new Error('תאריך תשלום עתידי דורש סטטוס "ממתין לתשלום"')
  }
  
  // ולידציה: אם loan_id מסופק, לוודא שהוא שייך לאותו borrower
  if (input.loan_id) {
    const loan = await loansService.getById(input.loan_id)
    if (!loan) {
      throw new Error('הלוואה לא נמצאה')
    }
    if (loan.borrower_id !== input.borrower_id) {
      throw new Error('ההלוואה אינה שייכת ללווה שנבחר')
    }
  }
  
  const status = input.status || 'paid'
  
  const result = await db.run(
    'INSERT INTO fee_payments (borrower_id, loan_id, fee_type, amount, payment_date, payment_method, status, receipt_number, receipt_document_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      input.borrower_id,
      input.loan_id || null,
      input.fee_type,
      input.amount,
      input.payment_date,
      input.payment_method,
      status,
      null, // receipt_number - יוגדר בעת הפקת קבלה
      null, // receipt_document_id
      input.note || null,
      null // created_by - TODO: להוסיף תמיכה במשתמשים
    ]
  )
  
  const id = String(result.lastInsertRowid)
  
  // רישום ב-Audit Log
  await logAudit('create', 'fee_payment', id, {
    after: input,
    actor: 'מערכת'
  })
  
  return { id }
}

// עדכון עמלה
export async function updateFeePayment(id: string, input: UpdateFeePaymentInput): Promise<void> {
  const existing = await getFeePaymentById(id)
  if (!existing) {
    throw new Error('עמלה לא נמצאה')
  }
  
  // ולידציות
  if (input.amount !== undefined && input.amount <= 0) {
    throw new Error('סכום העמלה חייב להיות חיובי')
  }
  
  if (input.payment_date) {
    const paymentDate = new Date(input.payment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const newStatus = input.status || existing.status
    if (paymentDate > today && newStatus === 'paid') {
      throw new Error('תאריך תשלום עתידי דורש סטטוס "ממתין לתשלום"')
    }
  }
  
  // שמירת מצב לפני לצורך Audit
  const beforeData = JSON.stringify(existing)
  
  await db.run(
    'UPDATE fee_payments SET fee_type = ?, amount = ?, payment_date = ?, payment_method = ?, status = ?, note = ? WHERE id = ?',
    [
      input.fee_type || existing.fee_type,
      input.amount !== undefined ? input.amount : existing.amount,
      input.payment_date || existing.payment_date,
      input.payment_method || existing.payment_method,
      input.status || existing.status,
      input.note !== undefined ? input.note : existing.note,
      id
    ]
  )
  
  // עדכון receipt אם סופק
  if (input.receipt_number || input.receipt_document_id) {
    await db.run(
      'UPDATE fee_payments SET receipt_number = ?, receipt_document_id = ? WHERE id = ?',
      [
        input.receipt_number || existing.receipt_number,
        input.receipt_document_id || existing.receipt_document_id,
        id
      ]
    )
  }
  
  // רישום ב-Audit Log
  await logAudit('update', 'fee_payment', id, {
    before: JSON.parse(beforeData),
    after: { ...existing, ...input },
    actor: 'מערכת'
  })
}

// מחיקה רכה (Soft Delete)
export async function deleteFeePayment(id: string, reason?: string): Promise<void> {
  const existing = await getFeePaymentById(id)
  if (!existing) {
    throw new Error('עמלה לא נמצאה')
  }
  
  // בדיקה: אם הסטטוס paid או waived ויש קבלה, לדרוש הערה
  if ((existing.status === 'paid' || existing.status === 'waived') && existing.receipt_number && !reason) {
    throw new Error('מחיקת תשלום עם קבלה דורשת הסבר מפורט')
  }
  
  await db.run('DELETE FROM fee_payments WHERE id = ?', [id])
  
  // רישום ב-Audit Log
  await logAudit('delete', 'fee_payment', id, {
    before: existing,
    metadata: reason ? { reason } : undefined,
    actor: 'מערכת'
  })
}

// שינוי סטטוס
export async function updateFeePaymentStatus(
  id: string,
  newStatus: FeePayment['status'],
  reason?: string
): Promise<void> {
  const existing = await getFeePaymentById(id)
  if (!existing) {
    throw new Error('עמלה לא נמצאה')
  }
  
  // ולידציה: אם משנים מ-paid ל-cancelled, דורש הערה
  if (existing.status === 'paid' && newStatus === 'cancelled' && !reason) {
    throw new Error('ביטול תשלום ששולם דורש הסבר מפורט')
  }
  
  await updateFeePayment(id, { status: newStatus })
  
  if (reason) {
    await logAudit('status_change', 'fee_payment', id, {
      before: { status: existing.status },
      after: { status: newStatus },
      metadata: { reason },
      actor: 'מערכת'
    })
  }
}

// חישוב סטטיסטיקות
export async function getFeePaymentsStats(filter?: FeePaymentsFilter): Promise<FeePaymentsStats> {
  let fees = await getAllFeePayments()
  
  // יישום פילטרים
  if (filter) {
    if (filter.borrower_id) {
      fees = fees.filter(f => f.borrower_id === filter.borrower_id)
    }
    if (filter.loan_id) {
      fees = fees.filter(f => f.loan_id === filter.loan_id)
    }
    if (filter.fee_type) {
      fees = fees.filter(f => f.fee_type === filter.fee_type)
    }
    if (filter.status) {
      fees = fees.filter(f => f.status === filter.status)
    }
    if (filter.payment_method) {
      fees = fees.filter(f => f.payment_method === filter.payment_method)
    }
    if (filter.date_from) {
      fees = fees.filter(f => f.payment_date >= filter.date_from!)
    }
    if (filter.date_to) {
      fees = fees.filter(f => f.payment_date <= filter.date_to!)
    }
  }
  
  const paidFees = fees.filter(f => f.status === 'paid')
  const pendingFees = fees.filter(f => f.status === 'pending')
  
  const total_fees_collected = paidFees.reduce((sum, f) => sum + f.amount, 0)
  const total_fees_pending = pendingFees.reduce((sum, f) => sum + f.amount, 0)
  
  // חישוב לפי סוג עמלה
  const fees_by_type: Record<FeeType, number> = {
    processing: 0,
    guarantor_check: 0,
    membership: 0,
    other: 0
  }
  
  paidFees.forEach(f => {
    fees_by_type[f.fee_type] += f.amount
  })
  
  return {
    total_fees_collected,
    total_fees_pending,
    count_paid: paidFees.length,
    count_pending: pendingFees.length,
    fees_by_type
  }
}

// פילטור עמלות עם פרמטרים מתקדמים
export async function filterFeePayments(filter: FeePaymentsFilter): Promise<FeePaymentWithDetails[]> {
  let fees = await getAllFeePayments()
  
  if (filter.borrower_id) {
    fees = fees.filter(f => f.borrower_id === filter.borrower_id)
  }
  if (filter.loan_id) {
    fees = fees.filter(f => f.loan_id === filter.loan_id)
  }
  if (filter.fee_type) {
    fees = fees.filter(f => f.fee_type === filter.fee_type)
  }
  if (filter.status) {
    fees = fees.filter(f => f.status === filter.status)
  }
  if (filter.payment_method) {
    fees = fees.filter(f => f.payment_method === filter.payment_method)
  }
  if (filter.date_from) {
    fees = fees.filter(f => f.payment_date >= filter.date_from!)
  }
  if (filter.date_to) {
    fees = fees.filter(f => f.payment_date <= filter.date_to!)
  }
  
  return fees
}

// סה"כ עמלות ששולמו להלוואה ספציפית
export async function getTotalFeesByLoan(loanId: string): Promise<number> {
  const fees = await getFeePaymentsByLoan(loanId)
  return fees.filter(f => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0)
}

// סה"כ עמלות ששולמו על ידי לווה (בכל ההלוואות שלו)
export async function getTotalFeesByBorrower(borrowerId: string): Promise<number> {
  const fees = await getFeePaymentsByBorrower(borrowerId)
  return fees.filter(f => f.status === 'paid').reduce((sum, f) => sum + f.amount, 0)
}

// יצירת מספר קבלה רץ
export async function generateReceiptNumber(): Promise<string> {
  const allFees = await getAllFeePayments()
  
  // חישוב מקסימום מספר קבלה קיים
  const maxReceiptNum = allFees.reduce((max, f) => {
    if (!f.receipt_number) return max
    
    const num = parseInt(f.receipt_number)
    if (!isNaN(num) && num > 0 && num < 1000000 && num > max) {
      return num
    }
    return max
  }, 0)
  
  return String(maxReceiptNum + 1).padStart(6, '0') // פורמט: 000001, 000002...
}

// עדכון פרטי קבלה לאחר הפקה
export async function updateReceiptDetails(
  feePaymentId: string,
  receiptNumber: string,
  documentId?: string
): Promise<void> {
  await updateFeePayment(feePaymentId, {
    receipt_number: receiptNumber,
    receipt_document_id: documentId
  })
}
