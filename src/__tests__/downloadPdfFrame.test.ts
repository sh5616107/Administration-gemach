/**
 * @vitest-environment jsdom
 *
 * downloadPdf קיבל תמיד את frameImageBase64/margins כפרמטרים, אבל בגוף
 * הפונקציה הם מעולם לא היו בשימוש — שום מסגרת לא צוירה בפועל ב-PDF,
 * למרות שכל שאר התשתית (הפאנל, resolveDocumentBranding) "האמינה" שהיא
 * מגיעה ליעד. הבדיקות כאן מוודאות שהתוכן מצויר בפועל.
 *
 * (קובץ זה בכוונה עם סביבת jsdom משלו, לעומת ברירת המחדל 'node' של שאר
 * חבילת הבדיקות — כאן, ורק כאן, יש צורך אמיתי במניפולציית DOM אמיתית
 * שהוא-document.createElement המדומה הגלובלי ב-setup.ts לא מספק.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pdfInstance = {
  addImage: vi.fn(),
  addPage: vi.fn(),
  save: vi.fn(),
}

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => pdfInstance),
}))

vi.mock('html2canvas', () => ({
  // canvas "גבוה" בכוונה (1500px ~= ~4 מסך A4 ברוחב 750px) כדי לבדוק
  // גם את מסלול ריבוי-העמודים (addPage + ציור המסגרת מחדש בכל עמוד)
  default: vi.fn().mockResolvedValue({
    width: 750,
    height: 3600,
    toDataURL: () => 'data:image/png;base64,FAKE_CONTENT_IMG',
  }),
}))

const { downloadPdf } = await import('../services/documents')

const FRAME = 'data:image/png;base64,FAKE_FRAME_IMG'
const MARGINS = { top: 30, bottom: 40, right: 15, left: 25 }

describe('downloadPdf: ציור מסגרת בפועל (לא רק wiring)', () => {
  beforeEach(() => {
    pdfInstance.addImage.mockClear()
    pdfInstance.addPage.mockClear()
    pdfInstance.save.mockClear()
  })

  it('בלי מסגרת: מצייר רק את התוכן, בלי לגעת ב-margins', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה')

    const contentCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === 'data:image/png;base64,FAKE_CONTENT_IMG')
    expect(contentCalls.length).toBeGreaterThan(0)
    // ה-frame image (FAKE_FRAME_IMG) אף פעם לא נקרא
    expect(pdfInstance.addImage.mock.calls.some(c => c[0] === FRAME)).toBe(false)
    // בלי מסגרת — התוכן נמתח לרוחב הדף המלא (210mm), לא מצומצם ע"י margins
    expect(contentCalls[0][2]).toBe(0) // x
    expect(contentCalls[0][4]).toBe(210) // width = pageWidth
  })

  it('עם מסגרת: מצייר תמונת רקע מלאה-עמוד (0,0,210,297) לפני כל בלוק תוכן', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה', FRAME, MARGINS)

    const frameCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === FRAME)
    expect(frameCalls.length).toBeGreaterThan(0)
    for (const call of frameCalls) {
      const [, , x, y, width, height] = call
      expect(x).toBe(0)
      expect(y).toBe(0)
      expect(width).toBe(210) // pageWidth מלא
      expect(height).toBe(297) // pageHeight מלא
    }
  })

  it('עם מסגרת: תוכן מוזח לפי margins.left ומצומצם ברוחב לפי left+right', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה', FRAME, MARGINS)

    const contentCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === 'data:image/png;base64,FAKE_CONTENT_IMG')
    expect(contentCalls.length).toBeGreaterThan(0)
    const [, , x, , width] = contentCalls[0]
    expect(x).toBe(MARGINS.left)
    expect(width).toBe(210 - MARGINS.left - MARGINS.right)
  })

  it('מסמך ארוך מעמוד אחד: מוסיף עמוד וחוזר ומצייר את המסגרת גם שם', async () => {
    await downloadPdf('<p>תוכן ארוך</p>', 'קובץ-בדיקה', FRAME, MARGINS)

    expect(pdfInstance.addPage).toHaveBeenCalled()
    const frameCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === FRAME)
    // מסגרת מצוירת גם בעמוד הראשון וגם בכל עמוד נוסף
    expect(frameCalls.length).toBeGreaterThan(1)
  })

  it('שומר את הקובץ עם השם הנכון', async () => {
    await downloadPdf('<p>שלום</p>', 'שם-קובץ-ייחודי')
    expect(pdfInstance.save).toHaveBeenCalledWith('שם-קובץ-ייחודי.pdf')
  })
})
