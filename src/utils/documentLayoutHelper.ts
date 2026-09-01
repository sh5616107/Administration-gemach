import { DocumentType, DocumentLayoutConfig, DocumentLayoutsMap, createEmptyDocumentLayoutsMap } from '../types/documentLayout'

/**
 * מחלץ בבטחה את DocumentLayoutConfig הרלוונטי מתוך settings.document_layouts
 * (מחרוזת JSON). קונפיג פגום/חסר לעולם לא חוסם הדפסה/אימייל — נופל לריק
 * (ר' באג #7 במסמך ההוראות). משמש בכל 6 קבצי המסך בשלב 4.
 */
export function getDocumentLayout(documentLayoutsJson: string | undefined, docType: DocumentType): DocumentLayoutConfig | undefined {
  if (!documentLayoutsJson) return undefined
  try {
    const parsed = JSON.parse(documentLayoutsJson) as DocumentLayoutsMap
    return parsed[docType]
  } catch (error) {
    console.error(`❌ document_layouts פגום, נופל לקונפיג ריק עבור ${docType}:`, error)
    return createEmptyDocumentLayoutsMap()[docType]
  }
}
