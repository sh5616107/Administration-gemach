/**
 * עריכת הלוואה לא משנה קופה: update רגיל משאיר את fund_id, ושינוי קופה
 * מתבצע רק דרך changeFund (עם ולידציה ורישום ביומן).
 * (באג: LoansTab שלח fund_id של ברירת המחדל בכל עריכה ששמרה הלוואה.)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null),
}))

import { resetDatabase, ensureInitialized, fundsService, loansService, borrowersService, getAllItems } from '../services/database'

describe('עריכת הלוואה וקופה', () => {
  let fundB = ''
  let fundC = ''
  let loanId = ''

  beforeEach(async () => {
    resetDatabase()
    await ensureInitialized()
    fundB = (await fundsService.create({ name: 'ב', is_default: false, is_active: true })).id
    fundC = (await fundsService.create({ name: 'ג', is_default: false, is_active: true })).id
    const b = await borrowersService.create({ first_name: 'א', last_name: 'ב', phone: '1', id_number: '1', address: '', email: '', notes: '' } as any)
    const r = await loansService.create({
      borrower_id: b.lastInsertRowid as any, fund_id: fundB, amount: 100, loan_date: '2026-01-01',
      loan_type: 'flexible', is_recurring: 0, auto_repayment: 0,
    } as any)
    loanId = r.lastInsertRowid
  })

  it('update ללא fund_id משאיר את הקופה', async () => {
    await loansService.update(loanId, { notes: 'עודכן' })
    expect((await loansService.getById(loanId))?.fund_id).toBe(fundB)
  })

  it('update עם fund_id undefined לא דורס את הקופה', async () => {
    await loansService.update(loanId, { notes: 'x', fund_id: undefined } as any)
    expect((await loansService.getById(loanId))?.fund_id).toBe(fundB)
  })

  it('changeFund משנה קופה ורושם ביומן', async () => {
    await loansService.changeFund(loanId, fundC, 'בדיקה')
    expect((await loansService.getById(loanId))?.fund_id).toBe(fundC)
    const audit = getAllItems<any>('auditLog').filter(a => a.action === 'loan_fund_change')
    expect(audit).toHaveLength(1)
  })

  it('changeFund לקופה מושבתת נחסם', async () => {
    await fundsService.deactivate(fundC)
    await expect(loansService.changeFund(loanId, fundC, 'בדיקה')).rejects.toThrow()
    expect((await loansService.getById(loanId))?.fund_id).toBe(fundB)
  })
})
