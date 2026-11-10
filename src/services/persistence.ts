/**
 * persistence.ts
 * --------------
 * נקודת הכניסה היחידה לשמירה וטעינה של כל נתוני האפליקציה.
 * הממשק החיצוני (saveAppData / loadAppData) לא השתנה - database.ts, ה-repositories
 * וכל הטסטים הקיימים ממשיכים לעבוד בלי שינוי.
 *
 * מה שהשתנה בפנים:
 *  - באפליקציית שולחן העבודה (Tauri): הנתונים נשמרים בקובץ SQLite (gemach.sqlite),
 *    דרך SqliteBackend. בהפעלה הראשונה מתבצע מעבר חד-פעמי ומאומת מהאחסון הישן
 *    (gemach_data.json, או localStorage אם זה היה מקום האחסון בפועל).
 *  - מחוץ ל-Tauri (דפדפן לפיתוח, טסטים): ללא שינוי - localStorage.
 *  - אם מסד ה-SQLite אינו זמין והמעבר טרם בוצע: חוזרים בבטחה לאחסון הישן (כמו עד היום).
 *  - אם מסד ה-SQLite קיים אך אינו קריא: לא כותבים כלום ולא טוענים נתונים ישנים -
 *    האפליקציה מציגה הודעה (ר' getStorageStatus), במקום לדרוס נתונים.
 *
 * ר' docs/SQLITE_MIGRATION.md
 */

import logger from '../utils/logger'
import { DB_FILE, LegacyReadError, RECOVERY_FILES, SqliteBackend, StorageBlockedError, type BackupInfo, type LegacySource, type LoadOrigin } from './storage/sqliteBackend'
import { loadSqlJs } from './storage/sqlJsLoader'
import { createTauriStorage, type TauriStorage } from './storage/tauriStorageIO'

const STORAGE_KEY = 'gemach_data_v1'
const STORAGE_KEY_MIGRATED = 'gemach_data_v1.pre-sqlite'
const DATA_FILE = 'gemach_data.json'
const TMP_FILE = 'gemach_data.json.tmp'

// ───────────────────────── אחסון ישן (JSON / localStorage) ─────────────────────────
// הקוד הזה זהה להתנהגות שהייתה עד היום, והוא ממשיך לשמש מחוץ ל-Tauri ובמצב fallback.

/**
 * Writes `json` to `fileName` atomically within `baseDir`: writes to a
 * temporary sibling file first, then renames it over the real file.
 * A crash/power-loss mid-write leaves either the old file intact or the
 * new one fully written — never a half-written gemach_data.json.
 * (See spec: "אפיון פיצ'ר: צירוף מסמכים" section 7.3.)
 */
