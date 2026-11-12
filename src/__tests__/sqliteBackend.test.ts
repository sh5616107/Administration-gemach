/**
 * בדיקות לניהול קובץ ה-SQLite: טעינה, מעבר, שמירה אטומית, שחזור וחסימה.
 * כל התרחישים רצים על דיסק בזיכרון (MemoryStorageIO) כדי לדמות גם כשלים.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import {
  DB_FILE,
  PREV_FILE,
  BAK1_FILE,
  BAK2_FILE,
  BACKUP_INTERVAL_MS,
  LegacyReadError,
  MigrationVerificationError,
  SqliteBackend,
  StorageBlockedError,
  type LegacySource,
} from '../services/storage/sqliteBackend'
import { MemoryStorageIO, makeSampleData } from './helpers/memoryStorageIO'

let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await initSqlJs()
})

function backendFor(io: MemoryStorageIO, legacy: LegacySource | null = null) {
  return new SqliteBackend(SQL, io, { readLegacySource: async () => legacy })
}

/** backend שיוצר ושומר מבנה 1 (הישן): משמש בבדיקות שמדמות קובץ שנכתב לפני שדרוג המבנה */
function backendV1(io: MemoryStorageIO) {
  return new SqliteBackend(SQL, io, { readLegacySource: async () => null, schemaVersion: 1, migrations: {} })
}

const sameJson = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b))

describe('SqliteBackend - התקנה חדשה ושמירה/טעינה', () => {
  it('התקנה חדשה: אין נתונים; הקובץ נוצר בשמירה הראשונה ונטען בהפעלה הבאה', async () => {
    const io = new MemoryStorageIO()
    const b1 = backendFor(io)
    const first = await b1.load()
    expect(first.origin).toBe('new')
    expect(first.data).toBeNull()
    expect(b1.peek()).toBeNull()
    expect(io.files.has(DB_FILE)).toBe(false)

    const data = makeSampleData()
    await b1.save(data)
    expect(io.files.has(DB_FILE)).toBe(true)

    const b2 = backendFor(io)
    const second = await b2.load()
    expect(second.origin).toBe('sqlite')
    sameJson(second.data, data)
    sameJson(b2.peek(), data)
  })

  it('כל הפעלה תקינה מרעננת את עותק הביניים', async () => {
    const io = new MemoryStorageIO()
    const b1 = backendFor(io)
    await b1.load()
    await b1.save(makeSampleData())
    expect(io.files.has(PREV_FILE)).toBe(false)

    await backendFor(io).load()
    expect(io.files.has(PREV_FILE)).toBe(true)
    expect(Buffer.from(io.files.get(PREV_FILE)!).equals(Buffer.from(io.files.get(DB_FILE)!))).toBe(true)
  })

  it('שמירה בלי שינוי לא כותבת לדיסק; שינוי כותב', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)
    const writesAfterFirst = io.writes

    await b.save(data)
    await b.save(data)
    expect(io.writes).toBe(writesAfterFirst)

    data.settings.gemach_name = 'שם חדש'
    await b.save(data)
    expect(io.writes).toBe(writesAfterFirst + 1)
  })

  it('כשל כתיבה לדיסק נזרק למי ששמר, ושמירה הבאה (גם בלי שינוי נוסף) משלימה את הכתיבה', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)

    data.settings.gemach_name = 'חשוב מאוד'
    io.failWrites = 1
    await expect(b.save(data)).rejects.toThrow('disk full')

    // בדיסק עדיין הגרסה הישנה
    const stale = backendFor(io)
    expect(((await stale.load()).data as any).settings.gemach_name).toBe('גמ"ח שלי')

    // אין שינוי נוסף בנתונים - אבל השמירה הבאה חייבת להגיע לדיסק
    await b.save(data)
    const fresh = backendFor(io)
    expect(((await fresh.load()).data as any).settings.gemach_name).toBe('חשוב מאוד')
  })

  it('הרבה שמירות מקבילות מתבצעות בסדר, והדיסק מכיל את המצב האחרון', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()

    const saves: Promise<void>[] = []
    for (let i = 0; i < 25; i++) {
      data.settings[`counter_${i}`] = String(i)
      saves.push(b.save(data))
    }
    await Promise.all(saves)

    const reloaded = await backendFor(io).load()
    sameJson(reloaded.data, data)
  })

  it('שמירה שנכשלה (בנייה) לא פוגעת בשמירות הבאות בתור', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const bad: any = { settings: {} }
    bad.settings.self = bad // מעגלי - JSON.stringify נכשל

    const data = makeSampleData()
    const results = await Promise.allSettled([b.save(data), b.save(bad), b.save(data)])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    sameJson((await backendFor(io).load()).data, data)
  })
})

