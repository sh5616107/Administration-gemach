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
