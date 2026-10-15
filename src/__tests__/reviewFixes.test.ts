/**
 * רגרסיה לתיקוני סקירת הקוד (קופות / כסף זמין / תאריכים):
 *  1. כסף זמין: תרומות מחוקות, הלוואות מתוכננות שתאריכן הגיע, הלוואות overdue
 *  2. תאריכים לפי שעון מקומי (Asia/Jerusalem) - כולל דיכוי התראת פירעון אוטומטי
 *  3. קופה מושבתת לא מקבלת רשומות חדשות (עם חריג מפורש להמשך סדרה מחזורית)
 *  4. מחיקת תורם/מפקיד עם רשומות פעילות נחסמת (מזהי UUID)
 *  5. מחיקת הפקדה = soft delete גם למשיכות שלה
 *  6. rollback אמיתי במיגרציית הקופות
 */
// אזור הזמן (Asia/Jerusalem) מוגדר ב-vitest.globalSetup.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// שכבת שמירה בזיכרון - כדי שאפשר לבדוק גם שחזור מגיבוי
const store: { current: any } = { current: null }
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn(async (d: any) => { store.current = JSON.parse(JSON.stringify(d)) }),
  loadAppData: vi.fn(async () => (store.current ? JSON.parse(JSON.stringify(store.current)) : null)),
}))

import {
  resetDatabase,
  ensureInitialized,
  fundsService,
  loansService,
  borrowersService,
  repaymentsService,
  donationsService,
  depositsService,
  depositWithdrawalsService,
  expensesService,
  donorsService,
  depositorsService,
  statsService,
  getAllItems,
  db,
} from '../services/database'
import { toLocalDateStr, firstDayOfMonthStr } from '../utils/localDate'
import { checkAutoRepayments } from '../services/scheduler'
import { migrateFundsSystem } from '../services/migrations/fundsMigration'

const PAST = '2026-01-01'

async function setup() {
  const fund = await fundsService.getDefault()
  const b = await borrowersService.create({
    first_name: 'א', last_name: 'ב', phone: '0500000000', id_number: '1', address: '', email: '', notes: '',
  } as any)
  return { fundId: fund.id, borrowerId: b.lastInsertRowid as any }
}

function newLoan(borrowerId: string, fundId: string, extra: any = {}) {
  return {
    borrower_id: borrowerId, fund_id: fundId, amount: 400, loan_date: PAST,
    loan_type: 'flexible', is_recurring: 0, auto_repayment: 0, ...extra,
  } as any
}

beforeEach(async () => {
  store.current = null
  localStorage.clear()
  resetDatabase()
  await ensureInitialized()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('תאריכים לפי שעון מקומי', () => {
  it('הסביבה רצה בשעון ישראל', () => {
    // 1.10.2026 - עדיין שעון קיץ (UTC+3)
    expect(new Date(2026, 9, 1).getTimezoneOffset()).toBe(-180)
  })

  it('toLocalDateStr / firstDayOfMonthStr אינם מוסטים ביום', () => {
    expect(toLocalDateStr(new Date(2026, 9, 1))).toBe('2026-10-01')
    expect(firstDayOfMonthStr(new Date(2026, 9, 12, 15, 0))).toBe('2026-10-01')
    // לפני התיקון: (new Date(2026, 9, 1)).toISOString().split('T')[0] === '2026-09-30'
    expect(new Date(2026, 9, 1).toISOString().split('T')[0]).toBe('2026-09-30')
  })

  it('01:30 בלילה עדיין "היום" המקומי', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 1, 30, 0))
    expect(toLocalDateStr()).toBe('2026-10-12')
  })

  it('פירעון שבוצע ב-30 לחודש הקודם לא מדכא התראת פירעון אוטומטי של החודש הנוכחי', async () => {
    const { fundId, borrowerId } = await setup()
    const created = await loansService.create(newLoan(borrowerId, fundId, {
      amount: 1000, auto_repayment: 1, repayment_amount: 100, repayment_day: 5, repayment_start_date: PAST,
    }))
    await repaymentsService.create({ loan_id: created.lastInsertRowid, amount: 100, payment_date: '2026-09-30' } as any)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0))

    const alerts = await checkAutoRepayments()
    expect(alerts.some(a => a.loan_id === created.lastInsertRowid)).toBe(true)
  })

  it('פירעון שבוצע החודש כן מדכא את ההתראה', async () => {
    const { fundId, borrowerId } = await setup()
    const created = await loansService.create(newLoan(borrowerId, fundId, {
      amount: 1000, auto_repayment: 1, repayment_amount: 100, repayment_day: 5, repayment_start_date: PAST,
    }))
    await repaymentsService.create({ loan_id: created.lastInsertRowid, amount: 100, payment_date: '2026-10-05' } as any)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0))

    const alerts = await checkAutoRepayments()
    expect(alerts.some(a => a.loan_id === created.lastInsertRowid)).toBe(false)
  })
})

