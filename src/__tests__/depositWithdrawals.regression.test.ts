/**
 * Regression Tests - Deposit Withdrawals Delete
 * 
 * BLOCKER 2: ודא שמחיקת withdrawal מעדכנת נכון את הdeposit parent
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  depositWithdrawalsService,
  db,
  exportAllData,
  importAllData,
  getItem,
  setItem
} from '../services/database'

describe('BLOCKER 2 - Deposit Withdrawals Delete', () => {
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

  // תרחיש A: Deposit עם withdrawal אחד
  it('should reset deposit to active after deleting single withdrawal', async () => {
    // יצירת depositor
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['משה', 'כהן', '0501234567', '123456789', 'תל אביב', 'moshe@test.com', '']
    )

    // יצירת deposit של 10,000
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה ראשונה', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id

    // יצירת withdrawal של 5,000
    const { id: withdrawalId } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 5000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'משיכה חלקית'
    })

    // עדכון deposit ידני (סימולציה של מה ש-UI עושה)
    let depositData = getItem<any>('deposits', String(depositId))
    if (depositData) {
      depositData.status = 'active'
      depositData.withdrawn_amount = 5000
      setItem('deposits', String(depositId), depositData)
    }

    // ולידציה - deposit צריך להיות active עם 5000 נמשך
    let deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.status).toBe('active')
    expect(deposit.withdrawn_amount).toBe(5000)

    // מחיקת הwithdrawal
    await depositWithdrawalsService.delete(withdrawalId)

    // ✅ תיקון BLOCKER: deposit צריך לחזור למצב התחלתי
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.status).toBe('active')
    expect(deposit.withdrawn_amount).toBe(0)
    expect(deposit.withdrawal_date).toBeNull()
  })

  // תרחיש B: Deposit עם מספר withdrawals
  it('should recalculate correctly after deleting one of many withdrawals', async () => {
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['דוד', 'לוי', '0509876543', '987654321', 'ירושלים', 'david@test.com', '']
    )

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה גדולה', 'active', 'transfer', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id

    // יצירת 3 withdrawals: 3000, 2000, 1000
    const { id: w1 } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 3000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'ראשון'
    })

    const { id: w2 } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 2000,
      withdrawal_date: '2026-02-05',
      payment_method: 'transfer',
      notes: 'שני'
    })

    const { id: w3 } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 1000,
      withdrawal_date: '2026-02-10',
      payment_method: 'cash',
      notes: 'שלישי'
    })

    // עדכון deposit - סה"כ 6000 נמשך
    let depositData1 = getItem<any>('deposits', String(depositId))
    if (depositData1) {
      depositData1.status = 'active'
      depositData1.withdrawn_amount = 6000
      setItem('deposits', String(depositId), depositData1)
    }

    // ולידציה
    let deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(6000)
    expect(deposit.status).toBe('active')

    // מחיקת withdrawal אמצעי (2000)
    await depositWithdrawalsService.delete(w2)

    // ✅ withdrawn_amount צריך להיות 4000 (3000 + 1000)
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(4000)
    expect(deposit.status).toBe('active')

    // מחיקת withdrawal ראשון (3000)
    await depositWithdrawalsService.delete(w1)

    // ✅ withdrawn_amount צריך להיות 1000
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(1000)
    expect(deposit.status).toBe('active')

    // מחיקת withdrawal אחרון (1000)
    await depositWithdrawalsService.delete(w3)

    // ✅ deposit חוזר למצב התחלתי
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(0)
    expect(deposit.status).toBe('active')
  })

  // תרחיש C: מחיקה כפולה
  it('should not change deposit on double delete', async () => {
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['רחל', 'אברהם', '0507777777', '777777777', 'חיפה', 'rachel@test.com', '']
    )

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 5000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'בדיקת כפילות', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id

    const { id: withdrawalId } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 2000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'בדיקה'
    })

    let depositData2 = getItem<any>('deposits', String(depositId))
    if (depositData2) {
      depositData2.status = 'active'
      depositData2.withdrawn_amount = 2000
      setItem('deposits', String(depositId), depositData2)
    }

    // מחיקה ראשונה
    await depositWithdrawalsService.delete(withdrawalId)
    let deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(0)

    // מחיקה שנייה - לא אמורה לשנות כלום
    await depositWithdrawalsService.delete(withdrawalId)
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(0)  // עדיין 0, לא שלילי!
  })

  // תרחיש D: מחיקת withdrawal שמשאירה את הdeposit כ-withdrawn
  it('should keep status as withdrawn if total still equals deposit amount', async () => {
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['שרה', 'כהן', '0508888888', '888888888', 'באר שבע', 'sarah@test.com', '']
    )

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'נמשך במלואו', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id

    // משיכות שמסתכמות ב-10,000
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 6000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'חלק ראשון'
    })

    const { id: w2 } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 4000,
      withdrawal_date: '2026-02-05',
      payment_method: 'transfer',
      notes: 'חלק שני'
    })

    let depositData3 = getItem<any>('deposits', String(depositId))
    if (depositData3) {
      depositData3.status = 'withdrawn'
      depositData3.withdrawn_amount = 10000
      setItem('deposits', String(depositId), depositData3)
    }

    let deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.status).toBe('withdrawn')
    expect(deposit.withdrawn_amount).toBe(10000)

    // מחיקת המשיכה השנייה (4000)
    await depositWithdrawalsService.delete(w2)

    // ✅ סטטוס צריך לחזור ל-active כי נותרו רק 6000
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(6000)
    expect(deposit.status).toBe('active')  // לא withdrawn יותר!
  })

  // תרחיש E: persistance
  it('should persist changes after delete', async () => {
    await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['יוסי', 'דוד', '0509999999', '999999999', 'נתניה', 'yossi@test.com', '']
    )

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 8000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'בדיקת שמירה', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id

    const { id: withdrawalId } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 3000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'משיכה'
    })

    let depositData4 = getItem<any>('deposits', String(depositId))
    if (depositData4) {
      depositData4.status = 'active'
      depositData4.withdrawn_amount = 3000
      setItem('deposits', String(depositId), depositData4)
    }

    await depositWithdrawalsService.delete(withdrawalId)

    // ייצוא וייבוא חוזר - סימולציה של restart
    const exported = await exportAllData()
    await importAllData(exported)

    // ✅ השינויים צריכים להישמר
    const deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(0)
    expect(deposit.status).toBe('active')

    // הwithdrawal לא צריך להיות בזיכרון
    const withdrawal = await depositWithdrawalsService.getById(withdrawalId)
    expect(withdrawal).toBeNull()
  })

  // תרחיש F: מחיקת withdrawal שלא קיים
  it('should not fail on deleting non-existent withdrawal', async () => {
    await expect(
      depositWithdrawalsService.delete('non-existent-id')
    ).resolves.not.toThrow()
  })
})
