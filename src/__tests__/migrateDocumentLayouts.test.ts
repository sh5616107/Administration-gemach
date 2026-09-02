/**
 * טסט למיגרציית document_layouts.
 * בודק 3 תרחישים: אין הגדרות ישנות / customText בלבד / customText+frame.
 * מדפיס console.log(JSON.stringify(result)) לפי דרישת שלב 1 במסמך ההוראות.
 */

import { describe, it, expect } from 'vitest'
import { migrateDocumentLayouts } from '../services/migrations'

describe('migrateDocumentLayouts', () => {
  it('תרחיש 1: אין הגדרות ישנות כלל → קונפיג ריק תקין לכל 4 המסמכים', () => {
    const result = migrateDocumentLayouts({})
    console.log('תרחיש 1 (אין הגדרות ישנות):', JSON.stringify(result))

    expect(result.loan.customBlocks).toEqual([])
    expect(result.borrowerReport.customBlocks).toEqual([])
    expect(result.donationReceipt.customBlocks).toEqual([])
    expect(result.depositReceipt.customBlocks).toEqual([])
    expect(result.loan.frame).toBeUndefined()
    expect(result.depositReceipt.frame).toBeUndefined()
    // ה-JSON חייב להיות ניתן ל-serialize/parse בלי לזרוק
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow()
  })

  it('תרחיש 2: customText בלבד (ללא מסגרת) → בלוק יחיד בעוגן ברירת המחדל הנכון', () => {
    const result = migrateDocumentLayouts({
      loan_document_text: 'אני הח"מ מתחייב להחזיר את ההלוואה תוך 30 יום.',
      deposit_document_text: 'ואני מתחייב להחזיר את הסכום בתנאים שנקבעו.',
    })
    console.log('תרחיש 2 (customText בלבד):', JSON.stringify(result))

    expect(result.loan.customBlocks).toHaveLength(1)
    expect(result.loan.customBlocks[0].anchorId).toBe('commitmentText')
    expect(result.loan.customBlocks[0].text).toBe('אני הח"מ מתחייב להחזיר את ההלוואה תוך 30 יום.')
    expect(result.loan.customBlocks[0].order).toBe(0)

    expect(result.depositReceipt.customBlocks).toHaveLength(1)
    expect(result.depositReceipt.customBlocks[0].anchorId).toBe('afterAmount')

    // מסמכים שלא היה להם customText ישן נשארים ריקים
    expect(result.borrowerReport.customBlocks).toEqual([])
    expect(result.donationReceipt.customBlocks).toEqual([])

    // אין מסגרת בתרחיש הזה
    expect(result.loan.frame).toBeUndefined()
  })

  it('תרחיש 3: customText + frame → בלוקים וגם מסגרת משוכפלת לכל 4 המסמכים', () => {
    const result = migrateDocumentLayouts({
      loan_document_text: 'טקסט מותאם לשטר הלוואה',
      deposit_document_text: 'טקסט מותאם לשטר הפקדה',
      gemach_document_frame: 'data:image/png;base64,iVBORw0KG==',
      gemach_frame_margin_top: 40,
      gemach_frame_margin_bottom: 50,
      gemach_frame_margin_right: 25,
      gemach_frame_margin_left: 25,
    })
    console.log('תרחיש 3 (customText + frame):', JSON.stringify(result))

    expect(result.loan.customBlocks).toHaveLength(1)
    expect(result.depositReceipt.customBlocks).toHaveLength(1)

    for (const doc of ['loan', 'borrowerReport', 'donationReceipt', 'depositReceipt'] as const) {
      expect(result[doc].frame).toBeDefined()
      expect(result[doc].frame?.imageBase64).toBe('data:image/png;base64,iVBORw0KG==')
      expect(result[doc].frame?.marginTop).toBe(40)
      expect(result[doc].frame?.marginBottom).toBe(50)
      expect(result[doc].frame?.marginRight).toBe(25)
      expect(result[doc].frame?.marginLeft).toBe(25)
    }

    // borrowerReport ו-donationReceipt לא היה להם customText ישן (אין להם עמודה ישנה בכלל),
    // אבל כן קיבלו את המסגרת המשוכפלת
    expect(result.borrowerReport.customBlocks).toEqual([])
    expect(result.donationReceipt.customBlocks).toEqual([])
  })
})
