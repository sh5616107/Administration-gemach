/**
 * Regression Tests - Deposit Withdrawals Delete
 * 
 * BLOCKER 2: ודא שמחיקת withdrawal מעדכנת נכון את הdeposit parent
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { 
  depositWithdrawalsService,
  depositsService,
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
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['משה', 'כהן', '0501234567', '123456789', 'תל אביב', 'moshe@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid

    // יצירת deposit של 10,000
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה ראשונה', 'active', 'cash', '']
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
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['דוד', 'לוי', '0509876543', '987654321', 'ירושלים', 'david@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה גדולה', 'active', 'transfer', '']
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
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['רחל', 'אברהם', '0507777777', '777777777', 'חיפה', 'rachel@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 5000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'בדיקת כפילות', 'active', 'cash', '']
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
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['שרה', 'כהן', '0508888888', '888888888', 'באר שבע', 'sarah@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'נמשך במלואו', 'active', 'cash', '']
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
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['יוסי', 'דוד', '0509999999', '999999999', 'נתניה', 'yossi@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid

    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 8000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'בדיקת שמירה', 'active', 'cash', '']
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

describe('REGRESSION - Deposit/DepositWithdrawal ID Chain Verification', () => {
  beforeEach(async () => {
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

  it('R1: Creation - deposit_id מועבר כ-UUID string, לא number', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['אברהם', 'יצחק', '0501111111', '111111111', 'תל אביב', 'abraham@test.com', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorResult.lastInsertRowid, 15000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id
    
    // ✅ depositId הוא UUID string
    expect(typeof depositId).toBe('string')
    expect(depositId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    
    // יצירת withdrawal עם deposit_id כ-UUID
    const { id: withdrawalId } = await depositWithdrawalsService.create({
      deposit_id: depositId,  // string, not number
      amount: 5000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'בדיקת creation'
    })
    
    // ✅ withdrawal נוצר בהצלחה
    const withdrawal = await depositWithdrawalsService.getById(withdrawalId)
    expect(withdrawal).toBeDefined()
    expect(withdrawal?.deposit_id).toBe(depositId)
    expect(typeof withdrawal?.deposit_id).toBe('string')
  })

  it('R2: Lookup - depositsService.getById() ו-getByDeposit() עובדים עם UUID', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['שרה', 'לוי', '0502222222', '222222222', 'ירושלים', 'sarah@test.com', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorResult.lastInsertRowid, 20000, '2026-01-01', 'fixed', '2027-01-01', 0, null, null, null, null, 'הפקדה', 'active', 'transfer', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id
    
    // ✅ getById() עובד עם UUID
    const deposit = await depositsService.getById(depositId)
    expect(deposit).toBeDefined()
    expect(deposit?.id).toBe(depositId)
    
    // יצירת 2 withdrawals
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 7000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash',
      notes: 'ראשון'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 3000,
      withdrawal_date: '2026-03-01',
      payment_method: 'transfer',
      notes: 'שני'
    })
    
    // ✅ getByDeposit() מוצא את כל המשיכות
    const withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawals).toHaveLength(2)
    expect(withdrawals[0].deposit_id).toBe(depositId)
    expect(withdrawals[1].deposit_id).toBe(depositId)
  })

  it('R3: Recalculation - חישוב מחדש של withdrawn_amount עובד נכון', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['רבקה', 'כהן', '0503333333', '333333333', 'חיפה', 'rivka@test.com', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorResult.lastInsertRowid, 30000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה גדולה', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id
    
    // משיכות: 8000, 7000, 5000
    const { id: w1 } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 8000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 7000,
      withdrawal_date: '2026-03-01',
      payment_method: 'cash'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 5000,
      withdrawal_date: '2026-04-01',
      payment_method: 'cash'
    })
    
    // עדכון ידני
    let depositData = getItem<any>('deposits', depositId)
    if (depositData) {
      depositData.withdrawn_amount = 20000
      depositData.status = 'active'
      setItem('deposits', depositId, depositData)
    }
    
    let deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(20000)
    
    // מחיקת משיכה ראשונה - צריך לחשב מחדש
    await depositWithdrawalsService.delete(w1)
    
    // ✅ חישוב מחדש נכון: 20000 - 8000 = 12000
    deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(12000)
  })

  it('R4: Multiple Deposits - כל deposit וwithdrawals שלו מנוהלים בנפרד', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['לאה', 'אברהם', '0504444444', '444444444', 'באר שבע', 'leah@test.com', '']
    )
    const depositorId = depositorResult.lastInsertRowid
    
    // 3 הפקדות שונות
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 10000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'הפקדה 1', 'active', 'cash', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 15000, '2026-02-01', 'fixed', '2027-02-01', 0, null, null, null, null, 'הפקדה 2', 'active', 'transfer', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, 20000, '2026-03-01', 'monthly', '2027-03-01', 0, null, null, null, null, 'הפקדה 3', 'active', 'cash', '']
    )
    
    const deposits = await db.query('SELECT * FROM deposits ORDER BY deposit_date') as any[]
    const [dep1, dep2, dep3] = deposits
    
    // משיכות מהפקדות שונות
    await depositWithdrawalsService.create({
      deposit_id: dep1.id,
      amount: 3000,
      withdrawal_date: '2026-05-01',
      payment_method: 'cash'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: dep2.id,
      amount: 5000,
      withdrawal_date: '2026-05-02',
      payment_method: 'transfer'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: dep3.id,
      amount: 8000,
      withdrawal_date: '2026-05-03',
      payment_method: 'cash'
    })
    
    // ✅ כל deposit מוצא רק את המשיכות שלו
    const withdrawals1 = await depositWithdrawalsService.getByDeposit(dep1.id)
    const withdrawals2 = await depositWithdrawalsService.getByDeposit(dep2.id)
    const withdrawals3 = await depositWithdrawalsService.getByDeposit(dep3.id)
    
    expect(withdrawals1).toHaveLength(1)
    expect(withdrawals1[0].amount).toBe(3000)
    
    expect(withdrawals2).toHaveLength(1)
    expect(withdrawals2[0].amount).toBe(5000)
    
    expect(withdrawals3).toHaveLength(1)
    expect(withdrawals3[0].amount).toBe(8000)
  })

  it('R5: Delete - מחיקת withdrawal מעדכנת נכון את deposit parent', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['יוסף', 'דוד', '0505555555', '555555555', 'נתניה', 'joseph@test.com', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorResult.lastInsertRowid, 12000, '2026-01-01', 'monthly', '2027-01-01', 0, null, null, null, null, 'בדיקת delete', 'active', 'cash', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id
    
    const { id: withdrawalId } = await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 4000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash'
    })
    
    // עדכון ידני
    let depositData = getItem<any>('deposits', depositId)
    if (depositData) {
      depositData.withdrawn_amount = 4000
      depositData.status = 'active'
      setItem('deposits', depositId, depositData)
    }
    
    // ✅ לפני מחיקה
    const withdrawalsBefore = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawalsBefore).toHaveLength(1)
    
    // מחיקה
    await depositWithdrawalsService.delete(withdrawalId)
    
    // ✅ אחרי מחיקה - withdrawal נעלם
    const withdrawalsAfter = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawalsAfter).toHaveLength(0)
    
    // ✅ deposit חזר למצב התחלתי
    const deposit = (await db.query('SELECT * FROM deposits WHERE id = ?', [depositId]) as any[])[0]
    expect(deposit.withdrawn_amount).toBe(0)
    expect(deposit.status).toBe('active')
  })

  it('R6: Soft Delete - מחיקת deposit עושה soft delete לכל המשיכות', async () => {
    const depositorResult = await db.run(
      'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['מרים', 'שמעון', '0506666666', '666666666', 'אשדוד', 'miriam@test.com', '']
    )
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorResult.lastInsertRowid, 25000, '2026-01-01', 'fixed', '2027-01-01', 0, null, null, null, null, 'בדיקת soft delete', 'active', 'transfer', '']
    )

    const deposits = await db.query('SELECT * FROM deposits') as any[]
    const depositId = deposits[0].id
    
    // יצירת 3 withdrawals
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 5000,
      withdrawal_date: '2026-02-01',
      payment_method: 'cash'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 3000,
      withdrawal_date: '2026-03-01',
      payment_method: 'transfer'
    })
    
    await depositWithdrawalsService.create({
      deposit_id: depositId,
      amount: 2000,
      withdrawal_date: '2026-04-01',
      payment_method: 'cash'
    })
    
    // ✅ לפני soft delete
    const withdrawalsBefore = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawalsBefore).toHaveLength(3)
    
    // מחיקת deposit (soft delete)
    await depositsService.delete(depositId)
    
    // ✅ deposit עדיין קיים אבל מסומן is_deleted
    const depositAfter = getItem<any>('deposits', depositId)
    expect(depositAfter?.is_deleted).toBe(true)
    
    // ✅ כל המשיכות נעלמו מ-getByDeposit (getAll מסנן deleted)
    const withdrawalsAfter = await depositWithdrawalsService.getByDeposit(depositId)
    expect(withdrawalsAfter).toHaveLength(0)
  })

  it('R7: Invalid Reference - getByDeposit עם deposit_id לא קיים מחזיר מערך ריק', async () => {
    const fakeDepositId = 'non-existent-uuid-12345'
    
    // ✅ לא זורק exception, מחזיר []
    const withdrawals = await depositWithdrawalsService.getByDeposit(fakeDepositId)
    expect(withdrawals).toEqual([])
    expect(withdrawals).toHaveLength(0)
  })
})
