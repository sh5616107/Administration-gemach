/**
 * גיבוי אוטומטי.
 *
 * הבאג שתוקן: ההגדרה "נתיב לשמירת גיבויים" (auto_backup_path) נשמרה אבל לא נקראה.
 * הגיבוי האוטומטי יצר <a download> ולכן הקובץ תמיד ירד לתיקיית ההורדות.
 *
 * כעת, בגרסת Tauri, אם הוגדר נתיב - הקובץ נכתב ישירות אליו. אם הנתיב ריק, או שאנחנו
 * לא בתוך אפליקציית שולחן העבודה, נשמרת ההתנהגות הקודמת (הורדה דרך הדפדפן).
 * אם הכתיבה לנתיב המוגדר נכשלה, הגיבוי עדיין נשמר (בהורדות) והכשל מתועד כדי
 * שההגדרות יציגו אזהרה, ולא נבלע בשקט.
 */

import localforage from 'localforage'
import { toLocalDateStr } from '../utils/localDate'

/** מפתח ב-settings store שבו נשמר הכשל האחרון בכתיבה לנתיב המוגדר (אובייקט AutoBackupError). */
export const AUTO_BACKUP_ERROR_KEY = 'last_auto_backup_error'

export interface AutoBackupError {
  /** הנתיב שהוגדר ושאליו נכשלה הכתיבה */
  path: string
  /** הודעת השגיאה הטכנית (לאבחון) */
  message: string
  /** ISO timestamp */
  at: string
}

export interface AutoBackupStore {
  getItem<T>(key: string): Promise<T | null>
  setItem(key: string, value: unknown): Promise<unknown>
  removeItem(key: string): Promise<void>
}

export interface AutoBackupDeps {
  store: AutoBackupStore
  exportData: () => Promise<object>
  /** כותב קובץ לתיקייה (יוצר אותה אם חסרה). זורק שגיאה בכשל. */
  writeToFolder: (folder: string, fileName: string, content: string) => Promise<string>
  /** הורדה דרך הדפדפן (תיקיית ההורדות) */
  downloadViaBrowser: (fileName: string, content: string) => void
  isDesktop: () => boolean
  now: () => Date
}

export type AutoBackupResult =
  | { status: 'skipped' }
  | { status: 'folder'; path: string }
  | { status: 'download' }
  | { status: 'download-fallback'; error: AutoBackupError }
  | { status: 'error'; error: string }

const settingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

/** האם הגיע הזמן לגיבוי הבא לפי התדירות שנבחרה. */
export function isBackupDue(mode: string | null | undefined, lastBackupIso: string | null | undefined, now: Date): boolean {
  if (!mode || mode === 'off') return false
  if (!lastBackupIso) return true
  const last = new Date(lastBackupIso)
  if (Number.isNaN(last.getTime())) return true
  const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  if (mode === 'daily') return diffDays >= 1
  if (mode === 'weekly') return diffDays >= 7
  if (mode === 'monthly') return diffDays >= 30
  return false
}

/**
 * מנקה את מה שהמשתמש הקליד בשדה הנתיב: רווחים בקצוות ומרכאות עוטפות
 * (העתקה של "Copy as path" ב-Windows מוסיפה מרכאות).
 */
export function normalizeBackupFolder(raw: string | null | undefined): string {
  let value = (raw ?? '').trim()
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1).trim()
  }
  return value
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)
}

async function defaultWriteToFolder(folder: string, fileName: string, content: string): Promise<string> {
  const { mkdir, exists, writeFile } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')

  if (!(await exists(folder))) {
    await mkdir(folder, { recursive: true })
  }
  const fullPath = await join(folder, fileName)
  await writeFile(fullPath, new TextEncoder().encode(content))
  return fullPath
}

function defaultDownloadViaBrowser(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * מריץ גיבוי אוטומטי אם הגיע זמנו. לא זורק - מחזיר תוצאה.
 * `last_auto_backup` מתעדכן רק אם נוצר קובץ גיבוי בפועל (בנתיב המוגדר או בהורדות).
 */
export async function runAutoBackup(
  exportData: () => Promise<object>,
  overrides: Partial<AutoBackupDeps> = {},
): Promise<AutoBackupResult> {
  const deps: AutoBackupDeps = {
    store: settingsStore as unknown as AutoBackupStore,
    exportData,
    writeToFolder: defaultWriteToFolder,
    downloadViaBrowser: defaultDownloadViaBrowser,
    isDesktop: isTauriRuntime,
    now: () => new Date(),
    ...overrides,
  }

  try {
    const mode = await deps.store.getItem<string>('auto_backup')
    const lastBackup = await deps.store.getItem<string>('last_auto_backup')
    const now = deps.now()
    if (!isBackupDue(mode, lastBackup, now)) return { status: 'skipped' }

    const data = await deps.exportData()
    const content = JSON.stringify(
      { exportDate: now.toISOString(), version: '1.0', autoBackup: true, ...data },
      null,
      2,
    )
    const fileName = `gemach_auto_backup_${toLocalDateStr(now)}.json`
    const folder = normalizeBackupFolder(await deps.store.getItem<string>('auto_backup_path'))

    let result: AutoBackupResult

    if (folder && deps.isDesktop()) {
      try {
        const fullPath = await deps.writeToFolder(folder, fileName, content)
        await deps.store.removeItem(AUTO_BACKUP_ERROR_KEY)
        result = { status: 'folder', path: fullPath }
      } catch (writeError) {
        console.error('Auto backup: failed writing to configured folder, falling back to downloads:', writeError)
        deps.downloadViaBrowser(fileName, content)
        const error: AutoBackupError = {
          path: folder,
          message: writeError instanceof Error ? writeError.message : String(writeError),
          at: now.toISOString(),
        }
        await deps.store.setItem(AUTO_BACKUP_ERROR_KEY, error)
        result = { status: 'download-fallback', error }
      }
    } else {
      deps.downloadViaBrowser(fileName, content)
      result = { status: 'download' }
    }

    await deps.store.setItem('last_auto_backup', now.toISOString())
    return result
  } catch (error) {
    console.error('Auto backup error:', error)
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

/** הכשל האחרון בכתיבה לנתיב המוגדר (או null אם אין). */
export async function getAutoBackupError(): Promise<AutoBackupError | null> {
  try {
    return await settingsStore.getItem<AutoBackupError>(AUTO_BACKUP_ERROR_KEY)
  } catch {
    return null
  }
}

export async function clearAutoBackupError(): Promise<void> {
  try {
    await settingsStore.removeItem(AUTO_BACKUP_ERROR_KEY)
  } catch (error) {
    console.error('Error clearing auto backup error:', error)
  }
}
