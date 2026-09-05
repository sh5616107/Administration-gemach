// טיפוסים עבור פאנל עיצוב שטרות ודוחות (Document Designer Panel)
// ר' src/hooks/useSettings.ts (השדה document_layouts) ו-src/services/documents.ts
// (buildXxxDocumentHtml, שלב 2 בתהליך המימוש).

export type DocumentType = 'loan' | 'borrowerReport' | 'donationReceipt' | 'depositReceipt' | 'depositorReport'

export interface CustomTextBlock {
  id: string
  anchorId: string
  text: string
  align: 'right' | 'center' | 'left'
  bold: boolean
  underline: boolean
  fontFamily: DocumentFontFamily
  fontSize: number // px, 10–36
  order: number // תומך ביותר מבלוק אחד על אותו עוגן
}

// רשימת גופנים סגורה — ר' באג #3 במסמך ההוראות: לא input חופשי לשם גופן.
// עברית קלאסית לשטר רשמי כברירת מחדל, עם שתיים מודרניות כאופציה.
export const DOCUMENT_FONT_FAMILIES = [
  'Arial',
  'David',
  'Frank Ruehl CLM',
  'Rubik',
  'Assistant',
] as const

export type DocumentFontFamily = typeof DOCUMENT_FONT_FAMILIES[number]

export interface DocumentFrameConfig {
  imageBase64: string
  marginTop: number
  marginBottom: number
  marginRight: number
  marginLeft: number
}

export interface DocumentLayoutConfig {
  showSystemBlocks: Record<string, boolean>
  labelOverrides: Record<string, string>
  customBlocks: CustomTextBlock[]
  frame?: DocumentFrameConfig
}

export type DocumentLayoutsMap = Record<DocumentType, DocumentLayoutConfig>

export function createEmptyDocumentLayoutConfig(): DocumentLayoutConfig {
  return {
    showSystemBlocks: {},
    labelOverrides: {},
    customBlocks: [],
  }
}

export function createEmptyDocumentLayoutsMap(): DocumentLayoutsMap {
  return {
    loan: createEmptyDocumentLayoutConfig(),
    borrowerReport: createEmptyDocumentLayoutConfig(),
    donationReceipt: createEmptyDocumentLayoutConfig(),
    depositReceipt: createEmptyDocumentLayoutConfig(),
    depositorReport: createEmptyDocumentLayoutConfig(),
  }
}

/**
 * מנרמלת אובייקט layouts שנטען מהאחסון (JSON.parse על settings.document_layouts)
 * לכדי DocumentLayoutsMap תקין ומלא לכל סוגי המסמכים הידועים היום.
 *
 * למה זה קריטי: settings.document_layouts שנשמר לפני שנוסף סוג מסמך חדש
 * (למשל depositorReport) פשוט לא מכיל את המפתח הזה ב-runtime — הטיפוס
 * DocumentLayoutsMap לא קיים בפועל, הוא רק ברמת קומפילציה. `parsed.depositorReport`
 * במקרה כזה הוא `undefined` ממש, לא רק אובייקט ריק. זה שבר שני מקומות:
 * (1) copyFrameImageToAllDocuments שרץ על Object.keys(layouts) בפועל — פשוט
 *     דילג על מפתח שלא קיים, ולכן "העתק מסגרת לכל המסמכים" לא הגיע לסוג
 *     המסמך החדש.
 * (2) ברגע שנוגעים בבקרה כלשהי בטאב של סוג מסמך חדש (למשל הפעלת מסגרת),
 *     updateActiveLayout עושה `{ ...prev[activeTab], ...patch }` — כש-
 *     prev[activeTab] הוא undefined זה פשוט משאיר רק את ה-patch עצמו, בלי
 *     customBlocks/labelOverrides/showSystemBlocks. התוצאה נשמרת ב-state
 *     כאובייקט חלקי, ואז activeLayout.customBlocks.length קורס כי
 *     customBlocks הוא undefined (וזה כבר לא נופל ל-`?? createEmptyDocumentLayoutConfig()`
 *     כי האובייקט עצמו כן קיים, רק חלקי).
 *
 * הפתרון: תמיד לעבור על *כל* סוגי המסמכים הידועים (מ-createEmptyDocumentLayoutsMap,
 * לא מ-Object.keys של הקלט), ולמלא עבור כל אחד קונפיג מלא — אם קיים ב-parsed
 * ממזגים אותו מעל ברירת המחדל (כדי לא לאבד שדות שכן נשמרו, כמו frame), ואם
 * לא קיים בכלל נותנים קונפיג ריק מלא. ריפוי-עצמי גם לאובייקטים חלקיים שכבר
 * נשמרו בעבר עקב הבאג הזה (frame נשמר, לא נמחק — רק מתמלאים השדות החסרים).
 */
