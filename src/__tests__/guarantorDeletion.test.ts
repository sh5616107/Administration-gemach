/**
 * בדיקות יחידה להגנה על מחיקת ערבים
 * בודק את הלוגיקה של:
 * 1. מניעת מחיקת ערב עם הלוואה פעילה
 * 2. העברת סכום לערב שני כשמוחקים הלוואת ערב
 * 3. החזרת הלוואה לסטטוס "באיחור" כשאין ערב נוסף
 */

import { describe, it, expect } from 'vitest'

// ========================================
// טיפוסים לבדיקות
// ========================================

interface GuarantorLoan {
  id: number
  guarantor_id: number
  original_loan_id: number
  amount: number
  total_repaid: number
  status: 'active' | 'paid'
}

interface Loan {
  id: number
  guarantor1_id?: number
  guarantor2_id?: number
  status: string
  remaining: number
}

// ========================================
// פונקציות עזר - לוגיקה טהורה לבדיקה
// ========================================

/**
 * בודק אם ניתן למחוק ערב
 * @returns null אם ניתן למחוק, אחרת הודעת שגיאה
 */
function canDeleteGuarantor(
  guarantorId: number,
  guarantorLoans: GuarantorLoan[]
): string | null {
  const activeLoans = guarantorLoans.filter(
    gl => gl.guarantor_id === guarantorId && gl.status === 'active'
  )
  
  if (activeLoans.length > 0) {
    return 'לא ניתן למחוק ערב שיש לו הלוואה פעילה. יש למחוק קודם את ההלוואה.'
  }
  
  return null
}

/**
 * מחשב את מספר ההלוואות שערב משמש בהן
 */
function countLoansWithGuarantor(
  guarantorId: number,
  loans: Loan[]
): number {
  return loans.filter(
    l => (l.guarantor1_id === guarantorId || l.guarantor2_id === guarantorId) && 
         l.status === 'active'
  ).length
}

/**
 * יוצר הודעת אישור למחיקת ערב
 */
function getDeleteConfirmMessage(
  guarantorId: number,
  loans: Loan[]
): string {
  const loansCount = countLoansWithGuarantor(guarantorId, loans)
  
  if (loansCount > 0) {
    return `שים לב: ערב זה משמש כערב ב-${loansCount} הלוואות פעילות.\nהמחיקה תסיר אותו מהלוואות אלו.\n\nהאם להמשיך?`
  }
  
  return 'האם למחוק את הערב?'
}

/**
 * מחשב את התוצאה של מחיקת הלוואת ערב
 */
interface DeleteGuarantorLoanResult {
  action: 'transfer_to_other' | 'return_to_overdue' | 'simple_delete'
  transferAmount?: number
  otherGuarantorId?: number
  originalLoanId?: number
}

function calculateDeleteGuarantorLoanResult(
  glToDelete: GuarantorLoan,
  allGuarantorLoans: GuarantorLoan[],
  originalLoanStatus: string
): DeleteGuarantorLoanResult {
  const remaining = glToDelete.amount - glToDelete.total_repaid
  
  // בדיקה אם יש ערב נוסף על אותה הלוואה מקורית
  const otherGuarantorLoans = allGuarantorLoans.filter(
    gl => gl.original_loan_id === glToDelete.original_loan_id && 
          gl.id !== glToDelete.id && 
          gl.status === 'active'
  )
  
  if (otherGuarantorLoans.length > 0) {
    // יש ערב נוסף - מעבירים את היתרה אליו
    return {
      action: 'transfer_to_other',
      transferAmount: remaining,
      otherGuarantorId: otherGuarantorLoans[0].guarantor_id
    }
  }
  
  // אין ערב נוסף - בודקים אם צריך להחזיר לסטטוס באיחור
  if (originalLoanStatus === 'transferred') {
    return {
      action: 'return_to_overdue',
      originalLoanId: glToDelete.original_loan_id
    }
  }
  
  return { action: 'simple_delete' }
}

/**
 * מעדכן הלוואות אחרי מחיקת ערב - מסיר את הערב מההלוואות
 */
function getLoansUpdatesAfterGuarantorDelete(
  guarantorId: number,
  loans: Loan[]
): { loanId: number; updates: Partial<Loan> }[] {
  const updates: { loanId: number; updates: Partial<Loan> }[] = []
  
  for (const loan of loans) {
    if ((loan.guarantor1_id === guarantorId || loan.guarantor2_id === guarantorId) && 
        loan.status === 'active') {
      if (loan.guarantor1_id === guarantorId) {
        // ערב 1 נמחק - מעבירים ערב 2 למקומו
        updates.push({
          loanId: loan.id,
          updates: {
            guarantor1_id: loan.guarantor2_id || undefined,
            guarantor2_id: undefined
          }
        })
      } else if (loan.guarantor2_id === guarantorId) {
        // ערב 2 נמחק - פשוט מסירים אותו
        updates.push({
          loanId: loan.id,
          updates: {
            guarantor2_id: undefined
          }
        })
      }
    }
  }
  
  return updates
}

