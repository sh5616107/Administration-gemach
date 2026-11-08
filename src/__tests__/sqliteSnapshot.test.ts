/**
 * בדיקות לשכבת התרגום בין נתוני האפליקציה לבין SQLite.
 * המטרה: כל מה שנשמר חוזר זהה לחלוטין (כולל סדר הרשומות), בכל רצף של שינויים.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import fc from 'fast-check'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import {
  STORE_TABLES,
  __setForceIncrementalForTests,
  applyState,
  buildState,
  createSchema,
  readSnapshot,
  upgradeSchema,
  type SnapshotState,
} from '../services/storage/sqliteSnapshot'
import { makeSampleData } from './helpers/memoryStorageIO'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs()
})

function newDb(): Database {
  const db = new SQL.Database()
  createSchema(db)
  return db
}

/** שומר את obj במסד (כמו saveAppData) ומחזיר את המצב החדש */
function save(db: Database, prev: SnapshotState | null, obj: unknown): SnapshotState {
  const next = buildState(obj)
  applyState(db, prev, next)
  return next
}

function roundTripViaBytes(db: Database): Record<string, unknown> {
  const reopened = new SQL.Database(db.export())
  try {
    return readSnapshot(reopened).data
  } finally {
    reopened.close()
  }
}

describe('sqliteSnapshot - נאמנות מלאה', () => {
  it('נתוני דוגמה חוזרים זהים (כולל סדר) גם אחרי יצוא/פתיחה מחדש של הקובץ', () => {
    const data = makeSampleData()
    const db = newDb()
    save(db, null, data)

    expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
    expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
  })

  it('כל ה-stores של האפליקציה ממופים לטבלה', () => {
    const data = makeSampleData()
    for (const store of Object.keys(data)) {
      expect(STORE_TABLES[store], `חסרה טבלה ל-${store}`).toBeDefined()
    }
  })

  it('stores ריקים נשמרים כ-{} (המבנה המדויק נשמר)', () => {
    const data = { settings: { a: '1' }, borrowers: {}, loans: {} }
    const db = newDb()
    save(db, null, data)
    expect(readSnapshot(db).data).toEqual(data)
    expect(Object.keys(readSnapshot(db).data)).toEqual(['settings', 'borrowers', 'loans'])
  })

  it('מפתחות-על לא מוכרים וערכים שאינם מפה נשמרים ב-extras בלי אובדן', () => {
    const data: Record<string, unknown> = {
      settings: { a: '1' },
      loans: [1, 2, 3], // לא מפה - לא אמור לקרות, אבל אסור לאבד
      futureStore: { x: { y: 1 } },
      version: 7,
      note: 'שלום',
      nothing: null,
    }
    const db = newDb()
    save(db, null, data)
    expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
  })

  it('ערכי undefined נעלמים בדיוק כמו ב-JSON.stringify של הקובץ הישן', () => {
    const data: any = { borrowers: { a: { id: 'a', v: undefined, w: 1 }, b: undefined }, ghost: undefined }
    const db = newDb()
    save(db, null, data)
    expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
    expect(Object.keys(readSnapshot(db).data)).toEqual(['borrowers'])
  })

  it('מזהה "__proto__" נשמר כמפתח רגיל ולא משנה את הפרוטוטייפ', () => {
    const borrowers: Record<string, unknown> = {}
    Object.defineProperty(borrowers, '__proto__', { value: { id: 'p' }, enumerable: true, configurable: true, writable: true })
    borrowers.ok = { id: 'ok' }
    const db = newDb()
    save(db, null, { borrowers })
    const back = readSnapshot(db).data.borrowers as Record<string, unknown>
    expect(Object.keys(back)).toEqual(['__proto__', 'ok'])
    expect(Object.getPrototypeOf(back)).toBe(Object.prototype)
  })

  it('תווים מיוחדים, עברית, אימוג׳י ומספרים גדולים/עשרוניים נשמרים', () => {
    const data = {
      borrowers: {
        a: { id: 'a', name: 'משה "ר׳" 😀 \u0000 \\ / \n\t', n: 12345678901234567890, d: 0.1 + 0.2, neg: -0.5, e: 1e-7 },
      },
    }
    const db = newDb()
    save(db, null, data)
    expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
  })

  it('מזהים מספריים (נתונים ישנים) נשמרים עם אותו סדר שמנוע JS מחזיר', () => {
    const loans: Record<string, unknown> = {}
    loans['10'] = { id: 10 }
    loans['2'] = { id: 2 }
    loans['abc'] = { id: 'abc' }
    loans['1'] = { id: 1 }
    const db = newDb()
    save(db, null, { loans })
    expect(Object.keys(readSnapshot(db).data.loans as object)).toEqual(Object.keys(loans))
  })
})