describe('SqliteBackend - מעבר מהאחסון הישן', () => {
  it('מעבר מקובץ JSON: נתונים זהים, המקור לא נמחק (הועבר הצידה), וההפעלה הבאה טוענת מ-SQLite', async () => {
    const io = new MemoryStorageIO()
    const original = makeSampleData()
    const text = JSON.stringify(original)
    let marked = false
    const legacy: LegacySource = { kind: 'json-file', text, afterMigrated: async () => { marked = true } }

    const b = backendFor(io, legacy)
    const out = await b.load()
    expect(out.origin).toBe('migrated-json-file')
    expect(out.notice).toBeTruthy()
    sameJson(out.data, original)
    expect(marked).toBe(true)
    expect(io.files.has(DB_FILE)).toBe(true)

    // הפעלה הבאה: מסד קיים -> הלגסי לא נקרא כלל
    const b2 = new SqliteBackend(SQL, io, { readLegacySource: async () => { throw new Error('לא אמור להיקרא') } })
    const second = await b2.load()
    expect(second.origin).toBe('sqlite')
    sameJson(second.data, original)
  })

  it('מעבר מ-localStorage', async () => {
    const io = new MemoryStorageIO()
    const original = makeSampleData()
    const out = await backendFor(io, { kind: 'localStorage', text: JSON.stringify(original) }).load()
    expect(out.origin).toBe('migrated-localStorage')
    sameJson(out.data, original)
  })

  it('לאחר המעבר ניתן להמשיך לעבוד ולשמור', async () => {
    const io = new MemoryStorageIO()
    const original = makeSampleData()
    const b = backendFor(io, { kind: 'json-file', text: JSON.stringify(original) })
    await b.load()
    const updated = JSON.parse(JSON.stringify(original))
    updated.settings.gemach_name = 'אחרי המעבר'
    await b.save(updated)
    sameJson((await backendFor(io).load()).data, updated)
  })

  it('נתונים ישנים עם מפתחות/מבנה חריגים עוברים בלי אובדן', async () => {
    const io = new MemoryStorageIO()
    const original = { ...makeSampleData(), legacyKey: { x: 1 }, schemaNote: 'v1', loans: { '5': { id: 5 }, '1': { id: 1 }, z: { id: 'z' } } }
    const out = await backendFor(io, { kind: 'json-file', text: JSON.stringify(original) }).load()
    sameJson(out.data, JSON.parse(JSON.stringify(original)))
  })

  it('"null" כמקור ישן = אין נתונים (כמו בקוד הקודם) ולא שגיאה', async () => {
    const io = new MemoryStorageIO()
    const out = await backendFor(io, { kind: 'localStorage', text: 'null' }).load()
    expect(out.origin).toBe('new')
    expect(out.data).toBeNull()
  })

  it('אימות נכשל (הדיסק משנה את הבתים): לא נשאר קובץ SQLite, והשגיאה מאפשרת חזרה לאחסון הישן', async () => {
    const io = new MemoryStorageIO()
    io.corruptOnWrite = (_name, bytes) => {
      const copy = new Uint8Array(bytes)
      copy[copy.length - 1] ^= 0xff
      return copy
    }
    let marked = false
    const b = backendFor(io, {
      kind: 'json-file',
      text: JSON.stringify(makeSampleData()),
      afterMigrated: async () => { marked = true },
    })
    await expect(b.load()).rejects.toBeInstanceOf(MigrationVerificationError)
    expect(io.files.has(DB_FILE)).toBe(false)
    expect(marked).toBe(false) // המקור הישן לא הוזז
  })

  it('כשל כתיבת הקובץ במעבר: לא נשאר קובץ והמקור לא הוזז', async () => {
    const io = new MemoryStorageIO()
    io.failWrites = 1
    let marked = false
    const b = backendFor(io, {
      kind: 'json-file',
      text: JSON.stringify(makeSampleData()),
      afterMigrated: async () => { marked = true },
    })
    await expect(b.load()).rejects.toBeInstanceOf(MigrationVerificationError)
    expect(io.files.has(DB_FILE)).toBe(false)
    expect(marked).toBe(false)
  })

  it('כשל בהעברת המקור הישן הצידה לא מכשיל את המעבר', async () => {
    const io = new MemoryStorageIO()
    const original = makeSampleData()
    const out = await backendFor(io, {
      kind: 'json-file',
      text: JSON.stringify(original),
      afterMigrated: async () => { throw new Error('locked') },
    }).load()
    expect(out.origin).toBe('migrated-json-file')
    sameJson(out.data, original)
  })

  it('JSON ישן פגום: חסימה, בלי כתיבה ובלי יצירת קובץ; "התחל מחדש" מעביר הצידה ויוצר מסד ריק', async () => {
    const io = new MemoryStorageIO()
    let quarantined = false
    const b = backendFor(io, {
      kind: 'json-file',
      text: '{"borrowers": {"a": ',
      quarantine: async () => { quarantined = true },
    })
    await expect(b.load()).rejects.toMatchObject({ name: 'StorageBlockedError', kind: 'legacy-unreadable' })
    expect(io.files.has(DB_FILE)).toBe(false)
    await expect(b.save({ settings: {} })).rejects.toThrow()
    expect(io.files.has(DB_FILE)).toBe(false)

    await b.startFresh()
    expect(quarantined).toBe(true)
    expect(io.files.has(DB_FILE)).toBe(true)
    await b.save({ settings: { a: '1' } })

    // הפעלה הבאה: המסד החדש הוא מקור האמת - לא מתבצע מעבר מחדש מהישן
    const next = new SqliteBackend(SQL, io, { readLegacySource: async () => { throw new Error('לא אמור להיקרא') } })
    expect((await next.load()).data).toEqual({ settings: { a: '1' } })
  })
})

