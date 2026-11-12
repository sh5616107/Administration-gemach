/**
 * בדיקות למבנה 2: עמודות נגזרות ואינדקסים מעל ה-JSON.
 * העקרונות שנבדקים:
 *  1. ה-JSON נשאר מקור האמת ולא משתנה (שדרוג, כתיבה, פתיחה מחדש).
 *  2. ערכי העמודות הנגזרות זהים למה שהקוד העסקי היה מחשב מהאובייקט בזיכרון.
 *  3. שאילתות SQL נותנות אותה תוצאה כמו הלוגיקה הקיימת, ומשתמשות באינדקסים.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fc from 'fast-check'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  DERIVED_TABLES,
  applyDerivedSchema,
  indexName,
  listMissingDerivedSchema,
} from '../services/storage/derivedSchema'
import {
  SCHEMA_MIGRATIONS,
  SCHEMA_VERSION,
  STORE_TABLES,
  applyState,
  buildState,
  createSchema,
  readSnapshot,
  upgradeSchema,
} from '../services/storage/sqliteSnapshot'
import { DB_FILE, PREV_FILE, SqliteBackend } from '../services/storage/sqliteBackend'
import { MemoryStorageIO, makeSampleData } from './helpers/memoryStorageIO'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs()
})

const rows = (db: Database, sql: string, params: Array<string | number> = []): unknown[][] => {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const out: unknown[][] = []
    while (stmt.step()) out.push(stmt.get())
    return out
  } finally {
    stmt.free()
  }
}

function v1Db(data: unknown): Database {
  const db = new SQL.Database()
  createSchema(db, 1)
  applyState(db, null, buildState(data))
  return db
}

function v2Db(data: unknown): Database {
  const db = new SQL.Database()
  createSchema(db)
  applyState(db, null, buildState(data))
  return db
}

describe('derivedSchema - מבנה', () => {
  it('גרסת המבנה הנוכחית היא 2 ויש שלב שדרוג 1 -> 2', () => {
    expect(SCHEMA_VERSION).toBe(2)
    expect(typeof SCHEMA_MIGRATIONS[1]).toBe('function')
  })

  it('כל הטבלאות ב-DERIVED_TABLES קיימות ב-STORE_TABLES', () => {
    const tables = new Set(Object.values(STORE_TABLES))
    for (const t of Object.keys(DERIVED_TABLES)) expect(tables.has(t)).toBe(true)
  })

  it('כל עמודה באינדקס מוגדרת כעמודה נגזרת של אותה טבלה', () => {
    for (const [table, def] of Object.entries(DERIVED_TABLES)) {
      const names = new Set(def.columns.map(c => c.name))
      for (const cols of def.indexes) for (const c of cols) expect(names.has(c), `${table}.${c}`).toBe(true)
    }
  })

  it('מסד חדש נוצר עם כל העמודות והאינדקסים', () => {
    const db = new SQL.Database()
    createSchema(db)
    expect(listMissingDerivedSchema(db)).toEqual([])
    expect(rows(db, 'PRAGMA user_version')[0][0]).toBe(2)
  })

  it('מסד במבנה 1 חסר עמודות ואינדקסים (זיהוי חוסרים עובד)', () => {
    const db = new SQL.Database()
    createSchema(db, 1)
    const missing = listMissingDerivedSchema(db)
    expect(missing).toContain('loans.borrower_id')
    expect(missing).toContain(`index ${indexName('loans', ['borrower_id'])}`)
  })

  it('applyDerivedSchema בטוח להרצה חוזרת', () => {
    const db = v2Db(makeSampleData())
    expect(() => applyDerivedSchema(db)).not.toThrow()
    expect(listMissingDerivedSchema(db)).toEqual([])
  })
})

describe('derivedSchema - שדרוג 1 -> 2', () => {
  it('הנתונים זהים בייט-לבייט (JSON לא נגע), והעמודות והאינדקסים נוספו', () => {
    const data = makeSampleData()
    const db = v1Db(data)
    const before = rows(db, 'SELECT seq, id, data FROM loans ORDER BY seq')

    upgradeSchema(db, 1, 2, SCHEMA_MIGRATIONS)

    expect(rows(db, 'SELECT seq, id, data FROM loans ORDER BY seq')).toEqual(before)
    expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
    expect(listMissingDerivedSchema(db)).toEqual([])
    expect(rows(db, 'PRAGMA user_version')[0][0]).toBe(2)
    expect(rows(db, "SELECT value FROM meta WHERE key='schema_version'")[0][0]).toBe('2')
  })

  it('שדרוג שנכשל באמצע מבטל הכול (אין עמודות חלקיות)', () => {
    const db = v1Db(makeSampleData())
    const failing = {
      1: (d: Database) => {
        applyDerivedSchema(d)
        throw new Error('boom')
      },
    }
    expect(() => upgradeSchema(db, 1, 2, failing)).toThrow('boom')
    expect(listMissingDerivedSchema(db).length).toBeGreaterThan(0)
    expect(rows(db, 'PRAGMA user_version')[0][0]).toBe(1)
  })

  it('מסד משודרג ומסד חדש זהים במבנה (אותן עמודות ואותם אינדקסים)', () => {
    const upgraded = v1Db(makeSampleData())
    upgradeSchema(upgraded, 1, 2, SCHEMA_MIGRATIONS)
    const fresh = v2Db(makeSampleData())
    const shape = (db: Database) =>
      rows(db, "SELECT type, name FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name")
    expect(shape(upgraded)).toEqual(shape(fresh))
    for (const table of Object.values(STORE_TABLES)) {
      const cols = (db: Database) => rows(db, `PRAGMA table_xinfo("${table}")`).map(r => [r[1], r[2], r[6]])
      expect(cols(upgraded), table).toEqual(cols(fresh))
    }
  })

  it('שדרוג בפועל דרך SqliteBackend: נתונים זהים, קובץ בדיסק במבנה 2, ועותק הביניים נשאר מבנה 1', async () => {
    const io = new MemoryStorageIO()
    const old = new SqliteBackend(SQL, io, { readLegacySource: async () => null, schemaVersion: 1, migrations: {} })
    await old.load()
    const data = makeSampleData()
    await old.save(data)
    const oldBytes = Buffer.from(io.files.get(DB_FILE)!)

    const b = new SqliteBackend(SQL, io, { readLegacySource: async () => null })
    const out = await b.load()
    expect(out.origin).toBe('sqlite')
    expect(JSON.stringify(out.data)).toBe(JSON.stringify(data))

    const onDisk = new SQL.Database(io.files.get(DB_FILE)!)
    expect(rows(onDisk, 'PRAGMA user_version')[0][0]).toBe(2)
    expect(listMissingDerivedSchema(onDisk)).toEqual([])
    expect(rows(onDisk, 'PRAGMA quick_check')).toEqual([['ok']])
    onDisk.close()
    expect(Buffer.from(io.files.get(PREV_FILE)!).equals(oldBytes)).toBe(true)

    // שמירה אחרי השדרוג ופתיחה מחדש: עדיין תקין
    data.settings.gemach_name = 'אחרי שדרוג'
    await b.save(data)
    const again = new SqliteBackend(SQL, io, { readLegacySource: async () => null })
    expect(JSON.stringify((await again.load()).data)).toBe(JSON.stringify(data))
  })
})

describe('derivedSchema - ערכי העמודות', () => {
  it('מזהה מספרי ב-JSON הופך לטקסט, שדה חסר/null הוא NULL, ו-is_deleted חסר/false/0 = 0', () => {
    const data = {
      ...makeSampleData(),
      loans: {
        a: { id: 'a', borrower_id: 5, amount: 10.5, loan_date: '2026-01-02', status: 'active' },
        b: { id: 'b', borrower_id: null, is_deleted: true },
        c: { id: 'c', borrower_id: 'x', is_deleted: false, due_date: '2026-03-01' },
        d: { id: 'd', is_deleted: 0 },
        e: { id: 'e', is_deleted: 1 },
      },
    }
    const db = v2Db(data)
    const got = rows(db, 'SELECT id, borrower_id, typeof(borrower_id), amount, due_date, is_deleted FROM loans ORDER BY seq')
    expect(got).toEqual([
      ['a', '5', 'text', 10.5, null, 0],
      ['b', null, 'null', null, null, 1],
      ['c', 'x', 'text', null, '2026-03-01', 0],
      ['d', null, 'null', null, null, 0],
      ['e', null, 'null', null, null, 1],
    ])
  })

  it('גם רשומות עם מזהה מספרי (תרומות) מושוות נכון למפתח הטקסטואלי', () => {
    const data = {
      ...makeSampleData(),
      donations: { '7': { id: 7, donor_id: 3, amount: 50, donation_date: '2026-05-01' } },
    }
    const db = v2Db(data)
    expect(rows(db, 'SELECT id, donor_id FROM donations WHERE donor_id = ?', ['3'])).toEqual([['7', '3']])
  })

  it('כתיבה מצטברת (הוספה/עדכון/מחיקה) מעדכנת את העמודות והאינדקסים', () => {
    const db = v2Db(makeSampleData())
    const base = readSnapshot(db)
    const next = JSON.parse(JSON.stringify(base.data))
    const [firstLoanId] = Object.keys(next.loans)
    next.loans[firstLoanId].status = 'paid'
    next.loans.NEW = { id: 'NEW', borrower_id: 'zz', amount: 7, status: 'planned', loan_date: '2027-01-01' }
    const victim = Object.keys(next.loans)[1]
    delete next.loans[victim]
    applyState(db, base.state, buildState(next))

    expect(rows(db, 'SELECT status FROM loans WHERE id = ?', [firstLoanId])).toEqual([['paid']])
    expect(rows(db, 'SELECT borrower_id, status FROM loans WHERE status = ?', ['planned'])).toEqual([['zz', 'planned']])
    expect(rows(db, 'SELECT COUNT(*) FROM loans WHERE id = ?', [victim])).toEqual([[0]])
    expect(rows(db, 'PRAGMA quick_check')).toEqual([['ok']])
  })

  it('הקובץ המיוצא נפתח מחדש עם אותן עמודות ועובר quick_check', () => {
    const data = makeSampleData()
    const db = v2Db(data)
    const reopened = new SQL.Database(db.export())
    expect(listMissingDerivedSchema(reopened)).toEqual([])
    expect(rows(reopened, 'PRAGMA quick_check')).toEqual([['ok']])
    expect(JSON.stringify(readSnapshot(reopened).data)).toBe(JSON.stringify(data))
  })
})

describe('derivedSchema - שקילות שאילתות לוגיקה הקיימת', () => {
  const loanArb = fc.record({
    borrower: fc.integer({ min: 0, max: 4 }),
    amount: fc.integer({ min: 1, max: 5000 }),
    day: fc.integer({ min: 1, max: 28 }),
    status: fc.constantFrom('active', 'paid', 'planned'),
    deleted: fc.option(fc.boolean(), { nil: undefined }),
  })
  const repaymentArb = fc.record({
    loan: fc.integer({ min: 0, max: 9 }),
    amount: fc.integer({ min: 1, max: 900 }),
    deleted: fc.option(fc.boolean(), { nil: undefined }),
  })

  it('יתרות, סינון לפי לווה/סטטוס ומחיקה רכה - SQL שווה ללוגיקה בזיכרון (150 הרצות)', () => {
    fc.assert(
      fc.property(fc.array(loanArb, { maxLength: 10 }), fc.array(repaymentArb, { maxLength: 25 }), (ls, rs) => {
        const loans: Record<string, any> = {}
        ls.forEach((l, i) => {
          loans[`L${i}`] = {
            id: `L${i}`,
            borrower_id: `B${l.borrower}`,
            amount: l.amount,
            loan_date: `2026-01-${String(l.day).padStart(2, '0')}`,
            status: l.status,
            ...(l.deleted === undefined ? {} : { is_deleted: l.deleted }),
          }
        })
        const repayments: Record<string, any> = {}
        rs.forEach((r, i) => {
          repayments[`R${i}`] = {
            id: `R${i}`,
            loan_id: `L${r.loan}`,
            amount: r.amount,
            ...(r.deleted === undefined ? {} : { is_deleted: r.deleted }),
          }
        })
        const db = v2Db({ ...makeSampleData(), loans, repayments })
        try {
          // 1) סכום פירעונות לכל הלוואה (כמו repaymentsService.getByLoan + reduce)
          const sqlRepaid = new Map(
            rows(db, 'SELECT loan_id, SUM(amount) FROM repayments WHERE is_deleted = 0 GROUP BY loan_id').map(r => [
              String(r[0]),
              Number(r[1]),
            ])
          )
          const jsRepaid = new Map<string, number>()
          for (const r of Object.values(repayments)) {
            if (r.is_deleted) continue
            jsRepaid.set(r.loan_id, (jsRepaid.get(r.loan_id) ?? 0) + r.amount)
          }
          expect(sqlRepaid).toEqual(jsRepaid)

          // 2) הלוואות פעילות של לווה, ממוינות לפי תאריך יורד (כמו loansService.getAll + getByBorrower)
          for (let b = 0; b < 5; b++) {
            const sqlIds = rows(
              db,
              "SELECT id FROM loans WHERE is_deleted = 0 AND borrower_id = ? AND status = 'active' ORDER BY loan_date DESC, seq",
              [`B${b}`]
            ).map(r => String(r[0]))
            const jsIds = Object.values(loans)
              .filter(l => !l.is_deleted && l.borrower_id === `B${b}` && l.status === 'active')
              .map((l, i) => ({ l, i }))
              .sort((x, y) => (x.l.loan_date < y.l.loan_date ? 1 : x.l.loan_date > y.l.loan_date ? -1 : x.i - y.i))
              .map(x => x.l.id)
            expect(sqlIds).toEqual(jsIds)
          }

          // 3) סך ההלוואות הפעילות (כמו חישוב הכסף המושאל בדף הבית)
          const sqlTotal = Number(rows(db, "SELECT COALESCE(SUM(amount), 0) FROM loans WHERE is_deleted = 0 AND status = 'active'")[0][0])
          const jsTotal = Object.values(loans)
            .filter(l => !l.is_deleted && l.status === 'active')
            .reduce((s, l) => s + l.amount, 0)
          expect(sqlTotal).toBe(jsTotal)
        } finally {
          db.close()
        }
      }),
      { numRuns: 150 }
    )
  })

  it('שאילתות מרכזיות משתמשות באינדקס ולא בסריקה מלאה', () => {
    const db = v2Db(makeSampleData())
    const plan = (sql: string) => rows(db, `EXPLAIN QUERY PLAN ${sql}`).map(r => String(r[3])).join(' | ')
    expect(plan("SELECT id FROM loans WHERE borrower_id = 'x'")).toContain(`USING INDEX ${indexName('loans', ['borrower_id'])}`)
    expect(plan("SELECT id FROM loans WHERE status = 'active'")).toContain(`USING INDEX ${indexName('loans', ['status'])}`)
    expect(plan("SELECT id FROM repayments WHERE loan_id = 'x'")).toContain(`USING INDEX ${indexName('repayments', ['loan_id'])}`)
    expect(plan("SELECT id FROM deposits WHERE depositor_id = 'x'")).toContain(`USING INDEX ${indexName('deposits', ['depositor_id'])}`)
  })
})
