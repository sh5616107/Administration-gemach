/**
 * loanUpdateValidation.test.ts
 * ----------------------------
 * טסט רגרסיה לשני באגים קשורים ב-loansService.update():
 *
 * 1. עריכת סכום הלוואה אחרי שנסגרה (נפרעה במלואה) לא עדכנה את ה-status,
 *    וההלוואה נעלמה מ"לווים פעילים" בדף הבית למרות יתרה חדשה וחיובית.
 * 2. אפשר היה לשנות את סכום ההלוואה לערך נמוך מסך הפירעונות שכבר בוצעו,
 *    מה שיצר יתרה שלילית בלי שום התראה.
 *
 * שורש משותף: loansService.update() לא הפעיל שום ולידציה (בניגוד ל-create()).
 * התיקון: update() חוסם שינוי amount על הלוואה סגורה, וחוסם שינוי amount
 * לערך הנמוך מסך הפירעונות שכבר בוצעו - עם שגיאה ברורה בשני המקרים.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, statsService, resetDatabase } from '../services/database'
import { addRepaymentAtomic } from '../services/transactional'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

// @ts-ignore
globalThis.localStorage = localStorageMock

async function createTestBorrower() {
  const result = await borrowersService.create({
    first_name: 'משה',
    last_name: 'כהן',
    phone: '0501234567',
    id_number: '',
    address: '',
    email: '',
    notes: ''
  } as any)
  return result.lastInsertRowid
}

describe('ולידציה בעריכת הלוואה (loansService.update)', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('באג 1: לא ניתן לשנות סכום של הלוואה שכבר נסגרה - נזרקת שגיאה ברורה', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 100,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    // פירעון מלא -> ההלוואה נסגרת אוטומטית
    const full = await addRepaymentAtomic(loanId, { amount: 100, payment_date: '2026-02-01' } as any)
    expect(full.success).toBe(true)
    expect((await loansService.getById(loanId))?.status).toBe('closed')

    // ניסיון לשנות את סכום ההלוואה ל-1000 אחרי שנסגרה -> אמור להיחסם
    await expect(
      loansService.update(loanId, { amount: 1000 } as any)
    ).rejects.toThrow(/נסגרה/)

    // המצב לא השתנה - אין הלוואה "תקועה" עם status=closed ויתרה חיובית
    const loanAfter = await loansService.getById(loanId)
    expect(loanAfter?.amount).toBe(100)
    expect(loanAfter?.status).toBe('closed')
    expect(loanAfter?.remaining).toBe(0)

    // ולכן היא גם לא אמורה להופיע ברשימת הלווים הפעילים בדף הבית
    const activeBorrowers = await statsService.getActiveBorrowers()
    expect(activeBorrowers.find((b: any) => b.id === borrowerId)).toBeUndefined()
  })

  it('עריכת שדות אחרים (לא amount) בהלוואה סגורה עדיין מותרת', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 100,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    await addRepaymentAtomic(loanId, { amount: 100, payment_date: '2026-02-01' } as any)
    expect((await loansService.getById(loanId))?.status).toBe('closed')

    await expect(
      loansService.update(loanId, { notes: 'הערה חדשה' } as any)
    ).resolves.not.toThrow()

    expect((await loansService.getById(loanId))?.notes).toBe('הערה חדשה')
  })

  it('באג 2: לא ניתן לשנות סכום הלוואה לערך הנמוך מסך הפירעונות שכבר בוצעו', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 400,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    // פירעון מלא -> ההלוואה נסגרת (400/400)
    await addRepaymentAtomic(loanId, { amount: 400, payment_date: '2026-02-01' } as any)
    expect((await loansService.getById(loanId))?.status).toBe('closed')

    // ניסיון לשנות ל-40 אחרי פירעון של 400 -> נחסם (הן בגלל status=closed, והן בגלל יתרה שלילית)
    await expect(
      loansService.update(loanId, { amount: 40 } as any)
    ).rejects.toThrow()

    const loanAfter = await loansService.getById(loanId)
    expect(loanAfter?.amount).toBe(400)
    expect(loanAfter?.remaining).toBe(0)
  })

  it('באג 2 (מקרה כללי): חוסם יתרה שלילית גם בהלוואה פעילה (לא סגורה)', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    // פירעון חלקי -> ההלוואה נשארת active עם יתרה של 100
    await addRepaymentAtomic(loanId, { amount: 900, payment_date: '2026-02-01' } as any)
    const loanMid = await loansService.getById(loanId)
    expect(loanMid?.status).toBe('active')
    expect(loanMid?.remaining).toBe(100)

    // ניסיון לשנות סכום ל-50 (פחות מסך הפירעונות: 900) -> נחסם
    await expect(
      loansService.update(loanId, { amount: 50 } as any)
    ).rejects.toThrow(/יתרה שלילית|לא ניתן לשנות/)

    const loanAfter = await loansService.getById(loanId)
    expect(loanAfter?.amount).toBe(1000)
  })

  it('שינוי amount לערך תקין (גבוה מסך הפירעונות) עדיין מותר בהלוואה פעילה', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    await addRepaymentAtomic(loanId, { amount: 300, payment_date: '2026-02-01' } as any)

    await expect(
      loansService.update(loanId, { amount: 1200 } as any)
    ).resolves.not.toThrow()

    const loanAfter = await loansService.getById(loanId)
    expect(loanAfter?.amount).toBe(1200)
    expect(loanAfter?.remaining).toBe(900)
    expect(loanAfter?.status).toBe('active')
  })
})
