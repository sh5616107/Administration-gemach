/**
 * Attachments storage — the filesystem side of the document-attachments
 * feature: copying a user-picked file into the app-managed archive folder,
 * opening the stored copy, and permanently deleting it.
 *
 * See spec: "אפיון פיצ'ר: צירוף מסמכים", section 7 (storage) and section 5
 * (attach/open/remove flows).
 *
 * Design notes (MVP scope):
 * - Single desktop manager, single machine — every attached file is ALWAYS
 *   copied into the archive; there is no "link only" mode and no cloud sync.
 * - The archive lives under Tauri's AppLocalData directory, next to
 *   gemach_data.json, in a "מסמכי_הגמח/<entityType>/<entityId>/" structure.
 * - Removing a single attachment is a hard delete of both the DB record and
 *   the physical file (see attachmentsService.hardDelete + this module's
 *   hardDeleteAttachment) — there's no per-attachment undo in MVP.
 */

import type { Attachment, AttachmentCategory, AttachmentEntityType } from '../types/attachments'
import { attachmentsService } from './database'

const ARCHIVE_ROOT = 'מסמכי_הגמח'

const SUPPORTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx']

// Same Tauri-detection pattern used elsewhere in the app (see services/documents.ts).
function isTauri(): boolean {
  const hasTauriGlobal = typeof window !== 'undefined' && '__TAURI__' in window
  const hasTauriInternals = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  return hasTauriGlobal || hasTauriInternals
}

/** Sanitizes a filename so it's safe to use as a path segment on Windows. */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'קובץ'
}

function relativeDirFor(entityType: AttachmentEntityType, entityId: string): string {
  return `${ARCHIVE_ROOT}/${entityType}/${entityId}`
}

export class NotInDesktopAppError extends Error {
  constructor() {
    super('צירוף מסמכים זמין רק בגרסת שולחן העבודה של התוכנה')
    this.name = 'NotInDesktopAppError'
  }
}

/**
 * Opens the native "pick a file" dialog, copies the chosen file into the
 * managed archive folder for the given entity, and creates the Attachment
 * record.
 *
 * @returns the created Attachment, or null if the user cancelled the dialog.
 */
export async function pickAndAttachFile(
  entityType: AttachmentEntityType,
  entityId: string,
  category: AttachmentCategory,
  note?: string,
  customLabel?: string
): Promise<Attachment | null> {
  if (!isTauri()) throw new NotInDesktopAppError()

  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    multiple: false,
    title: 'בחר קובץ לצירוף',
    filters: [{ name: 'מסמכים ותמונות', extensions: SUPPORTED_EXTENSIONS }],
  })

  // `open` only returns an array when `multiple: true`; we never pass that,
  // but guard defensively in case the option ever changes.
  if (!selected || Array.isArray(selected)) return null
  const sourcePath = selected

  const { mkdir, copyFile, exists, stat, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  const { basename } = await import('@tauri-apps/api/path')

  const originalName = await basename(sourcePath)
  const safeName = sanitizeFileName(originalName)
  const relativeDir = relativeDirFor(entityType, entityId)

  await mkdir(relativeDir, { baseDir: BaseDirectory.AppLocalData, recursive: true })

  // Avoid silently overwriting an existing file with the same name for this
  // entity — append a numeric suffix instead.
  let finalName = safeName
  let attempt = 1
  while (await exists(`${relativeDir}/${finalName}`, { baseDir: BaseDirectory.AppLocalData })) {
    const dotIndex = safeName.lastIndexOf('.')
    const base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName
    const ext = dotIndex > 0 ? safeName.slice(dotIndex) : ''
    attempt += 1
    finalName = `${base} (${attempt})${ext}`
  }

  const storedPathRelative = `${relativeDir}/${finalName}`
  await copyFile(sourcePath, storedPathRelative, { toPathBaseDir: BaseDirectory.AppLocalData })

  let fileSize: number | undefined
  try {
    const info = await stat(storedPathRelative, { baseDir: BaseDirectory.AppLocalData })
    fileSize = info.size
  } catch {
    // best-effort only — size is for display purposes
  }

  return attachmentsService.create({
    entityType,
    entityId,
    category,
    customLabel: category === 'אחר' ? customLabel?.trim() || undefined : undefined,
    fileName: originalName,
    storedPathRelative,
    fileSize,
    note,
  })
}

