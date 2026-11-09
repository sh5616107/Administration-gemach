/**
 * sqliteBackend.ts
 * ----------------
 * ניהול קובץ ה-SQLite עצמו: טעינה, מעבר חד-פעמי מהאחסון הישן, שמירה אטומית,
 * ושחזור. הלוגיקה כאן אינה תלויה ב-Tauri - הגישה לדיסק עוברת דרך StorageIO
 * (ממשק קטן), כך שאפשר לבדוק את כל התרחישים (כולל קבצים פגומים וכשלי כתיבה) בטסטים.
 *
 * עקרונות בטיחות:
 *  - המעבר מהאחסון הישן לא מוחק ולא משנה את המקור. לפני שהקובץ החדש הופך לקובץ
 *    האמת נעשית השוואה מלאה בין המקור למה שנקרא בחזרה מהמסד (בזיכרון ומהדיסק).
 *  - אם משהו לא מסתדר - לא נוצר קובץ SQLite, והמערכת ממשיכה לעבוד על האחסון הישן.
 *  - אם קובץ SQLite קיים אך אי אפשר לקרוא אותו - לא מתבצע fallback לנתונים ישנים
 *    (שעלולים להיות מיושנים) ולא נכתב שום דבר: הכתיבה נחסמת עד שהמשתמש מתערב.
 *  - בכל הפעלה תקינה נשמר עותק של הקובץ כפי שהיה בתחילתה (gemach.sqlite.prev),
 *    ובנוסף, במהלך העבודה, גיבוי מתגלגל של הגרסה התקינה האחרונה (gemach.sqlite.bak1/bak2,
 *    לכל היותר אחת ל-BACKUP_INTERVAL_MS, ורק לאחר אימות). אם הקובץ הראשי נעלם או נפגע
 *    מתבצע שחזור אוטומטי מהעותק התקין החדש ביותר.
 */

import type { Database, SqlJsStatic } from 'sql.js'
import {
  SCHEMA_MIGRATIONS,
  SCHEMA_VERSION,
  applyState,
  buildState,
  createSchema,
  hasPersistedData,
  readMetaSchemaVersion,
  readSnapshot,
  upgradeSchema,
  verifyRowCounts,
  writeInfoMeta,
  type SchemaMigrations,
  type SnapshotState,
} from './sqliteSnapshot'

export const DB_FILE = 'gemach.sqlite'
export const PREV_FILE = 'gemach.sqlite.prev'
/** גיבויים מתגלגלים: BAK1 החדש יותר, BAK2 הקודם לו */
export const BAK1_FILE = 'gemach.sqlite.bak1'
export const BAK2_FILE = 'gemach.sqlite.bak2'
/** כל קבצי השחזור האפשריים (בנוסף לקובץ הראשי) */
export const RECOVERY_FILES = [BAK1_FILE, PREV_FILE, BAK2_FILE] as const
/** כל כמה זמן לכל היותר מתגלגל גיבוי חדש בזמן עבודה */
export const BACKUP_INTERVAL_MS = 10 * 60 * 1000
/**
 * Safety snapshots taken right before destructive actions (delete all, import). Newest first.
 * Deliberately NOT part of RECOVERY_FILES: auto-recovering from them could resurrect data that
 * the user deleted on purpose. Restoring from a safety snapshot is manual only.
 */
export const SAFETY_FILES = [
  'gemach.sqlite.safety1',
  'gemach.sqlite.safety2',
  'gemach.sqlite.safety3',
  'gemach.sqlite.safety4',
  'gemach.sqlite.safety5',
] as const
export const LEGACY_JSON_FILE = 'gemach_data.json'
export const LEGACY_JSON_MIGRATED_FILE = 'gemach_data.pre-sqlite.json'