describe('כסף זמין', () => {
  async function seed() {
    const { fundId, borrowerId } = await setup()
    await donationsService.create({ donor_id: 1, amount: 1000, donation_date: PAST, notes: '' } as any)
    await depositsService.create({
      depositor_id: 'dep-1', amount: 500, deposit_date: PAST, period_type: 'fixed', due_date: '2026-12-31',
      is_recurring: 0, notes: '', status: 'active',
    } as any)
    await expensesService.create({
      description: 'x', amount: 100, expense_date: PAST, category: 'c', paid_by: 'gemach',
    } as any)
    const loan = await loansService.create(newLoan(borrowerId, fundId, { amount: 300 }))
    await repaymentsService.create({ loan_id: loan.lastInsertRowid, amount: 100, payment_date: PAST } as any)
    return { fundId, borrowerId, loanId: loan.lastInsertRowid }
  }

  const dashboardCash = (s: Awaited<ReturnType<typeof statsService.getDashboardStats>>) =>
    s.donations.total + s.deposits.total - s.activeLoans.total - s.gemachExpenses

  it('בסיס: 1000 + 500 - 200 (יתרה) - 100 = 1200, והכללי שווה לקופה', async () => {
    const { fundId } = await seed()
    const stats = await statsService.getDashboardStats()
    expect(dashboardCash(stats)).toBe(1200)
    expect((await statsService.getStatsByFund(fundId)).availableCash).toBe(1200)
  })

  it('תרומה שנמחקה (soft delete) לא נספרת בדף הבית', async () => {
    const { fundId } = await seed()
    const [don] = await donationsService.getAll()
    await db.run('DELETE FROM donations WHERE id = ?', [don.id])

    const stats = await statsService.getDashboardStats()
    expect(stats.donations.total).toBe(0)
    expect(dashboardCash(stats)).toBe(200)
    expect((await statsService.getStatsByFund(fundId)).availableCash).toBe(dashboardCash(stats))
  })

  it('הוצאה שנמחקה (soft delete) לא נספרת בשום חישוב', async () => {
    const { fundId } = await seed()
    const [exp] = await expensesService.getAll()
    await expensesService.delete(exp.id)

    expect((await statsService.getDashboardStats()).gemachExpenses).toBe(0)
    expect(await statsService.getTotalGemachExpenses()).toBe(0)
    expect((await statsService.getPaymentMethodStats()).unknown.expensesOut).toBe(0)
    expect((await statsService.getStatsByFund(fundId)).availableCash).toBe(1300)
  })

  it('הלוואה בסטטוס planned שתאריכה הגיע מופחתת מהכסף הזמין', async () => {
    const { fundId, loanId } = await seed()
    await loansService.update(loanId, { status: 'planned' })

    const stats = await statsService.getDashboardStats()
    expect(stats.activeLoans.total).toBe(200)
    expect(stats.plannedLoans.count).toBe(0)
    expect((await statsService.getStatsByFund(fundId)).availableCash).toBe(1200)
  })

  it('הלוואה עתידית היא מתוכננת ואינה מופחתת', async () => {
    const { fundId, borrowerId } = await seed()
    await loansService.create(newLoan(borrowerId, fundId, { amount: 700, loan_date: '2999-01-01' }))

    const stats = await statsService.getDashboardStats()
    expect(stats.plannedLoans).toEqual({ count: 1, total: 700 })
    expect(dashboardCash(stats)).toBe(1200)
  })

  it('הלוואה overdue עדיין נחשבת הלוואה יוצאת', async () => {
    const { fundId, loanId } = await seed()
    await loansService.update(loanId, { status: 'overdue' })

    expect(dashboardCash(await statsService.getDashboardStats())).toBe(1200)
    expect((await statsService.getStatsByFund(fundId)).availableCash).toBe(1200)
    expect((await statsService.getActiveBorrowers()).length).toBe(1)
  })
})

