/**
 * Full backup export — spec stage 3: "גיבוי מלא הכולל מסמכים" (see spec
 * doc "אפיון פיצ'ר: צירוף מסמכים", section 8.6).
 *
 * The existing "יצוא לגיבוי" button (AdvancedTools.tsx, handleExport)
 * only exports gemach_data.json — it does NOT include the physical files
 * in the attachments archive folder, since attachment records only ever
 * held a path/link. Now that attachments are always copied into a
 * managed archive (see attachmentsStorage.ts), a data-only backup would
 * silently lose every attached document. This module adds a second,
 * complementary export: a ZIP containing both gemach_data.json AND the
 * full archive folder, so restoring from it doesn't require the archive
 * to have separately survived.
 *
 * This does NOT replace the existing JSON-only export — that one is
 * lighter and still useful for quick exports where documents don't
 * matter. Both are offered side by side in Advanced Tools.
 */

import JSZip from 'jszip'
import { exportAllData } from './database'

const ARCHIVE_ROOT = 'מסמכי_הגמח'

function isTauri(): boolean {
  const hasTauriGlobal = typeof window !== 'undefined' && '__TAURI__' in window
  const hasTauriInternals = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  return hasTauriGlobal || hasTauriInternals
}

/**
 * Recursively walks a directory under AppLocalData and returns every file
 * found, as paths relative to AppLocalData (e.g.
 * "מסמכי_הגמח/loan/<uuid>/שטר.pdf"). readDir() itself is not recursive —
 * we do the recursion here, descending into any entry with isDirectory.
 */
async function listArchiveFilesRecursive(relativeDir: string): Promise<string[]> {
  const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs')

  let entries: { name: string; isDirectory: boolean; isFile: boolean }[]
  try {
    entries = await readDir(relativeDir, { baseDir: BaseDirectory.AppLocalData })
  } catch {
    // Archive folder doesn't exist yet (e.g. no attachments were ever
    // added) — nothing to walk, not an error.
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    const entryRelativePath = `${relativeDir}/${entry.name}`
    if (entry.isDirectory) {
      files.push(...(await listArchiveFilesRecursive(entryRelativePath)))
    } else if (entry.isFile) {
      files.push(entryRelativePath)
    }
  }
  return files
}

export interface FullBackupResult {
  fileCount: number
  totalBytes: number
}

/**
 * Builds a ZIP containing gemach_data.json (the same content as the
 * existing JSON export) plus every file currently in the attachments
 * archive, and triggers a browser download for it — same delivery
 * mechanism as the existing handleExport in AdvancedTools.tsx (an
 * in-memory Blob + a synthetic <a download> click), so this works
 * identically whether running in Tauri or a plain browser tab.
 */
