/**
 * sqliteSnapshot.ts
 * -----------------
 * תרגום נאמן בין "אובייקט הנתונים של האפליקציה" (DataStore ב-database.ts: אוסף
 * stores, כל store הוא מפה id -> רשומה) לבין מסד נתונים SQLite.
 *
 * עקרונות (מכוונים להבטיח שהמעבר ל-SQLite לא ישנה התנהגות):
 *  1. כל רשומה נשמרת כ-JSON מלא בעמודת data. JSON היא מקור האמת - אין עמודות כפולות
 *     שעלולות להיות לא עקביות. הקוד העסקי (database.ts ומעלה) לא משתנה בכלל.
 *  2. הסריאליזציה זהה בדיוק למה שנעשה עד היום בקובץ ה-JSON (JSON.stringify), ולכן
 *     מה שנטען חזרה זהה למה שנטען בעבר מ-gemach_data.json.
 *  3. סדר הרשומות בתוך כל store נשמר (עמודת seq), כי getAllItems מחזיר Object.values.
 *  4. אין אובדן מידע: מפתחות-על לא מוכרים, או store שאינו מפה רגילה, נשמרים כ-JSON
 *     בטבלת extras. רשימת המפתחות שהיו קיימים נשמרת ב-meta כדי לשחזר את המבנה המדויק.
 *  5. כתיבה אינקרמנטלית: בכל שמירה נכתבים רק ההבדלים מהמצב האחרון שנשמר, בתוך
 *     טרנזקציה אחת (הכול או כלום).
 */

import type { Database } from 'sql.js'

export const SCHEMA_VERSION = 1

/** שם store באפליקציה -> שם טבלה. רשימה קבועה בקוד (אין שמות טבלאות שנגזרים מנתונים). */
export const STORE_TABLES: Readonly<Record<string, string>> = {
  settings: 'settings',
  borrowers: 'borrowers',
  guarantors: 'guarantors',
  loans: 'loans',
  repayments: 'repayments',
  donors: 'donors',
  donations: 'donations',
  depositors: 'depositors',
  deposits: 'deposits',
  depositWithdrawals: 'deposit_withdrawals',
  blacklist: 'blacklist',
  expenses: 'expenses',
  guarantorLoans: 'guarantor_loans',
  guarantorLoanRepayments: 'guarantor_loan_repayments',
  guarantorRefunds: 'guarantor_refunds',
  waitlist: 'waitlist',
  contacts: 'contacts',
  attachments: 'attachments',
  auditLog: 'audit_log',
  feePayments: 'fee_payments',
  funds: 'funds',
}

const META_PRESENT_KEYS = 'present_keys'
const META_ROW_COUNTS = 'row_counts'
const META_SCHEMA_VERSION = 'schema_version'

export interface StoreState {
  /** מזהי הרשומות לפי סדר ההכנסה */
  keys: string[]
  /** id -> JSON של הרשומה */
  json: Map<string, string>
}

export interface SnapshotState {
  /** stores שנשמרים כטבלה (שם store באפליקציה -> מצב) */
  tables: Map<string, StoreState>
  /** מפתחות-על שנשמרים כ-JSON בטבלת extras */
  extras: Map<string, string>
  /** כל מפתחות-העל שהיו באובייקט, לפי הסדר */
  presentKeys: string[]
}

const EMPTY_STORE: StoreState = { keys: [], json: new Map() }