describe('קופה מושבתת', () => {
  async function inactiveFund() {
    await setup()
    const f = await fundsService.create({ name: 'ב', is_default: false, is_active: true })
    await fundsService.deactivate(f.id)
    return f.id
  }

  it('לא ניתן ליצור הלוואה/הפקדה/תרומה/הוצאה בקופה מושבתת', async () => {
    const fundId = await inactiveFund()
    const b = (await borrowersService.getAll())[0].id

    await expect(loansService.create(newLoan(b, fundId))).rejects.toThrow('אינה פעילה')
    await expect(depositsService.create({
      depositor_id: 'd', fund_id: fundId, amount: 1, deposit_date: PAST, period_type: 'fixed', due_date: PAST,
      is_recurring: 0, notes: '', status: 'active',
    } as any)).rejects.toThrow('אינה פעילה')
    await expect(donationsService.create({ donor_id: 1, fund_id: fundId, amount: 1, donation_date: PAST, notes: '' } as any))
      .rejects.toThrow('אינה פעילה')
    await expect(expensesService.create({
      fund_id: fundId, description: 'x', amount: 1, expense_date: PAST, category: 'c', paid_by: 'gemach',
    } as any)).rejects.toThrow('אינה פעילה')
    await expect(statsService.addExpense({
      fund_id: fundId, description: 'x', amount: 1, expense_date: PAST, category: 'c', paid_by: 'gemach',
    })).rejects.toThrow('אינה פעילה')
  })

  it('המשך סדרה מחזורית באותה קופה מותר במפורש', async () => {
    const fundId = await inactiveFund()
    const b = (await borrowersService.getAll())[0].id
    const r = await loansService.create(newLoan(b, fundId), { allowInactiveFund: true })
    expect((await loansService.getById(r.lastInsertRowid))?.fund_id).toBe(fundId)
  })

  it('קופה פעילה ממשיכה לעבוד', async () => {
    const { fundId, borrowerId } = await setup()
    await expect(loansService.create(newLoan(borrowerId, fundId))).resolves.toBeTruthy()
  })
})

