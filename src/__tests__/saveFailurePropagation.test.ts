/**
 * לפני התיקון: borrowersService/guarantorsService/loansService.create/update/delete
 * היו "fire and forget" - קוראות ל-setItem() שמפעיל saveData() ברקע בלי await.
 * אם הכתיבה בפועל לדיסק נכשלה (הרשאות, דיסק מלא, וכו'), ה-create/update/delete
 * היו נראות כאילו הצליחו, וה-UI (LoansTab.tsx, BorrowersTab.tsx, GuarantorsTab.tsx
 * וכו') היה מציג "נשמר בהצלחה" למרות שהנתונים בפועל לא הגיעו לדיסק.
 *
 * אחרי התיקון: כל אחת מהפעולות האלה מחכה בפועל ל-flushPendingSave(), כך שכישלון
 * כתיבה אמיתי מפיל את ה-Promise, ומגיע ל-catch הקיים כבר בקומפוננטות (שכבר יודע
 * להציג Snackbar עם השגיאה למשתמש).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { saveAppData } from '../services/persistence'
import { borrowersService, guarantorsService, loansService, resetDatabase } from '../services/database'

describe('הפצת כשלי שמירה לדיסק (regression)', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
    ;(saveAppData as any).mockResolvedValue(undefined)
  })

  it('borrowersService.create נכשל אם הכתיבה לדיסק נכשלת', async () => {
    ;(saveAppData as any).mockRejectedValueOnce(new Error('disk full'))

    await expect(
      borrowersService.create({
        first_name: 'משה', last_name: 'כהן', phone: '0501234567',
        id_number: '', address: '', email: '', notes: ''
      })
    ).rejects.toThrow('disk full')
  })

  it('borrowersService.update נכשל אם הכתיבה לדיסק נכשלת', async () => {
    const b = await borrowersService.create({
      first_name: 'משה', last_name: 'כהן', phone: '0501234567',
      id_number: '', address: '', email: '', notes: ''
    })

    ;(saveAppData as any).mockRejectedValueOnce(new Error('disk full'))
    await expect(
      borrowersService.update(b.lastInsertRowid, { phone: '0509999999' })
    ).rejects.toThrow('disk full')
  })

  it('guarantorsService.create נכשל אם הכתיבה לדיסק נכשלת', async () => {
    ;(saveAppData as any).mockRejectedValueOnce(new Error('disk full'))

    await expect(
      guarantorsService.create({
        first_name: 'דוד', last_name: 'לוי', phone: '0521234567',
        id_number: '', address: '', email: '', notes: ''
      })
    ).rejects.toThrow('disk full')
  })

  it('loansService.create נכשל אם הכתיבה לדיסק נכשלת', async () => {
    const b = await borrowersService.create({
      first_name: 'משה', last_name: 'כהן', phone: '0501234567',
      id_number: '', address: '', email: '', notes: ''
    })

    // loansService.create מפעיל יותר מכתיבה אחת (generateNumericId מעדכן מונה
    // לפני ה-setItem('loans', ...) עצמו) - כשל אמיתי בדיסק (לא זמני) נשאר כשל
    // בכל ניסיון כתיבה, אז משתמשים ב-mockRejectedValue (לא Once) כדי לדמות את זה.
    ;(saveAppData as any).mockRejectedValue(new Error('disk full'))
    await expect(
      loansService.create({
        borrower_id: b.lastInsertRowid,
        amount: 1000,
        loan_date: '2026-01-15',
        loan_type: 'fixed',
        due_date: '2026-06-15',
        auto_repayment: 0,
        is_recurring: 0
      })
    ).rejects.toThrow('disk full')
  })

  it('loansService.delete נכשל אם הכתיבה לדיסק נכשלת', async () => {
    const b = await borrowersService.create({
      first_name: 'משה', last_name: 'כהן', phone: '0501234567',
      id_number: '', address: '', email: '', notes: ''
    })
    const l = await loansService.create({
      borrower_id: b.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      due_date: '2026-06-15',
      auto_repayment: 0,
      is_recurring: 0
    })

    ;(saveAppData as any).mockRejectedValueOnce(new Error('disk full'))
    await expect(
      loansService.delete(l.lastInsertRowid)
    ).rejects.toThrow('disk full')
  })

  it('הצלחה רגילה עדיין עובדת (לא שברנו את המקרה החיובי)', async () => {
    const b = await borrowersService.create({
      first_name: 'משה', last_name: 'כהן', phone: '0501234567',
      id_number: '', address: '', email: '', notes: ''
    })
    expect(b.lastInsertRowid).toBeDefined()

    const all = await borrowersService.getAll()
    expect(all).toHaveLength(1)
  })
})
