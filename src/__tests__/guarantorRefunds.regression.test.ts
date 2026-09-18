/**
 * Regression Tests - Guarantor Refunds Delete
 * 
 * BLOCKER 1: ודא שמחיקת refund מעדכנת נכון את total_refunded
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  guarantorRefundsService, 
  guarantorLoansService,
  exportAllData,
  importAllData
} from '../services/database'

describe('BLOCKER 1 - Guarantor Refunds Delete', () => {
  beforeEach(async () => {
    // נקה את הזיכרון
    await importAllData({
      borrowers: {},
      guarantors: {},
      loans: {},
      repayments: {},
      donations: {},
      donors: {},
      deposits: {},
      depositors: {},
      depositWithdrawals: {},
      blacklist: {},
      expenses: {},
      guarantorLoans: {},
      guarantorLoanRepayments: {},
      guarantorRefunds: {},
      waitlist: {},
      contacts: {},
      attachments: {}
    })
  })

  // תרחיש A: Parent עם refund אחד
  it('should set total_refunded to 0 after deleting single refund', async () => {
    // יצירת guarantor loan
    const { id: loanId } = await guarantorLoansService.create({
      guarantor_id: 'g1',
      original_loan_id: 'loan1',
      amount: 5000,
      notes: ''
    })

    // עדכון total_repaid ידנית (סימולציה של פירעון)
    await guarantorLoansService.update(loanId, { total_repaid: 5000 })

    // יצירת refund אחד של 100
    const { id: refundId } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 100,
      refund_date: '2026-01-01',
      payment_method: 'cash',
      notes: 'החזר יחיד'
    })

    // ולידציה - total_refunded צריך להיות 100
    let loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(100)

    // מחיקת הrefund
    await guarantorRefundsService.delete(refundId)

    // ✅ תיקון BLOCKER: total_refunded צריך להיות 0
    loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)
  })

  // תרחיש B: Parent עם מספר refunds
  it('should recalculate total_refunded correctly after deleting one of many', async () => {
    const { id: loanId } = await guarantorLoansService.create({
      guarantor_id: 'g1',
      original_loan_id: 'loan1',
      amount: 5000,
      notes: ''
    })

    await guarantorLoansService.update(loanId, { total_repaid: 5000 })

    // יצירת 3 refunds: 100 + 50 + 25
    const { id: refund1 } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 100,
      refund_date: '2026-01-01',
      payment_method: 'cash',
      notes: 'ראשון'
    })

    const { id: refund2 } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 50,
      refund_date: '2026-01-02',
      payment_method: 'cash',
      notes: 'שני'
    })

    const { id: refund3 } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 25,
      refund_date: '2026-01-03',
      payment_method: 'cash',
      notes: 'שלישי'
    })

    // ולידציה - total_refunded = 175
    let loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(175)

    // מחיקת refund2 (50)
    await guarantorRefundsService.delete(refund2)

    // ✅ total_refunded צריך להיות 125 (100 + 25)
    loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(125)

    // מחיקת refund1 (100)
    await guarantorRefundsService.delete(refund1)

    // ✅ total_refunded צריך להיות 25
    loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(25)

    // מחיקת refund3 (25)
    await guarantorRefundsService.delete(refund3)

    // ✅ total_refunded צריך להיות 0
    loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)
  })

  // תרחיש C: מחיקה כפולה
  it('should not change total_refunded on double delete', async () => {
    const { id: loanId } = await guarantorLoansService.create({
      guarantor_id: 'g1',
      original_loan_id: 'loan1',
      amount: 5000,
      notes: ''
    })

    await guarantorLoansService.update(loanId, { total_repaid: 5000 })

    const { id: refundId } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 100,
      refund_date: '2026-01-01',
      payment_method: 'cash',
      notes: 'בדיקת כפילות'
    })

    // מחיקה ראשונה
    await guarantorRefundsService.delete(refundId)
    let loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)

    // מחיקה שנייה - לא אמורה לשנות כלום
    await guarantorRefundsService.delete(refundId)
    loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)  // עדיין 0, לא שלילי!
  })

  // תרחיש D: Parent ללא refunds
  it('should handle parent with no refunds', async () => {
    const { id: loanId } = await guarantorLoansService.create({
      guarantor_id: 'g1',
      original_loan_id: 'loan1',
      amount: 5000,
      notes: ''
    })

    const loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)
  })

  // תרחיש E: מחיקת refund שלא קיים
  it('should not fail on deleting non-existent refund', async () => {
    // לא אמור לזרוק exception
    await expect(
      guarantorRefundsService.delete('non-existent-id')
    ).resolves.not.toThrow()
  })

  // תרחיש F: persistance - ודא ששינויים נשמרים
  it('should persist changes after delete', async () => {
    const { id: loanId } = await guarantorLoansService.create({
      guarantor_id: 'g1',
      original_loan_id: 'loan1',
      amount: 5000,
      notes: ''
    })

    await guarantorLoansService.update(loanId, { total_repaid: 5000 })

    const { id: refundId } = await guarantorRefundsService.create({
      guarantor_loan_id: loanId,
      amount: 100,
      refund_date: '2026-01-01',
      payment_method: 'cash',
      notes: 'בדיקת שמירה'
    })

    await guarantorRefundsService.delete(refundId)

    // ייצוא וייבוא חוזר - סימולציה של restart
    const exported = await exportAllData()
    await importAllData(exported)

    // ✅ total_refunded צריך להישמר כ-0
    const loan = await guarantorLoansService.getById(loanId)
    expect(loan?.total_refunded).toBe(0)

    // הrefund לא צריך להיות בזיכרון
    const refund = await guarantorRefundsService.getById(refundId)
    expect(refund).toBeNull()
  })
})