describe('SqliteBackend - קובץ פגום, שחזור וחסימה', () => {
  async function seeded(): Promise<{ io: MemoryStorageIO; data: Record<string, any> }> {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)
    await backendFor(io).load() // יוצר את עותק הביניים
    return { io, data }
  }

  it('קובץ ראשי פגום + עותק תקין: שחזור אוטומטי, הקובץ הפגום נשמר בצד', async () => {
    const { io, data } = await seeded()
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('this is not a database at all'.repeat(100))))

    const out = await backendFor(io).load()
    expect(out.origin).toBe('recovered-backup')
    expect(out.notice).toBeTruthy()
    sameJson(out.data, data)
    expect(io.names().some(n => n.startsWith(`${DB_FILE}.corrupt-`))).toBe(true)

    // והקובץ הראשי שוב תקין
    expect((await backendFor(io).load()).origin).toBe('sqlite')
  })

  it('קובץ קטוע (חצי מהבתים) מזוהה כפגום', async () => {
    const { io, data } = await seeded()
    const bytes = io.files.get(DB_FILE)!
    io.files.set(DB_FILE, bytes.slice(0, Math.floor(bytes.length / 2)))
    const out = await backendFor(io).load()
    expect(out.origin).toBe('recovered-backup')
    sameJson(out.data, data)
  })

  it('קובץ ראשי חסר + עותק תקין: שחזור', async () => {
    const { io, data } = await seeded()
    io.files.delete(DB_FILE)
    const out = await backendFor(io).load()
    expect(out.origin).toBe('recovered-backup')
    sameJson(out.data, data)
  })

  it('קובץ פגום ואין עותק: חסימה; הקובץ לא נדרס; שמירה נכשלת', async () => {
    const io = new MemoryStorageIO()
    const garbage = new Uint8Array(Buffer.from('garbage-garbage-garbage'.repeat(50)))
    io.files.set(DB_FILE, garbage)

    const b = backendFor(io)
    await expect(b.load()).rejects.toBeInstanceOf(StorageBlockedError)
    expect(b.isBlocked()).toBe(true)
    await expect(b.save(makeSampleData())).rejects.toThrow()
    expect(Buffer.from(io.files.get(DB_FILE)!).equals(Buffer.from(garbage))).toBe(true)
    expect(io.writes).toBe(0)
  })

  it('קובץ פגום וגם עותק פגום: חסימה, בלי למחוק דבר', async () => {
    const { io } = await seeded()
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))
    io.files.set(PREV_FILE, new Uint8Array(Buffer.from('y'.repeat(5000))))
    const before = io.names()
    await expect(backendFor(io).load()).rejects.toBeInstanceOf(StorageBlockedError)
    expect(io.names()).toEqual(before)
  })

  it('"התחל מחדש" לאחר חסימה: מעביר הצידה את הפגומים (ללא מחיקה) ופותח מסד ריק תקין', async () => {
    const io = new MemoryStorageIO()
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('garbage'.repeat(300))))
    io.files.set(PREV_FILE, new Uint8Array(Buffer.from('garbage2'.repeat(300))))
    const b = backendFor(io)
    await expect(b.load()).rejects.toBeInstanceOf(StorageBlockedError)

    await b.startFresh()
    expect(io.names().filter(n => n.includes('.corrupt-')).length).toBe(2)
    expect(b.isBlocked()).toBe(false)

    const data = makeSampleData()
    await b.save(data)
    const out = await backendFor(io).load()
    expect(out.origin).toBe('sqlite')
    sameJson(out.data, data)
  })

  it('קובץ מגרסת מבנה חדשה יותר: חסימה בלי שחזור/דריסה, ואי אפשר "להתחיל מחדש"', async () => {
    const { io } = await seeded()
    const db = new SQL.Database(io.files.get(DB_FILE)!)
    db.run('PRAGMA user_version = 99')
    const futureBytes = db.export()
    db.close()
    io.files.set(DB_FILE, futureBytes)
    const prevBefore = Buffer.from(io.files.get(PREV_FILE)!)

    const b = backendFor(io)
    await expect(b.load()).rejects.toMatchObject({ kind: 'newer-version' })
    expect(Buffer.from(io.files.get(DB_FILE)!).equals(Buffer.from(futureBytes))).toBe(true)
    expect(Buffer.from(io.files.get(PREV_FILE)!).equals(prevBefore)).toBe(true)
    await expect(b.save(makeSampleData())).rejects.toThrow()
    await expect(b.startFresh()).rejects.toThrow()
  })

  it('מסד תקין מבנית אך עם present_keys פגום נחשב פגום ולא נטען חלקית', async () => {
    const { io, data } = await seeded()
    const db = new SQL.Database(io.files.get(DB_FILE)!)
    db.run("UPDATE meta SET value = '{not json' WHERE key = 'present_keys'")
    io.files.set(DB_FILE, db.export())
    db.close()
    const out = await backendFor(io).load()
    expect(out.origin).toBe('recovered-backup')
    sameJson(out.data, data)
  })
})

