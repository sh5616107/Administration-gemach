/**
 * שלב 4 — בדיקת "wiring" אמיתית: מוכיחה שקונפיג שמור ב-document_layouts
 * זורם דרך getDocumentLayout ובאמת משפיע על ה-HTML שנוצר, ולא רק ש-tsc
 * עובר. זה תחליף כן לבדיקה ידנית מול ממשק — הסביבה כאן היא headless
 * בלי דפדפן/מסך, כך שלא ניתן ללחוץ בפועל על כפתורים באפליקציית Tauri.
 * במקום זאת: מדמה בדיוק את מה שכל handler עושה (settings.document_layouts
 * → getDocumentLayout → buildXxxDocumentHtml) ומוודא שהבלוק/המסגרת/התווית
 * שנשמרו מופיעים בפועל בפלט, עבור 3 מסמכים שונים (עומד בדרישה).
 */
import { describe, it, expect, vi } from 'vitest'
import { getDocumentLayout } from '../utils/documentLayoutHelper'
import { createEmptyDocumentLayoutsMap } from '../types/documentLayout'

vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('jspdf', () => ({ default: vi.fn() }))

const { buildLoanDocumentHtml, buildDonationReceiptHtml, buildDepositDocumentHtml } = await import('../services/documents')

describe('שלב 4: wiring אמיתי — settings.document_layouts משפיע בפועל על הפלט', () => {
  it('שטר הלוואה: בלוק מותאם בעוגן afterAmount מופיע בפועל ב-HTML', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.customBlocks = [
      { id: 'x', anchorId: 'afterAmount', text: 'טקסט-בדיקה-ייחודי-שטר-הלוואה', align: 'right', bold: true, underline: false, fontFamily: 'David', fontSize: 16, order: 0 },
    ]
    const settingsDocumentLayoutsJson = JSON.stringify(layouts)

    // בדיוק מה ש-LoansTab.tsx/UnifiedLoansPage.tsx עושים בפועל אחרי החיבור
    const layout = getDocumentLayout(settingsDocumentLayoutsJson, 'loan')
    const html = buildLoanDocumentHtml({
      gemachName: 'גמ"ח בדיקה', borrowerName: 'ישראל ישראלי', amount: 1000,
      loanDate: '2026-01-01', loanType: 'flexible',
    } as any, layout)

    expect(html).toContain('טקסט-בדיקה-ייחודי-שטר-הלוואה')
    expect(html).toContain('font-family: \'David\'')
  })

  it('קבלה על תרומה: labelOverride משנה בפועל תווית מודפסת', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.donationReceipt.labelOverrides = { 'donation.receivedFrom': 'תווית-דריסה-ייחודית' }
    const settingsDocumentLayoutsJson = JSON.stringify(layouts)

    const layout = getDocumentLayout(settingsDocumentLayoutsJson, 'donationReceipt')
    const html = buildDonationReceiptHtml({
      gemachName: 'גמ"ח בדיקה', donorName: 'רחל כהן', amount: 300,
      donationDate: '2026-01-01', receiptNumber: '99',
    }, layout)

    expect(html).toContain('תווית-דריסה-ייחודית')
    expect(html).not.toContain('התקבל מאת:') // התווית המקורית נדרסה, לא רק נוספה
  })

  it('קבלה על הפקדה: showSystemBlocks=false מסתיר בפועל את טבלת המשיכות', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.depositReceipt.showSystemBlocks = { withdrawalsTable: false }
    const settingsDocumentLayoutsJson = JSON.stringify(layouts)

    const layout = getDocumentLayout(settingsDocumentLayoutsJson, 'depositReceipt')
    const html = buildDepositDocumentHtml({
      gemachName: 'גמ"ח בדיקה', depositorName: 'יעקב לוי', amount: 5000,
      depositDate: '2026-01-01', periodType: 'flexible',
      withdrawals: [{ amount: 999, withdrawal_date: '2026-02-01' }],
    }, layout)

    expect(html).not.toContain('משיכות שבוצעו')
    expect(html).not.toContain('999')
  })

  it('קונפיג פגום (JSON לא תקין) לא חוסם — נופל לריק בשקט (באג #7)', () => {
    const layout = getDocumentLayout('{this is not json', 'loan')
    expect(() => buildLoanDocumentHtml({
      gemachName: 'גמ"ח בדיקה', borrowerName: 'ישראל ישראלי', amount: 1000,
      loanDate: '2026-01-01', loanType: 'flexible',
    } as any, layout)).not.toThrow()
  })

  it('אין קונפיג בכלל (undefined) — עובד בדיוק כמו לפני שלב 4 (backward compatible)', () => {
    const layout = getDocumentLayout(undefined, 'loan')
    expect(layout).toBeUndefined()
    const html = buildLoanDocumentHtml({
      gemachName: 'גמ"ח בדיקה', borrowerName: 'ישראל ישראלי', amount: 1000,
      loanDate: '2026-01-01', loanType: 'flexible',
    } as any, layout)
    expect(html).toContain('ישראל ישראלי')
  })
})
