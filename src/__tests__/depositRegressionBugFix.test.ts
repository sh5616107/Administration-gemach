/**
 * Test: תיקון באג 3 - רגרסיה בהפקדות מחזוריות
 * 
 * הבעיה:
 * אחרי קומיט ce5d9f0, הפקדות מחזוריות נתקעות אחרי 2 יצירות בלבד.
 * הסיבה: שני מנגנוני מניעת-כפילויות (newerDepositExists ב-autoCreateRecurringDeposits
 * ו-existingDeposit ב-createRecurringDeposit) לא מתואמים ביניהם.
 * 
 * הטסט הקיים softDeleteDepositsPrevention.test.ts תפס את הרגרסיה:
 * לפני: עובר (3 הפקדות נוצרות)
 * אחרי: נכשל (רק 2 הפקדות נוצרות)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, db } from '../services/database'
import { createRecurringDeposit, autoCreateRecurringDeposits } from '../services/scheduler'

describe('תיקון באג 3: רגרסיה בהפקדות מחזוריות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.useFakeTimers()
  })

  it('should continue creating deposits beyond 2 months', async () => {
    // יצירת מפקיד
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['רחל', 'לוי', '0509876543', '987654321', 'ירושלים', 'rachel@example.com', '']
    )

    // יצירת הפקדה מחזורית (חודש 1)
    vi.setSystemTime(new Date('2026-01-05'))
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 3000, '2026-01-05', 'monthly', '2027-01-05', 1, 5, 11, 1, 12, 'הפקדה מחזורית', 'active', 'transfer', '']
    )

    const deposits1 = await db.query('SELECT * FROM deposits') as any[]
    const depositId1 = deposits1[0].id

    console.log('=== חודש 1: יצירת הפקדה ראשונה ===')
    console.log('Deposit #1:', {
      id: depositId1,
      recurring_deposit_number: 1,
      date: '2026-01-05'
    })

    // חודש 2: יצירת הפקדה שנייה
    vi.setSystemTime(new Date('2026-02-05'))
    const success2 = await createRecurringDeposit(depositId1)
    expect(success2).toBe(true)

    let allDeposits = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
    console.log('=== חודש 2: אחרי createRecurringDeposit ===')
    console.log('Total deposits:', allDeposits.length)
    allDeposits.forEach(d => {
      console.log(`  Deposit #${d.recurring_deposit_number}: id=${d.id}, date=${d.deposit_date}`)
    })

    expect(allDeposits).toHaveLength(2)

    // חודש 3: ניסיון ליצור הפקדה שלישית
    vi.setSystemTime(new Date('2026-03-05'))
    
    console.log('=== חודש 3: לפני createRecurringDeposit ===')
    // מציאת ההפקדה האחרונה במשפחה
    const latestDeposit = allDeposits.sort((a, b) => 
      (b.recurring_deposit_number || 1) - (a.recurring_deposit_number || 1)
    )[0]
    console.log('Latest deposit before create:', {
      id: latestDeposit.id,
      recurring_deposit_number: latestDeposit.recurring_deposit_number
    })

    const success3 = await createRecurringDeposit(latestDeposit.id)
    
    console.log('createRecurringDeposit result:', success3)
    
    allDeposits = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
    console.log('=== חודש 3: אחרי createRecurringDeposit ===')
    console.log('Total deposits:', allDeposits.length)
    allDeposits.forEach(d => {
      console.log(`  Deposit #${d.recurring_deposit_number}: id=${d.id}, date=${d.deposit_date}`)
    })

    // ✅ תיקון באג 3: צריכות להיות 3 הפקדות (לא 2)
    expect(success3).toBe(true)
    expect(allDeposits).toHaveLength(3)

    // וידוא מספור נכון
    const numbers = allDeposits.map(d => d.recurring_deposit_number).sort((a, b) => a - b)
    expect(numbers).toEqual([1, 2, 3])
  })

  it('should create deposits continuously over 5 months', async () => {
    // יצירת מפקיד
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['משה', 'אברהם', '0501112233', '111222333', 'חיפה', 'moshe@example.com', '']
    )

    // יצירת הפקדה מחזורית
    vi.setSystemTime(new Date('2026-01-05'))
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 4000, '2026-01-05', 'monthly', '2027-01-05', 1, 5, 11, 1, 12, 'הפקדה מחזורית', 'active', 'cash', '']
    )

    // סימולציה של 5 חודשים
    for (let month = 2; month <= 5; month++) {
      vi.setSystemTime(new Date(`2026-0${month}-05`))
      await autoCreateRecurringDeposits()

      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
      console.log(`Month ${month}: ${deposits.length} deposits created`)

      expect(deposits.length).toBeGreaterThanOrEqual(month)
    }

    const finalDeposits = await db.query('SELECT * FROM deposits WHERE depositor_id = 1 AND is_recurring = 1') as any[]
    
    // ✅ תיקון באג 3: צריכות להיות לפחות 5 הפקדות
    expect(finalDeposits.length).toBeGreaterThanOrEqual(5)

    // וידוא שכל המספרים רצופים
    const numbers = finalDeposits.map(d => d.recurring_deposit_number).sort((a, b) => a - b)
    const expectedNumbers = Array.from({ length: finalDeposits.length }, (_, i) => i + 1)
    expect(numbers).toEqual(expectedNumbers)
  })
})
