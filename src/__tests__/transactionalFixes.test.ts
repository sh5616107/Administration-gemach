/**
 * טסטים לארבעת התיקונים ב-transactional.ts:
 *
 * 1. Audit log לא "משקר" יותר: כשל ב-addRepaymentAtomic אחרי שנכתבה רשומת
 *    audit 'repayment_create' מייצר גם רשומת compensation שמצביעה עליה
 *    במפורש - כדי שקריאה של ה-audit log תשקף את המצב הסופי הנכון.
 * 2. updateRepaymentAtomic עושה rollback אמיתי: אם כשל קורה אחרי שהפירעון
 *    כבר עודכן בפועל, השינוי מוחזר במפורש למצב המקורי.
 * 3+4. guarantor repayment מותאם דרך source_repayment_id, לא ניחוש לפי
 *    payment_date - כולל תרחיש שבו שני פירעונות של אותו לווה חולקים תאריך
 *    זהה (המקרה שבו ניחוש לפי תאריך היה בוחר את הרשומה הלא-נכונה).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resetDatabase,
  borrowersService,
  guarantorsService,
  loansService,
  guarantorLoansService,
  guarantorLoanRepaymentsService,
} from '../services/database'
import { addRepaymentAtomic, updateRepaymentAtomic, deleteRepaymentAtomic } from '../services/transactional'

describe('תיקוני transactional.ts', () => {
  let borrowerId: string
  let guarantorId: string
  let loanId: string
  let guarantorLoanId: string

  beforeEach(async () => {
    resetDatabase()

    const borrower = await borrowersService.create({
      first_name: 'לווה',
      last_name: 'לדוגמה',
      phone: '0500000001',
    } as any)
    borrowerId = borrower.lastInsertRowid

    const guarantor = await guarantorsService.create({
      first_name: 'ערב',
      last_name: 'לדוגמה',
      phone: '0500000002',
    } as any)
    guarantorId = guarantor.lastInsertRowid

    const loan = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'regular',
      is_recurring: 0,
      auto_repayment: 0,
      guarantor1_id: guarantorId,
    } as any)
    loanId = loan.lastInsertRowid

    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: guarantorId,
      original_loan_id: loanId,
      amount: 10000,
      status: 'active',
    } as any)
    guarantorLoanId = guarantorLoan.id
  })

  it('#1: כשל ב-addRepaymentAtomic אחרי כתיבת audit יוצר רשומת compensation, לא משאיר create יתום', async () => {
    // מכריחים כשל אחרי שהפירעון כבר נוצר ונכתב ל-audit: עדכון הלוואת הערב נכשל
    const updateSpy = vi.spyOn(guarantorLoansService, 'update').mockRejectedValueOnce(new Error('DB failure'))

    const result = await addRepaymentAtomic(loanId, {
      amount: 1000,
      payment_date: '2026-02-01',
      payment_method: 'cash',
      payment_details: '',
    })

    expect(result.success).toBe(false)
    expect(result.data).toBeUndefined()

    // הפירעון עצמו אכן בוטל (compensation)
    const repayments = await (await import('../services/database')).repaymentsService.getByLoan(loanId)
    expect(repayments.length).toBe(0)

    // ה-audit log מכיל את שני האירועים: create ואז compensation שמצביע עליו.
    // אין לנו את ה-repaymentId מראש (הפעולה נכשלה לפני שהוא הוחזר) - מחפשים בכל ה-audit log
    const { getAllAuditLogs } = await import('../services/auditLog')
    const logs = await getAllAuditLogs()
    const createEntries = logs.filter(l => l.action === 'repayment_create')
    const compensationEntries = logs.filter(l => l.action === 'repayment_delete' && l.metadata?.compensation === true)

    expect(createEntries.length).toBe(1)
    expect(compensationEntries.length).toBe(1)
    // ה-compensation מצביע במפורש חזרה על רשומת ה-create המקורית
    expect(compensationEntries[0].metadata.reverts_audit_id).toBe(createEntries[0].id)
    expect(compensationEntries[0].entity_id).toBe(createEntries[0].entity_id)

    updateSpy.mockRestore()
  })

  it('#2: updateRepaymentAtomic מחזיר (rollback) את הפירעון למצב המקורי כשכשל קורה אחרי העדכון', async () => {
    const created = await addRepaymentAtomic(loanId, {
      amount: 1000,
      payment_date: '2026-02-01',
      payment_method: 'cash',
      payment_details: '',
    })
    expect(created.success).toBe(true)
    const repaymentId = created.data!.repaymentId

    // מכריחים כשל בשלב עדכון פירעונות הערב, אחרי ש-repaymentsService.update כבר רץ
    const updateSpy = vi.spyOn(guarantorLoanRepaymentsService, 'update').mockRejectedValueOnce(new Error('guarantor update failed'))

    const result = await updateRepaymentAtomic(repaymentId, { amount: 2000 })
    expect(result.success).toBe(false)

    // הפירעון חייב לחזור לסכום המקורי (1000), לא להישאר על 2000 (הבאג המקורי)
    const { repaymentsService } = await import('../services/database')
    const afterRollback = await repaymentsService.getById(repaymentId)
    expect(afterRollback!.amount).toBe(1000)

    updateSpy.mockRestore()
  })

  it('#3/#4: שני פירעונות של הלווה באותו תאריך - update/delete פוגעים ברשומת הערב הנכונה, לא בשכנתה', async () => {
    const { repaymentsService } = await import('../services/database')

    // שני פירעונות של הלווה, באותו תאריך בכוונה - זה בדיוק המצב שבו
    // matching לפי payment_date בלבד היה עלול לבחור את הרשומה הלא-נכונה
    const first = await addRepaymentAtomic(loanId, {
      amount: 1000,
      payment_date: '2026-03-01',
      payment_method: 'cash',
      payment_details: '',
    })
    const second = await addRepaymentAtomic(loanId, {
      amount: 500,
      payment_date: '2026-03-01',
      payment_method: 'cash',
      payment_details: '',
    })
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)

    const firstRepaymentId = first.data!.repaymentId
    const secondRepaymentId = second.data!.repaymentId

    const glRepaymentsBefore = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoanId)
    expect(glRepaymentsBefore.length).toBe(2)
    const glForFirst = glRepaymentsBefore.find(r => r.source_repayment_id === firstRepaymentId)
    const glForSecond = glRepaymentsBefore.find(r => r.source_repayment_id === secondRepaymentId)
    expect(glForFirst).toBeDefined()
    expect(glForSecond).toBeDefined()
    expect(glForFirst!.amount).toBe(1000) // proportion 100%, guarantor covers full loan
    expect(glForSecond!.amount).toBe(500)

    // עדכון הפירעון הראשון בלבד
    await updateRepaymentAtomic(firstRepaymentId, { amount: 1200 })

    const glRepaymentsAfterUpdate = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoanId)
    const glForFirstAfter = glRepaymentsAfterUpdate.find(r => r.id === glForFirst!.id)
    const glForSecondAfter = glRepaymentsAfterUpdate.find(r => r.id === glForSecond!.id)

    // רק רשומת הערב ששייכת לפירעון הראשון השתנתה
    expect(glForFirstAfter!.amount).toBe(1200)
    expect(glForSecondAfter!.amount).toBe(500) // לא נגעו בה

    // מחיקת הפירעון השני בלבד
    await deleteRepaymentAtomic(secondRepaymentId)

    const glRepaymentsAfterDelete = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoanId)
    // רשומת הערב של הפירעון הראשון עדיין קיימת עם 1200
    expect(glRepaymentsAfterDelete.find(r => r.id === glForFirst!.id)?.amount).toBe(1200)
    // רשומת הערב של הפירעון השני נמחקה
    expect(glRepaymentsAfterDelete.find(r => r.id === glForSecond!.id)).toBeUndefined()

    const remainingRepayments = await repaymentsService.getByLoan(loanId)
    expect(remainingRepayments.map(r => r.id)).toEqual([firstRepaymentId])
  })
})