describe('מחיקת תורם/מפקיד (מזהי UUID)', () => {
  it('תורם עם תרומות לא נמחק', async () => {
    const { fundId } = await setup()
    const d: any = await db.run('INSERT INTO donors (first_name,last_name,phone,id_number,address,email,notes) VALUES (?,?,?,?,?,?,?)',
      ['א', 'ב', '1', '1', '', '', ''])
    await db.run('INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details, fund_id) VALUES (?,?,?,?,?,?,?)',
      [d.lastInsertRowid, 50, PAST, '', '', '', fundId])

    await expect(donorsService.delete(d.lastInsertRowid)).rejects.toThrow('תרומות')
    expect(await donorsService.getById(d.lastInsertRowid)).not.toBeNull()
  })

  it('מפקיד עם הפקדה פעילה לא נמחק', async () => {
    const { fundId } = await setup()
    const d: any = await db.run('INSERT INTO depositors (first_name,last_name,phone,id_number,address,email,notes) VALUES (?,?,?,?,?,?,?)',
      ['א', 'ב', '1', '1', '', '', ''])
    await depositsService.create({
      depositor_id: d.lastInsertRowid, fund_id: fundId, amount: 10, deposit_date: PAST, period_type: 'fixed',
      due_date: PAST, is_recurring: 0, notes: '', status: 'active',
    } as any)

    await expect(depositorsService.delete(d.lastInsertRowid)).rejects.toThrow('הפקדות פעילות')
    expect(await depositorsService.getById(d.lastInsertRowid)).not.toBeNull()
  })

  it('תורם בלי תרומות נמחק כרגיל', async () => {
    await setup()
    const d: any = await db.run('INSERT INTO donors (first_name,last_name,phone,id_number,address,email,notes) VALUES (?,?,?,?,?,?,?)',
      ['א', 'ב', '1', '1', '', '', ''])
    await donorsService.delete(d.lastInsertRowid)
    expect(await donorsService.getById(d.lastInsertRowid)).toBeNull()
  })
})

describe('משיכות מהפקדות - soft delete', () => {
  async function depositWithWithdrawal() {
    const { fundId } = await setup()
    const dep = await depositsService.create({
      depositor_id: 'dep-1', fund_id: fundId, amount: 500, deposit_date: PAST, period_type: 'fixed',
      due_date: PAST, is_recurring: 0, notes: '', status: 'active',
    } as any)
    const w = await depositWithdrawalsService.create({ deposit_id: dep.lastInsertRowid, amount: 200, withdrawal_date: PAST })
    return { depId: dep.lastInsertRowid, wId: w.id, fundId }
  }

  it('מחיקת הפקדה מסמנת את המשיכות כמחוקות ולא מוחקת אותן סופית', async () => {
    const { depId, wId } = await depositWithWithdrawal()
    await depositsService.delete(depId)

    const raw = getAllItems<any>('depositWithdrawals').find(w => w.id === wId)
    expect(raw).toBeTruthy()
    expect(raw.is_deleted).toBe(true)
    expect(await depositWithdrawalsService.getByDeposit(depId)).toHaveLength(0)
  })

  it('מחיקת משיכה בודדת מחזירה את היתרה להפקדה', async () => {
    const { depId, wId } = await depositWithWithdrawal()
    await depositWithdrawalsService.delete(wId)

    expect(await depositWithdrawalsService.getTotalWithdrawn(depId)).toBe(0)
    expect((await depositsService.getById(depId))?.status).toBe('active')
    expect(await depositWithdrawalsService.getById(wId)).toBeNull()
  })
})

describe('מיגרציית קופות - rollback אמיתי', () => {
  it('כשל באמצע המיגרציה משחזר את הנתונים המקוריים', async () => {
    const original = {
      loans: { 'loan-1': { id: 'loan-1', borrower_id: 'b1', amount: 1000, loan_date: PAST } },
      donations: {}, deposits: {}, expenses: {}, funds: {},
    }
    store.current = JSON.parse(JSON.stringify(original))
    localStorage.clear()

    // כשל: אין קופת ברירת מחדל ויצירתה נכשלת
    vi.spyOn(fundsService, 'getDefault').mockRejectedValue(new Error('none'))
    vi.spyOn(fundsService, 'create').mockRejectedValue(new Error('boom'))

    await expect(migrateFundsSystem()).rejects.toThrow('המערכת שוחזרה מגיבוי')

    expect(Object.keys(store.current.loans)).toEqual(['loan-1'])
    expect(store.current.loans['loan-1'].fund_id).toBeUndefined()
    expect(Object.keys(store.current.funds ?? {})).toHaveLength(0)
    expect(localStorage.getItem('funds_migration_v1_completed')).toBeNull()
    vi.restoreAllMocks()
  })
})
