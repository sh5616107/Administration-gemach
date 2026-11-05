/**
 * שמירת קובץ גיבוי ידני (ייצוא JSON וגיבוי מלא ZIP) דרך חלון "שמירה בשם".
 *
 * בגרסת Tauri נפתח חלון "שמירה בשם" שמתחיל בתיקיית הגיבוי שהוגדרה בהגדרות
 * (auto_backup_path). המשתמש בוחר שם ומיקום בכל פעם, והתיקייה המוגדרת היא רק
 * נקודת ההתחלה. אם לא הוגדרה תיקייה, החלון נפתח במיקום ברירת המחדל של המערכת.
 *
 * מחוץ לאפליקציית שולחן העבודה (תצוגה בדפדפן) נשמרת ההתנהגות הקודמת: הורדה דרך הדפדפן.
 * אם הכתיבה אחרי הבחירה נכשלה, הקובץ יורד בכל זאת דרך הדפדפן והכשל מדווח,
 * כדי שלא יאבד גיבוי.
 */

import localforage from 'localforage'
import { normalizeBackupFolder } from './autoBackupService'

export type SaveBackupResult =
  | { status: 'saved'; path: string }
  | { status: 'cancelled' }
  | { status: 'download' }
  | { status: 'download-fallback'; error: string }

export interface SaveBackupOptions {
  /** שם הקובץ המוצע, למשל gemach_backup_2026-11-05.json */
  fileName: string
  /** תוכן הקובץ */
  data: string | Uint8Array
  /** תיאור סוג הקובץ בחלון השמירה */
  filterName: string
  /** סיומת בלי נקודה, למשל json / zip */
  extension: string
  /** כותרת החלון */
  title?: string
}

export interface SaveBackupDeps {
  getFolder: () => Promise<string>
  isDesktop: () => boolean
  /** פותח חלון "שמירה בשם". מחזיר את הנתיב שנבחר, או null אם בוטל. */
  pickSavePath: (opts: { defaultPath: string; title?: string; filterName: string; extension: string }) => Promise<string | null>
  joinPath: (folder: string, fileName: string) => Promise<string>
  writeFile: (path: string, bytes: Uint8Array) => Promise<void>
  downloadViaBrowser: (fileName: string, bytes: Uint8Array) => void
}

const settingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
}

/** התיקייה שהוגדרה בהגדרות כתיקיית גיבוי (מחרוזת ריקה אם לא הוגדרה). */
export async function getConfiguredBackupFolder(): Promise<string> {
  try {
    return normalizeBackupFolder(await settingsStore.getItem<string>('auto_backup_path'))
  } catch {
    return ''
  }
}

const defaultDeps: SaveBackupDeps = {
  getFolder: getConfiguredBackupFolder,
  isDesktop: isTauriRuntime,
  pickSavePath: async ({ defaultPath, title, filterName, extension }) => {
    const { save } = await import('@tauri-apps/plugin-dialog')
    return save({ defaultPath, title, filters: [{ name: filterName, extensions: [extension] }] })
  },
  joinPath: async (folder, fileName) => {
    const { join } = await import('@tauri-apps/api/path')
    return join(folder, fileName)
  },
  writeFile: async (path, bytes) => {
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, bytes)
  },
  downloadViaBrowser: (fileName, bytes) => {
    const blob = new Blob([bytes as BlobPart])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  },
}

export async function saveBackupFile(
  opts: SaveBackupOptions,
  overrides: Partial<SaveBackupDeps> = {},
): Promise<SaveBackupResult> {
  const deps = { ...defaultDeps, ...overrides }
  const bytes = typeof opts.data === 'string' ? new TextEncoder().encode(opts.data) : opts.data

  if (!deps.isDesktop()) {
    deps.downloadViaBrowser(opts.fileName, bytes)
    return { status: 'download' }
  }

  try {
    const folder = await deps.getFolder()
    const defaultPath = folder ? await deps.joinPath(folder, opts.fileName) : opts.fileName
    const chosen = await deps.pickSavePath({
      defaultPath,
      title: opts.title,
      filterName: opts.filterName,
      extension: opts.extension,
    })
    if (!chosen) return { status: 'cancelled' }

    try {
      await deps.writeFile(chosen, bytes)
      return { status: 'saved', path: chosen }
    } catch (writeError) {
      console.error('Manual backup: failed writing to the chosen path, falling back to download:', writeError)
      deps.downloadViaBrowser(opts.fileName, bytes)
      return {
        status: 'download-fallback',
        error: writeError instanceof Error ? writeError.message : String(writeError),
      }
    }
  } catch (dialogError) {
    console.error('Manual backup: save dialog failed, falling back to download:', dialogError)
    deps.downloadViaBrowser(opts.fileName, bytes)
    return {
      status: 'download-fallback',
      error: dialogError instanceof Error ? dialogError.message : String(dialogError),
    }
  }
}

/** הודעה למשתמש לפי תוצאת השמירה, או null אם אין מה להציג (ביטול). */
export function describeSaveResult(
  result: SaveBackupResult,
  successMessage: string,
): { message: string; severity: 'success' | 'warning' | 'info' } | null {
  switch (result.status) {
    case 'saved':
      return { message: `${successMessage}: ${result.path}`, severity: 'success' }
    case 'download':
      return { message: successMessage, severity: 'success' }
    case 'download-fallback':
      return {
        message: `${successMessage} (נשמר בתיקיית ההורדות, כי השמירה במיקום שנבחר נכשלה)`,
        severity: 'warning',
      }
    case 'cancelled':
      return null
  }
}
