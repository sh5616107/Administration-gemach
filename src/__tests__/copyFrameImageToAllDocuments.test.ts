import { describe, it, expect } from 'vitest'
import { copyFrameImageToAllDocuments, createEmptyDocumentLayoutsMap, normalizeDocumentLayoutsMap } from '../types/documentLayout'

describe('copyFrameImageToAllDocuments', () => {
  it('מעתיקה את התמונה לכל 4 המסמכים האחרים, עם שוליים ברירת מחדל למי שאין לו מסגרת', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.frame = { imageBase64: 'data:image/png;base64,IMG1', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }

    const result = copyFrameImageToAllDocuments(layouts, 'loan')

    for (const docType of ['borrowerReport', 'donationReceipt', 'depositReceipt', 'depositorReport'] as const) {
      expect(result[docType].frame?.imageBase64).toBe('data:image/png;base64,IMG1')
      expect(result[docType].frame?.marginTop).toBe(35) // ברירת מחדל, לא מהמקור
      expect(result[docType].frame?.marginBottom).toBe(48)
      expect(result[docType].frame?.marginRight).toBe(20)
      expect(result[docType].frame?.marginLeft).toBe(20)
    }
  })

  it('לא נוגעת בשוליים קיימים של מסמך שכבר יש לו מסגרת משלו — רק התמונה מוחלפת', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.frame = { imageBase64: 'data:image/png;base64,SOURCE', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }
    layouts.donationReceipt.frame = { imageBase64: 'data:image/png;base64,OLD', marginTop: 10, marginBottom: 10, marginRight: 5, marginLeft: 5 }

    const result = copyFrameImageToAllDocuments(layouts, 'loan')

    expect(result.donationReceipt.frame?.imageBase64).toBe('data:image/png;base64,SOURCE') // התמונה כן הוחלפה
    expect(result.donationReceipt.frame?.marginTop).toBe(10) // אבל השוליים נשארו כפי שהיו
    expect(result.donationReceipt.frame?.marginBottom).toBe(10)
    expect(result.donationReceipt.frame?.marginRight).toBe(5)
    expect(result.donationReceipt.frame?.marginLeft).toBe(5)
  })

  it('לא נוגעת במסמך המקור עצמו', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.frame = { imageBase64: 'data:image/png;base64,IMG1', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }

    const result = copyFrameImageToAllDocuments(layouts, 'loan')

    expect(result.loan.frame).toEqual(layouts.loan.frame)
  })

  it('אם למקור אין תמונת מסגרת בכלל — לא עושה כלום (מחזירה את אותו אובייקט)', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    const result = copyFrameImageToAllDocuments(layouts, 'loan')
    expect(result).toBe(layouts) // אותו reference, אין שינוי
  })

  it('לא נוגעת בבלוקים/תוויות/showSystemBlocks של אף מסמך, רק בשדה frame', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.frame = { imageBase64: 'data:image/png;base64,IMG1', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }
    layouts.donationReceipt.customBlocks = [
      { id: 'x', anchorId: 'header', text: 'טקסט קיים', align: 'right', bold: false, underline: false, fontFamily: 'Arial', fontSize: 14, order: 0 },
    ]

    const result = copyFrameImageToAllDocuments(layouts, 'loan')

    expect(result.donationReceipt.customBlocks).toEqual(layouts.donationReceipt.customBlocks)
  })

  it(`רגרסיה: מעתיקה גם לסוג מסמך שנוסף אחרי ששמירה קודמת התבצעה — המפתח חסר לגמרי מהאובייקט ב-runtime, לא רק "ריק" (ר' הבאג שדווח: הכפתור לא העתיק לדוח מפקיד כי depositorReport לא היה קיים כלל ב-Object.keys של layouts שנטענו מ-localforage ישן)`, () => {
    // מדמה בדיוק את מה שקורה בפועל: JSON.parse על settings.document_layouts
    // שנשמר *לפני* שנוסף depositorReport — האובייקט המתקבל פשוט לא מכיל
    // את המפתח הזה בכלל, למרות שהטיפוס DocumentLayoutsMap אומר שהוא אמור.
    const legacyLayouts = createEmptyDocumentLayoutsMap()
    delete (legacyLayouts as any).depositorReport
    legacyLayouts.loan.frame = { imageBase64: 'data:image/png;base64,IMG1', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }

    const result = copyFrameImageToAllDocuments(legacyLayouts, 'loan')

    expect(result.depositorReport).toBeDefined()
    expect(result.depositorReport.frame?.imageBase64).toBe('data:image/png;base64,IMG1')
    expect(result.depositorReport.frame?.marginTop).toBe(35)
    expect(result.depositorReport.customBlocks).toEqual([])
  })
})

describe('normalizeDocumentLayoutsMap', () => {
  it('משלימה סוג מסמך שחסר לגמרי (JSON ישן שנשמר לפני שהמסמך נוסף) לקונפיג ריק מלא', () => {
    const legacyParsed = createEmptyDocumentLayoutsMap()
    delete (legacyParsed as any).depositorReport

    const result = normalizeDocumentLayoutsMap(legacyParsed)

    expect(result.depositorReport).toEqual({ showSystemBlocks: {}, labelOverrides: {}, customBlocks: [] })
  })

  it('מרפאה אובייקט חלקי שכבר נשמר בעבר (frame בלי customBlocks) — משמרת את frame, משלימה את השאר', () => {
    const corrupted = createEmptyDocumentLayoutsMap()
    // בדיוק התוצאה של updateActiveLayout על מפתח שלא היה קיים: רק frame, בלי שאר השדות
    ;(corrupted as any).depositorReport = { frame: { imageBase64: 'data:image/png;base64,X', marginTop: 35, marginBottom: 48, marginRight: 20, marginLeft: 20 } }

    const result = normalizeDocumentLayoutsMap(corrupted)

    expect(result.depositorReport.frame?.imageBase64).toBe('data:image/png;base64,X')
    expect(result.depositorReport.customBlocks).toEqual([])
    expect(result.depositorReport.labelOverrides).toEqual({})
    expect(result.depositorReport.showSystemBlocks).toEqual({})
  })

  it('קלט undefined/פגום נופל לקונפיג ריק מלא לכל סוגי המסמכים, לא זורקת', () => {
    expect(normalizeDocumentLayoutsMap(undefined)).toEqual(createEmptyDocumentLayoutsMap())
    expect(normalizeDocumentLayoutsMap(null)).toEqual(createEmptyDocumentLayoutsMap())
  })
})