export function emptyState(): SnapshotState {
  return { tables: new Map(), extras: new Map(), presentKeys: [] }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isKnownStore(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(STORE_TABLES, name)
}

/**
 * מפתחות שנראים כמספר שלם אי-שלילי (למשל "12") ממוינים ע"י מנוע JS בעצמו בתחילת
 * האובייקט, בלי קשר לסדר ההכנסה - לכן אינם נכללים בבדיקת הסדר.
 */
function isIntegerKey(k: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(k) && Number(k) < 4294967295
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** בונה את מצב ה"צילום" מאובייקט הנתונים. זורק אם הנתונים אינם ניתנים לסריאליזציה. */
export function buildState(obj: unknown): SnapshotState {
  if (!isPlainObject(obj)) {
    throw new Error('נתוני האפליקציה אינם אובייקט תקין - השמירה בוטלה')
  }
  const state = emptyState()
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (isKnownStore(key) && isPlainObject(value)) {
      const store: StoreState = { keys: [], json: new Map() }
      for (const id of Object.keys(value)) {
        const s = JSON.stringify(value[id])
        // כמו JSON.stringify של אובייקט שלם: ערך undefined נעלם
        if (s === undefined) continue
        store.keys.push(id)
        store.json.set(id, s)
      }
      state.tables.set(key, store)
      state.presentKeys.push(key)
    } else {
      const s = JSON.stringify(value)
      if (s === undefined) continue
      state.extras.set(key, s)
      state.presentKeys.push(key)
    }
  }
  return state
}

function quote(table: string): string {
  return `"${table}"`
}

/** יוצר סכימה ריקה. בטוח להריץ שוב (IF NOT EXISTS). */
export function createSchema(db: Database, version: number = SCHEMA_VERSION): void {
  const statements: string[] = [
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS extras (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
  ]
  for (const table of Object.values(STORE_TABLES)) {
    statements.push(
      `CREATE TABLE IF NOT EXISTS ${quote(table)} (` +
        'seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, data TEXT NOT NULL)'
    )
  }
  db.run('BEGIN')
  try {
    for (const sql of statements) db.run(sql)
    db.run(
      'INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)',
      [META_SCHEMA_VERSION, String(version)]
    )
    db.run(`PRAGMA user_version = ${version}`)
    db.run('COMMIT')
  } catch (e) {
    safeRollback(db)
    throw e
  }
}

/** שלבי שדרוג מבנה: מפתח N = שדרוג ממבנה N למבנה N+1. כרגע אין (המבנה היחיד הוא 1). */
export type SchemaMigrations = Record<number, (db: Database) => void>
export const SCHEMA_MIGRATIONS: SchemaMigrations = {}

/**
 * משדרג מסד ממבנה `from` למבנה `to` בטרנזקציה אחת. אם חסר שלב כלשהו או שהוא נכשל -
 * זורק, והמסד נשאר כפי שהיה. (הקורא אחראי לשמור עותק לפני כתיבת התוצאה לדיסק.)
 */
export function upgradeSchema(
  db: Database,
  from: number,
  to: number,
  migrations: SchemaMigrations = SCHEMA_MIGRATIONS
): void {
  for (let v = from; v < to; v++) {
    if (typeof migrations[v] !== 'function') throw new Error(`אין שלב שדרוג ממבנה ${v} למבנה ${v + 1}`)
  }
  db.run('BEGIN')
  try {
    for (let v = from; v < to; v++) migrations[v](db)
    upsertMeta(db, META_SCHEMA_VERSION, String(to))
    db.run(`PRAGMA user_version = ${to}`)
    db.run('COMMIT')
  } catch (e) {
    safeRollback(db)
    throw e
  }
}

/** מספר הרשומות בכל store (כל ה-stores המוכרים, גם ריקים) כ-JSON יציב - נשמר ב-meta לזיהוי אובדן שורות */
function countsJson(state: SnapshotState): string {
  const counts: Record<string, number> = {}
  for (const store of Object.keys(STORE_TABLES)) {
    counts[store] = state.tables.get(store)?.keys.length ?? 0
  }
  return JSON.stringify(counts)
}

/** ערך meta.schema_version כמספר (NaN אם חסר/לא תקין) */
export function readMetaSchemaVersion(db: Database): number {
  const rows = selectAll(db, `SELECT key, value FROM meta WHERE key = '${META_SCHEMA_VERSION}'`)
  return rows.length === 1 ? Number(rows[0][1]) : NaN
}

/** בדיקה זולה: מספר השורות בכל טבלה תואם meta.row_counts. זורק אם לא. */
export function verifyRowCounts(db: Database): void {
  const rows = selectAll(db, `SELECT value FROM meta WHERE key = '${META_ROW_COUNTS}'`)
  if (rows.length !== 1) throw new Error('meta.row_counts חסר')
  const expected = JSON.parse(rows[0][0]) as Record<string, unknown>
  for (const [store, table] of Object.entries(STORE_TABLES)) {
    const actual = Number(selectAll(db, `SELECT COUNT(*) FROM ${quote(table)}`)[0][0])
    if (expected[store] !== actual) throw new Error(`מספר הרשומות ב-"${store}" אינו תואם`)
  }
}

function safeRollback(db: Database): void {
  try {
    db.run('ROLLBACK')
  } catch {
    // אין טרנזקציה פעילה - אין מה לבטל
  }
}

/** האם מדובר בשינוי שניתן לבצע בלי לשבש את הסדר (ר' תיאור בגוף syncTable) */
function canApplyIncrementally(a: StoreState, b: StoreState): boolean {
  const aNon = a.keys.filter(k => !isIntegerKey(k))
  const bNon = b.keys.filter(k => !isIntegerKey(k))
  const commonA = aNon.filter(k => b.json.has(k))
  const commonB = bNon.filter(k => a.json.has(k))
  if (!sameArray(commonA, commonB)) return false
  const added = bNon.filter(k => !a.json.has(k))
  return sameArray(bNon, commonB.concat(added))
}

function sameStore(a: StoreState, b: StoreState): boolean {
  if (!sameArray(a.keys, b.keys)) return false
  for (const k of a.keys) if (a.json.get(k) !== b.json.get(k)) return false
  return true
}

/** לבדיקות בלבד: מכריח כתיבה מצטברת גם כשהיא לא בטוחה, כדי לוודא שרשת הביטחון תופסת */
let forceIncrementalForTests = false
export function __setForceIncrementalForTests(v: boolean): void {
  forceIncrementalForTests = v
}

/** האם סדר המזהים בטבלה (לפי seq) זהה בדיוק למצב המבוקש */
function idsMatchInOrder(db: Database, quotedTable: string, keys: string[]): boolean {
  const stmt = db.prepare(`SELECT id FROM ${quotedTable} ORDER BY seq`)
  try {
    let i = 0
    while (stmt.step()) {
      if (i >= keys.length || String(stmt.get()[0]) !== keys[i]) return false
      i++
    }
    return i === keys.length
  } finally {
    stmt.free()
  }
}

/** מסנכרן טבלה אחת מ-a (מה שבמסד) ל-b (המצב החדש). מחזיר true אם שונה משהו. */
function syncTable(db: Database, table: string, a: StoreState, b: StoreState): boolean {
  if (a.keys.length === 0 && b.keys.length === 0) return false
  if (sameStore(a, b)) return false

  const t = quote(table)

  if (!forceIncrementalForTests && !canApplyIncrementally(a, b)) {
    // הסדר היחסי השתנה (למשל מחיקה והוספה מחדש של אותו מזהה, או בנייה מחדש של
    // האובייקט): כותבים את כל הטבלה מחדש בסדר הנכון.
    db.run(`DELETE FROM ${t}`)
    insertAll(db, t, b, b.keys)
    return true
  }

  const del = db.prepare(`DELETE FROM ${t} WHERE id = ?`)
  const upd = db.prepare(`UPDATE ${t} SET data = ? WHERE id = ?`)
  try {
    for (const id of a.keys) {
      if (!b.json.has(id)) del.run([id])
    }
    for (const id of b.keys) {
      if (a.json.has(id) && a.json.get(id) !== b.json.get(id)) {
        upd.run([b.json.get(id) as string, id])
      }
    }
  } finally {
    del.free()
    upd.free()
  }
  insertAll(db, t, b, b.keys.filter(id => !a.json.has(id)))

  // רשת ביטחון: לוגיקת הכתיבה המצטברת עדינה (סדר, מזהים מספריים). אחרי כל כתיבה כזו מוודאים
  // שסדר המזהים בטבלה זהה בדיוק למבוקש (קריאת מזהים בלבד - זול), ואם לא - כותבים את הטבלה מחדש.
  if (!idsMatchInOrder(db, t, b.keys)) {
    db.run(`DELETE FROM ${t}`)
    insertAll(db, t, b, b.keys)
  }
  return true
}

function insertAll(db: Database, quotedTable: string, state: StoreState, ids: string[]): void {
  if (ids.length === 0) return
  const ins = db.prepare(`INSERT INTO ${quotedTable} (id, data) VALUES (?, ?)`)
  try {
    for (const id of ids) ins.run([id, state.json.get(id) as string])
  } finally {
    ins.free()
  }
}

function upsertMeta(db: Database, key: string, value: string): void {
  db.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  )
}

/**
 * מחיל על המסד את ההבדלים בין prev (מה שנשמר עד כה) ל-next, בטרנזקציה אחת.
 * אם משהו נכשל - מתבצע ROLLBACK והשגיאה נזרקת; המסד נשאר בדיוק כפי שהיה.
 * מחזיר true אם בוצע שינוי כלשהו במסד.
 */
export function applyState(db: Database, prev: SnapshotState | null, next: SnapshotState): boolean {
  const p = prev ?? emptyState()
  let changed = false

  db.run('BEGIN')
  try {
    for (const [store, table] of Object.entries(STORE_TABLES)) {
      const a = p.tables.get(store) ?? EMPTY_STORE
      const b = next.tables.get(store) ?? EMPTY_STORE
      if (syncTable(db, table, a, b)) changed = true
    }

    for (const key of p.extras.keys()) {
      if (!next.extras.has(key)) {
        db.run('DELETE FROM extras WHERE key = ?', [key])
        changed = true
      }
    }
    for (const [key, json] of next.extras) {
      if (p.extras.get(key) !== json) {
        db.run(
          'INSERT INTO extras (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, json]
        )
        changed = true
      }
    }

    const prevKeys = JSON.stringify(p.presentKeys)
    const nextKeys = JSON.stringify(next.presentKeys)
    if (prev === null || prevKeys !== nextKeys) {
      upsertMeta(db, META_PRESENT_KEYS, nextKeys)
      changed = true
    }
    const nextCounts = countsJson(next)
    if (prev === null || countsJson(p) !== nextCounts) {
      upsertMeta(db, META_ROW_COUNTS, nextCounts)
      changed = true
    }

    db.run('COMMIT')
  } catch (e) {
    safeRollback(db)
    throw e
  }
  return changed
}

function defineOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  } else {
    target[key] = value
  }
}

