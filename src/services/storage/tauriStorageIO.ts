/**
 * tauriStorageIO.ts
 * -----------------
 * מימוש StorageIO מעל @tauri-apps/plugin-fs, ואיתור קובץ ה-JSON הישן.
 * משתמש רק בהרשאות שכבר קיימות ב-capabilities/default.json (קריאה, כתיבה,
 * rename, exists, stat, remove, mkdir בתיקיות AppLocalData / AppData).
 */

import { DB_FILE, LEGACY_JSON_FILE, LEGACY_JSON_MIGRATED_FILE, RECOVERY_FILES, type StorageIO } from './sqliteBackend'

type FsModule = typeof import('@tauri-apps/plugin-fs')
type BaseDirValue = import('@tauri-apps/plugin-fs').BaseDirectory

export interface LegacyJsonFile {
  text: string
  /** מעביר את קובץ ה-JSON המקורי לשם gemach_data.pre-sqlite.json (בלי למחוק) */
  markMigrated: () => Promise<void>
  /** מעביר הצידה קובץ JSON שאינו קריא */
  quarantine: () => Promise<void>
}

export interface TauriStorage {
  io: StorageIO
  dirName: 'AppLocalData' | 'AppData'
  /** קובץ ה-JSON הישן, באותו סדר חיפוש שהיה בקוד הקודם: AppLocalData ואז AppData */
  readLegacyJson: () => Promise<LegacyJsonFile | null>
}

async function dirContainsSqliteFiles(fs: FsModule, baseDir: BaseDirValue): Promise<boolean> {
  for (const name of [DB_FILE, ...RECOVERY_FILES]) {
    try {
      if (await fs.exists(name, { baseDir })) return true
    } catch {
      // תיקייה שלא קיימת / לא נגישה
    }
  }
  return false
}

async function canWrite(fs: FsModule, baseDir: BaseDirValue): Promise<boolean> {
  const probe = '.gemach-write-probe'
  try {
    try {
      await fs.mkdir('', { baseDir, recursive: true })
    } catch {
      // התיקייה כבר קיימת, או שה-mkdir אינו נדרש
    }
    await fs.writeFile(probe, new Uint8Array([1]), { baseDir })
    await fs.remove(probe, { baseDir })
    return true
  } catch {
    return false
  }
}

function makeIO(fs: FsModule, baseDir: BaseDirValue): StorageIO {
  return {
    exists: name => fs.exists(name, { baseDir }),
    readBytes: name => fs.readFile(name, { baseDir }),
    async writeBytesAtomic(name, bytes) {
      const tmp = `${name}.tmp`
      await fs.writeFile(tmp, bytes, { baseDir })
      try {
        // מוודאים שהקובץ הזמני נכתב במלואו לפני שמחליפים בו את הקובץ האמיתי
        const info = await fs.stat(tmp, { baseDir })
        if (info.size !== bytes.length) {
          throw new Error(`כתיבה חלקית: נכתבו ${info.size} מתוך ${bytes.length} בתים`)
        }
        await fs.rename(tmp, name, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
      } catch (e) {
        try {
          if (await fs.exists(tmp, { baseDir })) await fs.remove(tmp, { baseDir })
        } catch {
          // ניקוי best-effort
        }
        throw e
      }
    },
    rename: (from, to) => fs.rename(from, to, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir }),
    remove: name => fs.remove(name, { baseDir }),
  }
}

export async function createTauriStorage(): Promise<TauriStorage> {
  const fs = await import('@tauri-apps/plugin-fs')
  const { BaseDirectory } = fs
  const candidates: Array<{ name: TauriStorage['dirName']; baseDir: BaseDirValue }> = [
    { name: 'AppLocalData', baseDir: BaseDirectory.AppLocalData },
    { name: 'AppData', baseDir: BaseDirectory.AppData },
  ]

  // 1. אם כבר קיים שם קובץ SQLite - זו התיקייה.
  let chosen: (typeof candidates)[number] | null = null
  for (const c of candidates) {
    if (await dirContainsSqliteFiles(fs, c.baseDir)) {
      chosen = c
      break
    }
  }
  // 2. אחרת - התיקייה הראשונה שאפשר לכתוב בה (כמו בקוד הקודם: AppLocalData ואז AppData).
  if (!chosen) {
    for (const c of candidates) {
      if (await canWrite(fs, c.baseDir)) {
        chosen = c
        break
      }
    }
  }
  if (!chosen) throw new Error('לא נמצאה תיקיית נתונים שניתן לכתוב אליה')

  const io = makeIO(fs, chosen.baseDir)

  const readLegacyJson = async (): Promise<LegacyJsonFile | null> => {
    for (const c of candidates) {
      let present = false
      try {
        present = await fs.exists(LEGACY_JSON_FILE, { baseDir: c.baseDir })
      } catch {
        present = false
      }
      if (!present) continue
      const text = await fs.readTextFile(LEGACY_JSON_FILE, { baseDir: c.baseDir })
      const baseDir = c.baseDir
      return {
        text,
        markMigrated: async () => {
          // אם כבר קיים קובץ בשם הזה (מעבר קודם) - לא דורסים אותו
          const target = (await fs.exists(LEGACY_JSON_MIGRATED_FILE, { baseDir }))
            ? `gemach_data.pre-sqlite-${Date.now()}.json`
            : LEGACY_JSON_MIGRATED_FILE
          await fs.rename(LEGACY_JSON_FILE, target, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
        },
        quarantine: async () => {
          await fs.rename(LEGACY_JSON_FILE, `gemach_data.unreadable-${Date.now()}.json`, {
            oldPathBaseDir: baseDir,
            newPathBaseDir: baseDir,
          })
        },
      }
    }
    return null
  }

  return { io, dirName: chosen.name, readLegacyJson }
}