async function writeFileAtomic(fileName: string, json: string, baseDir: any): Promise<void> {
  const { writeTextFile, rename, remove, exists } = await import('@tauri-apps/plugin-fs')

  await writeTextFile(TMP_FILE, json, { baseDir })

  try {
    await rename(TMP_FILE, fileName, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
  } catch (renameError) {
    // Clean up the temp file if the rename itself failed, so we don't
    // leave stray .tmp files behind on repeated failures.
    try {
      if (await exists(TMP_FILE, { baseDir })) {
        await remove(TMP_FILE, { baseDir })
      }
    } catch {
      // best-effort cleanup only
    }
    throw renameError
  }
}

async function legacySaveAppData(obj: unknown): Promise<void> {
  const json = JSON.stringify(obj)

  // Try Tauri fs
  if ((window as any).__TAURI__) {
    try {
      const { BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')

      // Get the app local data directory
      const localDataDir = await appLocalDataDir()
      console.log('🔍 App Local Data Dir:', localDataDir)

      // Try to write to local data directory (should be next to exe in portable mode)
      try {
        await writeFileAtomic(DATA_FILE, json, BaseDirectory.AppLocalData)
        console.log('💾 ✅ Saved to AppLocalData:', localDataDir)
        return
      } catch (localError) {
        console.warn('⚠️ Cannot write to AppLocalData, trying AppData:', localError)
        // Fall back to AppData
        await writeFileAtomic(DATA_FILE, json, BaseDirectory.AppData)
        console.log('💾 Saved to AppData (fallback)')
        return
      }
    } catch (e) {
      console.warn('Tauri write failed, falling back to localStorage:', e)
    }
  }

  // Fallback: localStorage (writes are already effectively atomic here —
  // the browser either commits the full string or throws, e.g. on quota)
  try {
    localStorage.setItem(STORAGE_KEY, json)
    console.log('💾 Saved to localStorage')
    return
  } catch (e) {
    console.error('localStorage save failed:', e)
    throw e
  }
}

async function legacyLoadAppData(): Promise<any | null> {
  // Try Tauri fs
  if ((window as any).__TAURI__) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')

      // Get the app local data directory
      const localDataDir = await appLocalDataDir()
      console.log('🔍 App Local Data Dir:', localDataDir)

      // Try to read from local data directory
      try {
        const content = await readTextFile('gemach_data.json', { baseDir: BaseDirectory.AppLocalData })
        console.log('📂 ✅ Loaded from AppLocalData:', localDataDir)
        return JSON.parse(content)
      } catch (localError) {
        console.warn('⚠️ Cannot read from AppLocalData, trying AppData:', localError)
        // Fall back to AppData
        const content = await readTextFile('gemach_data.json', { baseDir: BaseDirectory.AppData })
        console.log('📂 Loaded from AppData (fallback)')
        return JSON.parse(content)
      }
    } catch (e) {
      console.warn('Tauri read failed, will try localStorage:', e)
    }
  }

  // Fallback: localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      console.log('📂 Loaded from localStorage')
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('localStorage load failed:', e)
  }

  return null
}

// ───────────────────────────── מצב האחסון ─────────────────────────────

export type StorageMode =
  /** דפדפן / טסטים: localStorage בלבד */
  | 'legacy-local'
  /** אפליקציית שולחן עבודה עם מסד SQLite */
  | 'sqlite'
  /** SQLite לא זמין והמעבר טרם בוצע - ממשיכים על האחסון הישן (כמו עד היום) */
  | 'legacy-fallback'

export interface StorageStatus {
  mode: StorageMode
  /** 'error' = האחסון חסום והכתיבה מושבתת עד התערבות */
  state: 'ok' | 'error'
  origin?: LoadOrigin
  /** הודעה לידיעת המשתמש (מעבר/שחזור/דחיית מעבר) - לא שגיאה */
  notice?: string
  /** אזהרה שדורשת תשומת לב (למשל: נמצא מקור נתונים ישן נוסף שלא הועבר) */
  warning?: string
  error?: string
  /** האם ניתן להציע "התחל ממסד חדש" (הקבצים הישנים נשמרים בצד) */
  canStartFresh?: boolean
}

let mode: StorageMode = 'legacy-local'
let status: StorageStatus = { mode, state: 'ok' }
let backend: SqliteBackend | null = null
let initPromise: Promise<void> | null = null
let initError: Error | null = null

let storageFactory: () => Promise<TauriStorage> = createTauriStorage

/** לשימוש בטסטים בלבד: החלפת גישת הדיסק ואיפוס המצב הפנימי */
export function __setStorageFactoryForTests(factory: (() => Promise<TauriStorage>) | null): void {
  storageFactory = factory ?? createTauriStorage
}
export function __resetStorageForTests(): void {
  backend?.close()
  backend = null
  initPromise = null
  initError = null
  mode = 'legacy-local'
  status = { mode, state: 'ok' }
  clearRetryTimer()
  saveFailure = null
  latestToSave = undefined
  retryDelays = [3000, 10000, 30000, 60000]
  listeners.clear()
}

export function getStorageStatus(): StorageStatus {
  return status
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
}