describe('sqliteSnapshot - שמירה אינקרמנטלית', () => {
  it('שמירה חוזרת בלי שינוי לא משנה את המסד', () => {
    const data = makeSampleData()
    const db = newDb()
    const s1 = save(db, null, data)
    const changed = applyState(db, s1, buildState(data))
    expect(changed).toBe(false)
  })

  it('עדכון / הוספה / מחיקה נשמרים נכון', () => {
    const data = makeSampleData()
    const db = newDb()
    let state = save(db, null, data)

    const loanIds = Object.keys(data.loans)
    data.loans[loanIds[0]].amount = 999
    delete data.loans[loanIds[1]]
    data.loans['new-1'] = { id: 'new-1', amount: 5 }
    data.settings.risk_threshold = '60000'
    state = save(db, state, data)

    expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
    expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
  })

  it('מחיקה והוספה מחדש של אותו מזהה (הסדר משתנה) נשמרת בסדר הנכון', () => {
    const data: any = { borrowers: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } } }
    const db = newDb()
    let state = save(db, null, data)

    const b = data.borrowers.b
    delete data.borrowers.b
    data.borrowers.b = b // עכשיו הסדר: a, c, b - אבל התוכן זהה
    state = save(db, state, data)

    expect(Object.keys(readSnapshot(db).data.borrowers as object)).toEqual(['a', 'c', 'b'])
  })

  it('בנייה מחדש של האובייקט בסדר שונה נשמרת בסדר החדש', () => {
    const data: any = { loans: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } } }
    const db = newDb()
    let state = save(db, null, data)

    data.loans = { c: data.loans.c, x: { id: 'x' }, a: data.loans.a }
    state = save(db, state, data)

    expect(Object.keys(readSnapshot(db).data.loans as object)).toEqual(['c', 'x', 'a'])
  })

  it('ריקון store ו"מחיקת כל הנתונים" נשמרים', () => {
    const data = makeSampleData()
    const db = newDb()
    let state = save(db, null, data)
    data.loans = {}
    data.repayments = {}
    state = save(db, state, data)
    expect(readSnapshot(db).data.loans).toEqual({})
    expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
  })

  it('store שהפך משאינו-מפה למפה (ולהפך) לא משאיר שאריות', () => {
    const db = newDb()
    let state = save(db, null, { loans: { a: { id: 'a' } } })
    state = save(db, state, { loans: [1, 2] })
    expect(readSnapshot(db).data).toEqual({ loans: [1, 2] })
    state = save(db, state, { loans: { b: { id: 'b' } } })
    expect(readSnapshot(db).data).toEqual({ loans: { b: { id: 'b' } } })
  })

  it('כישלון באמצע השמירה מבטל את כל השינוי (ROLLBACK) והמסד נשאר כפי שהיה', () => {
    const data = makeSampleData()
    const db = newDb()
    const state = save(db, null, data)
    const before = JSON.stringify(readSnapshot(db).data)

    // עוטפים את המסד כך שהכנסה לטבלת funds תיכשל (אחרי ששינויים בטבלאות קודמות כבר בוצעו)
    const failing = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('INSERT INTO "funds"')) throw new Error('boom')
            return target.prepare(sql)
          }
        }
        const v = Reflect.get(target, prop, receiver)
        return typeof v === 'function' ? v.bind(target) : v
      },
    }) as Database

    const modified = makeSampleData()
    modified.loans = {}
    modified.funds = { f2: { id: 'f2' } }
    expect(() => applyState(failing, state, buildState(modified))).toThrow('boom')

    expect(JSON.stringify(readSnapshot(db).data)).toBe(before)
  })
})

