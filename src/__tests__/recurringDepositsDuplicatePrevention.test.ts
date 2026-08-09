/**
 * טסט למניעת כפילות בהפקדות מחזוריות אוטומטיות
 * 
 * בודק אם יש פער דומה לזה שתוקן בהלוואות ב-CRITICAL FIX #1
 * (RECURRING_LOANS_DUPLICATE_BUG_AND_SOLUTIONS.md)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, db, getAllItems } from '../services/database'
import { autoCreateRecurringDeposits, createRecurringDeposit } from '../services/scheduler'

describe('מניעת כפילות בהפקדות מחזוריות', () => {
  let depositorId: string

  beforeEach(async () => {
    resetDatabase()
    
    // יצירת מפקיד דרך db.run
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['יוסף', 'לוי', '0507654321', '', '', '', '']
    )
    depositorId = depositorResult.lastInsertRowid
  })

  it('🔍 בדיקה: הרצה כפולה של createRecurringDeposit לא צריכה ליצור כפילויות', async () => {
    // 1. יצירת הפקדה מחזורית
    const depositResult = await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 1000, '2024-01-05', 'indefinite', null, 1, 5, 11, 1, 12, '', 'active', '', '']
    )
    const originalDepositId = depositResult.lastInsertRowid

    console.log('[TEST] הפקדה מקורית נוצרה:', originalDepositId)

    // 2. יצירת ההפקדה הבאה (חודש 2) דרך createRecurringDeposit
    const success1 = await createRecurringDeposit(originalDepositId)
    expect(success1).toBe(true)

    const allDeposits1 = getAllItems<any>('deposits')
    const deposit2 = allDeposits1.find(d => 
      d.depositor_id === depositorId && 
      d.recurring_deposit_number === 2
    )
    expect(deposit2).toBeDefined()
    console.log('[TEST] הפקדה 2 נוצרה:', deposit2!.id)

    // 3. נסיון להריץ שוב createRecurringDeposit על ההפקדה המקורית
    // (תרחיש שיכול לקרות אם autoCreateRecurringDeposits רץ על כל ההפקדות בלולאה)
    const success2 = await createRecurringDeposit(originalDepositId)
    
    // 4. בדיקה: האם נוצרה כפילות?
    const allDeposits2 = getAllItems<any>('deposits')
    const deposits2Count = allDeposits2.filter(d => 
      d.depositor_id === depositorId && 
      d.recurring_deposit_number === 2 &&
      !d.is_deleted
    ).length

    console.log('[TEST] מספר הפקדות עם מספר 2:', deposits2Count)

    // ✅ אמור להיות רק 1, לא 2
    expect(deposits2Count).toBe(1)
    
    // אם success2 הוא true, זה אומר שנוצרה כפילות!
    if (success2 === true) {
      console.warn('⚠️ אזהרה: createRecurringDeposit החזיר true בהרצה שנייה - יכולה להיות בעיית כפילות!')
    }
  })

  it('✅ הפקדה-בת חדשה יותר לא צריכה ליצור כפילות של הקודמת', async () => {
    // זהו התרחיש המדויק ש-CRITICAL FIX #1 תיקן בהלוואות
    
    // 1. הפקדה מקורית
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 1000, '2024-01-05', 'indefinite', null, 1, 5, 2, 1, 3, '', 'active', '', '']
    )

    // 2. הפקדה-בת (מספר 2)
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 1000, '2024-02-05', 'indefinite', null, 1, 5, 1, 2, 3, '', 'active', '', '']
    )

    // 3. הפקדה-בת (מספר 3)
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 1000, '2024-03-05', 'indefinite', null, 1, 5, 0, 3, 3, '', 'active', '', '']
    )

    console.log('[TEST] נוצרו 3 הפקדות בסדרה')

    // 4. הרצת autoCreateRecurringDeposits - בודק שכל אחת בסדרה
    // לא תנסה ליצור את "הבאה שלה" אם כבר קיימת
    await autoCreateRecurringDeposits()

    const allDeposits = getAllItems<any>('deposits')
    const activeDeposits = allDeposits.filter(d => 
      d.depositor_id === depositorId && 
      !d.is_deleted
    )

    console.log('[TEST] אחרי autoCreate:', activeDeposits.length, 'הפקדות')
    console.log('[TEST] מספרים:', activeDeposits.map(d => d.recurring_deposit_number).sort())

    // ✅ עדיין 3 הפקדות, לא יותר
    expect(activeDeposits.length).toBe(3)
    
    // בדיקה שהמספורים 1, 2, 3 - ללא כפילויות
    const numbers = activeDeposits.map(d => d.recurring_deposit_number).sort()
    expect(numbers).toEqual([1, 2, 3])
  })
})
