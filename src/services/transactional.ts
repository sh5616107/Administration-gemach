/**
 * שכבת Transactions - פעולות אטומיות עסקיות
 * 
 * מטרה: להבטיח שפעולות מרובות יבוצעו כיחידה אחת (all-or-nothing)
 * עד המעבר ל-SQLite עם transactions אמיתיות, זהו best-effort compensation.
 */

import { repaymentsService, loansService, guarantorLoansService, guarantorLoanRepaymentsService } from './database'
import { commitData } from './database'
import { logRepaymentCreate, logRepaymentUpdate, logRepaymentDelete } from './auditLog'
import logger from '../utils/logger'

/**
 * תוצאת פעולה טרנזקציונלית
 */
export interface TransactionResult<T = void> {
  success: boolean
  data?: T
  error?: string
  compensationFailed?: boolean
}

/**
 * הוספת פירעון אטומית
 * כולל עדכון guarantor loans אוטומטי
 * 
 * @param loanId - ID של ההלוואה
 * @param repaymentData - נתוני הפירעון
 * @returns תוצאה עם success/error
 */
export async function addRepaymentAtomic(
  loanId: string,
  repaymentData: {
    amount: number
    payment_date: string
    payment_method: string
    payment_details: string
    is_recurring?: number
    recurring_repayment_number?: number
    recurring_repayment_count?: number
  }
): Promise<TransactionResult<{ repaymentId: string; guarantorLoansUpdated: boolean }>> {
  
  logger.info(`[TX] Starting atomic repayment: loan=${loanId}, amount=${repaymentData.amount}`)
  
  let createdRepaymentId: string | null = null
  let createdGuarantorRepayments: string[] = []
  
  try {
    // שלב 1: בדיקות ראשוניות
    const loan = await loansService.getById(loanId)
    if (!loan) {
      return { success: false, error: 'הלוואה לא נמצאה' }
    }
    
    const remaining = loan.remaining || 0
    if (remaining <= 0) {
      return { success: false, error: 'ההלוואה כבר נפרעה במלואה' }
    }
    
    if (repaymentData.amount > remaining) {
      return { success: false, error: 'סכום הפירעון גדול מיתרת ההלוואה' }
    }
    
    // שלב 2: יצירת הפירעון
    const result = await repaymentsService.create({
      loan_id: loanId,
      ...repaymentData
    })
    
    createdRepaymentId = String(result.lastInsertRowid)
    logger.info(`[TX] Repayment created: id=${createdRepaymentId}`)
    
    // Audit log
    await logRepaymentCreate(createdRepaymentId, repaymentData)
    
    // שלב 3: עדכון guarantor loans (אם קיימים)
    let guarantorLoansUpdated = false
    
    const guarantorLoans = await guarantorLoansService.getAll()
    const relatedGuarantorLoans = guarantorLoans.filter(gl => 
      gl.original_loan_id === loanId && 
      gl.status === 'active'
    )
    
    if (relatedGuarantorLoans.length > 0) {
      logger.info(`[TX] Updating ${relatedGuarantorLoans.length} guarantor loans`)
      
      for (const gl of relatedGuarantorLoans) {
        // חישוב פרופורציה
        const proportion = gl.amount / loan.amount
        const guarantorRepaymentAmount = repaymentData.amount * proportion
        
        // יצירת פירעון לערב
        const glRepayment = await guarantorLoanRepaymentsService.create({
          guarantor_loan_id: gl.id,
          amount: guarantorRepaymentAmount,
          payment_date: repaymentData.payment_date,
          payment_method: repaymentData.payment_method || '',
          payment_details: repaymentData.payment_details || ''
        })
        
        createdGuarantorRepayments.push(String(glRepayment.lastInsertRowid))
        
        // בדיקה אם הלוואת הערב נפרעה במלואה
        const glRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        const totalRepaid = glRepayments.reduce((sum, r) => sum + r.amount, 0)
        
        if (totalRepaid >= gl.amount) {
          await guarantorLoansService.update(gl.id, { status: 'paid' })
          logger.info(`[TX] Guarantor loan ${gl.id} marked as paid`)
        }
      }
      
      guarantorLoansUpdated = true
    }
    
    // שלב 4: commit - הבטחת שמירה לדיסק
    await commitData()
    
    logger.info(`[TX] Atomic repayment completed successfully`)
    return {
      success: true,
      data: {
        repaymentId: createdRepaymentId,
        guarantorLoansUpdated
      }
    }
    
  } catch (error: any) {
    logger.error(`[TX] Atomic repayment failed:`, error)
    
    // ניסיון Compensation - מחיקה של מה שנוצר
    let compensationFailed = false
    
    try {
      if (createdRepaymentId) {
        logger.info(`[TX] Compensating: deleting repayment ${createdRepaymentId}`)
        await repaymentsService.delete(createdRepaymentId)
      }
      
      for (const grId of createdGuarantorRepayments) {
        logger.info(`[TX] Compensating: deleting guarantor repayment ${grId}`)
        await guarantorLoanRepaymentsService.delete(grId)
      }
      
      await commitData()
      
    } catch (compensationError: any) {
      logger.error(`[TX] Compensation failed!`, compensationError)
      compensationFailed = true
    }
    
    return {
      success: false,
      error: error.message || 'שגיאה לא ידועה',
      compensationFailed
    }
  }
}

