/**
 * @vitest-environment jsdom
 *
 * createDepositEmailData (שטר הפקדה במייל) הייתה קיימת אך לא חוברה לאף מסך.
 * הבדיקה מוודאת שהמייל נבנה עם הנמען, מסמך PDF מצורף ושם קובץ, כך ששליחה
 * דרך openEmailWithDocument תצרף את השטר.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('jspdf', () => ({ default: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

import { createDepositEmailData } from '../services/documents'

const base = {
  gemachName: 'גמ"ח לדוגמה',
  depositorName: 'ישראל ישראלי',
  depositorEmail: 'depositor@example.com',
  amount: 1500,
  depositDate: '2026-10-01',
  periodType: 'fixed',
}

describe('createDepositEmailData', () => {
  it('addresses the depositor and attaches the deposit document as a PDF', () => {
    const data = createDepositEmailData(base)
    expect(data.to).toBe('depositor@example.com')
    expect(data.documentType).toBe('deposit')
    expect(data.htmlContent).toBeTruthy()
    expect(data.filename).toContain('ישראל ישראלי')
  })

  it('mentions the gemach and the amount in the default message body', () => {
    const data = createDepositEmailData(base)
    expect(data.subject).toContain('גמ"ח לדוגמה')
    expect(data.body).toContain('ישראל ישראלי')
    expect(data.body).toContain('1,500')
  })

  it('accepts withdrawals and recurring metadata without throwing', () => {
    const data = createDepositEmailData({
      ...base,
      isRecurring: true,
      recurringDepositNumber: 2,
      recurringDepositCount: 12,
      withdrawals: [{ amount: 200, withdrawal_date: '2026-10-05' }],
    })
    expect(data.htmlContent).toBeTruthy()
  })
})