describe('SqliteBackend - התאמת גרסאות מבנה', () => {
  async function fileWith(mutate: (db: any) => void) {
    const io = new MemoryStorageIO()
    const b = backendV1(io)
    await b.load()
    await b.save(makeSampleData())
    const db = new SQL.Database(io.files.get(DB_FILE)!)
    mutate(db)
    io.files.set(DB_FILE, db.export())
    io.files.delete(PREV_FILE)
    db.close()
    return io
  }

  it('meta.schema_version שונה מ-user_version: נחשב פגום (לא נטען, לא משודרג)', async () => {
    const io = await fileWith(db => db.run("UPDATE meta SET value='7' WHERE key='schema_version'"))
    await expect(backendFor(io).load()).rejects.toMatchObject({ kind: 'corrupt' })
  })

  it('meta.schema_version חסר', async () => {
    const io = await fileWith(db => db.run("DELETE FROM meta WHERE key='schema_version'"))
    await expect(backendFor(io).load()).rejects.toMatchObject({ kind: 'corrupt' })
  })

  it('user_version שונה מ-meta (נמוך מכפי שנרשם) - נדחה גם לפני שדרוג', async () => {
    const io = await fileWith(db => db.run('PRAGMA user_version = 1'))
    // meta=1,user_version=1 תקין; כאן מדמים meta=2 מול user_version=1
    const io2 = await fileWith(db => db.run("UPDATE meta SET value='2' WHERE key='schema_version'"))
    await expect(backendFor(io2).load()).rejects.toMatchObject({ kind: 'corrupt' })
    await expect(backendFor(io).load()).resolves.toBeTruthy()
  })
})

