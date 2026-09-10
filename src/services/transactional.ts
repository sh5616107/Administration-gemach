/**
 * שכבת Transactions - פעולות אטומיות עסקיות
 * 
 * מטרה: להבטיח שפעולות מרובות יבוצעו כיחידה אחת (all-or-nothing)
 * עד המעבר ל-SQLite עם transactions אמיתיות, זהו best-effort compensation.
 */

import { repaymentsService, loansService, guarantorLoansService, guarantorLoanRepaymentsService, GuarantorLoanRepayment } from './database'
import { commitData } from './database'
import { logRepaymentCreate, logRepaymentUpdate, logRepaymentDelete, logCompensation } from './auditLog'
import logger from '../utils/logger'
import { validateRepaymentAmount, validateRepayment } from './validators'

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
 * מציאת פירעון הערב שמתאים לפירעון הלווה הנתון.
 *
 * עדיפות ראשונה: התאמה מפורשת דרך source_repayment_id (נשמר החל מהיצירה
 * ב-addRepaymentAtomic). זו ההתאמה היחידה שבטוחה באופן חד-משמעי.
 *
 * נפילה חזרה (fallback) לפי payment_date קיימת רק כדי לא לשבור רשומות
 * שנוצרו *לפני* הוספת source_repayment_id. היא מוגבלת בכוונה לרשומות
 * שעדיין אין להן source_repayment_id בכלל - כדי לא "לגנוב" בטעות רשומה
 * ששייכת כבר במפורש לפירעון אחר רק כי יש לו אותו תאריך. אם יש כמה רשומות
 * ללא תיוג באותו תאריך, עדיין יכולה לקרות התאמה שגויה - בדיוק כמו קודם -
 * ולכן זה מתועד בלוג כאזהרה מפורשת כדי שאפשר יהיה למצוא ולתקן ידנית.
 */