function selectAll(db: Database, sql: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const stmt = db.prepare(sql)
  try {
    while (stmt.step()) {
      const row = stmt.get()
      out.push([String(row[0]), String(row[1])])
    }
  } finally {
    stmt.free()
  }
  return out
}

/**
 * קורא את כל המסד לאובייקט נתונים + מצב ה"צילום" התואם (לשימוש בהבדלים בשמירה הבאה).
 * הנתונים שמוחזרים הם עותק חדש לגמרי (JSON.parse), ללא שיתוף הפניות עם המצב.
 */
export function readSnapshot(db: Database): { data: Record<string, unknown>; state: SnapshotState } {
  const state = emptyState()
  const tableObjects = new Map<string, Record<string, unknown>>()

  for (const [store, table] of Object.entries(STORE_TABLES)) {
    const rows = selectAll(db, `SELECT id, data FROM ${quote(table)} ORDER BY seq`)
    const st: StoreState = { keys: [], json: new Map() }
    const obj: Record<string, unknown> = {}
    for (const [id, json] of rows) {
      st.keys.push(id)
      st.json.set(id, json)
      defineOwn(obj, id, JSON.parse(json))
    }
    if (rows.length > 0) {
      state.tables.set(store, st)
      tableObjects.set(store, obj)
    }
  }

  const extraObjects = new Map<string, unknown>()
  for (const [key, json] of selectAll(db, 'SELECT key, value FROM extras')) {
    state.extras.set(key, json)
    extraObjects.set(key, JSON.parse(json))
  }

  // ── בדיקות עקביות מלאות בין meta, extras והטבלאות. כל אי-התאמה = מסד פגום (לא "מתקנים" בשקט). ──
  const metaRows = selectAll(db, `SELECT key, value FROM meta WHERE key = '${META_PRESENT_KEYS}'`)
  if (metaRows.length !== 1) {
    throw new Error('meta.present_keys חסר - המסד אינו עקבי')
  }
  let present: unknown
  try {
    present = JSON.parse(metaRows[0][1])
  } catch {
    throw new Error('meta.present_keys פגום')
  }
  if (!Array.isArray(present) || present.some(k => typeof k !== 'string')) {
    throw new Error('meta.present_keys פגום')
  }
  const presentKeys = present as string[]
  const presentSet = new Set(presentKeys)
  if (presentSet.size !== presentKeys.length) {
    throw new Error('meta.present_keys מכיל מפתחות כפולים')
  }

  for (const key of presentKeys) {
    const inExtras = extraObjects.has(key)
    const hasRows = tableObjects.has(key)
    if (inExtras && hasRows) {
      throw new Error(`המפתח "${key}" מופיע גם ב-extras וגם בטבלה - המסד אינו עקבי`)
    }
    if (!inExtras && !isKnownStore(key)) {
      throw new Error(`המפתח "${key}" רשום ב-meta אך אינו קיים במסד`)
    }
  }
  for (const key of extraObjects.keys()) {
    if (!presentSet.has(key)) {
      throw new Error(`רשומה יתומה ב-extras ("${key}") שאינה רשומה ב-meta - המסד אינו עקבי`)
    }
  }
  for (const key of tableObjects.keys()) {
    if (!presentSet.has(key)) {
      throw new Error(`נתונים בטבלה "${key}" שאינה רשומה ב-meta - המסד אינו עקבי`)
    }
  }

  // מספר השורות בכל טבלה חייב להתאים למה שנרשם בשמירה האחרונה (מזהה שורות שנעלמו)
  const countRows = selectAll(db, `SELECT key, value FROM meta WHERE key = '${META_ROW_COUNTS}'`)
  if (countRows.length !== 1) {
    throw new Error('meta.row_counts חסר - המסד אינו עקבי')
  }
  let expectedCounts: unknown
  try {
    expectedCounts = JSON.parse(countRows[0][1])
  } catch {
    throw new Error('meta.row_counts פגום')
  }
  if (!isPlainObject(expectedCounts)) throw new Error('meta.row_counts פגום')
  for (const store of Object.keys(STORE_TABLES)) {
    const expected = expectedCounts[store]
    const actual = state.tables.get(store)?.keys.length ?? 0
    if (expected !== actual) {
      throw new Error(`מספר הרשומות ב-"${store}" (${actual}) שונה ממה שנשמר (${String(expected)}) - המסד אינו עקבי`)
    }
  }

  const data: Record<string, unknown> = {}
  for (const key of presentKeys) {
    if (extraObjects.has(key)) {
      defineOwn(data, key, extraObjects.get(key))
    } else {
      // store ריק (אין שורות) אך היה קיים באובייקט המקורי -> {}
      defineOwn(data, key, tableObjects.get(key) ?? {})
      if (!state.tables.has(key)) state.tables.set(key, { keys: [], json: new Map() })
    }
  }
  state.presentKeys = presentKeys

  return { data, state }
}

/** האם המסד מכיל נתונים כלשהם (לפי meta). */
export function hasPersistedData(state: SnapshotState | null): boolean {
  return state !== null && state.presentKeys.length > 0
}

/** כותב ל-meta ערכי מידע (מקור הנתונים, זמן מעבר וכו') - לאבחון בלבד, לא משפיע על הנתונים. */
export function writeInfoMeta(db: Database, info: Record<string, string>): void {
  db.run('BEGIN')
  try {
    for (const [k, v] of Object.entries(info)) upsertMeta(db, `info_${k}`, v)
    db.run('COMMIT')
  } catch (e) {
    safeRollback(db)
    throw e
  }
}
