// טיפוסים עבור פאנל עיצוב שטרות ודוחות (Document Designer Panel)
// ר' src/hooks/useSettings.ts (השדה document_layouts) ו-src/services/documents.ts
// (buildXxxDocumentHtml, שלב 2 בתהליך המימוש).

export type DocumentType = 'loan' | 'borrowerReport' | 'donationReceipt' | 'depositReceipt'

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
  }
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
}