// ========================================
// בדיקות: מניעת מחיקת ערב עם הלוואה פעילה
// ========================================

describe('canDeleteGuarantor', () => {
  it('should prevent deletion when guarantor has active loan', () => {
    const guarantorLoans: GuarantorLoan[] = [
      { id: 1, guarantor_id: 100, original_loan_id: 1, amount: 5000, total_repaid: 0, status: 'active' }
    ]
    
    const result = canDeleteGuarantor(100, guarantorLoans)
    
    expect(result).not.toBeNull()
    expect(result).toContain('לא ניתן למחוק')
  })
  
  it('should allow deletion when guarantor has no active loans', () => {
    const guarantorLoans: GuarantorLoan[] = [
      { id: 1, guarantor_id: 100, original_loan_id: 1, amount: 5000, total_repaid: 5000, status: 'paid' }
    ]
    
    const result = canDeleteGuarantor(100, guarantorLoans)
    
    expect(result).toBeNull()
  })
  
  it('should allow deletion when guarantor has no loans at all', () => {
    const guarantorLoans: GuarantorLoan[] = []
    
    const result = canDeleteGuarantor(100, guarantorLoans)
    
    expect(result).toBeNull()
  })
  
  it('should allow deletion when other guarantors have active loans', () => {
    const guarantorLoans: GuarantorLoan[] = [
      { id: 1, guarantor_id: 200, original_loan_id: 1, amount: 5000, total_repaid: 0, status: 'active' }
    ]
    
    const result = canDeleteGuarantor(100, guarantorLoans)
    
    expect(result).toBeNull()
  })
})

// ========================================
// בדיקות: הודעת אישור למחיקת ערב
// ========================================

describe('getDeleteConfirmMessage', () => {
  it('should show warning when guarantor is linked to active loans', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, guarantor2_id: 200, status: 'active', remaining: 5000 },
      { id: 2, guarantor1_id: 100, status: 'active', remaining: 3000 }
    ]
    
    const message = getDeleteConfirmMessage(100, loans)
    
    expect(message).toContain('2 הלוואות')
    expect(message).toContain('שים לב')
  })
  
  it('should show simple message when guarantor has no linked loans', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 200, status: 'active', remaining: 5000 }
    ]
    
    const message = getDeleteConfirmMessage(100, loans)
    
    expect(message).toBe('האם למחוק את הערב?')
  })
  
  it('should not count paid/closed loans', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, status: 'paid', remaining: 0 },
      { id: 2, guarantor1_id: 100, status: 'active', remaining: 5000 }
    ]
    
    const message = getDeleteConfirmMessage(100, loans)
    
    expect(message).toContain('1 הלוואות')
  })
})

// ========================================
// בדיקות: מחיקת הלוואת ערב
// ========================================

describe('calculateDeleteGuarantorLoanResult', () => {
  it('should transfer to other guarantor when exists', () => {
    const glToDelete: GuarantorLoan = {
      id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 1000, status: 'active'
    }
    const allGuarantorLoans: GuarantorLoan[] = [
      glToDelete,
      { id: 2, guarantor_id: 200, original_loan_id: 10, amount: 5000, total_repaid: 0, status: 'active' }
    ]
    
    const result = calculateDeleteGuarantorLoanResult(glToDelete, allGuarantorLoans, 'transferred')
    
    expect(result.action).toBe('transfer_to_other')
    expect(result.transferAmount).toBe(4000) // 5000 - 1000
    expect(result.otherGuarantorId).toBe(200)
  })
  
  it('should return to overdue when no other guarantor and loan was transferred', () => {
    const glToDelete: GuarantorLoan = {
      id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 0, status: 'active'
    }
    const allGuarantorLoans: GuarantorLoan[] = [glToDelete]
    
    const result = calculateDeleteGuarantorLoanResult(glToDelete, allGuarantorLoans, 'transferred')
    
    expect(result.action).toBe('return_to_overdue')
    expect(result.originalLoanId).toBe(10)
  })
  
  it('should simple delete when no other guarantor and loan not transferred', () => {
    const glToDelete: GuarantorLoan = {
      id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 0, status: 'active'
    }
    const allGuarantorLoans: GuarantorLoan[] = [glToDelete]
    
    const result = calculateDeleteGuarantorLoanResult(glToDelete, allGuarantorLoans, 'active')
    
    expect(result.action).toBe('simple_delete')
  })
  
  it('should not transfer to paid guarantor loan', () => {
    const glToDelete: GuarantorLoan = {
      id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 0, status: 'active'
    }
    const allGuarantorLoans: GuarantorLoan[] = [
      glToDelete,
      { id: 2, guarantor_id: 200, original_loan_id: 10, amount: 5000, total_repaid: 5000, status: 'paid' }
    ]
    
    const result = calculateDeleteGuarantorLoanResult(glToDelete, allGuarantorLoans, 'transferred')
    
    expect(result.action).toBe('return_to_overdue')
  })
})

// ========================================
// בדיקות: עדכון הלוואות אחרי מחיקת ערב
// ========================================