/** מספר הרשומות הכולל בטקסט JSON של נתוני האפליקציה (לאזהרת "שני מקורות"); -1 אם לא ניתן לקרוא */
function countRecords(text: string): number {
  try {
    const obj = JSON.parse(text)
    if (obj === null || typeof obj !== 'object') return -1
    let n = 0
    for (const v of Object.values(obj)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) n += Object.keys(v).length
    }
    return n
  } catch {
    return -1
  }
}

function describeCount(n: number): string {
  return n >= 0 ? `${n} רשומות` : 'תוכן לא קריא'
}

/**
 * איזה אחסון ישן הקוד הקודם היה קורא ממנו *בסביבה הזו בפועל*? הוא קרא קובץ רק אם
 * window.__TAURI__ מוגדר (ב-Tauri 2 זה קורה רק עם withGlobalTauri); אחרת - localStorage.
 * המעבר מעתיק בדיוק את מה שהמשתמש ראה עד היום, ולא מנחש מקור אחר.
 *
 * אם קיימים *שני* מקורות עם תוכן שונה: מועבר רק הראשי (לפי הכלל לעיל), המשני נשאר
 * ללא שינוי (לא נמחק ולא מועבר הצידה), והמשתמש מקבל אזהרה מפורשת עם מספר הרשומות בכל צד.
 */
async function readLegacySource(tauri: TauriStorage, warn: (message: string) => void): Promise<LegacySource | null> {
  const legacyUsedFile = typeof window !== 'undefined' && !!(window as any).__TAURI__

  let file: Awaited<ReturnType<TauriStorage['readLegacyJson']>> = null
  try {
    file = await tauri.readLegacyJson()
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    if (legacyUsedFile) {
      // ההחלטה: חוסמים. הקוד הקודם קרא ושמר את הנתונים בקובץ הזה; אם אי אפשר לקרוא אותו,
      // המעבר ממקור אחר (localStorage - שעלול להיות מיושן/ריק) או פתיחת מסד ריק היו מסתירים
      // את הנתונים האמיתיים. הקובץ לא נוגעים בו, והבעיה לרוב זמנית (נעילת קובץ, הרשאות).
      throw new LegacyReadError(
        `לא ניתן לקרוא את קובץ הנתונים הקיים (gemach_data.json בתיקיית הנתונים): ${reason}. ` +
          'כדי לא לעבוד על נתונים חלקיים או ישנים, התוכנה לא תמשיך. ' +
          'בדוק שהקובץ אינו נעול על ידי תוכנה אחרת (גיבוי/אנטי-וירוס) ושיש הרשאת קריאה, ואז הפעל מחדש. ' +
          'הקובץ לא נמחק ולא שונה.'
      )
    }
    // בסביבה זו הגרסה הקודמת לא קראה את הקובץ (הנתונים נשמרו ב-localStorage), ולכן אין חסימה -
    // אבל מציגים אזהרה כדי שלא יישאר "שקט" לגבי קובץ שקיים ולא נקרא.
    logger.warn('קריאת gemach_data.json (שאינו בשימוש בסביבה זו) נכשלה', e)
    warn(`הקובץ gemach_data.json קיים בתיקיית הנתונים אך לא ניתן לקרוא אותו (${reason}). הוא לא הועבר ולא שונה.`)
  }

  let stored: string | null = null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch (e) {
    logger.warn('localStorage לא זמין בעת בדיקת מקור המעבר', e)
  }

  const fromFile = (f: NonNullable<typeof file>): LegacySource => ({
    kind: 'json-file',
    text: f.text,
    afterMigrated: f.markMigrated,
    quarantine: f.quarantine,
  })
  const fromStorage = (text: string): LegacySource => {
    const moveKey = async () => {
      // מעבירים את המפתח הצידה (לא מוחקים את התוכן): כך גרסה ישנה לא תטען בטעות עותק
      // מיושן, וכך לא יתבצע מעבר חוזר ממנו. אם אין מקום - משאירים כמו שהוא.
      localStorage.setItem(STORAGE_KEY_MIGRATED, text)
      localStorage.removeItem(STORAGE_KEY)
    }
    return { kind: 'localStorage', text, afterMigrated: moveKey, quarantine: moveKey }
  }

  let primary: LegacySource | null = null
  let otherText: string | null = null
  let otherName = ''
  if (legacyUsedFile) {
    if (file) {
      primary = fromFile(file)
      otherText = stored
      otherName = 'אחסון הדפדפן הפנימי (localStorage)'
    } else if (stored) {
      primary = fromStorage(stored)
    }
  } else if (stored) {
    primary = fromStorage(stored)
    otherText = file ? file.text : null
    otherName = 'הקובץ gemach_data.json'
  }

  if (primary && otherText && otherText !== primary.text) {
    const primaryName = primary.kind === 'json-file' ? 'הקובץ gemach_data.json' : 'אחסון הדפדפן הפנימי (localStorage)'
    primary.warning =
      `נמצאו שני מקורות נתונים ישנים עם תוכן שונה. הועבר: ${primaryName} (${describeCount(countRecords(primary.text))}). ` +
      `לא הועבר ונשאר ללא שינוי: ${otherName} (${describeCount(countRecords(otherText))}). ` +
      'אם הנתונים העדכניים יותר היו במקור שלא הועבר - אל תמחק אותו ופנה לתמיכה.'
    logger.warn(primary.warning)
  }
  return primary
}