/** גישה לדיסק (תיקיית הנתונים של האפליקציה). שמות קבצים יחסיים בלבד. */
export interface StorageIO {
  exists(name: string): Promise<boolean>
  readBytes(name: string): Promise<Uint8Array>
  /** כתיבה אטומית: קובץ זמני + rename. כישלון זורק שגיאה ולא משאיר קובץ חלקי בשם הסופי. */
  writeBytesAtomic(name: string, bytes: Uint8Array): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(name: string): Promise<void>
}

/** מקור הנתונים הישן שממנו מבצעים מעבר חד-פעמי */
export interface LegacySource {
  kind: 'json-file' | 'localStorage'
  /** הטקסט המלא של הנתונים (JSON) */
  text: string
  /** נקרא לאחר מעבר מוצלח ומאומת: מותר להיכשל (best-effort) */
  afterMigrated?: () => Promise<void>
  /** העברת המקור הפגום הצידה (בלי מחיקה), כדי לאפשר התחלה נקייה */
  quarantine?: () => Promise<void>
  /** הודעת אזהרה שתוצג למשתמש לאחר המעבר (למשל: נמצא מקור נתונים נוסף שלא הועבר) */
  warning?: string
}

export type LoadOrigin = 'sqlite' | 'migrated-json-file' | 'migrated-localStorage' | 'recovered-backup' | 'new'

export interface LoadOutcome {
  data: Record<string, unknown> | null
  origin: LoadOrigin
  /** הודעה למשתמש (שחזור/מעבר) - אינה שגיאה */
  notice?: string
  /** אזהרה שדורשת תשומת לב (אינה מונעת עבודה) */
  warning?: string
}

/**
 * סוגי חסימה:
 *  - corrupt: קובץ ה-SQLite פגום ואין גיבוי תקין (ניתן "להתחיל מחדש", הקבצים נשמרים בצד)
 *  - newer-version: הקובץ נוצר בגרסת תוכנה חדשה יותר (יש לעדכן; לא מתחילים מחדש)
 *  - legacy-unreadable: מקור הנתונים הישן נקרא אך אינו JSON תקין (ניתן "להתחיל מחדש", המקור נשמר בצד)
 *  - legacy-read-failed: מקור הנתונים הישן קיים אך הקריאה ממנו נכשלה (שגיאת דיסק/הרשאה/נעילה).
 *    אין התחלה מחדש ואין מעבר מהמקור האחר: זו תקלה זמנית-לרוב שיש לפתור, והנתונים לא נוגעים.
 */
export type StorageBlockedKind = 'corrupt' | 'newer-version' | 'legacy-unreadable' | 'legacy-read-failed'

/** נזרקת מ-readLegacySource כשהמקור הישן קיים אך לא ניתן לקרוא אותו */
export class LegacyReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyReadError'
  }
}

/** שגיאה שאחריה אסור לכתוב לדיסק (כדי לא לדרוס נתונים קיימים) */
export class StorageBlockedError extends Error {
  readonly kind: StorageBlockedKind
  constructor(kind: StorageBlockedKind, message: string) {
    super(message)
    this.name = 'StorageBlockedError'
    this.kind = kind
  }
}

/** המעבר לא עבר אימות - אסור להשתמש בקובץ החדש. המערכת ממשיכה על האחסון הישן. */
export class MigrationVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationVerificationError'
  }
}

export interface SqliteBackendOptions {
  /** מחזיר את האחסון הישן שממנו יש להעביר (או null אם אין). נקרא רק אם אין קובץ SQLite. */
  readLegacySource: () => Promise<LegacySource | null>
  now?: () => Date
  /** לבדיקות / שדרוגים עתידיים. ברירת מחדל: מבנה הנוכחי ושלבי השדרוג המוגדרים בקוד */
  schemaVersion?: number
  migrations?: SchemaMigrations
  log?: (level: 'info' | 'warn' | 'error', message: string, extra?: unknown) => void
  /** מרווח מינימלי בין גיבויים מתגלגלים (ברירת מחדל: BACKUP_INTERVAL_MS). 0 = בכל שמירה (לבדיקות). */
  backupIntervalMs?: number
}