export function normalizeDocumentLayoutsMap(parsed: unknown): DocumentLayoutsMap {
  const empty = createEmptyDocumentLayoutsMap()
  const source = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<Record<DocumentType, Partial<DocumentLayoutConfig>>>

  const result = {} as DocumentLayoutsMap
  for (const docType of Object.keys(empty) as DocumentType[]) {
    const existing = source[docType]
    result[docType] = existing
      ? { ...createEmptyDocumentLayoutConfig(), ...existing }
      : createEmptyDocumentLayoutConfig()
  }
  return result
}

/**
 * מעתיקה רק את תמונת המסגרת (imageBase64) מ-sourceDocType לכל שאר סוגי
 * המסמכים — לא נוגעת בשוליים. אם למסמך יעד כבר יש מסגרת משלו, השוליים
 * שלו נשארים בלתי-נגועים (כל מסמך שונה בכמות/צפיפות תוכן, אין ערך שוליים
 * אחיד הגיוני). רק מסמך שעדיין אין לו מסגרת בכלל מקבל שוליים התחלתיים
 * (35/48/20/20), לכיוונון נפרד בהמשך דרך הפאנל.
 *
 * חשוב: עוברים על *כל* סוגי המסמכים הידועים היום (מ-createEmptyDocumentLayoutsMap),
 * לא רק על Object.keys(layouts) בפועל — אחרת סוג מסמך שנוסף אחרי ש-layouts
 * כבר נשמר באחסון (למשל depositorReport) פשוט לא קיים כמפתח ב-runtime,
 * והלולאה מדלגת עליו בשקט (ר' הבאג שתועד ב-normalizeDocumentLayoutsMap).
 */
export function copyFrameImageToAllDocuments(
  layouts: DocumentLayoutsMap,
  sourceDocType: DocumentType
): DocumentLayoutsMap {
  const sourceFrame = layouts[sourceDocType]?.frame
  if (!sourceFrame?.imageBase64) return layouts

  const next = { ...layouts }
  for (const docType of Object.keys(createEmptyDocumentLayoutsMap()) as DocumentType[]) {
    if (docType === sourceDocType) continue
    const current = next[docType] ?? createEmptyDocumentLayoutConfig()
    const existingFrame = current.frame
    next[docType] = {
      ...current,
      frame: existingFrame
        ? { ...existingFrame, imageBase64: sourceFrame.imageBase64 }
        : { imageBase64: sourceFrame.imageBase64, marginTop: 35, marginBottom: 48, marginRight: 20, marginLeft: 20 },
    }
  }
  return next
}


// עוגנים קבועים לכל סוג מסמך, מדויקים למבנה ה-HTML בפועל ב-documents.ts
// (לא קטגוריות כלליות). ר' סעיף "מקרה קצה" במסמך ההוראות לגבי afterRepaymentsTable
// ו-loanFullyRepaid: העוגן חייב להתקיים תמיד בזרימה גם כשהתוכן המותנה לא מוצג.
export interface AnchorDefinition {
  id: string
  label: string
  /** true = עוגן מותנה (מוצג רק כשתנאי מסוים מתקיים בפועל, ר' תיעוד anchoredCondition) */
  conditional?: boolean
  description?: string
}