describe('SqliteBackend - שדרוג מבנה בטעינה', () => {
  async function v1File() {
    const io = new MemoryStorageIO()
    const b = backendV1(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)
    return { io, data }
  }

  it('קובץ ממבנה ישן משודרג: נתונים זהים, קובץ בדיסק משודרג, ועותק הביניים נשאר מהמבנה הישן', async () => {
    const { io, data } = await v1File()
    const oldBytes = Buffer.from(io.files.get(DB_FILE)!)

    const b = new SqliteBackend(SQL, io, {
      readLegacySource: async () => null,
      schemaVersion: 2,
      migrations: { 1: d => d.run('CREATE TABLE added_in_v2 (x TEXT)') },
    })
    const out = await b.load()
    expect(out.origin).toBe('sqlite')
    sameJson(out.data, data)

    const onDisk = new SQL.Database(io.files.get(DB_FILE)!)
    expect(onDisk.exec('PRAGMA user_version')[0].values[0][0]).toBe(2)
    expect(onDisk.exec("SELECT name FROM sqlite_master WHERE name='added_in_v2'").length).toBe(1)
    onDisk.close()
    expect(Buffer.from(io.files.get(PREV_FILE)!).equals(oldBytes)).toBe(true)

    // והפעלה הבאה (אותה גרסה) לא משדרגת שוב ולא נכשלת
    const again = new SqliteBackend(SQL, io, { readLegacySource: async () => null, schemaVersion: 2, migrations: {} })
    sameJson((await again.load()).data, data)
  })

  it('שלב שדרוג חסר: חסימה (לא "פגום"), הקובץ לא משתנה', async () => {
    const { io } = await v1File()
    const before = Buffer.from(io.files.get(DB_FILE)!)
    const b = new SqliteBackend(SQL, io, { readLegacySource: async () => null, schemaVersion: 2, migrations: {} })
    await expect(b.load()).rejects.toBeInstanceOf(StorageBlockedError)
    expect(Buffer.from(io.files.get(DB_FILE)!).equals(before)).toBe(true)
  })

  it('כשל בכתיבת הקובץ המשודרג אינו מונע עבודה, והשמירה הבאה כותבת אותו', async () => {
    const { io, data } = await v1File()
    const b = new SqliteBackend(SQL, io, {
      readLegacySource: async () => null,
      schemaVersion: 2,
      migrations: { 1: d => d.run('CREATE TABLE added_in_v2 (x TEXT)') },
    })
    io.failWrites = 0
    // כשל רק בכתיבה אחרי רענון העותק: ה-prev זהה? לא - הוא עדיין לא קיים, לכן כתיבה ראשונה = prev, שנייה = שדרוג
    const origWrite = io.writeBytesAtomic.bind(io)
    let n = 0
    io.writeBytesAtomic = async (name, bytes) => {
      n++
      if (name === DB_FILE) throw new Error('disk full')
      return origWrite(name, bytes)
    }
    const out = await b.load()
    sameJson(out.data, data)
    io.writeBytesAtomic = origWrite
    data.settings.gemach_name = 'אחרי'
    await b.save(data)
    const onDisk = new SQL.Database(io.files.get(DB_FILE)!)
    expect(onDisk.exec('PRAGMA user_version')[0].values[0][0]).toBe(2)
    onDisk.close()
    expect(n).toBeGreaterThan(0)
  })
})

describe('SqliteBackend - עלות הפעלה', () => {
  it('peek() הראשון מחזיר את מה שנטען (בלי פענוח שני); הבאים קוראים מהמסד העדכני', async () => {
    const io = new MemoryStorageIO()
    const b0 = backendFor(io)
    await b0.load()
    const data = makeSampleData()
    await b0.save(data)

    const b = backendFor(io)
    const out = await b.load()
    const first = b.peek()
    expect(first).toBe(out.data) // אותו אובייקט - לא פענוח נוסף
    sameJson(first, data)

    // שינוי באובייקט שנמסר לא משפיע על המסד
    ;(first as any).settings.gemach_name = 'שונה בזיכרון בלבד'
    const second = b.peek()
    expect(second).not.toBe(first)
    sameJson(second, data)
  })

  it('הפעלה בלי שינויים לא כותבת מחדש את עותק הביניים', async () => {
    const io = new MemoryStorageIO()
    const b0 = backendFor(io)
    await b0.load()
    await b0.save(makeSampleData())
    await backendFor(io).load() // יוצר prev
    const writes = io.writes
    await backendFor(io).load()
    await backendFor(io).load()
    expect(io.writes).toBe(writes)
  })
})

