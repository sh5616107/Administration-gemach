/**
 * טעינת מנוע ה-SQLite (sql.js, WebAssembly) - נטען רק בעת הצורך, כדי לא להכביד
 * על טעינת האפליקציה בסביבות שאינן משתמשות בו.
 */

import type { SqlJsStatic } from 'sql.js'

let cached: Promise<SqlJsStatic> | null = null
let testOverride: (() => Promise<SqlJsStatic>) | null = null

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (testOverride) return testOverride()
  if (!cached) {
    cached = (async () => {
      const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
        import('sql.js'),
        import('sql.js/dist/sql-wasm-browser.wasm?url'),
      ])
      // כל בקשה לקובץ ה-wasm מופנית לכתובת שה-bundler הפיק עבורו
      return initSqlJs({ locateFile: () => wasmUrl })
    })()
    cached.catch(() => {
      cached = null // מאפשר ניסיון חוזר בפעם הבאה
    })
  }
  return cached
}

/** לשימוש בטסטים בלבד */
export function __setSqlJsLoaderForTests(loader: (() => Promise<SqlJsStatic>) | null): void {
  testOverride = loader
  cached = null
}