async function initStorage(): Promise<void> {
  if (!isTauriRuntime()) {
    mode = 'legacy-local'
    status = { mode, state: 'ok' }
    return
  }

  let tauri: TauriStorage
  try {
    tauri = await storageFactory()
  } catch (e) {
    // לא ניתן אפילו לגשת לתיקיית הנתונים: לא ניתן לדעת אם כבר קיים מסד -> לא ממשיכים בשקט
    return setBlocked(
      'corrupt',
      `לא ניתן לגשת לתיקיית הנתונים של התוכנה: ${(e as Error).message}`,
      false
    )
  }

  // האם כבר קיים מסד SQLite? אם כן, הוא מקור האמת ואסור לחזור לאחסון הישן.
  let sqliteFileExists: boolean
  try {
    // קובץ ראשי או כל גיבוי/עותק שחזור: גם אם הראשי נמחק, אסור "לחזור אחורה" לנתונים ישנים
    sqliteFileExists = false
    for (const name of [DB_FILE, ...RECOVERY_FILES]) {
      if (await tauri.io.exists(name)) {
        sqliteFileExists = true
        break
      }
    }
  } catch (e) {
    return setBlocked('corrupt', `לא ניתן לבדוק אם מסד הנתונים קיים: ${(e as Error).message}`, false)
  }

  let be: SqliteBackend | null = null
  const extraWarnings: string[] = []
  try {
    const SQL = await loadSqlJs()
    be = new SqliteBackend(SQL, tauri.io, {
      readLegacySource: () => readLegacySource(tauri, m => extraWarnings.push(m)),
      log: (level, message, extra) => {
        if (level === 'error') logger.error(message, extra)
        else if (level === 'warn') logger.warn(message, extra)
        else logger.info(message, extra)
      },
    })
    backend = be
    const outcome = await be.load()
    mode = 'sqlite'
    const warning = [outcome.warning, ...extraWarnings].filter(Boolean).join(' ') || undefined
    status = { mode, state: 'ok', origin: outcome.origin, notice: outcome.notice, warning }
    logger.info(`🗄️ מסד SQLite נטען (${outcome.origin}) מתוך ${tauri.dirName}`)
  } catch (e) {
    if (e instanceof StorageBlockedError) {
      initError = e
      mode = 'sqlite'
      status = {
        mode,
        state: 'error',
        error: e.message,
        canStartFresh: e.kind !== 'newer-version' && e.kind !== 'legacy-read-failed',
      }
      logger.error('❌ אחסון SQLite חסום:', e.message)
      return
    }

    // כשל אחר (מנוע SQLite לא נטען, אימות המעבר נכשל וכו').
    if (sqliteFileExists) {
      // כבר קיים מסד -> אסור "לחזור אחורה" לנתונים ישנים
      return setBlocked('corrupt', `לא ניתן לפתוח את מסד הנתונים: ${(e as Error).message}`, false)
    }
    // טרם בוצע מעבר: ממשיכים בבטחה על האחסון הישן, בדיוק כמו בגרסאות קודמות.
    logger.error(`⚠️ המעבר למסד SQLite נדחה, ממשיכים על האחסון הישן: ${(e as Error).message}`)
    backend?.close()
    backend = null
    mode = 'legacy-fallback'
    status = {
      mode,
      state: 'ok',
      notice: `המעבר למסד נתונים חדש נדחה (${(e as Error).message}). המערכת ממשיכה לעבוד כרגיל ותנסה שוב בהפעלה הבאה.`,
    }
  }
}

