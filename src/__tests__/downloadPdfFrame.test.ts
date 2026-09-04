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
  // נוספו עבור תיקון באג ה-clip (ר' documents.ts / drawContentClipped):
  // בלי אלה, downloadPdf היה קורס כש-hasFrame=true כי jsPDF האמיתי כן
  // תומך בהם אבל ה-mock כאן לא הכיל אותם.
  saveGraphicsState: vi.fn(),
  restoreGraphicsState: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  discardPath: vi.fn(),
}

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => pdfInstance),
}))

const html2canvasMock = vi.fn().mockResolvedValue({
  // canvas "גבוה" בכוונה (1500px ~= ~4 מסך A4 ברוחב 750px) כדי לבדוק
  // גם את מסלול ריבוי-העמודים (addPage + ציור המסגרת מחדש בכל עמוד)
  width: 750,
  height: 3600,
  toDataURL: () => 'data:image/png;base64,FAKE_CONTENT_IMG',
})

vi.mock('html2canvas', () => ({
  default: (...args: any[]) => html2canvasMock(...args),
}))

const { downloadPdf } = await import('../services/documents')

const FRAME = 'data:image/png;base64,FAKE_FRAME_IMG'
const MARGINS = { top: 30, bottom: 40, right: 15, left: 25 }

describe('downloadPdf: ציור מסגרת בפועל (לא רק wiring)', () => {
  beforeEach(() => {
    pdfInstance.addImage.mockClear()
    pdfInstance.addPage.mockClear()
    pdfInstance.save.mockClear()
    pdfInstance.saveGraphicsState.mockClear()
    pdfInstance.restoreGraphicsState.mockClear()
    pdfInstance.rect.mockClear()
    pdfInstance.clip.mockClear()
    pdfInstance.discardPath.mockClear()
    html2canvasMock.mockClear()
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

  it('מסמך רב-עמודים עם מסגרת: כל עמוד (כולל השני ואילך) נחתך (clip) בדיוק לאזור שבין השוליים, כדי שהשוליים לא "ייעלמו" מהעמוד השני', async () => {
    await downloadPdf('<p>תוכן ארוך</p>', 'קובץ-בדיקה', FRAME, MARGINS)

    const usablePageHeight = 297 - MARGINS.top - MARGINS.bottom
    const contentWidth = 210 - MARGINS.left - MARGINS.right

    // באג שתוקן: בלי ה-clip, מהעמוד השני ואילך position השלילי דחף את
    // תחילת התמונה מעל ל-y=0, כך שנראה שהתוכן "מתחיל מתחילת העמוד" בלי
    // שום רווח שוליים עליון. ה-clip מבטיח שרק [m.top, pageHeight-m.bottom]
    // מוצג בפועל, בכל עמוד — כולל הראשון.
    expect(pdfInstance.rect).toHaveBeenCalled()
    for (const call of pdfInstance.rect.mock.calls) {
      const [x, y, width, height, style] = call
      expect(x).toBe(MARGINS.left)
      expect(y).toBe(MARGINS.top)
      expect(width).toBe(contentWidth)
      expect(height).toBe(usablePageHeight)
      expect(style).toBeNull()
    }
    expect(pdfInstance.clip).toHaveBeenCalled()
    // מספר הפעמים ש-rect/clip נקראו חייב להיות זהה למספר קריאות addImage
    // של תוכן העמוד עצמו (כל עמוד חתוך בנפרד, לא רק העמוד הראשון)
    const contentCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === 'data:image/png;base64,FAKE_CONTENT_IMG')
    expect(pdfInstance.rect.mock.calls.length).toBe(contentCalls.length)
    expect(pdfInstance.clip.mock.calls.length).toBe(contentCalls.length)
    expect(pdfInstance.saveGraphicsState.mock.calls.length).toBe(contentCalls.length)
    expect(pdfInstance.restoreGraphicsState.mock.calls.length).toBe(contentCalls.length)
  })

  it('בלי מסגרת: אף פעם לא קורא ל-clip/rect (אין שינוי התנהגות למסמך בלי מסגרת)', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה')
    expect(pdfInstance.rect).not.toHaveBeenCalled()
    expect(pdfInstance.clip).not.toHaveBeenCalled()
    expect(pdfInstance.saveGraphicsState).not.toHaveBeenCalled()
    expect(pdfInstance.restoreGraphicsState).not.toHaveBeenCalled()
  })

  it('שומר את הקובץ עם השם הנכון', async () => {
    await downloadPdf('<p>שלום</p>', 'שם-קובץ-ייחודי')
    expect(pdfInstance.save).toHaveBeenCalledWith('שם-קובץ-ייחודי.pdf')
  })

  it('מסגרת בפורמט JPEG: מוצהר כ-JPEG ל-jsPDF, לא PNG קשיח', async () => {
    const jpegFrame = 'data:image/jpeg;base64,FAKE_JPEG_FRAME'
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה', jpegFrame, MARGINS)

    const frameCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === jpegFrame)
    expect(frameCalls.length).toBeGreaterThan(0)
    for (const call of frameCalls) {
      expect(call[1]).toBe('JPEG') // format param, לא 'PNG'
    }
  })

  it('מסגרת בפורמט PNG (ברירת המחדל): מוצהרת כ-PNG', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה', FRAME, MARGINS)
    const frameCalls = pdfInstance.addImage.mock.calls.filter(c => c[0] === FRAME)
    expect(frameCalls.length).toBeGreaterThan(0)
    for (const call of frameCalls) {
      expect(call[1]).toBe('PNG')
    }
  })

  it('באג "כרטיס לבן צף": עם מסגרת, ה-container שקוף (לא רקע לבן אטום) וה-html2canvas מקבל backgroundColor:null', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה', FRAME, MARGINS)

    expect(html2canvasMock).toHaveBeenCalledTimes(1)
    const [container, options] = html2canvasMock.mock.calls[0]
    // באג אמיתי שנמצא בבדיקה ידנית (צילום מסך): לפני התיקון הרקע היה
    // 'white' תמיד, גם עם מסגרת — מה שגרם למלבן לבן צף מעל תמונת המסגרת.
    expect(container.style.background).toBe('transparent')
    expect(container.style.padding).toBe('0px')
    expect(options.backgroundColor).toBeNull()
  })

  it('בלי מסגרת: ה-container נשאר עם רקע לבן אטום כמו קודם (ללא שינוי התנהגות)', async () => {
    await downloadPdf('<p>שלום</p>', 'קובץ-בדיקה')

    const [container, options] = html2canvasMock.mock.calls[0]
    expect(container.style.background).toBe('white')
    expect(container.style.padding).toBe('20px')
    expect(options.backgroundColor).toBe('#ffffff')
  })
})