function findMatchingGuarantorRepayment(
  glRepayments: GuarantorLoanRepayment[],
  repaymentId: string,
  paymentDate: string
): GuarantorLoanRepayment | undefined {
  const bySourceId = glRepayments.find(glr => glr.source_repayment_id === repaymentId)
  if (bySourceId) {
    return bySourceId
  }

  const untagged = glRepayments.filter(glr => !glr.source_repayment_id)
  const byDateAmongUntagged = untagged.find(glr => glr.payment_date === paymentDate)

  if (byDateAmongUntagged) {
    logger.warn(
      `[TX] Guarantor repayment ${byDateAmongUntagged.id} matched to repayment ${repaymentId} ` +
      `by payment_date only (legacy record without source_repayment_id). ` +
      `If more than one untagged guarantor repayment shares this date, the match may be wrong - verify manually.`
    )
  }

  return byDateAmongUntagged
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
  let createdRepaymentAuditId: string | null = null
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
    
    // Validation מרוכזת
    const validation = validateRepayment({ loan_id: loanId, ...repaymentData }, loan)
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') }
    }
    
    // שלב 2: יצירת הפירעון
    const result = await repaymentsService.create({
      loan_id: loanId,
      ...repaymentData
    })
    
    createdRepaymentId = String(result.lastInsertRowid)
    logger.info(`[TX] Repayment created: id=${createdRepaymentId}`)
    
    // Audit log - שומרים את ה-id כדי שאפשר יהיה לתעד compensation מולו אם נצטרך
    createdRepaymentAuditId = await logRepaymentCreate(createdRepaymentId, repaymentData)
    
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
        
        // יצירת פירעון לערב - עם source_repayment_id כדי שעדכון/מחיקה
        // עתידיים של פירעון הלווה הזה ימצאו את הרשומה הזו בוודאות, ולא
        // ינחשו לפי payment_date (ראו findMatchingGuarantorRepayment)
        const glRepayment = await guarantorLoanRepaymentsService.create({
          guarantor_loan_id: gl.id,
          amount: guarantorRepaymentAmount,
          payment_date: repaymentData.payment_date,
          payment_method: repaymentData.payment_method || '',
          payment_details: repaymentData.payment_details || '',
          source_repayment_id: createdRepaymentId
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

    // תיעוד ה-compensation ב-audit log. בלי זה, רשומת ה-'repayment_create'
    // שכבר נכתבה (createdRepaymentAuditId) הייתה נשארת כ"אמת" יחידה למרות
    // שהפירעון בוטל - עכשיו יש רשומה נוספת שמצביעה עליה במפורש ומסבירה
    // שהיא בוטלה. אם ה-compensation עצמו נכשל, זה מצוין בסיבה כדי שמישהו
    // יבדוק ידנית אם נשארו רשומות "יתומות".
    if (createdRepaymentId) {
      await logCompensation(
        'repayment_create',
        'repayment',
        createdRepaymentId,
        createdRepaymentAuditId,
        repaymentData,
        compensationFailed
          ? `${error.message || 'שגיאה לא ידועה'} (compensation גם נכשל - יש לבדוק ידנית אם נשארו רשומות)`
          : (error.message || 'שגיאה לא ידועה')
      )
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

  // מצב לפני כל שינוי - נדרש כדי שנוכל לעשות rollback אמיתי אם שלב מאוחר
  // יותר ייכשל אחרי ש-repaymentsService.update כבר רץ בפועל
  let repaymentUpdateApplied = false
  let originalRepaymentSnapshot: any = null
  const appliedGuarantorUpdates: { id: string; previousAmount: number }[] = []
  let updateAuditId: string | null = null
  
  try {
    // שלב 1: קבלת הפירעון המקורי
    const repayment = await repaymentsService.getById(repaymentId)
    if (!repayment) {
      return { success: false, error: 'פירעון לא נמצא' }
    }
    originalRepaymentSnapshot = repayment
    
    const originalAmount = repayment.amount
    const newAmount = updates.amount ?? originalAmount
    const amountDiff = newAmount - originalAmount
    
    // שלב 2: עדכון הפירעון
    // Validation של הסכום החדש
    if (updates.amount !== undefined) {
      const loan = await loansService.getById(repayment.loan_id)
      if (loan) {
        const otherRepayments = (await repaymentsService.getByLoan(loan.id))
          .filter(r => r.id !== repaymentId)
        const otherTotal = otherRepayments.reduce((sum, r) => sum + r.amount, 0)
        const remainingForThis = loan.amount - otherTotal
        
        const validation = validateRepaymentAmount(updates.amount, remainingForThis)
        if (!validation.valid) {
          return { success: false, error: validation.errors.join(', ') }
        }
      }
    }
    
    await repaymentsService.update(repaymentId, updates)
    repaymentUpdateApplied = true
    logger.info(`[TX] Repayment updated`)
    
    // Audit log
    updateAuditId = await logRepaymentUpdate(repaymentId, repayment, { ...repayment, ...updates })
    
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
          
          // מציאת הפירעון המתאים של הערב - דרך source_repayment_id קודם,
          // ורק אם חסר נופלים חזרה על payment_date (ראו findMatchingGuarantorRepayment)
          const glRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
          const matchingGlRepayment = findMatchingGuarantorRepayment(glRepayments, repaymentId, repayment.payment_date)
          
          if (matchingGlRepayment) {
            const newGlAmount = matchingGlRepayment.amount + guarantorAmountDiff
            appliedGuarantorUpdates.push({ id: matchingGlRepayment.id, previousAmount: matchingGlRepayment.amount })
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

    // Rollback אמיתי: מחזירים את הפירעון ואת כל פירעונות הערב שכבר עודכנו
    // בלולאה חזרה למצב המקורי שלהם, לפני שנכשלנו. בלי זה, הכשל היה מחזיר
    // success=false בעוד השינוי כבר נשאר בפועל (הבאג המקורי).
    let compensationFailed = false
    try {
      if (repaymentUpdateApplied && originalRepaymentSnapshot) {
        logger.info(`[TX] Rolling back: restoring repayment ${repaymentId} to its pre-update state`)
        await repaymentsService.update(repaymentId, originalRepaymentSnapshot)
      }

      for (const applied of appliedGuarantorUpdates) {
        logger.info(`[TX] Rolling back: restoring guarantor repayment ${applied.id} to amount=${applied.previousAmount}`)
        await guarantorLoanRepaymentsService.update(applied.id, { amount: applied.previousAmount })
      }

      await commitData()
    } catch (compensationError: any) {
      logger.error(`[TX] Rollback failed!`, compensationError)
      compensationFailed = true
    }

    if (repaymentUpdateApplied) {
      await logCompensation(
        'repayment_update',
        'repayment',
        repaymentId,
        updateAuditId,
        originalRepaymentSnapshot,
        compensationFailed
          ? `${error.message || 'שגיאה בעדכון פירעון'} (rollback גם נכשל - יש לבדוק ידנית)`
          : (error.message || 'שגיאה בעדכון פירעון')
      )
    }

    return {
      success: false,
      error: error.message || 'שגיאה בעדכון פירעון',
      compensationFailed
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
        // התאמה דרך source_repayment_id קודם, payment_date רק כ-fallback
        // לרשומות ישנות ללא תיוג (ראו findMatchingGuarantorRepayment)
        const matchingGlRepayment = findMatchingGuarantorRepayment(glRepayments, repaymentId, paymentDate)
        
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