export const DOCUMENT_ANCHORS: Record<DocumentType, AnchorDefinition[]> = {
  loan: [
    { id: 'header', label: 'כותרת המסמך (לפני הכל)' },
    { id: 'afterBorrowerName', label: 'אחרי שם הלווה', description: 'אחרי "אני הח״מ [שם הלווה]"' },
    { id: 'commitmentText', label: 'נוסח ההתחייבות', description: 'מחליף את נוסח ההתחייבות הרגיל בשטר' },
    { id: 'afterAmount', label: 'אחרי סכום ההלוואה' },
    { id: 'beforeRepaymentsTable', label: 'לפני טבלת הפירעונות' },
    {
      id: 'afterRepaymentsTable',
      label: 'אחרי טבלת הפירעונות',
      description: 'קיים תמיד בזרימה גם כשאין פירעונות (fallback: מיד אחרי beforeRepaymentsTable)',
    },
    {
      id: 'loanFullyRepaid',
      label: 'הלוואה נפרעה במלואה',
      conditional: true,
      description: 'מוצג רק כאשר remaining <= 0 && repayments.length > 0',
    },
    { id: 'beforeSignature', label: 'לפני שורת החתימה' },
    { id: 'afterGuarantors', label: 'אחרי פרטי הערבים', conditional: true, description: 'מוצג רק אם יש ערב 1 ו/או ערב 2' },
    { id: 'footer', label: 'תחתית המסמך (אחרי תאריך הפקה)' },
  ],
  borrowerReport: [
    { id: 'header', label: 'כותרת הדוח' },
    { id: 'afterSummaryBox', label: 'אחרי תיבת הסיכום הכללי' },
    { id: 'beforeLoansTable', label: 'לפני טבלת ההלוואות' },
    { id: 'afterLoansTable', label: 'אחרי טבלת ההלוואות' },
    { id: 'beforeRepaymentsTable', label: 'לפני טבלת הפירעונות', conditional: true, description: 'מוצג רק אם יש פירעונות כלשהם' },
    { id: 'afterRepaymentsTable', label: 'אחרי טבלת הפירעונות', conditional: true },
    { id: 'beforeExpensesTable', label: 'לפני טבלת ההוצאות', conditional: true, description: 'מוצג רק אם יש הוצאות' },
    { id: 'afterExpensesTable', label: 'אחרי טבלת ההוצאות', conditional: true },
    { id: 'footer', label: 'תחתית הדוח' },
  ],
  donationReceipt: [
    { id: 'header', label: 'כותרת הקבלה' },
    { id: 'afterReceiptNumber', label: 'אחרי מספר הקבלה' },
    { id: 'afterDonorName', label: 'אחרי שם התורם' },
    { id: 'afterAmount', label: 'אחרי סכום התרומה' },
    { id: 'beforeThankYou', label: 'לפני שורת "תודה רבה"' },
    { id: 'afterThankYou', label: 'אחרי שורת "יישר כח"' },
    { id: 'beforeSignature', label: 'לפני חתימת הגמ"ח' },
  ],
  depositReceipt: [
    { id: 'header', label: 'כותרת שטר ההפקדה' },
    { id: 'afterDepositorName', label: 'אחרי שם המפקיד' },
    { id: 'afterAmount', label: 'אחרי סכום ההפקדה' },
    { id: 'beforeWithdrawalsTable', label: 'לפני טבלת המשיכות' },
    {
      id: 'afterWithdrawalsTable',
      label: 'אחרי טבלת המשיכות',
      description: 'קיים תמיד בזרימה גם כשאין משיכות (fallback: מיד אחרי beforeWithdrawalsTable)',
    },
    { id: 'beforeSignature', label: 'לפני שורות החתימה' },
    { id: 'footer', label: 'תחתית המסמך (אחרי תאריך הפקה)' },
  ],
  depositorReport: [
    { id: 'header', label: 'כותרת הדוח' },
    { id: 'afterSummaryBox', label: 'אחרי תיבת הסיכום הכללי' },
    { id: 'beforeDepositsTable', label: 'לפני טבלת ההפקדות' },
    { id: 'afterDepositsTable', label: 'אחרי טבלת ההפקדות' },
    { id: 'footer', label: 'תחתית הדוח' },
  ],
}
