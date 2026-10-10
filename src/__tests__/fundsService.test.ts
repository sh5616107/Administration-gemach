import { describe, it, expect, beforeEach } from 'vitest'
import { fundsService, resetDatabase, setItem } from '../services/database'
import { saveAppData } from '../services/persistence'

describe('Funds Service', () => {
  beforeEach(async () => {
    // ניקוי מלא
    resetDatabase()
    localStorage.clear()
  })

  it('בדיקה 1: אי אפשר למחוק קופה עם הלוואות (כולל soft-deleted)', async () => {
    // יצירת קופה
    const fund = await fundsService.create({
      name: 'קופת בדיקה',
      description: 'קופה לבדיקה',
      is_default: false,
      is_active: true,
    })

    // הוספת הלוואה ישירות ל-store
    const loanId = 'test-loan-1'
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: 'borrower-1',
      amount: 5000,
      loan_date: '2026-01-15',
      fund_id: fund.id,
      is_deleted: false,
    })

    // ניסיון למחיקת הקופה - צריך לזרוק שגיאה
    await expect(fundsService.delete(fund.id)).rejects.toThrow()
  })

  it('בדיקה 2: setDefault משאיר בדיוק קופת ברירת מחדל אחת', async () => {
    // יצירת 2 קופות
    const fund1 = await fundsService.create({
      name: 'קופה 1',
      description: 'קופה ראשונה',
      is_default: true,
      is_active: true,
    })

    const fund2 = await fundsService.create({
      name: 'קופה 2',
      description: 'קופה שנייה',
      is_default: false,
      is_active: true,
    })

    // הגדרת קופה 2 כברירת מחדל
    await fundsService.setDefault(fund2.id)

    // בדיקה שרק קופה 2 היא ברירת מחדל
    const allFunds = await fundsService.getAll()
    const defaultFunds = allFunds.filter(f => f.is_default)
    
    expect(defaultFunds.length).toBe(1)
    expect(defaultFunds[0].name).toBe('קופה 2')
    
    // בדיקה שקופה 1 כבר לא ברירת מחדל
    const fund1Updated = await fundsService.getById(fund1.id)
    expect(fund1Updated?.is_default).toBe(false)
  })

  it('בדיקה 3: אי אפשר להשבית קופת ברירת מחדל', async () => {
    // יצירת קופת ברירת מחדל
    const defaultFund = await fundsService.create({
      name: 'קופת ברירת מחדל',
      description: 'קופה ראשית',
      is_default: true,
      is_active: true,
    })

    // ניסיון להשבתה - צריך לזרוק שגיאה
    await expect(fundsService.deactivate(defaultFund.id)).rejects.toThrow(
      'לא ניתן להשבית את קופת ברירת המחדל'
    )
  })

  it('בדיקה 4: אי אפשר למחוק קופת ברירת מחדל', async () => {
    // יצירת קופת ברירת מחדל
    const defaultFund = await fundsService.create({
      name: 'קופת ברירת מחדל',
      description: 'קופה ראשית',
      is_default: true,
      is_active: true,
    })

    // ניסיון למחיקה - צריך לזרוק שגיאה
    await expect(fundsService.delete(defaultFund.id)).rejects.toThrow(
      'לא ניתן למחוק את קופת ברירת המחדל'
    )
  })

  it('בדיקה 5: אי אפשר למחוק קופה עם הלוואות מחוקות (soft-deleted)', async () => {
    // יצירת קופה
    const fund = await fundsService.create({
      name: 'קופת בדיקה',
      description: 'קופה לבדיקה',
      is_default: false,
      is_active: true,
    })

    // הוספת הלוואה מחוקה (soft-deleted)
    const loanId = 'test-loan-deleted'
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: 'borrower-1',
      amount: 3000,
      loan_date: '2026-01-10',
      fund_id: fund.id,
      is_deleted: true,
      deleted_at: '2026-01-20T10:00:00.000Z',
    })

    // ניסיון למחיקת הקופה - צריך לזרוק שגיאה גם עם הלוואות soft-deleted
    await expect(fundsService.delete(fund.id)).rejects.toThrow()
  })

  it('בדיקה 6: ניתן למחוק קופה ללא רשומות משויכות', async () => {
    // יצירת קופה לא-ברירת-מחדל ללא רשומות
    const fund = await fundsService.create({
      name: 'קופה ריקה',
      description: 'ללא רשומות',
      is_default: false,
      is_active: true,
    })

    // מחיקה צריכה להצליח
    await expect(fundsService.delete(fund.id)).resolves.not.toThrow()

    // בדיקה שהקופה אכן נמחקה (soft delete)
    const deletedFund = await fundsService.getById(fund.id)
    expect(deletedFund).toBeNull()
  })
})