function setBlocked(kind: 'corrupt' | 'newer-version', message: string, canStartFresh: boolean): void {
  initError = new StorageBlockedError(kind, message)
  mode = 'sqlite'
  status = { mode, state: 'error', error: message, canStartFresh }
  logger.error('❌ אחסון חסום:', message)
}

function ensureStorage(): Promise<void> {
  if (!initPromise) initPromise = initStorage()
  return initPromise
}

// ───────────────────────────── API ציבורי ─────────────────────────────

// ───────────────────────── כשלי שמירה: דיווח לממשק וניסיון חוזר ─────────────────────────
//
// ב-database.ts רוב השמירות הן "שגר ושכח": אין מי שמחכה להן ולכן Promise דחוי לא מגיע
// לשום מסך. כדי שכשל כתיבה לא יוצג למשתמש כאילו הפעולה נשמרה, המצב נשמר כאן, כל מנוי
// (StorageStatusGate) מקבל עדכון מיידי, ובמקביל מתבצע ניסיון חוזר אוטומטי.
// ה-obj שמועבר לשמירה הוא אובייקט הנתונים החי של האפליקציה, ולכן ניסיון חוזר שומר
// תמיד את המצב העדכני ביותר ולא גרסה ישנה.

export interface SaveFailure {
  message: string
  /** מתי נכשלה השמירה הראשונה בסדרה הנוכחית */
  since: number
  /** מספר הניסיונות שנכשלו ברצף */
  attempts: number
}

let saveFailure: SaveFailure | null = null
let latestToSave: unknown = undefined
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryDelays: number[] = [3000, 10000, 30000, 60000]
const listeners = new Set<() => void>()

/** מנוי לשינויים במצב האחסון (כשל שמירה / התאוששות). מחזיר פונקציית ביטול. */
export function subscribeStorageStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners(): void {
  for (const l of [...listeners]) {
    try {
      l()
    } catch (e) {
      logger.error('מאזין למצב האחסון נכשל', e)
    }
  }
}

/** כשל השמירה הנוכחי, או null אם השמירה האחרונה הצליחה */
export function getSaveFailure(): SaveFailure | null {
  return saveFailure
}

/** לבדיקות בלבד: השהיות הניסיון החוזר */
export function __setRetryDelaysForTests(delays: number[]): void {
  retryDelays = delays
}

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function markSaveSucceeded(): void {
  clearRetryTimer()
  if (saveFailure) {
    saveFailure = null
    notifyListeners()
  }
}

function markSaveFailed(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  saveFailure = {
    message,
    since: saveFailure?.since ?? Date.now(),
    attempts: (saveFailure?.attempts ?? 0) + 1,
  }
  notifyListeners()
  scheduleRetry()
}

function scheduleRetry(): void {
  clearRetryTimer()
  const attempts = saveFailure?.attempts ?? 1
  const delay = retryDelays[Math.min(attempts - 1, retryDelays.length - 1)]
  retryTimer = setTimeout(() => {
    retryTimer = null
    void retrySaveNow().catch(() => {})
  }, delay)
}

/**
 * ניסיון שמירה חוזר של המצב העדכני (אוטומטי, או בלחיצה על "נסה שוב"). דוחה אם נכשל שוב.
 * אין כשל פעיל -> לא עושה דבר.
 */
