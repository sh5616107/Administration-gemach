/**
 * בדיקות יחידה לפונקציות הלוואות ערבים
 * בודק את הלוגיקה של העברת חוב לערבים והפחתה יחסית
 */

import { describe, it, expect } from 'vitest'

// ========================================
// פונקציות עזר - לוגיקה טהורה לבדיקה
// ========================================

/**
 * מחשב חלוקה שווה של סכום בין ערבים
 */
function calculateEqualSplit(totalAmount: number, guarantorCount: number): number[] {
  if (guarantorCount === 0) return []
  const perGuarantor = Math.floor(totalAmount / guarantorCount)
  const remainder = totalAmount % guarantorCount
  
  const amounts: number[] = []
  for (let i = 0; i < guarantorCount; i++) {
    // הערב הראשון מקבל את השארית
    amounts.push(i === 0 ? perGuarantor + remainder : perGuarantor)
  }
  return amounts
}

/**
 * מחשב הפחתה יחסית מחוב ערבים כשהלווה משלם
 */
function calculateProportionalReduction(
  guarantorDebts: { id: number; amount: number; paid: number }[],
  paymentAmount: number
): { id: number; reduction: number }[] {
  const totalDebt = guarantorDebts.reduce((sum, g) => sum + (g.amount - g.paid), 0)
  if (totalDebt === 0) return []
  
  const reductions: { id: number; reduction: number }[] = []
  let remainingPayment = paymentAmount
  
  for (const guarantor of guarantorDebts) {
    const remaining = guarantor.amount - guarantor.paid
    if (remaining <= 0) continue
    
    const proportion = remaining / totalDebt
    let reduction = Math.floor(paymentAmount * proportion)
    
    // וידוא שלא מפחיתים יותר מהיתרה
    reduction = Math.min(reduction, remaining, remainingPayment)
    
    reductions.push({ id: guarantor.id, reduction })
    remainingPayment -= reduction
  }
  
  // אם נשאר שארית, מוסיפים לערב הראשון
  if (remainingPayment > 0 && reductions.length > 0) {
    const firstGuarantor = guarantorDebts[0]
    const maxAdditional = firstGuarantor.amount - firstGuarantor.paid - reductions[0].reduction
    reductions[0].reduction += Math.min(remainingPayment, maxAdditional)
  }
  
  return reductions
}

/**
 * בודק אם ערב זכאי להחזר (שילם ואז הלווה פרע)
 */
function calculateRefundOwed(
  guarantorPaid: number,
  originalDebt: number,
  borrowerRepaidAfter: number
): number {
  // אם הערב שילם והלווה פרע אחר כך, הערב זכאי להחזר
  if (guarantorPaid > 0 && borrowerRepaidAfter > 0) {
    // ההחזר הוא היחס בין מה שהלווה שילם לבין החוב המקורי, כפול מה שהערב שילם
    const refundRatio = Math.min(borrowerRepaidAfter / originalDebt, 1)
    return Math.floor(guarantorPaid * refundRatio)
  }
  return 0
}

// ========================================
// בדיקות: חלוקה שווה
// ========================================

describe('calculateEqualSplit', () => {
  it('should split evenly between 2 guarantors', () => {
    const result = calculateEqualSplit(10000, 2)
    expect(result).toEqual([5000, 5000])
  })

  it('should handle odd amounts (remainder goes to first)', () => {
    const result = calculateEqualSplit(10001, 2)
    expect(result).toEqual([5001, 5000])
  })

  it('should split between 3 guarantors', () => {
    const result = calculateEqualSplit(9000, 3)
    expect(result).toEqual([3000, 3000, 3000])
  })

  it('should handle remainder with 3 guarantors', () => {
    const result = calculateEqualSplit(10000, 3)
    // 10000 / 3 = 3333.33...
    // 3333 * 3 = 9999, remainder = 1
    expect(result).toEqual([3334, 3333, 3333])
    expect(result.reduce((a, b) => a + b, 0)).toBe(10000)
  })

  it('should return empty array for 0 guarantors', () => {
    const result = calculateEqualSplit(10000, 0)
    expect(result).toEqual([])
  })

  it('should handle single guarantor', () => {
    const result = calculateEqualSplit(10000, 1)
    expect(result).toEqual([10000])
  })
})

// ========================================
// בדיקות: הפחתה יחסית
// ========================================

describe('calculateProportionalReduction', () => {
  it('should reduce proportionally for equal debts', () => {
    const debts = [
      { id: 1, amount: 5000, paid: 0 },
      { id: 2, amount: 5000, paid: 0 },
    ]
    
    const result = calculateProportionalReduction(debts, 2000)
    
    // כל ערב צריך לקבל הפחתה של 1000
    expect(result.find(r => r.id === 1)?.reduction).toBe(1000)
    expect(result.find(r => r.id === 2)?.reduction).toBe(1000)
  })

  it('should reduce proportionally for unequal debts', () => {
    const debts = [
      { id: 1, amount: 7000, paid: 0 }, // 70%
      { id: 2, amount: 3000, paid: 0 }, // 30%
    ]
    
    const result = calculateProportionalReduction(debts, 1000)
    
    // ערב 1 צריך לקבל 700, ערב 2 צריך לקבל 300
    expect(result.find(r => r.id === 1)?.reduction).toBe(700)
    expect(result.find(r => r.id === 2)?.reduction).toBe(300)
  })

  it('should consider already paid amounts', () => {
    const debts = [
      { id: 1, amount: 5000, paid: 3000 }, // נשאר 2000
      { id: 2, amount: 5000, paid: 0 },    // נשאר 5000
    ]
    
    const result = calculateProportionalReduction(debts, 700)
    
    // סה"כ חוב: 7000
    // ערב 1: 2000/7000 = 28.57% -> 200
    // ערב 2: 5000/7000 = 71.43% -> 500
    expect(result.find(r => r.id === 1)?.reduction).toBe(200)
    expect(result.find(r => r.id === 2)?.reduction).toBe(500)
  })

  it('should not reduce more than remaining debt', () => {
    const debts = [
      { id: 1, amount: 1000, paid: 900 }, // נשאר רק 100
      { id: 2, amount: 1000, paid: 0 },
    ]
    
    const result = calculateProportionalReduction(debts, 500)
    
    // ערב 1 לא יכול לקבל יותר מ-100
    expect(result.find(r => r.id === 1)?.reduction).toBeLessThanOrEqual(100)
  })

  it('should handle fully paid guarantor', () => {
    const debts = [
      { id: 1, amount: 5000, paid: 5000 }, // שילם הכל
      { id: 2, amount: 5000, paid: 0 },
    ]
    
    const result = calculateProportionalReduction(debts, 1000)
    
    // ערב 1 לא צריך לקבל כלום
    expect(result.find(r => r.id === 1)?.reduction || 0).toBe(0)
    // ערב 2 צריך לקבל הכל
    expect(result.find(r => r.id === 2)?.reduction).toBe(1000)
  })

  it('should return empty for no debts', () => {
    const result = calculateProportionalReduction([], 1000)
    expect(result).toEqual([])
  })
})

