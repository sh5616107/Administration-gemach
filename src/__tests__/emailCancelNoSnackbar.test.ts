/**
 * רגרסיה: ביטול חלון עריכת המייל הציג הודעת שגיאה אדומה ("השליחה בוטלה"),
 * כי כל נקודות הקריאה הציגו כל success:false כשגיאה.
 * הבדיקה סורקת את קוד המקור: כל קריאה ל-openEmailWithDocument ששומרת את
 * התוצאה חייבת לטפל ב-result.cancelled לפני שהיא מציגה הודעה.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : walk(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('callers of openEmailWithDocument', () => {
  const files = walk(join(process.cwd(), 'src')).filter(
    (f) => !f.endsWith('documents.ts')
  )
  const callPattern = /const result = await openEmailWithDocument\(/g

  it('ignore a cancelled send instead of showing it as an error', () => {
    const offenders: string[] = []
    let calls = 0
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(callPattern)) {
        calls++
        const after = source.slice(match.index!, match.index! + 700)
        if (!after.includes('result.cancelled')) offenders.push(file)
      }
    }
    expect(calls).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