/**
 * עדכון פירעון אטומי
 * כולל עדכון guarantor loan repayments
 * 
 * @param repaymentId - ID של הפירעון
 * @param updates - עדכונים (סכום, תאריך וכו')
 * @returns תוצאה עם success/error
 */
export async function updateRepaymentAtomic(
  repaymentId: string,
  updates: {
    amount?: number
    payment_date?: string
    payment_method?: string
    payment_details?: string
  }
): Promise<TransactionResult> {
  
  logger.info(`[TX] Starting atomic repayment update: id=${repaymentId}`)
  
  try {
    // שלב 1: קבלת הפירעון המקורי
    const repayment = await repaymentsService.getById(repaymentId)
    if (!repayment) {
      return { success: false, error: 'פירעון לא נמצא' }
    }
    
    const originalAmount = repayment.amount
    const newAmount = updates.amount ?? originalAmount
    const amountDiff = newAmount - originalAmount
    
    // שלב 2: עדכון הפירעון
    await repaymentsService.update(repaymentId, updates)
    logger.info(`[TX] Repayment updated`)
    
    // Audit log
    await logRepaymentUpdate(repaymentId, repayment, { ...repayment, ...updates })
    
    // שלב 3: עדכון פירעונות ערבים (אם השתנה הסכום)
    if (amountDiff !== 0) {
      const loan = await loansService.getById(repayment.loan_id)
      if (loan) {
        const guarantorLoans = await guarantorLoansService.getAll()
        const relatedGuarantorLoans = guarantorLoans.filter(gl => 
          gl.original_loan_id === loan.id && 
          gl.status === 'active'
        )
        
        for (const gl of relatedGuarantorLoans) {
          const proportion = gl.amount / loan.amount
          const guarantorAmountDiff = amountDiff * proportion
          
          // מציאת הפירעון המתאים של הערב
          const glRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
          const matchingGlRepayment = glRepayments.find(glr => 
            glr.payment_date === repayment.payment_date
          )
          
          if (matchingGlRepayment) {
            const newGlAmount = matchingGlRepayment.amount + guarantorAmountDiff
            await guarantorLoanRepaymentsService.update(matchingGlRepayment.id, {
              amount: newGlAmount
            })
            logger.info(`[TX] Guarantor repayment ${matchingGlRepayment.id} updated`)
          }
        }
      }
    }
    
    // שלב 4: commit
    await commitData()
    
    logger.info(`[TX] Atomic repayment update completed`)
    return { success: true }
    
  } catch (error: any) {
    logger.error(`[TX] Atomic repayment update failed:`, error)
    return {
      success: false,
      error: error.message || 'שגיאה בעדכון פירעון'
    }
  }
}

/**
 * מחיקת פירעון אטומית
 * כולל מחיקת guarantor loan repayments + עדכון סטטוסים
 * 
 * @param repaymentId - ID של הפירעון
 * @returns תוצאה עם success/error
 */
export async function deleteRepaymentAtomic(
  repaymentId: string
): Promise<TransactionResult> {
  
  logger.info(`[TX] Starting atomic repayment deletion: id=${repaymentId}`)
  
  try {
    // שלב 1: קבלת הפירעון
    const repayment = await repaymentsService.getById(repaymentId)
    if (!repayment) {
      return { success: false, error: 'פירעון לא נמצא' }
    }
    
    const loanId = repayment.loan_id
    const amount = repayment.amount
    const paymentDate = repayment.payment_date
    
    // שלב 2: מחיקת הפירעון
    await repaymentsService.delete(repaymentId)
    logger.info(`[TX] Repayment deleted`)
    
    // Audit log
    await logRepaymentDelete(repaymentId, repayment)
    
    // שלב 3: מחיקת פירעונות ערבים מתאימים
    const loan = await loansService.getById(loanId)
    if (loan) {
      const guarantorLoans = await guarantorLoansService.getAll()
      const relatedGuarantorLoans = guarantorLoans.filter(gl => 
        gl.original_loan_id === loan.id
      )
      
      for (const gl of relatedGuarantorLoans) {
        const glRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        const matchingGlRepayment = glRepayments.find(glr => 
          glr.payment_date === paymentDate
        )
        
        if (matchingGlRepayment) {
          await guarantorLoanRepaymentsService.delete(matchingGlRepayment.id)
          logger.info(`[TX] Guarantor repayment ${matchingGlRepayment.id} deleted`)
        }
        
        // בדיקה אם צריך לשנות סטטוס חזרה ל-active
        const remainingGlRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        const totalRepaid = remainingGlRepayments.reduce((sum, r) => sum + r.amount, 0)
        
        if (totalRepaid < gl.amount && gl.status === 'paid') {
          await guarantorLoansService.update(gl.id, { status: 'active' })
          logger.info(`[TX] Guarantor loan ${gl.id} status reverted to active`)
        }
      }
    }
    
    // שלב 4: commit
    await commitData()
    
    logger.info(`[TX] Atomic repayment deletion completed`)
    return { success: true }
    
  } catch (error: any) {
    logger.error(`[TX] Atomic repayment deletion failed:`, error)
    return {
      success: false,
      error: error.message || 'שגיאה במחיקת פירעון'
    }
  }
}