// ========================================
// בדיקות: חישוב החזר לערב
// ========================================

describe('calculateRefundOwed', () => {
  it('should calculate full refund when borrower repays all', () => {
    // ערב שילם 2000 מתוך חוב של 5000
    // הלווה פרע את כל ה-5000
    const refund = calculateRefundOwed(2000, 5000, 5000)
    
    // הערב זכאי להחזר מלא של מה ששילם
    expect(refund).toBe(2000)
  })

  it('should calculate partial refund when borrower repays partially', () => {
    // ערב שילם 2000 מתוך חוב של 5000
    // הלווה פרע רק 2500 (50%)
    const refund = calculateRefundOwed(2000, 5000, 2500)
    
    // הערב זכאי להחזר של 50% ממה ששילם = 1000
    expect(refund).toBe(1000)
  })

  it('should return 0 if guarantor did not pay', () => {
    const refund = calculateRefundOwed(0, 5000, 5000)
    expect(refund).toBe(0)
  })

  it('should return 0 if borrower did not repay after', () => {
    const refund = calculateRefundOwed(2000, 5000, 0)
    expect(refund).toBe(0)
  })

  it('should cap refund at guarantor paid amount', () => {
    // ערב שילם 1000
    // הלווה פרע יותר מהחוב (לא אמור לקרות, אבל בדיקת edge case)
    const refund = calculateRefundOwed(1000, 5000, 10000)
    
    // ההחזר לא יכול להיות יותר ממה שהערב שילם
    expect(refund).toBeLessThanOrEqual(1000)
  })
})

// ========================================
// בדיקות: תרחישים מורכבים
// ========================================

describe('Complex Scenarios', () => {
  it('should handle full loan transfer and repayment flow', () => {
    // תרחיש: הלוואה של 10,000 מועברת ל-2 ערבים
    const loanAmount = 10000
    
    // שלב 1: חלוקה שווה
    const split = calculateEqualSplit(loanAmount, 2)
    expect(split).toEqual([5000, 5000])
    
    // שלב 2: הלווה משלם 2000
    const debts = [
      { id: 1, amount: 5000, paid: 0 },
      { id: 2, amount: 5000, paid: 0 },
    ]
    const reductions = calculateProportionalReduction(debts, 2000)
    
    // כל ערב מקבל הפחתה של 1000
    expect(reductions[0].reduction).toBe(1000)
    expect(reductions[1].reduction).toBe(1000)
    
    // שלב 3: עדכון חובות
    debts[0].paid = 0 // הערב לא שילם
    debts[1].paid = 0
    // אבל החוב שלהם ירד ב-1000 כל אחד (מהפחתה)
    debts[0].amount = 4000
    debts[1].amount = 4000
    
    // שלב 4: ערב 1 משלם 2000
    debts[0].paid = 2000
    
    // שלב 5: הלווה פורע את כל השאר (6000)
    const finalReductions = calculateProportionalReduction(debts, 6000)
    
    // ערב 1: נשאר 2000, ערב 2: נשאר 4000
    // סה"כ: 6000
    // ערב 1: 2000/6000 = 33.33% -> 2000
    // ערב 2: 4000/6000 = 66.67% -> 4000
    expect(finalReductions.find(r => r.id === 1)?.reduction).toBe(2000)
    expect(finalReductions.find(r => r.id === 2)?.reduction).toBe(4000)
    
    // שלב 6: ערב 1 זכאי להחזר
    const refund = calculateRefundOwed(2000, 4000, 6000)
    expect(refund).toBe(2000) // מקבל בחזרה את מה ששילם
  })

  it('should handle unequal split scenario', () => {
    // תרחיש: הלוואה של 10,000 מחולקת 70/30
    const guarantorDebts = [
      { id: 1, amount: 7000, paid: 0 },
      { id: 2, amount: 3000, paid: 0 },
    ]
    
    // הלווה משלם 5000
    const reductions = calculateProportionalReduction(guarantorDebts, 5000)
    
    // ערב 1: 70% -> 3500
    // ערב 2: 30% -> 1500
    expect(reductions.find(r => r.id === 1)?.reduction).toBe(3500)
    expect(reductions.find(r => r.id === 2)?.reduction).toBe(1500)
    
    // סה"כ הפחתות = 5000
    const totalReduction = reductions.reduce((sum, r) => sum + r.reduction, 0)
    expect(totalReduction).toBe(5000)
  })
})
