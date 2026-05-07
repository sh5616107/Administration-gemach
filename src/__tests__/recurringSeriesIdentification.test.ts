/**
 * Recurring Series Identification Tests
 * 
 * בדיקות לזיהוי נכון של פריטים בסדרה מחזורית
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { borrowersService, loansService, depositorsService } from '../services/database'
import { recurringItemsService } from '../services/recurringItemsService'

describe('Recurring Series Identification', () => {
  beforeEach(async () => {
    localStorage.clear()
  })

  describe('הלוואות מחזוריות - זיהוי סדרה', () => {
    it('צריך למצוא את כל ההלוואות בסדרה גם אם הסכום שונה', async () => {
      // יצירת לווה
      const borrower = await borrowersService.create({
        first_name: 'ישראל',
        last_name: 'ישראלי',
        phone: '0501234567',
        id_number: '123456789'
      })

      // יצירת 6 הלוואות מחזוריות עם סכומים שונים
      const loan1 = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 1,
        recurring_loan_count: 6,
        recurring_months: 5,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-02-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 2,
        recurring_loan_count: 6,
        recurring_months: 4,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1200, // סכום שונה!
        loan_date: '2026-03-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 3,
        recurring_loan_count: 6,
        recurring_months: 3,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1200, // סכום שונה!
        loan_date: '2026-04-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 4,
        recurring_loan_count: 6,
        recurring_months: 2,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1500, // סכום שונה שוב!
        loan_date: '2026-05-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 5,
        recurring_loan_count: 6,
        recurring_months: 1,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1500, // סכום שונה שוב!
        loan_date: '2026-06-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 6,
        recurring_loan_count: 6,
        recurring_months: 0,
        auto_repayment: 0
      })

      // קריאה לפונקציה שמזהה את כל ההלוואות בסדרה
      const seriesItems = await recurringItemsService.getSeriesItems(
        loan1.lastInsertRowid,
        'loan'
      )

      // בדיקה: צריך למצוא את כל 6 ההלוואות
      expect(seriesItems).toHaveLength(6)
      
      // בדיקה: המספרים צריכים להיות 1-6
      expect(seriesItems.map(item => item.item_number)).toEqual([1, 2, 3, 4, 5, 6])
      
      // בדיקה: הסכומים שונים
      expect(seriesItems[0].amount).toBe(1000)
      expect(seriesItems[1].amount).toBe(1000)
      expect(seriesItems[2].amount).toBe(1200)
      expect(seriesItems[3].amount).toBe(1200)
      expect(seriesItems[4].amount).toBe(1500)
      expect(seriesItems[5].amount).toBe(1500)
    })

    it('לא צריך לכלול הלוואות של לווה אחר', async () => {
      // יצירת שני לווים
      const borrower1 = await borrowersService.create({
        first_name: 'ישראל',
        last_name: 'ישראלי',
        phone: '0501234567',
        id_number: '123456789'
      })

      const borrower2 = await borrowersService.create({
        first_name: 'משה',
        last_name: 'כהן',
        phone: '0507654321',
        id_number: '987654321'
      })

      // יצירת הלוואות ללווה 1
      const loan1 = await loansService.create({
        borrower_id: borrower1.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 1,
        recurring_loan_count: 3,
        recurring_months: 2,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower1.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-02-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 2,
        recurring_loan_count: 3,
        recurring_months: 1,
        auto_repayment: 0
      })

      // יצירת הלוואה ללווה 2 באותו יום
      await loansService.create({
        borrower_id: borrower2.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 1,
        recurring_loan_count: 2,
        recurring_months: 1,
        auto_repayment: 0
      })

      // קריאה לפונקציה
      const seriesItems = await recurringItemsService.getSeriesItems(
        loan1.lastInsertRowid,
        'loan'
      )

      // בדיקה: צריך למצוא רק 2 הלוואות (של לווה 1)
      expect(seriesItems).toHaveLength(2)
      expect(seriesItems.map(item => item.item_number)).toEqual([1, 2])
    })

    it('לא צריך לכלול הלוואות עם יום שונה', async () => {
      // יצירת לווה
      const borrower = await borrowersService.create({
        first_name: 'ישראל',
        last_name: 'ישראלי',
        phone: '0501234567',
        id_number: '123456789'
      })

      // יצירת הלוואות ביום 5
      const loan1 = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 1,
        recurring_loan_count: 2,
        recurring_months: 1,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-02-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 2,
        recurring_loan_count: 2,
        recurring_months: 0,
        auto_repayment: 0
      })

      // יצירת הלוואה ביום 10 (סדרה אחרת)
      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-10',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 10,
        recurring_loan_number: 1,
        recurring_loan_count: 2,
        recurring_months: 1,
        auto_repayment: 0
      })

      // קריאה לפונקציה
      const seriesItems = await recurringItemsService.getSeriesItems(
        loan1.lastInsertRowid,
        'loan'
      )

      // בדיקה: צריך למצוא רק 2 הלוואות (יום 5)
      expect(seriesItems).toHaveLength(2)
      expect(seriesItems.map(item => item.item_number)).toEqual([1, 2])
    })

    it('לא צריך לכלול הלוואות שנמחקו (soft-delete)', async () => {
      // יצירת לווה
      const borrower = await borrowersService.create({
        first_name: 'ישראל',
        last_name: 'ישראלי',
        phone: '0501234567',
        id_number: '123456789'
      })

      // יצירת 3 הלוואות
      const loan1 = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 1,
        recurring_loan_count: 3,
        recurring_months: 2,
        auto_repayment: 0
      })

      const loan2 = await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-02-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 2,
        recurring_loan_count: 3,
        recurring_months: 1,
        auto_repayment: 0
      })

      await loansService.create({
        borrower_id: borrower.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-03-05',
        loan_type: 'flexible',
        is_recurring: 1,
        recurring_day: 5,
        recurring_loan_number: 3,
        recurring_loan_count: 3,
        recurring_months: 0,
        auto_repayment: 0
      })

      // מחיקת הלוואה 2 (soft-delete)
      await loansService.delete(loan2.lastInsertRowid)

      // קריאה לפונקציה
      const seriesItems = await recurringItemsService.getSeriesItems(
        loan1.lastInsertRowid,
        'loan'
      )

      // בדיקה: צריך למצוא רק 2 הלוואות (1 ו-3, בלי 2)
      expect(seriesItems).toHaveLength(2)
      expect(seriesItems.map(item => item.item_number)).toEqual([1, 3])
    })
  })

  describe('הפקדות מחזוריות - זיהוי סדרה', () => {
    it('צריך למצוא את כל ההפקדות בסדרה גם אם הסכום שונה', async () => {
      // יצירת מפקיד
      const depositor = await depositorsService.create({
        first_name: 'דוד',
        last_name: 'לוי',
        phone: '0501111111',
        id_number: '111111111'
      })

      // יצירת 4 הפקדות מחזוריות עם סכומים שונים
      const deposit1Result = await depositorsService.addDeposit(depositor.lastInsertRowid, {
        amount: 500,
        deposit_date: '2026-01-10',
        period_type: 'indefinite',
        is_recurring: 1,
        recurring_day: 10,
        recurring_deposit_number: 1,
        recurring_deposit_count: 4,
        recurring_months: 3
      })

      await depositorsService.addDeposit(depositor.lastInsertRowid, {
        amount: 500,
        deposit_date: '2026-02-10',
        period_type: 'indefinite',
        is_recurring: 1,
        recurring_day: 10,
        recurring_deposit_number: 2,
        recurring_deposit_count: 4,
        recurring_months: 2
      })

      await depositorsService.addDeposit(depositor.lastInsertRowid, {
        amount: 600, // סכום שונה!
        deposit_date: '2026-03-10',
        period_type: 'indefinite',
        is_recurring: 1,
        recurring_day: 10,
        recurring_deposit_number: 3,
        recurring_deposit_count: 4,
        recurring_months: 1
      })

      await depositorsService.addDeposit(depositor.lastInsertRowid, {
        amount: 700, // סכום שונה שוב!
        deposit_date: '2026-04-10',
        period_type: 'indefinite',
        is_recurring: 1,
        recurring_day: 10,
        recurring_deposit_number: 4,
        recurring_deposit_count: 4,
        recurring_months: 0
      })

      // קריאה לפונקציה
      const seriesItems = await recurringItemsService.getSeriesItems(
        deposit1Result.depositId,
        'deposit'
      )

      // בדיקה: צריך למצוא את כל 4 ההפקדות
      expect(seriesItems).toHaveLength(4)
      
      // בדיקה: המספרים צריכים להיות 1-4
      expect(seriesItems.map(item => item.item_number)).toEqual([1, 2, 3, 4])
      
      // בדיקה: הסכומים שונים
      expect(seriesItems[0].amount).toBe(500)
      expect(seriesItems[1].amount).toBe(500)
      expect(seriesItems[2].amount).toBe(600)
      expect(seriesItems[3].amount).toBe(700)
    })
  })
})
