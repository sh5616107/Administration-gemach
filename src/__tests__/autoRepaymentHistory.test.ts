/**
 * Auto Repayment History Tests
 * 
 * בדיקות לטעינת היסטוריית פירעונות אוטומטיים
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  borrowersService, 
  loansService, 
  repaymentsService
} from '../services/database'
import { recurringItemsService } from '../services/recurringItemsService'

describe('Auto Repayment History Loading', () => {
  beforeEach(async () => {
    // Clear any existing data
    // Note: In real tests, we would use a test database or mocks
  })

  it('should load repayments history for loan with auto_repayment', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567',
      id_number: '123456789'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1000,
      repayment_day: 5,
      repayment_frequency: 'monthly',
      repayment_start_date: '2026-01-05'
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת 3 פירעונות מחזוריים
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2026-01-05',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10
    })

    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2026-02-05',
      is_recurring: 1,
      recurring_repayment_number: 2,
      recurring_repayment_count: 10
    })

    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2026-03-05',
      is_recurring: 1,
      recurring_repayment_number: 3,
      recurring_repayment_count: 10
    })

    // 4. טעינת היסטוריה דרך recurringItemsService
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 5. בדיקות
    expect(seriesItems).toHaveLength(3)
    expect(seriesItems[0].item_number).toBe(1)
    expect(seriesItems[0].amount).toBe(1000)
    expect(seriesItems[0].date).toBe('2026-01-05')
    expect(seriesItems[0].status).toBe('paid')

    expect(seriesItems[1].item_number).toBe(2)
    expect(seriesItems[1].amount).toBe(1000)
    expect(seriesItems[1].date).toBe('2026-02-05')

    expect(seriesItems[2].item_number).toBe(3)
    expect(seriesItems[2].amount).toBe(1000)
    expect(seriesItems[2].date).toBe('2026-03-05')
  })

  it('should return empty array for loan without repayments', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לevi',
      phone: '0507654321',
      id_number: '987654321'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה עם פירעון אוטומטי אבל בלי פירעונות
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 5000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 500,
      repayment_day: 10,
      repayment_frequency: 'monthly'
    })
    const loanId = loanResult.lastInsertRowid

    // 3. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 4. בדיקה - צריך להיות מערך ריק
    expect(seriesItems).toHaveLength(0)
  })

  it('should filter only recurring repayments', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'שרה',
      last_name: 'לוי',
      phone: '0509876543',
      id_number: '111222333'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה עם פירעון אוטומטי
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 8000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 800,
      repayment_day: 15
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת פירעון מחזורי
    await repaymentsService.create({
      loan_id: loanId,
      amount: 800,
      payment_date: '2026-01-15',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10
    })

    // 4. יצירת פירעון רגיל (לא מחזורי)
    await repaymentsService.create({
      loan_id: loanId,
      amount: 500,
      payment_date: '2026-01-20',
      is_recurring: 0
    })

    // 5. יצירת עוד פירעון מחזורי
    await repaymentsService.create({
      loan_id: loanId,
      amount: 800,
      payment_date: '2026-02-15',
      is_recurring: 1,
      recurring_repayment_number: 2,
      recurring_repayment_count: 10
    })

    // 6. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 7. בדיקה - צריך להיות 3 פירעונות (כולל הפירעון הידני)
    // לפי התיקון ב-TASK 3: מציגים את כל הפירעונות של הלוואה עם auto_repayment
    // הפירעונות ממוינים לפי תאריך:
    // 1. פירעון מחזורי #1 (2026-01-15) - item_number=1
    // 2. פירעון ידני (2026-01-20) - item_number=2 (index+1)
    // 3. פירעון מחזורי #2 (2026-02-15) - item_number=2
    expect(seriesItems).toHaveLength(3)
    expect(seriesItems[0].item_number).toBe(1)
    expect(seriesItems[1].item_number).toBe(2) // הפירעון הידני מקבל אינדקס
    expect(seriesItems[2].item_number).toBe(2)
  })

  it('should sort repayments by number', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יוסף',
      last_name: 'כהן',
      phone: '0501112233',
      id_number: '444555666'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 6000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 600,
      repayment_day: 20
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת פירעונות בסדר לא נכון
    await repaymentsService.create({
      loan_id: loanId,
      amount: 600,
      payment_date: '2026-03-20',
      is_recurring: 1,
      recurring_repayment_number: 3,
      recurring_repayment_count: 10
    })

    await repaymentsService.create({
      loan_id: loanId,
      amount: 600,
      payment_date: '2026-01-20',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10
    })

    await repaymentsService.create({
      loan_id: loanId,
      amount: 600,
      payment_date: '2026-02-20',
      is_recurring: 1,
      recurring_repayment_number: 2,
      recurring_repayment_count: 10
    })

    // 4. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 5. בדיקה - צריך להיות ממוין לפי מספר
    expect(seriesItems).toHaveLength(3)
    expect(seriesItems[0].item_number).toBe(1)
    expect(seriesItems[0].date).toBe('2026-01-20')
    expect(seriesItems[1].item_number).toBe(2)
    expect(seriesItems[1].date).toBe('2026-02-20')
    expect(seriesItems[2].item_number).toBe(3)
    expect(seriesItems[2].date).toBe('2026-03-20')
  })

  it('should mark past and future repayments correctly', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'רחל',
      last_name: 'אברהם',
      phone: '0503334455',
      id_number: '777888999'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 4000,
      loan_date: '2025-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 400,
      repayment_day: 1
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת פירעון בעבר
    await repaymentsService.create({
      loan_id: loanId,
      amount: 400,
      payment_date: '2025-01-01',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10
    })

    // 4. יצירת פירעון בעתיד
    await repaymentsService.create({
      loan_id: loanId,
      amount: 400,
      payment_date: '2027-01-01',
      is_recurring: 1,
      recurring_repayment_number: 2,
      recurring_repayment_count: 10
    })

    // 5. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 6. בדיקה
    expect(seriesItems).toHaveLength(2)
    expect(seriesItems[0].isPast).toBe(true)  // 2025 - עבר
    expect(seriesItems[1].isPast).toBe(false) // 2027 - עתיד
  })

  it('should load loan settings correctly', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'אברהם',
      last_name: 'יצחק',
      phone: '0506667788',
      id_number: '123123123'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה עם הגדרות ספציפיות
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 12000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 1,
      repayment_amount: 1200,
      repayment_day: 25,
      repayment_frequency: 'monthly'
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת פירעון
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1200,
      payment_date: '2026-01-25',
      is_recurring: 1,
      recurring_repayment_number: 1,
      recurring_repayment_count: 10
    })

    // 4. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 5. בדיקה שההגדרות נטענו נכון
    expect(seriesItems).toHaveLength(1)
    expect(seriesItems[0].recurring_day).toBe(25)
    expect(seriesItems[0].amount).toBe(1200)
  })

  it('should handle loan without auto_repayment', async () => {
    // 1. יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'יעקב',
      last_name: 'משה',
      phone: '0509998877',
      id_number: '456456456'
    })
    const borrowerId = borrowerResult.lastInsertRowid

    // 2. יצירת הלוואה רגילה (בלי auto_repayment)
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 3000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    })
    const loanId = loanResult.lastInsertRowid

    // 3. יצירת פירעון רגיל
    await repaymentsService.create({
      loan_id: loanId,
      amount: 1000,
      payment_date: '2026-01-15',
      is_recurring: 0
    })

    // 4. טעינת היסטוריה
    const seriesItems = await recurringItemsService.getSeriesItems(loanId, 'auto_repayment')

    // 5. בדיקה - צריך להיות פירעון אחד (הפירעון הרגיל)
    // לפי התיקון ב-TASK 3: מציגים את כל הפירעונות של הלוואה, גם אם אין auto_repayment
    expect(seriesItems).toHaveLength(1)
  })
})
