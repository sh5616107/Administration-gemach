#!/usr/bin/env node
/**
 * יצירת hash לקוד מאסטר חדש.
 *
 * שימוש:
 *   node scripts/generateMasterCodeHash.cjs "הקוד-שבחרת"
 *
 * הפלט (salt:hash) מודבק כערך של MASTER_CODE_HASH ב-
 * src/services/protection.ts, במקום ה-placeholder הקיים.
 *
 * חשוב:
 * - הקוד עצמו (הטקסט הגלוי) לא נשמר בשום מקום בקוד/git - רק ה-hash.
 * - תשמור את הקוד עצמו במקום פרטי (password manager וכו') - אם שוכחים
 *   אותו, צריך להריץ את הסקריפט הזה שוב עם קוד חדש ולהחליף את ה-hash.
 * - זהו בדיוק אותו אלגוריתם (SHA-256 + salt) שמשמש לסיסמת המשתמש
 *   ב-protection.ts, כדי לא להוסיף תלות/שיטה חדשה.
 */

const crypto = require('crypto')

const code = process.argv[2]

if (!code) {
  console.error('שימוש: node scripts/generateMasterCodeHash.cjs "הקוד-שבחרת"')
  process.exit(1)
}

if (code.length < 6) {
  console.warn('⚠️  אזהרה: קוד קצר מ-6 תווים קל יותר לניחוש. מומלץ קוד ארוך יותר.')
}

const salt = crypto.randomBytes(16).toString('hex')
const hash = crypto.createHash('sha256').update(code + salt, 'utf8').digest('hex')
const result = `${salt}:${hash}`

console.log('\nהדבק את השורה הבאה ב-src/services/protection.ts במקום MASTER_CODE_HASH הנוכחי:\n')
console.log(`const MASTER_CODE_HASH = '${result}'\n`)