export async function retrySaveNow(): Promise<void> {
  if (!saveFailure || latestToSave === undefined) return
  clearRetryTimer()
  await performSave(latestToSave)
}

async function performSave(obj: unknown): Promise<void> {
  latestToSave = obj
  try {
    if (mode === 'sqlite') {
      if (!backend) throw initError ?? new Error('מסד הנתונים אינו זמין - לא ניתן לשמור')
      await backend.save(obj)
    } else {
      await legacySaveAppData(obj)
    }
  } catch (e) {
    // מצב חסום (אתחול נכשל) אינו כשל שמירה שניתן לנסות שוב - הוא מוצג במסך השגיאה הייעודי
    if (!initError) markSaveFailed(e)
    throw e
  }
  markSaveSucceeded()
}

export async function saveAppData(obj: unknown): Promise<void> {
  await ensureStorage()
  return performSave(obj)
}

export async function loadAppData(): Promise<any | null> {
  await ensureStorage()
  if (mode === 'sqlite') {
    if (initError) throw initError
    return backend ? backend.peek() : null
  }
  return legacyLoadAppData()
}

/**
 * "התחל ממסד חדש": רק לאחר שהמשתמש אישר במפורש. הקבצים הפגומים לא נמחקים - הם
 * מועברים הצידה בתיקיית הנתונים. לאחר הקריאה יש לטעון מחדש את האפליקציה.
 */
export async function startFreshAfterStorageError(): Promise<void> {
  await ensureStorage()
  if (!backend || status.state !== 'error' || !status.canStartFresh) {
    throw new Error('אין מצב שגיאה שמצריך התחלה ממסד חדש')
  }
  await backend.startFresh()
  initError = null
  status = { mode: 'sqlite', state: 'ok', notice: 'נפתח מסד נתונים חדש. הקבצים הקודמים נשמרו בתיקיית הנתונים.' }
}

/** ממתין לסיום שמירות שהתחילו (לשימוש לפני סגירה / בטסטים) */
export async function flushStorage(): Promise<void> {
  if (backend) await backend.idle()
}

/** (flat shape on purpose: this project does not enable strict null checks, so unions do not narrow) */
export interface PreDestructiveBackupResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

/**
 * Safety snapshot before a destructive action. Outside SQLite mode (browser / tests / legacy
 * fallback) there is nothing to snapshot: returns skipped. On failure the caller must abort.
 */
export async function createPreDestructiveBackup(reason: string = 'manual'): Promise<PreDestructiveBackupResult> {
  try {
    await ensureStorage()
    if (mode !== 'sqlite') return { ok: true, skipped: true }
    if (!backend) throw initError ?? new Error('\u05de\u05e1\u05d3 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d0\u05d9\u05e0\u05d5 \u05d6\u05de\u05d9\u05df - \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d9\u05e6\u05d5\u05e8 \u05d2\u05d9\u05d1\u05d5\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea')
    await backend.createSafetySnapshot(reason)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Safety snapshots and automatic copies available for restore (empty outside SQLite mode). */
export async function listBackups(): Promise<BackupInfo[]> {
  try {
    await ensureStorage()
  } catch {
    return []
  }
  if (mode !== 'sqlite' || !backend) return []
  return backend.listBackups()
}

/**
 * Restores one of the listed copies over the main database. Does NOT reload: the caller must reload
 * the app afterwards (the in-memory data object is stale and further saves are ignored).
 */
export async function restoreBackup(file: string): Promise<PreDestructiveBackupResult> {
  try {
    await ensureStorage()
    if (mode !== 'sqlite' || !backend) throw new Error('\u05e9\u05d7\u05d6\u05d5\u05e8 \u05d6\u05de\u05d9\u05df \u05e8\u05e7 \u05d1\u05d2\u05e8\u05e1\u05ea \u05e9\u05d5\u05dc\u05d7\u05df \u05d4\u05e2\u05d1\u05d5\u05d3\u05d4')
    await backend.restoreFromBackup(file)
    clearRetryTimer()
    latestToSave = undefined
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
