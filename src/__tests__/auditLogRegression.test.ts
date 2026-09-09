import { describe, it, expect, beforeEach } from 'vitest'
import { exportAllData, importAllData, repaymentsService } from '../services/database'
import { logAudit, getAuditLog, getAllAuditLogs } from '../services/auditLog'

describe('Audit Log regression', () => {
  beforeEach(async () => {
    // ניקוי נתונים לפני כל טסט
    const data = await exportAllData()
    data.auditLog = {}
    data.repayments = {}
    await importAllData(data)
  })

  it('רשומה שנרשמת ב-logAudit חוזרת דרך getAuditLog (היה מחזיר [] תמיד)', async () => {
    await logAudit('repayment_create', 'repayment', 'repayment-1', {
      after: { amount: 500 }
    })

    const entries = await getAuditLog('repayment', 'repayment-1')
    expect(entries).toHaveLength(1)
    expect(entries[0].action).toBe('repayment_create')
    expect(entries[0].after).toEqual({ amount: 500 })
  })

  it('getAllAuditLogs מכבד limit ומחזיר רשומות אמיתיות (לא [])', async () => {
    await logAudit('repayment_create', 'repayment', 'r1', {})
    await logAudit('repayment_update', 'repayment', 'r1', {})
    await logAudit('repayment_delete', 'repayment', 'r1', {})

    const all = await getAllAuditLogs(2)
    expect(all).toHaveLength(2)
    // שתי הרשומות שחזרו הן מתוך מה שנרשם בפועל, לא מערך ריק
    const actions = all.map(a => a.action)
    for (const action of actions) {
      expect(['repayment_create', 'repayment_update', 'repayment_delete']).toContain(action)
    }
  })
})

describe('repaymentsService.getById', () => {
  beforeEach(async () => {
    const data = await exportAllData()
    data.repayments = {}
    await importAllData(data)
  })

  it('מחזיר את הפירעון הקיים לפי id', async () => {
    const created = await repaymentsService.create({
      loan_id: 'loan-1',
      amount: 300,
      payment_date: '2026-01-01',
      payment_method: 'cash',
    } as any)

    const found = await repaymentsService.getById(created.lastInsertRowid)
    expect(found).not.toBeNull()
    expect(found?.amount).toBe(300)
  })

  it('מחזיר null לפירעון שנמחק (soft delete) או שלא קיים', async () => {
    const created = await repaymentsService.create({
      loan_id: 'loan-1',
      amount: 100,
      payment_date: '2026-01-01',
      payment_method: 'cash',
    } as any)

    await repaymentsService.delete(created.lastInsertRowid)

    expect(await repaymentsService.getById(created.lastInsertRowid)).toBeNull()
    expect(await repaymentsService.getById('does-not-exist')).toBeNull()
  })
})