describe('sqliteSnapshot - בדיקת רצפים אקראיים (property-based)', () => {
  const storeNames = ['borrowers', 'loans', 'repayments', 'settings', 'funds']
  const idArb = fc.oneof(
    fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g'),
    fc.constantFrom('1', '2', '10', '3'),
    fc.uuid()
  )
  const valueArb = fc.record({
    n: fc.integer(),
    s: fc.string(),
    arr: fc.array(fc.oneof(fc.integer(), fc.string(), fc.constant(null)), { maxLength: 3 }),
  })

  const opArb = fc.oneof(
    fc.record({ kind: fc.constant('set' as const), store: fc.constantFrom(...storeNames), id: idArb, value: valueArb }),
    fc.record({ kind: fc.constant('delete' as const), store: fc.constantFrom(...storeNames), id: idArb }),
    fc.record({ kind: fc.constant('readd' as const), store: fc.constantFrom(...storeNames), id: idArb }),
    fc.record({ kind: fc.constant('rebuild' as const), store: fc.constantFrom(...storeNames), seed: fc.integer({ min: 0, max: 1000 }) }),
    fc.record({ kind: fc.constant('clear' as const), store: fc.constantFrom(...storeNames) }),
    fc.record({ kind: fc.constant('save' as const) })
  )

  it('אחרי כל רצף פעולות ושמירות - מה שנקרא זהה למה שבזיכרון (כולל סדר)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), ops => {
        const data: Record<string, Record<string, unknown>> = {}
        for (const s of storeNames) data[s] = {}

        const db = newDb()
        let state: SnapshotState | null = null
        state = save(db, state, data)

        for (const op of ops) {
          if (op.kind === 'set') data[op.store][op.id] = op.value
          else if (op.kind === 'delete') delete data[op.store][op.id]
          else if (op.kind === 'readd') {
            if (op.id in data[op.store]) {
              const v = data[op.store][op.id]
              delete data[op.store][op.id]
              data[op.store][op.id] = v
            }
          } else if (op.kind === 'rebuild') {
            // בנייה מחדש בסדר "מעורבב" דטרמיניסטי
            const entries = Object.entries(data[op.store])
            entries.sort((x, y) => ((x[0].length * 31 + op.seed) % 7) - ((y[0].length * 31 + op.seed) % 7) || (x[0] < y[0] ? 1 : -1))
            data[op.store] = Object.fromEntries(entries)
          } else if (op.kind === 'clear') {
            data[op.store] = {}
          } else {
            state = save(db, state, data)
            expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
          }
        }

        state = save(db, state, data)
        expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
        expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
        db.close()
      }),
      { numRuns: 150 }
    )
  })
})

describe('sqliteSnapshot - רשת ביטחון לסדר רשומות', () => {
  it('גם אם הכתיבה המצטברת נבחרה בטעות במצב שמשבש סדר - הסדר בטבלה מתוקן אוטומטית', () => {
    __setForceIncrementalForTests(true)
    try {
      const data: any = { borrowers: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } }, loans: { a: { id: 'a' }, b: { id: 'b' } } }
      const db = newDb()
      let state = save(db, null, data)

      const b = data.borrowers.b
      delete data.borrowers.b
      data.borrowers.b = b // a, c, b
      data.loans = { b: data.loans.b, a: data.loans.a } // b, a
      state = save(db, state, data)

      expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
      expect(JSON.stringify(roundTripViaBytes(db))).toBe(JSON.stringify(data))
    } finally {
      __setForceIncrementalForTests(false)
    }
  })

  it('רצפים אקראיים עם כתיבה מצטברת מאולצת עדיין מניבים סדר נכון', () => {
    __setForceIncrementalForTests(true)
    try {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.constantFrom('a', 'b', 'c', 'd', '1', '2', '10'),
              op: fc.constantFrom('set', 'del', 'readd', 'save'),
            }),
            { minLength: 1, maxLength: 30 }
          ),
          ops => {
            const data: any = { loans: {} }
            const db = newDb()
            let state: SnapshotState | null = save(db, null, data)
            for (const { id, op } of ops) {
              if (op === 'set') data.loans[id] = { id, v: Math.random() }
              else if (op === 'del') delete data.loans[id]
              else if (op === 'readd') {
                if (id in data.loans) {
                  const v = data.loans[id]
                  delete data.loans[id]
                  data.loans[id] = v
                }
              } else {
                state = save(db, state, data)
                expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
              }
            }
            state = save(db, state, data)
            expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
            db.close()
          }
        ),
        { numRuns: 200 }
      )
    } finally {
      __setForceIncrementalForTests(false)
    }
  })
})

describe('sqliteSnapshot - שדרוג מבנה', () => {
  it('מריץ את השלבים לפי הסדר, מעדכן user_version ו-meta, ושומר נתונים', () => {
    const data = makeSampleData()
    const db = newDb()
    save(db, null, data)
    const calls: number[] = []
    upgradeSchema(db, 1, 3, {
      1: d => { calls.push(1); d.run('CREATE TABLE t2 (x)') },
      2: d => { calls.push(2); d.run('INSERT INTO t2 VALUES (1)') },
    })
    expect(calls).toEqual([1, 2])
    expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(3)
    expect(db.exec("SELECT value FROM meta WHERE key='schema_version'")[0].values[0][0]).toBe('3')
    expect(JSON.stringify(readSnapshot(db).data)).toBe(JSON.stringify(data))
  })

  it('שלב חסר: זורק לפני שינוי כלשהו', () => {
    const db = newDb()
    save(db, null, makeSampleData())
    expect(() => upgradeSchema(db, 1, 3, { 1: d => d.run('CREATE TABLE t2 (x)') })).toThrow()
    expect(db.exec("SELECT name FROM sqlite_master WHERE name='t2'").length).toBe(0)
    expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(1)
  })

  it('שלב שנכשל באמצע: הכול מתבטל (כולל שלבים קודמים)', () => {
    const db = newDb()
    save(db, null, makeSampleData())
    expect(() =>
      upgradeSchema(db, 1, 3, {
        1: d => d.run('CREATE TABLE t2 (x)'),
        2: () => { throw new Error('boom') },
      })
    ).toThrow('boom')
    expect(db.exec("SELECT name FROM sqlite_master WHERE name='t2'").length).toBe(0)
    expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(1)
  })
})

