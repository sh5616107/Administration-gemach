import { describe, it, expect } from 'vitest'
import { IRREVERSIBLE_DELETE_WARNING, confirmDeleteMessage } from '../utils/confirmDialog'

/**
 * רגרסיה: אין מנגנון Restore ב-UI למחיקות (soft delete או hard delete),
 * ולכן כל דיאלוג אישור מחיקה חייב לכלול את אזהרת אי-ההפיכות במפורש.
 * הטסט הזה מוודא שההתנהגות של הפונקציה המשותפת לא תישבר בטעות בעתיד -
 * למשל אם מישהו ינסה "לייעל" ולהסיר את השרשור של האזהרה.
 */
describe('confirmDeleteMessage', () => {
  it('always appends the irreversible-delete warning to the question', () => {
    const message = confirmDeleteMessage('האם למחוק את הלווה?')
    expect(message).toContain('האם למחוק את הלווה?')
    expect(message).toContain(IRREVERSIBLE_DELETE_WARNING)
  })

  it('keeps the warning text explicit about no recovery being possible', () => {
    expect(IRREVERSIBLE_DELETE_WARNING).toContain('בלתי הפיכה')
    expect(IRREVERSIBLE_DELETE_WARNING).toMatch(/לא ניתן|אין אפשרות/)
  })

  it('works with dynamically built questions (e.g. entity names interpolated)', () => {
    const message = confirmDeleteMessage(`האם למחוק את התורם ישראל ישראלי?`)
    expect(message).toContain('ישראל ישראלי')
    expect(message).toContain(IRREVERSIBLE_DELETE_WARNING)
  })
})