describe('SqliteBackend - אזהרת מקור נוסף', () => {
  it('warning ממקור הנתונים עובר ל-LoadOutcome', async () => {
    const io = new MemoryStorageIO()
    const out = await backendFor(io, { kind: 'localStorage', text: JSON.stringify(makeSampleData()), warning: 'שני מקורות' }).load()
    expect(out.warning).toBe('שני מקורות')
    expect(out.notice).toContain('ללא הצפנה')
  })
})

describe('SqliteBackend - גיבוי מתגלגל של הגרסה התקינה האחרונה', () => {
  /** שעון נשלט: כל קריאה מחזירה את הזמן הנוכחי של הבדיקה */
  function clocked(io: MemoryStorageIO, t: { ms: number }) {
    return new SqliteBackend(SQL, io, { readLegacySource: async () => null, now: () => new Date(t.ms) })
  }
  const T0 = Date.parse('2026-11-08T10:00:00Z')
  const withItem = (n: number) => {
    const d = makeSampleData() as Record<string, any>
    d.__marker = { n }
    return d
  }

  it('אין גיבוי לפני שעבר המרווח; אחריו נוצר גיבוי של הגרסה שנשמרה', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b = clocked(io, t)
    await b.load()
    await b.save(withItem(1))
    expect(io.files.has(BAK1_FILE)).toBe(false)

    t.ms += BACKUP_INTERVAL_MS - 1000
    await b.save(withItem(2))
    expect(io.files.has(BAK1_FILE)).toBe(false)

    t.ms += 2000
    await b.save(withItem(3))
    expect(io.files.has(BAK1_FILE)).toBe(true)
    expect(Buffer.from(io.files.get(BAK1_FILE)!).equals(Buffer.from(io.files.get(DB_FILE)!))).toBe(true)
  })

  it('גלגול: הקודם עובר ל-bak2 ו-bak1 מחזיק את החדש', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b = clocked(io, t)
    await b.load()
    for (let i = 1; i <= 3; i++) {
      t.ms += BACKUP_INTERVAL_MS + 1000
      await b.save(withItem(i))
    }
    const marker = (name: string) => {
      const db = new SQL.Database(io.files.get(name)!)
      try {
        return (JSON.parse(String(db.exec("SELECT value FROM extras WHERE key='__marker'")[0].values[0][0])) as any).n
      } finally {
        db.close()
      }
    }
    expect(marker(BAK1_FILE)).toBe(3)
    expect(marker(BAK2_FILE)).toBe(2)
  })

  it('קובץ ראשי פגום באמצע הפעלה: משחזרים מהגיבוי החדש (לא מתחילת ההפעלה הקודמת), ההודעה מציינת תאריך', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    // הפעלה 1: שמירה, ואז הפעלה 2 (prev = סוף הפעלה 1), עבודה ארוכה עם גיבוי
    const b1 = clocked(io, t)
    await b1.load()
    await b1.save(withItem(1))
    const b2 = clocked(io, t)
    await b2.load()
    t.ms += BACKUP_INTERVAL_MS + 1000
    await b2.save(withItem(2)) // גיבוי כאן
    t.ms += 1000
    await b2.save(withItem(3)) // אחרי הגיבוי, רק בקובץ הראשי
    // הקובץ הראשי נפגע
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))

    const out = await clocked(io, t).load()
    expect(out.origin).toBe('recovered-backup')
    expect((out.data as any).__marker.n).toBe(2) // לא 1 (prev) ולא 3 (אבוד)
    expect(out.notice).toMatch(/גיבוי אוטומטי מתאריך \d{2}\/\d{2}\/\d{4}/)
    expect([...io.files.keys()].some(k => k.startsWith(`${DB_FILE}.corrupt-`))).toBe(true)
  })

  it('הגיבוי החדש פגום: משחזרים מהעותק התקין הבא בתור (לפי זמן שמירה)', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b = clocked(io, t)
    await b.load()
    for (let i = 1; i <= 3; i++) {
      t.ms += BACKUP_INTERVAL_MS + 1000
      await b.save(withItem(i))
    }
    io.files.set(BAK1_FILE, new Uint8Array(Buffer.from('bad'.repeat(2000))))
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))
    const out = await clocked(io, t).load()
    expect(out.origin).toBe('recovered-backup')
    expect((out.data as any).__marker.n).toBe(2) // bak2
  })

  it('כשהקובץ הראשי חסר לגמרי - משחזרים מהחדש ביותר גם כשהוא bak ולא prev', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b1 = clocked(io, t)
    await b1.load()
    await b1.save(withItem(1))
    const b2 = clocked(io, t)
    await b2.load() // prev = גרסה 1
    t.ms += BACKUP_INTERVAL_MS + 1000
    await b2.save(withItem(2)) // bak1 = גרסה 2
    io.files.delete(DB_FILE)
    const out = await clocked(io, t).load()
    expect((out.data as any).__marker.n).toBe(2)
  })

  it('עותק תחילת ההפעלה (prev) חדש מהגיבוי המתגלגל: משחזרים ממנו ולא מהגיבוי הישן יותר', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b1 = clocked(io, t)
    await b1.load()
    t.ms += BACKUP_INTERVAL_MS + 1000
    await b1.save(withItem(1)) // bak1 = 1
    t.ms += 1000
    await b1.save(withItem(2)) // main = 2
    t.ms += 1000
    const b2 = clocked(io, t)
    await b2.load() // prev = 2 (חדש מ-bak1)
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))
    const out = await clocked(io, t).load()
    expect(out.origin).toBe('recovered-backup')
    expect((out.data as any).__marker.n).toBe(2)
  })

  it('כשל בגלגול הגיבוי אינו מכשיל את השמירה', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b = clocked(io, t)
    await b.load()
    await b.save(withItem(1))
    t.ms += BACKUP_INTERVAL_MS + 1000
    const realWrite = io.writeBytesAtomic.bind(io)
    io.writeBytesAtomic = async (name, bytes) => {
      if (name === BAK1_FILE) throw new Error('disk full')
      return realWrite(name, bytes)
    }
    await expect(b.save(withItem(2))).resolves.toBeUndefined()
    expect((await clocked(io, t).load()).origin).toBe('sqlite')
  })

  it('startFresh מעביר הצידה גם את הגיבויים (כדי שלא ישוחזרו נתונים שהמשתמש בחר להשליך)', async () => {
    const io = new MemoryStorageIO()
    const t = { ms: T0 }
    const b = clocked(io, t)
    await b.load()
    for (let i = 1; i <= 2; i++) {
      t.ms += BACKUP_INTERVAL_MS + 1000
      await b.save(withItem(i))
    }
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))
    const broken = clocked(io, t)
    await expect(broken.load()).resolves.toBeTruthy() // משוחזר, לא חסום
    // מדמים מצב חסום: כל הגיבויים פגומים
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('x'.repeat(5000))))
    for (const n of [BAK1_FILE, BAK2_FILE, PREV_FILE]) io.files.set(n, new Uint8Array(Buffer.from('y'.repeat(5000))))
    const blocked = clocked(io, t)
    await expect(blocked.load()).rejects.toBeInstanceOf(StorageBlockedError)
    await blocked.startFresh()
    expect(io.files.has(BAK1_FILE)).toBe(false)
    expect(io.files.has(BAK2_FILE)).toBe(false)
    expect(io.files.has(PREV_FILE)).toBe(false)
    const after = await clocked(io, t).load()
    expect(after.origin).toBe('sqlite')
  })
})

describe('SqliteBackend - קריאת מקור ישן נכשלה', () => {
  it('LegacyReadError חוסם (legacy-read-failed), לא יוצר קבצים, ואין startFresh', async () => {
    const io = new MemoryStorageIO()
    const b = new SqliteBackend(SQL, io, {
      readLegacySource: async () => {
        throw new LegacyReadError('נעול')
      },
    })
    await expect(b.load()).rejects.toMatchObject({ name: 'StorageBlockedError', kind: 'legacy-read-failed' })
    expect(io.names()).toEqual([])
    expect(b.isBlocked()).toBe(true)
    await expect(b.save(makeSampleData())).rejects.toThrow()
    await expect(b.startFresh()).rejects.toThrow()
    expect(io.names()).toEqual([])
  })

  it('שגיאה אחרת מ-readLegacySource אינה מומרת לחסימה (ממשיכה כשגיאה רגילה)', async () => {
    const b = new SqliteBackend(SQL, new MemoryStorageIO(), {
      readLegacySource: async () => {
        throw new Error('other')
      },
    })
    await expect(b.load()).rejects.not.toBeInstanceOf(StorageBlockedError)
  })
})