describe('sqliteSnapshot - בדיקות עקביות בקריאה (מסד לא עקבי נדחה, לא "מתוקן" בשקט)', () => {
  function seededDb(): Database {
    const db = newDb()
    save(db, null, { ...makeSampleData(), customTopLevel: { a: 1 } })
    return db
  }
  const present = (db: Database): string[] =>
    JSON.parse(String(db.exec("SELECT value FROM meta WHERE key='present_keys'")[0].values[0][0]))
  const setPresent = (db: Database, keys: unknown) =>
    db.run("UPDATE meta SET value=? WHERE key='present_keys'", [JSON.stringify(keys)])

  it('מסד תקין נקרא', () => {
    expect(() => readSnapshot(seededDb())).not.toThrow()
  })

  it('present_keys חסר', () => {
    const db = seededDb()
    db.run("DELETE FROM meta WHERE key='present_keys'")
    expect(() => readSnapshot(db)).toThrow(/present_keys/)
  })

  it('present_keys אינו מערך מחרוזות / JSON שבור', () => {
    for (const bad of ['{"a":1}', '[1,2]', 'not json']) {
      const db = seededDb()
      db.run("UPDATE meta SET value=? WHERE key='present_keys'", [bad])
      expect(() => readSnapshot(db)).toThrow(/present_keys/)
    }
  })

  it('מפתח כפול ב-present_keys', () => {
    const db = seededDb()
    const keys = present(db)
    setPresent(db, [...keys, keys[0]])
    expect(() => readSnapshot(db)).toThrow(/כפולים/)
  })

  it('מפתח ב-extras שאינו ב-present_keys (רשומה יתומה)', () => {
    const db = seededDb()
    setPresent(db, present(db).filter(k => k !== 'customTopLevel'))
    expect(() => readSnapshot(db)).toThrow(/יתומה/)
  })

  it('שורות בטבלה של store שאינו ב-present_keys', () => {
    const db = seededDb()
    const store = Object.keys(STORE_TABLES).find(s => present(db).includes(s) && (db.exec(`SELECT 1 FROM "${STORE_TABLES[s]}" LIMIT 1`)[0]?.values.length ?? 0) > 0)!
    setPresent(db, present(db).filter(k => k !== store))
    expect(() => readSnapshot(db)).toThrow(/שאינה רשומה/)
  })

  it('מפתח ב-present_keys שלא קיים בשום מקום (לא store מוכר ולא ב-extras)', () => {
    const db = seededDb()
    setPresent(db, [...present(db), 'ghostKey'])
    expect(() => readSnapshot(db)).toThrow(/ghostKey/)
  })

  it('אותו מפתח גם ב-extras וגם בטבלה', () => {
    const db = seededDb()
    const store = Object.keys(STORE_TABLES).find(s => (db.exec(`SELECT 1 FROM "${STORE_TABLES[s]}" LIMIT 1`)[0]?.values.length ?? 0) > 0)!
    db.run('INSERT INTO extras (key, value) VALUES (?, ?)', [store, '{}'])
    expect(() => readSnapshot(db)).toThrow(/גם ב-extras וגם בטבלה/)
  })

  it('שורה שנמחקה מטבלה (row_counts לא תואם)', () => {
    const db = seededDb()
    const table = Object.values(STORE_TABLES).find(t => Number(db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0]) > 0)!
    db.run(`DELETE FROM "${table}" WHERE seq = (SELECT MIN(seq) FROM "${table}")`)
    expect(() => readSnapshot(db)).toThrow(/שונה ממה שנשמר/)
  })

  it('row_counts חסר או פגום', () => {
    const a = seededDb()
    a.run("DELETE FROM meta WHERE key='row_counts'")
    expect(() => readSnapshot(a)).toThrow(/row_counts/)
    const b = seededDb()
    b.run("UPDATE meta SET value='[1]' WHERE key='row_counts'")
    expect(() => readSnapshot(b)).toThrow(/row_counts/)
  })

  it('מחיקת כל הנתונים ואז שמירה מחדש - עדיין עקבי (row_counts מתעדכן)', () => {
    const db = newDb()
    const s1 = save(db, null, makeSampleData())
    const s2 = save(db, s1, {})
    expect(readSnapshot(db).data).toEqual({})
    save(db, s2, makeSampleData())
    expect(() => readSnapshot(db)).not.toThrow()
  })
})
