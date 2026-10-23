/**
 * מסמכי תרומה והפקדה אינם קבלה או חשבונית לצורכי מס.
 * הבדיקות מוודאות שהכותרת ושורת ההבהרה קשיחות: לא ניתן לשנות או להסתיר אותן
 * דרך layout (labelOverrides / showSystemBlocks / customBlocks / hideDividers
 * / blackAndWhite), והן מופיעות גם בנתיב האימייל.
 */
import { describe, it, expect, vi } from 'vitest'
import { createEmptyDocumentLayoutsMap } from '../types/documentLayout'
import { DONATION_DOC_TITLE, DEPOSIT_DOC_TITLE, NON_TAX_DISCLAIMER } from '../services/documentConstants'

vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('jspdf', () => ({ default: vi.fn() }))

const {
  buildDonationReceiptHtml,
  buildDepositDocumentHtml,
  createDonationEmailData,
  createDepositEmailData,
} = await import('../services/documents')

const donation = {
  gemachName: 'גמ"ח בדיקה', donorName: 'רחל כהן', amount: 300,
  donationDate: '2026-01-01', receiptNumber: '77',
}
const deposit = {
  gemachName: 'גמ"ח בדיקה', depositorName: 'יעקב לוי', amount: 5000,
  depositDate: '2026-01-01', periodType: 'flexible',
}

function hostileLayout(kind: 'donationReceipt' | 'depositReceipt') {
  const layouts = createEmptyDocumentLayoutsMap()
  const l = layouts[kind]
  l.labelOverrides = {
    title: 'קבלה', 'donation.title': 'קבלה', 'deposit.title': 'שטר הפקדה',
    disclaimer: '', 'donation.disclaimer': '', 'deposit.disclaimer': '',
  }
  l.showSystemBlocks = { title: false, disclaimer: false, footer: false, withdrawalsTable: false }
  l.hideDividers = true
  l.blackAndWhite = true
  l.customBlocks = ['header', 'footer', 'beforeSignature'].map((anchorId, i) => ({
    id: `b${i}`, anchorId, text: 'קבלה', align: 'right' as const, bold: false,
    underline: false, fontFamily: 'Arial', fontSize: 14, order: i,
  }))
  return l
}

describe('אישור קבלת תרומה', () => {
  it('מציג כותרת ושורת הבהרה בלי layout', () => {
    const html = buildDonationReceiptHtml(donation)
    expect(html).toContain(`>${DONATION_DOC_TITLE}</h1>`)
    expect(html).toContain(NON_TAX_DISCLAIMER)
    expect(html).not.toContain('קבלה על תרומה')
  })

  it('כותרת ושורת ההבהרה נשארות גם עם layout עוין', () => {
    const html = buildDonationReceiptHtml(donation, hostileLayout('donationReceipt'))
    expect(html).toContain(`>${DONATION_DOC_TITLE}</h1>`)
    expect(html).toContain(NON_TAX_DISCLAIMER)
    expect(html.split(NON_TAX_DISCLAIMER).length - 1).toBe(1)
  })

  it('נתיב האימייל כולל את אותם כותרת והבהרה, ואינו מכנה את המסמך קבלה', () => {
    const data = createDonationEmailData({ ...donation, donorEmail: 'a@b.co' })
    expect(data.htmlContent).toContain(DONATION_DOC_TITLE)
    expect(data.htmlContent).toContain(NON_TAX_DISCLAIMER)
    expect(data.subject).toContain('אישור קבלת תרומה')
    expect(data.subject).not.toContain('קבלה על תרומה')
    expect(data.body).not.toContain('קבלה על')
    expect(data.filename).not.toMatch(/^קבלה/)
  })
})

describe('אישור קבלת הפקדה', () => {
  it('מציג כותרת ושורת הבהרה בלי layout', () => {
    const html = buildDepositDocumentHtml(deposit)
    expect(html).toContain(`>${DEPOSIT_DOC_TITLE}</h1>`)
    expect(html).toContain(NON_TAX_DISCLAIMER)
    expect(html).not.toContain('>שטר הפקדה</h1>')
  })

  it('כותרת ושורת ההבהרה נשארות גם עם layout עוין', () => {
    const html = buildDepositDocumentHtml(deposit, hostileLayout('depositReceipt'))
    expect(html).toContain(`>${DEPOSIT_DOC_TITLE}</h1>`)
    expect(html).toContain(NON_TAX_DISCLAIMER)
    expect(html.split(NON_TAX_DISCLAIMER).length - 1).toBe(1)
  })

  it('נתיב האימייל כולל את אותם כותרת והבהרה', () => {
    const data = createDepositEmailData({ ...deposit, depositorEmail: 'a@b.co' })
    expect(data.htmlContent).toContain(DEPOSIT_DOC_TITLE)
    expect(data.htmlContent).toContain(NON_TAX_DISCLAIMER)
    expect(data.subject).toContain('אישור קבלת הפקדה')
    expect(data.body).toContain('אישור קבלת הפקדה')
  })
})