describe('getLoansUpdatesAfterGuarantorDelete', () => {
  it('should move guarantor2 to guarantor1 when guarantor1 is deleted', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, guarantor2_id: 200, status: 'active', remaining: 5000 }
    ]
    
    const updates = getLoansUpdatesAfterGuarantorDelete(100, loans)
    
    expect(updates).toHaveLength(1)
    expect(updates[0].loanId).toBe(1)
    expect(updates[0].updates.guarantor1_id).toBe(200)
    expect(updates[0].updates.guarantor2_id).toBeUndefined()
  })
  
  it('should just remove guarantor2 when guarantor2 is deleted', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, guarantor2_id: 200, status: 'active', remaining: 5000 }
    ]
    
    const updates = getLoansUpdatesAfterGuarantorDelete(200, loans)
    
    expect(updates).toHaveLength(1)
    expect(updates[0].loanId).toBe(1)
    expect(updates[0].updates.guarantor2_id).toBeUndefined()
    expect(updates[0].updates.guarantor1_id).toBeUndefined() // לא משנים את guarantor1
  })
  
  it('should handle multiple loans', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, guarantor2_id: 200, status: 'active', remaining: 5000 },
      { id: 2, guarantor1_id: 300, guarantor2_id: 100, status: 'active', remaining: 3000 },
      { id: 3, guarantor1_id: 100, status: 'active', remaining: 2000 }
    ]
    
    const updates = getLoansUpdatesAfterGuarantorDelete(100, loans)
    
    expect(updates).toHaveLength(3)
  })
  
  it('should not update non-active loans', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 100, status: 'paid', remaining: 0 },
      { id: 2, guarantor1_id: 100, status: 'active', remaining: 5000 }
    ]
    
    const updates = getLoansUpdatesAfterGuarantorDelete(100, loans)
    
    expect(updates).toHaveLength(1)
    expect(updates[0].loanId).toBe(2)
  })
  
  it('should return empty array when guarantor not linked to any loan', () => {
    const loans: Loan[] = [
      { id: 1, guarantor1_id: 200, status: 'active', remaining: 5000 }
    ]
    
    const updates = getLoansUpdatesAfterGuarantorDelete(100, loans)
    
    expect(updates).toHaveLength(0)
  })
})

// ========================================
// בדיקות: תרחישים מורכבים
// ========================================

describe('Complex Deletion Scenarios', () => {
  it('should handle full guarantor deletion flow', () => {
    // תרחיש: ערב 100 מקושר להלוואה רגילה ויש לו גם הלוואת ערב ששולמה
    const guarantorLoans: GuarantorLoan[] = [
      { id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 5000, status: 'paid' }
    ]
    const loans: Loan[] = [
      { id: 20, guarantor1_id: 100, guarantor2_id: 200, status: 'active', remaining: 10000 }
    ]
    
    // שלב 1: בדיקה אם ניתן למחוק
    const canDelete = canDeleteGuarantor(100, guarantorLoans)
    expect(canDelete).toBeNull() // ניתן למחוק כי ההלוואה שולמה
    
    // שלב 2: הודעת אישור
    const message = getDeleteConfirmMessage(100, loans)
    expect(message).toContain('1 הלוואות')
    
    // שלב 3: עדכון הלוואות
    const updates = getLoansUpdatesAfterGuarantorDelete(100, loans)
    expect(updates).toHaveLength(1)
    expect(updates[0].updates.guarantor1_id).toBe(200)
  })
  
  it('should block deletion when guarantor has active guarantor loan', () => {
    const guarantorLoans: GuarantorLoan[] = [
      { id: 1, guarantor_id: 100, original_loan_id: 10, amount: 5000, total_repaid: 1000, status: 'active' }
    ]
    
    const canDelete = canDeleteGuarantor(100, guarantorLoans)
    
    expect(canDelete).not.toBeNull()
    expect(canDelete).toContain('לא ניתן למחוק')
  })
  
  it('should handle guarantor loan deletion with transfer', () => {
    // תרחיש: מחיקת הלוואת ערב כשיש ערב נוסף
    const glToDelete: GuarantorLoan = {
      id: 1, guarantor_id: 100, original_loan_id: 10, amount: 6000, total_repaid: 2000, status: 'active'
    }
    const otherGL: GuarantorLoan = {
      id: 2, guarantor_id: 200, original_loan_id: 10, amount: 4000, total_repaid: 0, status: 'active'
    }
    
    const result = calculateDeleteGuarantorLoanResult(glToDelete, [glToDelete, otherGL], 'transferred')
    
    expect(result.action).toBe('transfer_to_other')
    expect(result.transferAmount).toBe(4000) // 6000 - 2000 = יתרה שמועברת
    expect(result.otherGuarantorId).toBe(200)
    
    // אחרי ההעברה, ערב 200 צריך להיות עם סכום של 8000 (4000 + 4000)
    const newOtherGLAmount = otherGL.amount + result.transferAmount!
    expect(newOtherGLAmount).toBe(8000)
  })
})
