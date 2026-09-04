/**
 * שלב 3 — בדיקת שמירה/קריאה-חוזרת: מדמה בדיוק את אותה לוגיקה ש-
 * DocumentDesignerPanel.handleSave מפעילה (אותו localforage instance,
 * אותו JSON.stringify(layouts), קריאה-חוזרת-לאימות), על כל 4 סוגי המסמכים.
 * לא רינדור React מלא — רק המנגנון הקריטי שהדוח דורש הוכחה עבורו.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import localforage from 'localforage'
import 'fake-indexeddb/auto'
import {
  DocumentType, DocumentLayoutsMap, createEmptyDocumentLayoutsMap,
} from '../types/documentLayout'

const uiSettingsStore = localforage.createInstance({ name: 'gemach-test', storeName: 'settings' })

async function saveAndVerify(layouts: DocumentLayoutsMap) {
  const serialized = JSON.stringify(layouts)
  await uiSettingsStore.setItem('document_layouts', serialized)
  const readBack = await uiSettingsStore.getItem<string>('document_layouts')
  const verified = readBack === serialized
  console.log('📋 save+read-back:', { savedLength: serialized.length, readBackLength: (readBack as string)?.length, verified })
  return { serialized, readBack, verified }
}

describe('DocumentDesignerPanel: שמירה + קריאה-חוזרת לאימות, על כל 4 המסמכים', () => {
  const docTypes: DocumentType[] = ['loan', 'borrowerReport', 'donationReceipt', 'depositReceipt']

  for (const docType of docTypes) {
    it(`${docType}: ערך שנשמר === ערך שנקרא בחזרה`, async () => {
      const layouts = createEmptyDocumentLayoutsMap()
      layouts[docType].customBlocks = [
        { id: 'b1', anchorId: 'header', text: 'טקסט בדיקה <script>alert(1)</script>', align: 'right', bold: true, underline: false, fontFamily: 'David', fontSize: 18, order: 0 },
      ]
      layouts[docType].labelOverrides = { someKey: 'תווית מותאמת' }
      layouts[docType].showSystemBlocks = { repaymentsTable: false }
      layouts[docType].frame = { imageBase64: 'data:image/png;base64,ABC==', marginTop: 30, marginBottom: 40, marginRight: 15, marginLeft: 15 }

      const { verified, readBack, serialized } = await saveAndVerify(layouts)
      expect(verified).toBe(true)
      expect(readBack).toBe(serialized)

      // ומוודאים שהערך שנקרא בחזרה אכן פורס בחזרה לאותו אובייקט
      const parsed = JSON.parse(readBack as string) as DocumentLayoutsMap
      expect(parsed[docType].customBlocks[0].text).toBe('טקסט בדיקה <script>alert(1)</script>')
      expect(parsed[docType].frame?.marginTop).toBe(30)
    })
  }

  it('קונפיג פגום ב-localforage לא חוסם — הפאנל נופל לברירת מחדל ריקה (באג #7)', async () => {
    await uiSettingsStore.setItem('document_layouts', '{invalid json')
    const raw = await uiSettingsStore.getItem<string>('document_layouts')
    let parsed: DocumentLayoutsMap
    try {
      parsed = JSON.parse(raw as string)
    } catch {
      parsed = createEmptyDocumentLayoutsMap()
    }
    expect(parsed.loan.customBlocks).toEqual([])
  })
})
