/**
 * repaymentRecordedEvent.test.ts
 * -------------------------------
 * טסט רגרסיה לבאג: "ביצוע פירעון לא מתעדכן בכרטיס הלווה, רק אחרי ריענון".
 *
 * שורש הבעיה: אין ערוץ תקשורת בין קומפוננטות. AlertsDialog (נגיש מכל מקום
 * דרך Layout) רושם פירעון, אבל UnifiedLoansPage/Dashboard טוענים את
 * הנתונים שלהם פעם אחת ל-state מקומי ואין להם דרך לדעת שמשהו השתנה.
 *
 * הפתרון: closeLoanIfFullyRepaid (שנקרא אחרי כל פירעון, מכל נקודות היצירה
 * באפליקציה) משדר אירוע window גלובלי (REPAYMENT_RECORDED_EVENT), באותה
 * תבנית הקיימת כבר ב-useSettings.ts (SETTINGS_CHANGED_EVENT). הטסט הזה
 * מוודא שהאירוע משודר, עם ה-loanId וה-borrowerId הנכונים, בכל אחד
 * ממסלולי יצירת הפירעון.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { loansService, borrowersService, resetDatabase } from '../services/database'
import { createRepaymentWithNumbering, closeLoanIfFullyRepaid, REPAYMENT_RECORDED_EVENT } from '../services/repaymentHelpers'
import { addRepaymentAtomic } from '../services/transactional'

// setup.ts מגדיר globalThis.window כאובייקט חלקי (localStorage + document)
// בלי dispatchEvent/addEventListener אמיתיים - כאן מוסיפים מימוש מינימלי
// מבוסס Map, כדי לבדוק שהאירוע אכן משודר בלי תלות ב-DOM אמיתי.
type Listener = (event: any) => void
const listeners = new Map<string, Set<Listener>>()

beforeEach(() => {
  listeners.clear()
  ;(globalThis.window as any).addEventListener = (name: string, fn: Listener) => {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name)!.add(fn)
  }
  ;(globalThis.window as any).removeEventListener = (name: string, fn: Listener) => {
    listeners.get(name)?.delete(fn)
  }
  ;(globalThis.window as any).dispatchEvent = (event: any) => {
    listeners.get(event.type)?.forEach(fn => fn(event))
    return true
  }
  if (typeof (globalThis as any).CustomEvent === 'undefined') {
    ;(globalThis as any).CustomEvent = class CustomEvent {
      type: string
      detail: any
      constructor(type: string, params: { detail?: any } = {}) {
        this.type = type
        this.detail = params.detail
      }
    }
  }
})

async function createTestBorrower() {
  const result = await borrowersService.create({
    first_name: 'רבקה',
    last_name: 'לוי',
    phone: '0521234567',
    id_number: '',
    address: '',
    email: '',
    notes: ''
  } as any)
  return result.lastInsertRowid
}

describe('שידור REPAYMENT_RECORDED_EVENT אחרי רישום פירעון', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('createRepaymentWithNumbering (AlertsDialog/UnifiedLoansPage) משדר את האירוע עם loanId ו-borrowerId נכונים', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    const received: any[] = []
    window.addEventListener(REPAYMENT_RECORDED_EVENT, (e: any) => received.push(e.detail))

    await createRepaymentWithNumbering({ loanId, amount: 200, paymentDate: '2026-02-01' })

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ loanId, borrowerId })
  })

  it('addRepaymentAtomic (LoansTab) גם משדר את האירוע', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId,
      amount: 300,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    const received: any[] = []
    window.addEventListener(REPAYMENT_RECORDED_EVENT, (e: any) => received.push(e.detail))

    await addRepaymentAtomic(loanId, { amount: 300, payment_date: '2026-02-01' } as any)

    expect(received.length).toBeGreaterThanOrEqual(1)
    expect(received[0]).toEqual({ loanId, borrowerId })
  })

  it('פירעון מרובה (UnifiedLoansPage) משדר אירוע לכל הלוואה שמעורבת', async () => {
    const borrowerId = await createTestBorrower()
    const loan1 = await loansService.create({
      borrower_id: borrowerId, amount: 100, loan_date: '2026-01-01',
      loan_type: 'flexible', is_recurring: 0, auto_repayment: 0
    } as any)
    const loan2 = await loansService.create({
      borrower_id: borrowerId, amount: 200, loan_date: '2026-01-02',
      loan_type: 'flexible', is_recurring: 0, auto_repayment: 0
    } as any)

    const received: any[] = []
    window.addEventListener(REPAYMENT_RECORDED_EVENT, (e: any) => received.push(e.detail))

    // מדמה את הלולאה שב-handleMultiRepayment: פירעון לכל הלוואה, ואז closeLoanIfFullyRepaid
    await createRepaymentWithNumbering({ loanId: loan1.lastInsertRowid, amount: 100, paymentDate: '2026-02-01' })
    await createRepaymentWithNumbering({ loanId: loan2.lastInsertRowid, amount: 200, paymentDate: '2026-02-01' })

    const loanIds = received.map(d => d.loanId)
    expect(loanIds).toContain(loan1.lastInsertRowid)
    expect(loanIds).toContain(loan2.lastInsertRowid)
    received.forEach(d => expect(d.borrowerId).toBe(borrowerId))
  })

  it('לא זורק שגיאה כשאין window.dispatchEvent (סביבת טסטים רגילה בלי מוק EventTarget)', async () => {
    // מוודא שהתיקון לא שובר טסטים אחרים שלא מגדירים dispatchEvent בעצמם
    delete (globalThis.window as any).dispatchEvent
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId, amount: 100, loan_date: '2026-01-01',
      loan_type: 'flexible', is_recurring: 0, auto_repayment: 0
    } as any)

    await expect(
      createRepaymentWithNumbering({ loanId: loanResult.lastInsertRowid, amount: 100, paymentDate: '2026-02-01' })
    ).resolves.not.toThrow()
  })

  it('closeLoanIfFullyRepaid משדר את האירוע גם כשההלוואה לא ננעלת (פירעון חלקי)', async () => {
    const borrowerId = await createTestBorrower()
    const loanResult = await loansService.create({
      borrower_id: borrowerId, amount: 1000, loan_date: '2026-01-01',
      loan_type: 'flexible', is_recurring: 0, auto_repayment: 0
    } as any)
    const loanId = loanResult.lastInsertRowid

    const received: any[] = []
    window.addEventListener(REPAYMENT_RECORDED_EVENT, (e: any) => received.push(e.detail))

    const closed = await closeLoanIfFullyRepaid(loanId)
    expect(closed).toBe(false) // אין פירעונות בכלל עדיין, לא אמור להיסגר
    expect(received).toHaveLength(1) // אבל האירוע כן משודר - מישהו קרא לפונקציה אחרי פעולת פירעון
    expect(received[0]).toEqual({ loanId, borrowerId })
  })
})
