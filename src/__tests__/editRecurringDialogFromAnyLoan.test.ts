/**
 * טסט לוודא ש-EditRecurringDialog עובד נכון גם כשנפתח מהלוואה שאינה הראשונה במשפחה
 * 
 * מטרה: לוודא ש-identifySeriesItems/getSeriesItems מזהים את המשפחה השלמה
 * גם כשה-ID שמועבר הוא של הלוואה #7 מתוך 12, למשל
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'
import { identifySeriesItems } from '../services/recurringItemsService'

describe('EditRecurringDialog - פתיחה מכל הלוואה במשפחה', () => {
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    
    // יצירת לווה
    const borrowerResult = await borrowersService.create({
      first_name: 'דוד',
      last_name: 'כהן',
      phone: '0501234567'
    })
    borrowerId = borrowerResult.lastInsertRowid
  })

  it('זיהוי משפחה שלמה מהלוואה #7 מתוך 12', async () => {
    const seriesId = crypto.randomUUID()
    
    // יצירת 12 הלוואות במשפחה
    const loanIds: string[] = []
    for (let i = 1; i <= 12; i++) {
      const result = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: `2024-${String(i).padStart(2, '0')}-05`,
        loan_type: 'רגילה',
        is_recurring: 1,
        recurring_months: 12 - i,
        recurring_day: 5,
        recurring_loan_number: i,
        recurring_loan_count: 12,
        recurring_series_id: seriesId
      })
      loanIds.push(result.lastInsertRowid)
    }

    console.log(`[TEST] נוצרו ${loanIds.length} הלוואות במשפחה`)

    // קריאה להלוואה #7
    const loan7 = await loansService.getById(loanIds[6]) // index 6 = הלוואה 7
    expect(loan7).toBeDefined()
    expect(loan7!.recurring_loan_number).toBe(7)

    // זיהוי המשפחה דרך identifySeriesItems (כמו ש-EditRecurringDialog עושה)
    const seriesItems = await identifySeriesItems('loan', loan7!)

    console.log(`[TEST] זוהו ${seriesItems.length} הלוואות במשפחה מהלוואה #7`)

    // ✅ אמור לזהות את כל 12 ההלוואות, לא רק את #7
    expect(seriesItems.length).toBe(12)

    // בדיקה שכל המספורים קיימים
    const numbers = seriesItems.map(l => l.recurring_loan_number).sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])

    // בדיקה שכולן שייכות לאותו series_id
    expect(seriesItems.every(l => l.recurring_series_id === seriesId)).toBe(true)
  })

  it('זיהוי משפחה גם ללא recurring_series_id (תואימות אחורה)', async () => {
    // יצירת 5 הלוואות ישנות ללא recurring_series_id
    const loanIds: string[] = []
    for (let i = 1; i <= 5; i++) {
      const result = await loansService.create({
        borrower_id: borrowerId,
        amount: 500,
        loan_date: `2024-${String(i).padStart(2, '0')}-10`,
        loan_type: 'רגילה',
        is_recurring: 1,
        recurring_months: 5 - i,
        recurring_day: 10,
        recurring_loan_number: i,
        recurring_loan_count: 5
        // אין recurring_series_id!
      })
      loanIds.push(result.lastInsertRowid)
    }

    // פתיחה מהלוואה #3
    const loan3 = await loansService.getById(loanIds[2])
    expect(loan3!.recurring_loan_number).toBe(3)

    // זיהוי על פי borrower_id + recurring_day (fallback)
    const seriesItems = await identifySeriesItems('loan', loan3!)

    console.log(`[TEST] זוהו ${seriesItems.length} הלוואות (ללא series_id) מהלוואה #3`)

    // ✅ אמור לזהות את כל 5 ההלוואות
    expect(seriesItems.length).toBe(5)

    const numbers = seriesItems.map(l => l.recurring_loan_number).sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2, 3, 4, 5])
  })

  it('הלוואה בודדת (לא במשפחה) מזוהה כרשימה של 1', async () => {
    // הלוואה מחזורית בודדת (לא חלק ממשפחה גדולה יותר)
    const result = await loansService.create({
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2024-06-15',
      loan_type: 'רגילה',
      is_recurring: 1, // מחזורית אבל בודדה
      recurring_months: 0,
      recurring_day: 15,
      recurring_loan_number: 1,
      recurring_loan_count: 1,
      recurring_series_id: crypto.randomUUID()
    })

    const loan = await loansService.getById(result.lastInsertRowid)
    const seriesItems = await identifySeriesItems('loan', loan!)

    // ✅ רשימה של 1 פריט
    expect(seriesItems.length).toBe(1)
    expect(seriesItems[0].id).toBe(loan!.id)
  })
})