export async function exportFullBackupZip(
  onProgress?: (message: string) => void
): Promise<FullBackupResult> {
  const zip = new JSZip()

  onProgress?.('אוסף את נתוני המערכת...')
  const data = await exportAllData()
  const exportData = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    includesDocumentsArchive: true,
    ...data,
  }
  zip.file('gemach_data.json', JSON.stringify(exportData, null, 2))

  let fileCount = 0
  let totalBytes = 0

  if (isTauri()) {
    onProgress?.('סורק את ארכיון המסמכים...')
    const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const archiveFiles = await listArchiveFilesRecursive(ARCHIVE_ROOT)

    for (const relativePath of archiveFiles) {
      onProgress?.(`מוסיף קובץ ${fileCount + 1} מתוך ${archiveFiles.length}...`)
      try {
        const bytes = await readFile(relativePath, { baseDir: BaseDirectory.AppLocalData })
        zip.file(relativePath, bytes)
        fileCount += 1
        totalBytes += bytes.byteLength
      } catch (e) {
        // Skip a file we can't read rather than failing the whole backup —
        // the JSON data (the critical part) is still exported either way.
        console.warn('לא ניתן היה לכלול קובץ בגיבוי:', relativePath, e)
      }
    }
  }
  // If not running under Tauri (e.g. a plain browser preview), there's no
  // filesystem to read an archive from — the ZIP still contains the data
  // JSON, just without documents, same as the regular export in that case.

  onProgress?.('בונה קובץ ZIP...')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gemach_backup_full_${new Date().toISOString().split('T')[0]}.zip`
  a.click()
  URL.revokeObjectURL(url)

  return { fileCount, totalBytes }
}

/**
 * Parses a backup's gemach_data.json content into the shape importAllData
 * expects, tolerating both old (array-based) and new (object-keyed-by-id)
 * formats — same logic AdvancedTools.tsx's handleImport always used, moved
 * here so both the plain-.json import and the .zip import (below) share
 * exactly one implementation instead of drifting apart.
 *
 * BUGFIX: the previous inline version of this logic (only in
 * AdvancedTools.tsx) never captured `data.attachments` into the import
 * object at all — even a plain JSON export (which DOES include attachment
 * records, since exportAllData() returns the full DataStore) would
 * silently lose every attachment record on import. Fixed here by
 * including 'attachments' in both the reset object and the field list.
 */
export interface ParsedBackupData {
  importData: Record<string, any>
  hasNumericIds: boolean
}

export function parseBackupJson(rawJson: string): ParsedBackupData {
  const data = JSON.parse(rawJson)

  if (!data.exportDate && !data.borrowers && !data.settings) {
    throw new Error('קובץ גיבוי לא תקין')
  }

  const importData: Record<string, any> = {
    settings: {},
    borrowers: {},
    guarantors: {},
    loans: {},
    repayments: {},
    donors: {},
    donations: {},
    depositors: {},
    deposits: {},
    depositWithdrawals: {},
    blacklist: {},
    expenses: {},
    guarantorLoans: {},
    guarantorLoanRepayments: {},
    waitlist: {},
    attachments: {},
  }

  if (Array.isArray(data.settings)) {
    data.settings.forEach((s: any) => { importData.settings[s.key] = s.value })
  } else if (data.settings) {
    importData.settings = data.settings
  }

  const convertToObject = (input: any) => {
    if (!input) return {}
    if (!Array.isArray(input) && typeof input === 'object') return input
    const obj: Record<string, any> = {}
    if (Array.isArray(input)) input.forEach(item => { if (item.id) obj[String(item.id)] = item })
    return obj
  }

  if (data.borrowers) importData.borrowers = convertToObject(data.borrowers)
  if (data.guarantors) importData.guarantors = convertToObject(data.guarantors)
  if (data.loans) importData.loans = convertToObject(data.loans)
  if (data.repayments) importData.repayments = convertToObject(data.repayments)
  if (data.donors) importData.donors = convertToObject(data.donors)
  if (data.donations) importData.donations = convertToObject(data.donations)
  if (data.depositors) importData.depositors = convertToObject(data.depositors)
  if (data.deposits) importData.deposits = convertToObject(data.deposits)
  if (data.blacklist) importData.blacklist = convertToObject(data.blacklist)
  if (data.expenses) importData.expenses = convertToObject(data.expenses)
  if (data.guarantorLoans) importData.guarantorLoans = convertToObject(data.guarantorLoans)
  if (data.guarantorLoanRepayments) importData.guarantorLoanRepayments = convertToObject(data.guarantorLoanRepayments)
  if (data.waitlist) importData.waitlist = convertToObject(data.waitlist)
  if (data.depositWithdrawals) importData.depositWithdrawals = convertToObject(data.depositWithdrawals)
  if (data.attachments) importData.attachments = convertToObject(data.attachments)

  const hasNumericIds = Object.values(importData.borrowers || {}).some(
    (b: any) => typeof b.id === 'number' || (typeof b.id === 'string' && b.id.length < 20)
  )

  return { importData, hasNumericIds }
}

export interface ZipImportResult extends ParsedBackupData {
  restoredFileCount: number
}

/**
 * Imports a full backup ZIP (produced by exportFullBackupZip): extracts
 * gemach_data.json and parses it exactly like a plain JSON import, then
 * restores every archived attachment file back into the managed archive
 * folder. Data import and file restoration are independent — a file that
 * fails to restore is skipped (logged) rather than failing the whole
 * import, since the data itself (the more critical part) already parsed
 * successfully by that point.
 */
export async function importFullBackupZip(file: File): Promise<ZipImportResult> {
  const { default: JSZipCtor } = await import('jszip')
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZipCtor.loadAsync(arrayBuffer)

  const dataEntry = zip.file('gemach_data.json')
  if (!dataEntry) {
    throw new Error('קובץ ה-ZIP אינו תקין: לא נמצא gemach_data.json בתוכו')
  }
  const rawJson = await dataEntry.async('string')
  const parsed = parseBackupJson(rawJson)

  let restoredFileCount = 0

  if (isTauri()) {
    const { mkdir, writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const archiveEntries = Object.values(zip.files).filter(
      entry => !entry.dir && entry.name !== 'gemach_data.json' && entry.name.startsWith(`${ARCHIVE_ROOT}/`)
    )

    for (const entry of archiveEntries) {
      const relativePath = entry.name
      const dir = relativePath.slice(0, relativePath.lastIndexOf('/'))
      try {
        if (dir) await mkdir(dir, { baseDir: BaseDirectory.AppLocalData, recursive: true })
        const bytes = await entry.async('uint8array')
        await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppLocalData })
        restoredFileCount += 1
      } catch (e) {
        console.warn('לא ניתן היה לשחזר קובץ מהגיבוי:', relativePath, e)
      }
    }
  }
  // If not running under Tauri, there's nowhere to restore archive files
  // to — the data import still succeeds, just without documents, same
  // as exportFullBackupZip's behavior when not running under Tauri.

  return { ...parsed, restoredFileCount }
}
