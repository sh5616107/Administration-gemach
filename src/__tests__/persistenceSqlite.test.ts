/**
 * בדיקות ל-persistence.ts: בחירת מצב האחסון (דפדפן / SQLite / fallback / חסום)
 * ובחירת מקור המעבר, כולל התנהגות הזיהוי של Tauri.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import {
  __resetStorageForTests,
  __setRetryDelaysForTests,
  __setStorageFactoryForTests,
  getSaveFailure,
  retrySaveNow,
  subscribeStorageStatus,
  flushStorage,
  getStorageStatus,
  loadAppData,
  saveAppData,
  startFreshAfterStorageError,
} from '../services/persistence'
import { __setSqlJsLoaderForTests } from '../services/storage/sqlJsLoader'
import { DB_FILE } from '../services/storage/sqliteBackend'
import type { LegacyJsonFile, TauriStorage } from '../services/storage/tauriStorageIO'
import { MemoryStorageIO, makeSampleData } from './helpers/memoryStorageIO'

let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await initSqlJs()
})

const w = () => (globalThis as any).window as Record<string, any>
const sameJson = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b))

function factoryFor(io: MemoryStorageIO, legacyJson: LegacyJsonFile | null = null) {
  return async (): Promise<TauriStorage> => ({
    io,
    dirName: 'AppLocalData',
    readLegacyJson: async () => legacyJson,
  })
}

function jsonFile(text: string) {
  const state = { marked: false, quarantined: false }
  const file: LegacyJsonFile = {
    text,
    markMigrated: async () => { state.marked = true },
    quarantine: async () => { state.quarantined = true },
  }
  return { file, state }
}

beforeEach(() => {
  __resetStorageForTests()
  __setSqlJsLoaderForTests(async () => SQL)
  localStorage.clear()
  delete w().__TAURI__
  delete w().__TAURI_INTERNALS__
})

afterEach(() => {
  __resetStorageForTests()
  __setStorageFactoryForTests(null)
  __setSqlJsLoaderForTests(null)
  delete w().__TAURI__
  delete w().__TAURI_INTERNALS__
  localStorage.clear()
})

describe('persistence - מחוץ ל-Tauri (דפדפן/טסטים)', () => {
  it('נשאר על localStorage בדיוק כמו קודם, בלי SQLite', async () => {
    const data = makeSampleData()
    await saveAppData(data)
    expect(localStorage.getItem('gemach_data_v1')).toBe(JSON.stringify(data))
    sameJson(await loadAppData(), data)
    expect(getStorageStatus().mode).toBe('legacy-local')
  })

  it('אין נתונים -> null', async () => {
    expect(await loadAppData()).toBeNull()
  })
})

describe('persistence - Tauri 2 בלי withGlobalTauri (רק __TAURI_INTERNALS__)', () => {
  it('מעביר את הנתונים מ-localStorage (המקום שבו הם נשמרו בפועל), ומעכשיו שומר ב-SQLite', async () => {
    w().__TAURI_INTERNALS__ = {}
    const original = makeSampleData()
    localStorage.setItem('gemach_data_v1', JSON.stringify(original))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))

    const loaded = await loadAppData()
    sameJson(loaded, original)
    expect(getStorageStatus()).toMatchObject({ mode: 'sqlite', state: 'ok', origin: 'migrated-localStorage' })
    expect(io.files.has(DB_FILE)).toBe(true)
    // המקור נשמר בשם חדש ולא נמחק
    expect(localStorage.getItem('gemach_data_v1')).toBeNull()
    expect(localStorage.getItem('gemach_data_v1.pre-sqlite')).toBe(JSON.stringify(original))

    const updated = JSON.parse(JSON.stringify(original))
    updated.settings.gemach_name = 'חדש'
    await saveAppData(updated)
    expect(localStorage.getItem('gemach_data_v1')).toBeNull() // לא נכתב יותר ל-localStorage

    // "הפעלה מחדש"
    __resetStorageForTests()
    sameJson(await loadAppData(), updated)
    expect(getStorageStatus().origin).toBe('sqlite')
  })

  it('קובץ gemach_data.json שהגרסה הקודמת לא קראה בסביבה זו - לא נבחר כמקור', async () => {
    w().__TAURI_INTERNALS__ = {}
    const stale = makeSampleData()
    const { file, state } = jsonFile(JSON.stringify(stale))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io, file))

    expect(await loadAppData()).toBeNull()
    expect(state.marked).toBe(false)
  })

  it('התקנה חדשה: אין נתונים; הקובץ נוצר בשמירה הראשונה', async () => {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    expect(await loadAppData()).toBeNull()
    expect(io.files.has(DB_FILE)).toBe(false)
    const data = makeSampleData()
    await saveAppData(data)
    expect(io.files.has(DB_FILE)).toBe(true)
    sameJson(await loadAppData(), data)
  })
})

describe('persistence - Tauri עם __TAURI__ (הקוד הקודם קרא/כתב קובץ)', () => {
  it('מעביר מקובץ ה-JSON ומעביר אותו הצידה', async () => {
    w().__TAURI__ = {}
    w().__TAURI_INTERNALS__ = {}
    const original = makeSampleData()
    const { file, state } = jsonFile(JSON.stringify(original))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io, file))

    sameJson(await loadAppData(), original)
    expect(getStorageStatus().origin).toBe('migrated-json-file')
    expect(state.marked).toBe(true)
  })

  it('אין קובץ אבל יש localStorage (כמו הקוד הקודם) -> מעביר מ-localStorage', async () => {
    w().__TAURI__ = {}
    w().__TAURI_INTERNALS__ = {}
    const original = makeSampleData()
    localStorage.setItem('gemach_data_v1', JSON.stringify(original))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    sameJson(await loadAppData(), original)
    expect(getStorageStatus().origin).toBe('migrated-localStorage')
  })
})

describe('persistence - כשלים', () => {
  beforeEach(() => {
    w().__TAURI_INTERNALS__ = {}
  })

  it('מנוע SQLite לא נטען ועדיין אין מסד: ממשיכים על האחסון הישן (localStorage) בלי לאבד דבר', async () => {
    const original = makeSampleData()
    localStorage.setItem('gemach_data_v1', JSON.stringify(original))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    __setSqlJsLoaderForTests(async () => { throw new Error('wasm failed') })

    sameJson(await loadAppData(), original)
    expect(getStorageStatus()).toMatchObject({ mode: 'legacy-fallback', state: 'ok' })
    expect(getStorageStatus().notice).toContain('wasm failed')

    const updated = JSON.parse(JSON.stringify(original))
    updated.settings.gemach_name = 'נשמר ללגסי'
    await saveAppData(updated)
    expect(JSON.parse(localStorage.getItem('gemach_data_v1')!).settings.gemach_name).toBe('נשמר ללגסי')
    expect(io.files.size).toBe(0)
  })

  it('מנוע SQLite לא נטען אבל כבר קיים מסד: חסימה - לא חוזרים לנתונים ישנים ולא כותבים', async () => {
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    await saveAppData(makeSampleData()) // יוצר מסד
    __resetStorageForTests()

    localStorage.setItem('gemach_data_v1', JSON.stringify({ settings: { stale: 'yes' } }))
    __setSqlJsLoaderForTests(async () => { throw new Error('wasm failed') })

    await expect(loadAppData()).rejects.toThrow('wasm failed')
    expect(getStorageStatus()).toMatchObject({ state: 'error', canStartFresh: false })
    await expect(saveAppData({ settings: {} })).rejects.toThrow()
    expect(JSON.parse(localStorage.getItem('gemach_data_v1')!)).toEqual({ settings: { stale: 'yes' } })
  })

  it('אין גישה לתיקיית הנתונים: חסימה ולא כתיבה לשום מקום', async () => {
    localStorage.setItem('gemach_data_v1', JSON.stringify(makeSampleData()))
    __setStorageFactoryForTests(async () => { throw new Error('no dir') })
    await expect(loadAppData()).rejects.toThrow('no dir')
    expect(getStorageStatus().state).toBe('error')
    await expect(saveAppData({ settings: {} })).rejects.toThrow()
  })

  it('מסד פגום: סטטוס שגיאה; "התחל מחדש" פותח מסד ריק, ובהפעלה הבאה לא חוזרים לנתונים הישנים', async () => {
    const io = new MemoryStorageIO()
    io.files.set(DB_FILE, new Uint8Array(Buffer.from('garbage'.repeat(300))))
    localStorage.setItem('gemach_data_v1', JSON.stringify(makeSampleData())) // מקור ישן מיושן
    __setStorageFactoryForTests(factoryFor(io))

    await expect(loadAppData()).rejects.toBeDefined()
    expect(getStorageStatus()).toMatchObject({ state: 'error', canStartFresh: true })
    await expect(saveAppData(makeSampleData())).rejects.toThrow()

    await startFreshAfterStorageError()
    expect(getStorageStatus().state).toBe('ok')

    __resetStorageForTests()
    expect(await loadAppData()).toBeNull() // ריק, לא הנתונים המיושנים
    expect(getStorageStatus().origin).toBe('sqlite')
  })

  it('"התחל מחדש" לא זמין כשאין מצב שגיאה', async () => {
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    await loadAppData()
    await expect(startFreshAfterStorageError()).rejects.toThrow()
  })

  it('שמירות מקבילות דרך ה-API הציבורי נשמרות בשלמותן', async () => {
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    const data = makeSampleData()
    const ps: Promise<void>[] = []
    for (let i = 0; i < 15; i++) {
      data.settings[`k${i}`] = String(i)
      ps.push(saveAppData(data))
    }
    await Promise.all(ps)
    await flushStorage()
    __resetStorageForTests()
    sameJson(await loadAppData(), data)
  })
})

describe('persistence - שני מקורות ישנים', () => {
  const small = (n: number) => ({ settings: { a: '1' }, loans: Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i}`, { id: `l${i}` }])) })

  it('Tauri בלי __TAURI__: מועבר localStorage, הקובץ נשאר ללא שינוי ומוצגת אזהרה עם מספרי רשומות', async () => {
    w().__TAURI_INTERNALS__ = {}
    localStorage.setItem('gemach_data_v1', JSON.stringify(small(3)))
    const { file, state } = jsonFile(JSON.stringify(small(9)))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io, file))

    sameJson(await loadAppData(), small(3))
    const st = getStorageStatus()
    expect(st.origin).toBe('migrated-localStorage')
    expect(st.warning).toContain('gemach_data.json')
    expect(st.warning).toContain('4 רשומות') // settings(1)+loans(3)
    expect(st.warning).toContain('10 רשומות')
    expect(state.marked).toBe(false)
    expect(state.quarantined).toBe(false)
  })

  it('עם __TAURI__: מועבר הקובץ, localStorage לא נגע, ואזהרה', async () => {
    w().__TAURI__ = {}
    w().__TAURI_INTERNALS__ = {}
    localStorage.setItem('gemach_data_v1', JSON.stringify(small(7)))
    const { file } = jsonFile(JSON.stringify(small(2)))
    __setStorageFactoryForTests(factoryFor(new MemoryStorageIO(), file))

    sameJson(await loadAppData(), small(2))
    expect(getStorageStatus().origin).toBe('migrated-json-file')
    expect(getStorageStatus().warning).toContain('localStorage')
    expect(localStorage.getItem('gemach_data_v1')).toBe(JSON.stringify(small(7)))
  })

  it('שני מקורות עם תוכן זהה: בלי אזהרה', async () => {
    w().__TAURI_INTERNALS__ = {}
    const text = JSON.stringify(small(3))
    localStorage.setItem('gemach_data_v1', text)
    const { file } = jsonFile(text)
    __setStorageFactoryForTests(factoryFor(new MemoryStorageIO(), file))
    await loadAppData()
    expect(getStorageStatus().warning).toBeUndefined()
  })

  it('מקור יחיד: בלי אזהרה', async () => {
    w().__TAURI_INTERNALS__ = {}
    localStorage.setItem('gemach_data_v1', JSON.stringify(small(3)))
    __setStorageFactoryForTests(factoryFor(new MemoryStorageIO()))
    await loadAppData()
    expect(getStorageStatus().warning).toBeUndefined()
  })
})

describe('persistence - כשלי שמירה מגיעים לממשק (גם בשמירות שגר-ושכח)', () => {
  async function sqliteReady() {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(factoryFor(io))
    await loadAppData()
    return io
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('כשל כתיבה: נרשם מצב כשל, המנויים מקבלים עדכון, ושמירה מוצלחת מנקה אותו', async () => {
    const io = await sqliteReady()
    const seen: Array<string | null> = []
    const unsub = subscribeStorageStatus(() => seen.push(getSaveFailure()?.message ?? null))
    __setRetryDelaysForTests([1_000_000]) // בלי ניסיון חוזר אוטומטי בבדיקה הזו

    io.failWrites = 1
    // "שגר ושכח": מי שקורא לא מחכה ולא תופס, אבל ה-Promise עדיין נדחה
    await expect(saveAppData(makeSampleData())).rejects.toThrow('disk full')
    expect(getSaveFailure()).toMatchObject({ message: 'disk full', attempts: 1 })

    await saveAppData(makeSampleData())
    expect(getSaveFailure()).toBeNull()
    expect(seen).toEqual(['disk full', null])
    unsub()
  })

  it('ניסיון חוזר אוטומטי שומר את המצב העדכני (האובייקט החי), ומנקה את הכשל', async () => {
    vi.useFakeTimers()
    const io = await sqliteReady()
    __setRetryDelaysForTests([1000, 2000])

    const live: Record<string, any> = makeSampleData()
    io.failWrites = 2
    await expect(saveAppData(live)).rejects.toThrow()
    expect(getSaveFailure()?.attempts).toBe(1)

    live.__changedAfterFailure = { yes: true } // האפליקציה המשיכה לעבוד
    await vi.advanceTimersByTimeAsync(1000) // ניסיון חוזר #1 נכשל (failWrites עוד אחד)
    expect(getSaveFailure()?.attempts).toBe(2)
    await vi.advanceTimersByTimeAsync(2000) // ניסיון חוזר #2 מצליח
    expect(getSaveFailure()).toBeNull()

    // ובדיסק יש את המצב העדכני
    __resetStorageForTests()
    w().__TAURI_INTERNALS__ = {}
    __setStorageFactoryForTests(factoryFor(io))
    expect(((await loadAppData()) as any).__changedAfterFailure).toEqual({ yes: true })
  })

  it('retrySaveNow ידני דוחה כשעדיין נכשל, ומצליח כשהדיסק חזר', async () => {
    const io = await sqliteReady()
    __setRetryDelaysForTests([1_000_000])
    io.failWrites = 2
    await expect(saveAppData(makeSampleData())).rejects.toThrow()
    await expect(retrySaveNow()).rejects.toThrow()
    expect(getSaveFailure()?.attempts).toBe(2)
    await retrySaveNow()
    expect(getSaveFailure()).toBeNull()
  })

  it('גם באחסון הישן (localStorage): כשל כתיבה מדווח', async () => {
    __setRetryDelaysForTests([1_000_000])
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      await expect(saveAppData(makeSampleData())).rejects.toThrow()
      expect(getSaveFailure()?.message).toMatch(/Quota/)
    } finally {
      spy.mockRestore()
    }
    await saveAppData(makeSampleData())
    expect(getSaveFailure()).toBeNull()
  })

  it('בלי כשל: retrySaveNow אינו עושה דבר', async () => {
    await sqliteReady()
    await expect(retrySaveNow()).resolves.toBeUndefined()
  })
})

describe('persistence - מקור JSON ישן שקיים אך לא ניתן לקריאה', () => {
  const failingFile = (io: MemoryStorageIO) => async (): Promise<TauriStorage> => ({
    io,
    dirName: 'AppLocalData',
    readLegacyJson: async () => {
      throw new Error('EBUSY: file is locked')
    },
  })

  it('עם __TAURI__ (הקוד הקודם קרא את הקובץ): חסימה מפורשת - לא עוברים ל-localStorage, לא נוצר מסד, אין התחלה-מחדש', async () => {
    w().__TAURI__ = {}
    const stale = makeSampleData()
    localStorage.setItem('gemach_data_v1', JSON.stringify(stale)) // עותק שעלול להיות מיושן
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(failingFile(io))

    await expect(loadAppData()).rejects.toThrow(/לא ניתן לקרוא את קובץ הנתונים/)
    const st = getStorageStatus()
    expect(st.state).toBe('error')
    expect(st.canStartFresh).toBe(false)
    expect(st.error).toMatch(/EBUSY/)

    // לא נוצר שום קובץ, localStorage לא שונה, ושמירה נדחית
    expect(io.names()).toEqual([])
    expect(localStorage.getItem('gemach_data_v1')).toBe(JSON.stringify(stale))
    await expect(saveAppData(makeSampleData())).rejects.toThrow()
    expect(io.names()).toEqual([])
    await expect(startFreshAfterStorageError()).rejects.toThrow()
  })

  it('לאחר שהקובץ שוב קריא (הפעלה הבאה) - המעבר מתבצע כרגיל מהקובץ', async () => {
    w().__TAURI__ = {}
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(failingFile(io))
    await expect(loadAppData()).rejects.toThrow()

    __resetStorageForTests()
    w().__TAURI__ = {}
    const data = makeSampleData()
    __setStorageFactoryForTests(factoryFor(io, jsonFile(JSON.stringify(data)).file))
    sameJson(await loadAppData(), data)
    expect(getStorageStatus().state).toBe('ok')
  })

  it('בלי __TAURI__ (הנתונים נשמרו ב-localStorage): לא חוסמים, מעבירים מ-localStorage, ומציגים אזהרה על הקובץ', async () => {
    w().__TAURI_INTERNALS__ = {}
    const data = makeSampleData()
    localStorage.setItem('gemach_data_v1', JSON.stringify(data))
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(failingFile(io))
    sameJson(await loadAppData(), data)
    const st = getStorageStatus()
    expect(st.state).toBe('ok')
    expect(st.warning).toMatch(/gemach_data\.json.*לא ניתן לקרוא/)
  })

  it('בלי __TAURI__ ובלי localStorage: מסד חדש + אזהרה (הקובץ לא נוגעים בו)', async () => {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    __setStorageFactoryForTests(failingFile(io))
    expect(await loadAppData()).toBeNull()
    expect(getStorageStatus().warning).toMatch(/לא הועבר ולא שונה/)
  })
})
