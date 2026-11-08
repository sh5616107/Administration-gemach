import { describe, it, expect } from 'vitest'
import { explainLockError, isLockError, retryOnLock } from '../services/storage/fileRetry'

const ACCESS = 'failed to rename old path: a.tmp to new path: a with error: Access is denied. (os error 5)'
const noSleep = async () => {}

describe('fileRetry - נעילת קובץ ב-Windows', () => {
  it('מזהה שגיאות נעילה (ולא שגיאות אחרות)', () => {
    expect(isLockError(new Error(ACCESS))).toBe(true)
    expect(isLockError(new Error('The process cannot access the file because it is being used by another process. (os error 32)'))).toBe(true)
    expect(isLockError(new Error('disk full'))).toBe(false)
    expect(isLockError(new Error('No such file (os error 2)'))).toBe(false)
  })

  it('נעילה זמנית: מצליח אחרי כמה ניסיונות', async () => {
    let calls = 0
    const waits: number[] = []
    const out = await retryOnLock(
      async () => {
        if (++calls < 3) throw new Error(ACCESS)
        return 'ok'
      },
      [10, 20, 30],
      async ms => { waits.push(ms) }
    )
    expect(out).toBe('ok')
    expect(calls).toBe(3)
    expect(waits).toEqual([10, 20])
  })

  it('נעילה מתמשכת: מוותר אחרי כל ההשהיות וזורק את השגיאה', async () => {
    let calls = 0
    await expect(
      retryOnLock(async () => { calls++; throw new Error(ACCESS) }, [1, 1], noSleep)
    ).rejects.toThrow(/Access is denied/)
    expect(calls).toBe(3)
  })

  it('שגיאה שאינה נעילה נזרקת מיד, בלי ניסיון חוזר', async () => {
    let calls = 0
    await expect(retryOnLock(async () => { calls++; throw new Error('disk full') }, [1, 1], noSleep)).rejects.toThrow('disk full')
    expect(calls).toBe(1)
  })

  it('הסבר בעברית נוסף רק לשגיאת נעילה', () => {
    expect(explainLockError(new Error(ACCESS)).message).toMatch(/נעול על ידי תוכנה אחרת.*נסה שוב עכשיו/)
    expect(explainLockError(new Error('disk full')).message).toBe('disk full')
  })
})