/**
 * Opens an attachment's stored copy with the OS's default application.
 *
 * Returns false (without throwing) if the file is missing, so the caller
 * can show a "file not found" message. This intentionally does NOT persist
 * `isMissing` to disk — see spec section 7.3: only the batch "check missing
 * documents" tool (planned for a later stage) writes that flag, in one
 * consolidated save at the end of a full scan.
 */
export async function openAttachment(attachment: Attachment): Promise<boolean> {
  if (!isTauri()) throw new NotInDesktopAppError()

  const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  const fileExists = await exists(attachment.storedPathRelative, { baseDir: BaseDirectory.AppLocalData })
  if (!fileExists) return false

  const { appLocalDataDir, join } = await import('@tauri-apps/api/path')
  const base = await appLocalDataDir()
  const absolutePath = await join(base, attachment.storedPathRelative)

  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_url', { url: absolutePath })
  return true
}

/**
 * Permanently deletes an attachment: the physical file in the archive AND
 * the database record (see spec section 5, "הסרת צירוף" — hard delete,
 * with a confirmation dialog handled by the calling UI component).
 */
export async function hardDeleteAttachment(attachment: Attachment): Promise<void> {
  if (isTauri()) {
    try {
      const { remove, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      if (await exists(attachment.storedPathRelative, { baseDir: BaseDirectory.AppLocalData })) {
        await remove(attachment.storedPathRelative, { baseDir: BaseDirectory.AppLocalData })
      }
    } catch (e) {
      // If the physical file is already gone or inaccessible, we still want
      // to remove the DB record — a dangling record pointing at a missing
      // file is worse than a slightly-too-eager record deletion.
      console.warn('לא ניתן היה למחוק את הקובץ הפיזי של המסמך:', e)
    }
  }

  await attachmentsService.hardDelete(attachment.id)
}

/**
 * Replaces the stored copy of an attachment ("צרף מחדש") after the original
 * file went missing from the archive (e.g. deleted manually outside the
 * app). Keeps the same category/note/entity linkage; only the physical
 * file and size are refreshed.
 *
 * @returns the refreshed Attachment, or null if the user cancelled the dialog.
 */
export async function reattachFile(attachment: Attachment): Promise<Attachment | null> {
  if (!isTauri()) throw new NotInDesktopAppError()

  const { open } = await import('@tauri-apps/plugin-dialog')
  const selected = await open({
    multiple: false,
    title: 'בחר קובץ חלופי',
    filters: [{ name: 'מסמכים ותמונות', extensions: SUPPORTED_EXTENSIONS }],
  })
  if (!selected || Array.isArray(selected)) return null

  const { copyFile, stat, BaseDirectory } = await import('@tauri-apps/plugin-fs')
  await copyFile(selected, attachment.storedPathRelative, { toPathBaseDir: BaseDirectory.AppLocalData })

  let fileSize: number | undefined
  try {
    const info = await stat(attachment.storedPathRelative, { baseDir: BaseDirectory.AppLocalData })
    fileSize = info.size
  } catch {
    // best-effort only
  }

  // There's no `update` in attachmentsService in MVP scope (create +
  // hardDelete only) — recreating the record preserves entity linkage while
  // keeping the service's write surface minimal.
  await attachmentsService.hardDelete(attachment.id)
  return attachmentsService.create({
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    category: attachment.category,
    customLabel: attachment.customLabel,
    fileName: attachment.fileName,
    storedPathRelative: attachment.storedPathRelative,
    fileSize,
    note: attachment.note,
  })
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
