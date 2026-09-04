import { describe, it, expect } from 'vitest'
import { copyFrameImageToAllDocuments, createEmptyDocumentLayoutsMap } from '../types/documentLayout'

describe('copyFrameImageToAllDocuments', () => {
  it('מעתיקה את התמונה לכל 3 המסמכים האחרים, עם שוליים ברירת מחדל למי שאין לו מסגרת', () => {
    const layouts = createEmptyDocumentLayoutsMap()
    layouts.loan.frame = { imageBase64: 'data:image/png;base64,IMG1', marginTop: 40, marginBottom: 50, marginRight: 25, marginLeft: 15 }

    const result = copyFrameImageToAllDocuments(layouts, 'loan')

    for (const docType of ['borrowerReport', 'donationReceipt', 'depositReceipt'] as const) {
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
})
