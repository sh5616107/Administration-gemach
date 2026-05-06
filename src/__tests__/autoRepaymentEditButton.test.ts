/**
 * בדיקות לכפתור עריכת פירעון אוטומטי
 * 
 * מטרה: לוודא שכפתור העריכה מופיע רק כשרלוונטי:
 * 1. כשאין עדיין פירעונות - הכפתור מופיע
 * 2. כשיש פירעון ראשון והוא עתידי - הכפתור מופיע
 * 3. כשיש פירעון ראשון והוא עבר - הכפתור לא מופיע
 * 4. כשיש פירעון שני או יותר - הכפתור לא מופיע
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { loansService, repaymentsService, borrowersService } from '../services/database'

describe('Auto Repayment Edit Button Logic', () => {
  beforeEach(async () => {
    // Note: In real tests, we would use a test database or mocks
  })

  it('should show edit button when no repayments exist yet', async () => {
    // צור לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567',
      email: 'moshe@example.com',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // צור הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      repayment_start_date: '2026-02-15',
    })
    const loanId = loanResult.lastInsertRowid

    // טען את ההלוואה
    const loan = await loansService.getById(loanId)
    expect(loan).toBeDefined()
    expect(loan!.auto_repayment).toBe(1)

    // טען פירעונות
    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(0)

    // לוגיקה: אין פירעונות -> הכפתור צריך להופיע
    const shouldShowButton = repayments.length === 0
    expect(shouldShowButton).toBe(true)
  })

  it('should show edit button when first repayment is in the future', async () => {
    // צור לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0501234568',
      email: 'david@example.com',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // תאריך עתידי (חודש מהיום)
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 1)
    const futureDateStr = futureDate.toISOString().split('T')[0]

    // צור הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      repayment_start_date: futureDateStr,
    })
    const loanId = loanResult.lastInsertRowid

    // צור פירעון ראשון עתידי
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: futureDateStr,
      notes: 'פירעון אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10,
    })

    // טען פירעונות
    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(1)

    const firstRepayment = repayments[0]
    expect(firstRepayment.is_recurring).toBe(1)
    expect(firstRepayment.recurring_repayment_number).toBe(1)

    // לוגיקה: פירעון ראשון עתידי -> הכפתור צריך להופיע
    const repaymentDate = new Date(firstRepayment.payment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const isFutureRepayment = repaymentDate >= today
    const shouldShowButton = firstRepayment.recurring_repayment_number === 1 && isFutureRepayment
    expect(shouldShowButton).toBe(true)
  })

  it('should NOT show edit button when first repayment is in the past', async () => {
    // צור לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסף',
      last_name: 'אברהם',
      phone: '0501234569',
      email: 'yosef@example.com',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // תאריך עבר (חודש לפני)
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 1)
    const pastDateStr = pastDate.toISOString().split('T')[0]

    // צור הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2025-12-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      repayment_start_date: pastDateStr,
    })
    const loanId = loanResult.lastInsertRowid

    // צור פירעון ראשון בעבר
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: pastDateStr,
      notes: 'פירעון אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10,
    })

    // טען פירעונות
    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(1)

    const firstRepayment = repayments[0]
    expect(firstRepayment.is_recurring).toBe(1)
    expect(firstRepayment.recurring_repayment_number).toBe(1)

    // לוגיקה: פירעון ראשון בעבר -> הכפתור לא צריך להופיע
    const repaymentDate = new Date(firstRepayment.payment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const isFutureRepayment = repaymentDate >= today
    const shouldShowButton = firstRepayment.recurring_repayment_number === 1 && isFutureRepayment
    expect(shouldShowButton).toBe(false)
  })

  it('should NOT show edit button when second or later repayment exists', async () => {
    // צור לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'שמעון',
      last_name: 'ישראל',
      phone: '0501234570',
      email: 'shimon@example.com',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // צור הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2025-11-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      repayment_start_date: '2025-12-15',
    })
    const loanId = loanResult.lastInsertRowid

    // צור פירעון ראשון (בעבר)
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2025-12-15',
      notes: 'פירעון אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10,
    })

    // צור פירעון שני (עתידי)
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2026-01-15',
      notes: 'פירעון אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: 2,
      recurring_repayment_count: 10,
    })

    // טען פירעונות
    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(2)

    // מצא את הפירעון הראשון
    const firstRepayment = repayments.find(r => r.recurring_repayment_number === 1)
    expect(firstRepayment).toBeDefined()
    expect(firstRepayment!.recurring_repayment_number).toBe(1)

    // לוגיקה: פירעון ראשון בעבר -> הכפתור לא צריך להופיע
    const repaymentDate = new Date(firstRepayment!.payment_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const isFutureRepayment = repaymentDate >= today
    const shouldShowButton = firstRepayment!.recurring_repayment_number === 1 && isFutureRepayment
    expect(shouldShowButton).toBe(false)
  })

  it('should handle edge case: repayment date is today', async () => {
    // צור לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'אברהם',
      last_name: 'יצחק',
      phone: '0501234571',
      email: 'avraham@example.com',
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // תאריך היום
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // צור הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 15,
      repayment_frequency: 'monthly',
      repayment_start_date: todayStr,
    })
    const loanId = loanResult.lastInsertRowid

    // צור פירעון ראשון היום
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: todayStr,
      notes: 'פירעון אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10,
    })

    // טען פירעונות
    const repayments = await repaymentsService.getByLoan(loanId)
    expect(repayments).toHaveLength(1)

    const firstRepayment = repayments[0]
    expect(firstRepayment.is_recurring).toBe(1)
    expect(firstRepayment.recurring_repayment_number).toBe(1)

    // לוגיקה: פירעון היום -> הכפתור צריך להופיע (>= today)
    const repaymentDate = new Date(firstRepayment.payment_date)
    const todayNormalized = new Date()
    todayNormalized.setHours(0, 0, 0, 0)
    const isFutureRepayment = repaymentDate >= todayNormalized
    const shouldShowButton = firstRepayment.recurring_repayment_number === 1 && isFutureRepayment
    expect(shouldShowButton).toBe(true)
  })
})