interface Opened {
  db: Database
  data: Record<string, unknown>
  state: SnapshotState
  /** אם המסד שודרג בזיכרון: ממבנה איזו גרסה */
  upgradedFrom?: number
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function timestampForFile(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
}

const META_SAVED_AT = 'info_saved_at'

/** זמן השמירה האחרונה שנרשם בתוך המסד (ms), או 0 אם אינו קיים/תקין */
function readSavedAt(db: Database): number {
  try {
    const rows = db.exec(`SELECT value FROM meta WHERE key = '${META_SAVED_AT}'`)
    const t = Date.parse(String(rows[0]?.values[0]?.[0] ?? ''))
    return Number.isNaN(t) ? 0 : t
  } catch {
    return 0
  }
}

function formatLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export class SqliteBackend {
  private db: Database | null = null
  private state: SnapshotState | null = null
  /** קיימים שינויים במסד שבזיכרון שעדיין לא הגיעו לדיסק */
  private diskDirty = false
  private blockedReason: string | null = null
  private blockedKind: StorageBlockedKind | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private readonly now: () => Date
  private readonly log: NonNullable<SqliteBackendOptions['log']>
  private readonly schemaVersion: number
  private readonly migrations: SchemaMigrations
  private readonly backupIntervalMs: number
  /** מתי ניסינו לאחרונה לגלגל גיבוי (בתחילה: זמן הטעינה - גיבוי ראשון רק אחרי שעבר המרווח) */
  private lastBackupAt = 0
  /** הנתונים שנטענו, למסירה חד-פעמית ל-peek() (חוסך קריאה ופענוח שניים של כל המסד) */
  private handoff: Record<string, unknown> | null = null

  constructor(
    private readonly SQL: SqlJsStatic,
    private readonly io: StorageIO,
    private readonly options: SqliteBackendOptions
  ) {
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? (() => {})
    this.schemaVersion = options.schemaVersion ?? SCHEMA_VERSION
    this.migrations = options.migrations ?? SCHEMA_MIGRATIONS
    this.backupIntervalMs = options.backupIntervalMs ?? BACKUP_INTERVAL_MS
    this.lastBackupAt = this.now().getTime()
  }

  // ───────────────────────────── טעינה ─────────────────────────────

  async load(): Promise<LoadOutcome> {
    const hasDb = await this.io.exists(DB_FILE)

    if (hasDb) {
      return this.loadExisting()
    }

    // אין קובץ ראשי. אם נשאר גיבוי/עותק מהפעלה קודמת - הקובץ אבד, ומשחזרים ממנו.
    if (await this.anyRecoveryFileExists()) {
      const restored = await this.tryRestoreFromBackups('קובץ מסד הנתונים הראשי לא נמצא')
      if (restored) return restored
      throw this.block(
        'corrupt',
        'קובץ מסד הנתונים הראשי חסר, וגם גיבויי המסד אינם תקינים. הנתונים לא נמחקו - ' +
          `ניתן לפנות לתמיכה (${RECOVERY_FILES.join(', ')}).`
      )
    }

    let legacy: LegacySource | null
    try {
      legacy = await this.options.readLegacySource()
    } catch (e) {
      // מקור ישן שקיים אך לא ניתן לקרוא: חוסמים. לא ממשיכים למקור אחר (שעלול להיות מיושן)
      // ולא מתחילים ממסד ריק, כדי שלא ייווצר מסד שיסתיר את הנתונים האמיתיים.
      if (e instanceof LegacyReadError) throw this.block('legacy-read-failed', e.message)
      throw e
    }
    if (legacy) {
      return this.migrate(legacy)
    }

    return this.startNew()
  }

  /** התקנה חדשה (אין נתונים קודמים): מסד ריק בזיכרון; הקובץ ייווצר בשמירה הראשונה. */
  private startNew(): LoadOutcome {
    this.db = new this.SQL.Database()
    createSchema(this.db, this.schemaVersion)
    this.state = null
    this.diskDirty = true
    this.handoff = null
    return { data: null, origin: 'new' }
  }

  private async loadExisting(): Promise<LoadOutcome> {
    let bytes: Uint8Array
    try {
      bytes = await this.io.readBytes(DB_FILE)
    } catch (e) {
      throw this.block('corrupt', `לא ניתן לקרוא את קובץ מסד הנתונים: ${(e as Error).message}`)
    }

    try {
      const opened = this.openAndValidate(bytes)
      this.db = opened.db
      this.state = opened.state
      this.diskDirty = opened.upgradedFrom !== undefined
      this.handoff = opened.data
      // עותק הביניים נשמר מהבתים המקוריים (לפני שדרוג מבנה, אם היה)
      await this.refreshPrev(bytes)
      if (this.diskDirty) await this.persistUpgrade()
      return { data: opened.data, origin: 'sqlite' }
    } catch (e) {
      if (e instanceof StorageBlockedError) {
        // גרסה חדשה יותר של הקובץ: לא מנסים לשחזר ולא נוגעים בקובץ
        this.blockedReason = e.message
        this.blockedKind = e.kind
        throw e
      }

      this.log('error', 'קובץ SQLite לא עבר בדיקה', e)
      const restored = await this.tryRestoreFromBackups(`קובץ מסד הנתונים נפגע (${(e as Error).message})`)
      if (restored) return restored
      throw this.block(
        'corrupt',
        `קובץ מסד הנתונים נפגע ואין עותק תקין לשחזור: ${(e as Error).message}. ` +
          'הקובץ לא נמחק ולא שונה.'
      )
    }
  }

  /** פותח את הבתים כמסד, ומוודא תקינות מבנית ולוגית (ומשדרג מבנה ישן, בזיכרון). זורק בכל חריגה. */
  private openAndValidate(bytes: Uint8Array): Opened {
    if (bytes.length === 0) throw new Error('הקובץ ריק')
    let db: Database | null = null
    try {
      db = new this.SQL.Database(bytes)

      const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
      if (version > this.schemaVersion) {
        throw new StorageBlockedError(
          'newer-version',
          `מסד הנתונים נוצר בגרסה חדשה יותר של התוכנה (מבנה ${version}). עדכן את התוכנה לגרסה האחרונה.`
        )
      }
      if (version < 1) {
        throw new Error(`גרסת מבנה לא צפויה: ${version}`)
      }

      const check = db.exec('PRAGMA quick_check')[0]?.values.map(r => String(r[0])) ?? []
      if (check.length !== 1 || check[0] !== 'ok') {
        throw new Error(`בדיקת שלמות נכשלה: ${check.slice(0, 3).join('; ')}`)
      }

      // שתי "תעודות" הגרסה (PRAGMA user_version ו-meta.schema_version) חייבות להתאים לפני כל שדרוג או קריאה.
      // אי-התאמה = קובץ שנערך/נפגם/התערבב - לא מנחשים איזו מהן נכונה.
      const metaVersion = readMetaSchemaVersion(db)
      if (metaVersion !== version) {
        throw new Error(
          `אי-התאמה בין גרסאות המבנה: user_version=${version}, meta.schema_version=${Number.isNaN(metaVersion) ? 'חסר' : metaVersion}`
        )
      }

      let upgradedFrom: number | undefined
      if (version < this.schemaVersion) {
        upgradeSchema(db, version, this.schemaVersion, this.migrations)
        upgradedFrom = version
      }

      const { data, state } = readSnapshot(db)
      return { db, data, state, upgradedFrom }
    } catch (e) {
      try {
        db?.close()
      } catch {
        // ignore
      }
      throw e
    }
  }

  /** כותב לדיסק מסד ששודרג. כישלון אינו קריטי: המסד נשאר "מלוכלך" והשמירה הבאה תכתוב אותו. */
  private async persistUpgrade(): Promise<void> {
    try {
      if (!this.db) return
      await this.io.writeBytesAtomic(DB_FILE, this.db.export())
      this.diskDirty = false
    } catch (e) {
      this.log('warn', 'כתיבת המסד לאחר שדרוג מבנה נכשלה - תתבצע בשמירה הבאה', e)
    }
  }

  private async refreshPrev(goodBytes: Uint8Array): Promise<void> {
    try {
      // אם העותק כבר זהה (הפעלה בלי שינויים) - אין צורך לכתוב מחדש
      try {
        if ((await this.io.exists(PREV_FILE)) && bytesEqual(await this.io.readBytes(PREV_FILE), goodBytes)) return
      } catch {
        // נכתוב מחדש
      }
      await this.io.writeBytesAtomic(PREV_FILE, goodBytes)
    } catch (e) {
      // עותק הביניים הוא רשת ביטחון בלבד - כישלון בו אינו מונע עבודה
      this.log('warn', 'לא ניתן לרענן את עותק הביניים של מסד הנתונים', e)
    }
  }

  private async anyRecoveryFileExists(): Promise<boolean> {
    for (const name of RECOVERY_FILES) {
      try {
        if (await this.io.exists(name)) return true
      } catch {
        // נתייחס כאל "לא קיים" - הבדיקה הבאה תנסה שוב
      }
    }
    return false
  }

  /**
   * משחזר מהעותק התקין החדש ביותר מבין הגיבויים המתגלגלים ועותק תחילת ההפעלה.
   * "החדש ביותר" נקבע לפי info_saved_at שנשמר בתוך המסד (לא לפי שם/זמן קובץ).
   * הקובץ הפגום (אם יש) מועבר הצידה ולא נמחק.
   */
  private async tryRestoreFromBackups(reason: string): Promise<LoadOutcome | null> {
    let best: { name: string; bytes: Uint8Array; opened: Opened; savedAt: number } | null = null
    for (const name of RECOVERY_FILES) {
      let bytes: Uint8Array
      try {
        if (!(await this.io.exists(name))) continue
        bytes = await this.io.readBytes(name)
      } catch (e) {
        this.log('warn', `קריאת ${name} נכשלה`, e)
        continue
      }
      let opened: Opened
      try {
        opened = this.openAndValidate(bytes)
      } catch (e) {
        this.log('warn', `${name} אינו תקין`, e)
        continue
      }
      const savedAt = readSavedAt(opened.db)
      // בשוויון נשארים עם הראשון ב-RECOVERY_FILES (bak1, prev, bak2)
      if (!best || savedAt > best.savedAt) {
        best?.opened.db.close()
        best = { name, bytes, opened, savedAt }
      } else {
        opened.db.close()
      }
    }
    if (!best) return null

    // מעבירים הצידה (לא מוחקים) את הקובץ הפגום, ושמים במקומו את העותק התקין
    const quarantineName = `${DB_FILE}.corrupt-${timestampForFile(this.now())}`
    try {
      if (await this.io.exists(DB_FILE)) await this.io.rename(DB_FILE, quarantineName)
      await this.io.writeBytesAtomic(DB_FILE, best.bytes)
    } catch (e) {
      best.opened.db.close()
      throw this.block('corrupt', `שחזור מגיבוי נכשל: ${(e as Error).message}`)
    }

    const { opened } = best
    this.db = opened.db
    this.state = opened.state
    this.diskDirty = opened.upgradedFrom !== undefined
    this.handoff = opened.data
    const when = best.savedAt > 0 ? ` מתאריך ${formatLocal(new Date(best.savedAt))}` : ''
    const source = best.name === PREV_FILE ? 'העותק שנשמר בתחילת ההפעלה הקודמת' : 'גיבוי אוטומטי'
    return {
      data: opened.data,
      origin: 'recovered-backup',
      notice:
        `${reason}. הנתונים שוחזרו מתוך ${source}${when}. ` +
        'שינויים שבוצעו אחרי מועד זה עלולים לא להופיע. הקובץ הפגום נשמר בתיקיית הנתונים.',
    }
  }

  // ───────────────────────────── מעבר ─────────────────────────────

  private async migrate(legacy: LegacySource): Promise<LoadOutcome> {
    let parsed: unknown
    try {
      parsed = JSON.parse(legacy.text)
    } catch (e) {
      throw this.legacyUnreadable(
        `נתוני המערכת הקיימים (${legacy.kind === 'json-file' ? 'קובץ' : 'אחסון הדפדפן'}) אינם JSON תקין: ${(e as Error).message}`,
        legacy
      )
    }
    if (parsed === null) {
      return this.startNew() // כמו בקוד הקודם: "null" משמעו שאין נתונים
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw this.legacyUnreadable('נתוני המערכת הקיימים אינם במבנה צפוי', legacy)
    }

    const db = new this.SQL.Database()
    let bytes: Uint8Array
    let state: SnapshotState
    try {
      createSchema(db, this.schemaVersion)
      state = buildState(parsed)
      applyState(db, null, state)
      writeInfoMeta(db, {
        migrated_from: legacy.kind,
        migrated_at: this.now().toISOString(),
        source_chars: String(legacy.text.length),
      })
      bytes = db.export()
    } catch (e) {
      db.close()
      throw new MigrationVerificationError(`בניית מסד הנתונים נכשלה: ${(e as Error).message}`)
    }

    // אימות 1: פותחים את הבתים כמסד חדש ומשווים מול המקור, כולל סדר.
    try {
      const reopened = this.openAndValidate(bytes)
      try {
        const original = JSON.stringify(parsed)
        const readBack = JSON.stringify(reopened.data)
        if (original !== readBack) {
          throw new MigrationVerificationError('הנתונים שנקראו מהמסד שונים מהמקור (אימות בזיכרון)')
        }
      } finally {
        reopened.db.close()
      }
    } catch (e) {
      db.close()
      if (e instanceof MigrationVerificationError) throw e
      throw new MigrationVerificationError(`אימות המסד שנבנה נכשל: ${(e as Error).message}`)
    }

    // כתיבה אטומית + אימות 2: קריאה מהדיסק והשוואה בייט-לבייט.
    try {
      await this.io.writeBytesAtomic(DB_FILE, bytes)
      const onDisk = await this.io.readBytes(DB_FILE)
      if (!bytesEqual(onDisk, bytes)) {
        throw new MigrationVerificationError('הקובץ שנכתב לדיסק שונה ממה שנבנה')
      }
    } catch (e) {
      db.close()
      // הקובץ החדש אינו מהימן - מסירים אותו כדי שלא יהפוך למקור האמת בהפעלה הבאה
      try {
        if (await this.io.exists(DB_FILE)) await this.io.remove(DB_FILE)
      } catch (removeError) {
        this.log('error', 'לא ניתן להסיר קובץ מסד לא מאומת', removeError)
      }
      if (e instanceof MigrationVerificationError) throw e
      throw new MigrationVerificationError(`כתיבת מסד הנתונים נכשלה: ${(e as Error).message}`)
    }

    this.db = db
    this.state = state
    this.diskDirty = false

    await this.refreshPrev(bytes)
    try {
      await legacy.afterMigrated?.()
    } catch (e) {
      this.log('warn', 'סיום המעבר (העברת המקור הישן הצידה) נכשל - אינו משפיע על הנתונים', e)
    }

    const data = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>
    this.handoff = data
    const keptCopy =
      legacy.kind === 'json-file'
        ? 'העותק המקורי נשמר בתיקיית הנתונים בשם gemach_data.pre-sqlite.json'
        : 'העותק המקורי נשמר באחסון הפנימי של התוכנה (מפתח gemach_data_v1.pre-sqlite)'
    return {
      data,
      origin: legacy.kind === 'json-file' ? 'migrated-json-file' : 'migrated-localStorage',
      notice:
        'הנתונים הועברו למסד נתונים חדש (SQLite) ואומתו מול המקור. ' +
        `${keptCopy}, ללא הצפנה; לאחר שתוודא שהכול תקין ניתן למחוק אותו.`,
      warning: legacy.warning,
    }
  }

  private legacyUnreadable(message: string, legacy: LegacySource): StorageBlockedError {
    this.legacyToQuarantine = legacy.quarantine ?? null
    return this.block('legacy-unreadable', message)
  }

  private legacyToQuarantine: (() => Promise<void>) | null = null

  // ───────────────────────────── שמירה ─────────────────────────────

  /** נתוני האחרונים שנשמרו (עותק חדש), או null אם עוד לא נשמר דבר. */
  peek(): Record<string, unknown> | null {
    if (!this.db || !hasPersistedData(this.state)) return null
    if (this.handoff) {
      // הקריאה הראשונה אחרי הטעינה: מוסרים את הנתונים שכבר נקראו (בלי לפענח שוב)
      const data = this.handoff
      this.handoff = null
      return data
    }
    return readSnapshot(this.db).data
  }

  save(obj: unknown): Promise<void> {
    return this.enqueue(async () => {
      if (this.blockedReason) throw new Error(this.blockedReason)
      const db = this.db
      if (!db) throw new Error('מסד הנתונים לא נטען - לא ניתן לשמור')

      const next = buildState(obj)
      const changed = applyState(db, this.state, next)
      this.state = next
      if (changed) this.diskDirty = true
      if (!this.diskDirty) return

      writeInfoMeta(db, { saved_at: this.now().toISOString() })
      const bytes = db.export()
      await this.io.writeBytesAtomic(DB_FILE, bytes)
      this.diskDirty = false
      await this.maybeRollBackup(bytes)
    })
  }

  /**
   * גיבוי מתגלגל: לכל היותר אחת ל-backupIntervalMs, ורק עבור בתים שנכתבו זה עתה ועוברים אימות קל
   * (מבנה, התאמת גרסאות, quick_check, ספירת שורות). הקודם עובר ל-bak2. לעולם לא זורק:
   * גיבוי הוא רשת ביטחון, וכישלון בו אינו מפיל שמירה.
   */
  private async maybeRollBackup(bytes: Uint8Array): Promise<void> {
    const nowMs = this.now().getTime()
    if (nowMs - this.lastBackupAt < this.backupIntervalMs) return
    this.lastBackupAt = nowMs
    try {
      this.validateLight(bytes)
      if (await this.io.exists(BAK1_FILE)) {
        if (await this.io.exists(BAK2_FILE)) await this.io.remove(BAK2_FILE)
        await this.io.rename(BAK1_FILE, BAK2_FILE)
      }
      await this.io.writeBytesAtomic(BAK1_FILE, bytes)
    } catch (e) {
      this.log('warn', 'גלגול גיבוי המסד נכשל (השמירה עצמה הצליחה)', e)
    }
  }

  /** אימות זול לבתים שלא ידרסו גיבוי תקין בגרסה פגומה */
  private validateLight(bytes: Uint8Array): void {
    const db = new this.SQL.Database(bytes)
    try {
      const version = Number(db.exec('PRAGMA user_version')[0]?.values[0]?.[0] ?? 0)
      if (version !== this.schemaVersion) throw new Error(`user_version=${version}`)
      if (readMetaSchemaVersion(db) !== version) throw new Error('meta.schema_version אינו תואם')
      const check = db.exec('PRAGMA quick_check')[0]?.values.map(r => String(r[0])) ?? []
      if (check.length !== 1 || check[0] !== 'ok') throw new Error(`quick_check: ${check.slice(0, 2).join('; ')}`)
      verifyRowCounts(db)
    } finally {
      db.close()
    }
  }

  /** ממתין לסיום כל השמירות שהתחילו עד כה */
  idle(): Promise<void> {
    return this.enqueue(async () => {})
  }

  /**
   * Writes a validated copy of the current in-memory database to a safety slot (rolling, 5 slots).
   * Runs inside the save queue, so it comes after every save that is already queued.
   * Unlike the rolling backup, errors are thrown: the caller must not continue a destructive action.
   */
  createSafetySnapshot(): Promise<void> {
    return this.enqueue(async () => {
      if (this.blockedReason) throw new Error(this.blockedReason)
      const db = this.db
      if (!db) throw new Error('\u05de\u05e1\u05d3 \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05dc\u05d0 \u05e0\u05d8\u05e2\u05df - \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d9\u05e6\u05d5\u05e8 \u05d2\u05d9\u05d1\u05d5\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea')
      const bytes = db.export()
      this.validateLight(bytes)
      const last = SAFETY_FILES.length - 1
      if (await this.io.exists(SAFETY_FILES[last])) await this.io.remove(SAFETY_FILES[last])
      for (let i = last - 1; i >= 0; i--) {
        if (await this.io.exists(SAFETY_FILES[i])) await this.io.rename(SAFETY_FILES[i], SAFETY_FILES[i + 1])
      }
      await this.io.writeBytesAtomic(SAFETY_FILES[0], bytes)
    })
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(() => fn())
    this.chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  // ───────────────────────── מצב חסימה והתאוששות ─────────────────────────

  private block(kind: StorageBlockedKind, message: string): StorageBlockedError {
    this.blockedReason = message
    this.blockedKind = kind
    return new StorageBlockedError(kind, message)
  }

  isBlocked(): boolean {
    return this.blockedReason !== null
  }

  getBlockedKind(): StorageBlockedKind | null {
    return this.blockedKind
  }

  /**
   * "התחל ממסד חדש" לאחר חסימה: מעביר הצידה (בלי למחוק) את הקובץ הפגום/המקור שלא ניתן לקרוא,
   * ופותח מסד ריק. נקרא רק לפי בקשה מפורשת של המשתמש.
   */
  async startFresh(): Promise<void> {
    if (this.blockedKind === 'newer-version') {
      throw new Error('הקובץ נוצר בגרסה חדשה יותר של התוכנה - יש לעדכן את התוכנה ולא להתחיל מחדש')
    }
    if (this.blockedKind === 'legacy-read-failed') {
      throw new Error('לא ניתן לקרוא את קובץ הנתונים הקיים - יש לפתור את הבעיה ולהפעיל מחדש, לא להתחיל ממסד ריק')
    }
    const stamp = timestampForFile(this.now())
    for (const name of [DB_FILE, ...RECOVERY_FILES]) {
      if (await this.io.exists(name)) {
        await this.io.rename(name, `${name}.corrupt-${stamp}`)
      }
    }
    if (this.legacyToQuarantine) {
      await this.legacyToQuarantine()
      this.legacyToQuarantine = null
    }

    // יוצרים מיד קובץ ריק תקין בדיסק: כך הפעלה הבאה לא תמצא "אין קובץ" ותעביר מחדש
    // נתונים ישנים/מיושנים מהאחסון הישן על גבי ההתחלה הנקייה שהמשתמש בחר.
    const fresh = new this.SQL.Database()
    let state: SnapshotState
    let bytes: Uint8Array
    try {
      createSchema(fresh, this.schemaVersion)
      state = buildState({})
      applyState(fresh, null, state)
      bytes = fresh.export()
      await this.io.writeBytesAtomic(DB_FILE, bytes)
    } catch (e) {
      fresh.close()
      throw e
    }
    this.db?.close()
    this.db = fresh
    this.state = state
    this.diskDirty = false
    this.handoff = null
    this.blockedReason = null
    this.blockedKind = null
  }

  close(): void {
    try {
      this.db?.close()
    } catch {
      // ignore
    }
    this.db = null
  }
}
