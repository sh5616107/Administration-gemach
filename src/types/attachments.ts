/**
 * Types for the "document attachments" feature.
 *
 * See spec: "אפיון פיצ'ר: צירוף מסמכים" (gemach-system docs), section 4.
 *
 * Design notes (MVP scope):
 * - Single desktop manager, single machine — no cloud sync, no multi-user
 *   sharing. Every attached file is ALWAYS copied into an app-managed
 *   archive folder; there is no "link only" mode.
 * - `category` is a closed union, not free text, so "which loans are
 *   missing a signed note" (user story #4) can rely on it reliably.
 */

export type AttachmentEntityType =
  | 'loan'
  | 'repayment'
  | 'borrower'
  | 'guarantor'
  | 'donation'
  | 'deposit'

export type AttachmentCategory =
  | 'שטר הלוואה'
  | 'אישור העברה בנקאית'
  | 'קבלה'
  | 'תעודת זהות'
  | 'כתב ערבות'
  | 'אחר'

export const ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  'שטר הלוואה',
  'אישור העברה בנקאית',
  'קבלה',
  'תעודת זהות',
  'כתב ערבות',
  'אחר',
]

export interface Attachment {
  id: string
  entityType: AttachmentEntityType
  entityId: string
  category: AttachmentCategory
  /**
   * Free-text label shown alongside the category when category === 'אחר'.
   * Keeps `category` itself a closed union (so the future "missing
   * documents" report can still rely on it) while letting the user say
   * what the "other" document actually is.
   */
  customLabel?: string
  /** Original file name, for display only. */
  fileName: string
  /**
   * Path to the stored copy, relative to the managed archive root
   * (which itself lives under Tauri's AppLocalData, next to
   * gemach_data.json). e.g. "מסמכי_הגמח/loan/<uuid>/שטר.pdf".
   */
  storedPathRelative: string
  /** Size in bytes, for display only. */
  fileSize?: number
  addedDate: string
  /** Free-text note — the only free-text field on an attachment. */
  note?: string
  /**
   * Set only by the (future, stage 2) "check missing documents" scan tool —
   * never written as a side effect of a single failed open attempt.
   */
  isMissing?: boolean
  /**
   * Soft-delete flag, set only when a parent entity with soft-delete
   * semantics (loan/repayment/deposit) is itself soft-deleted — see spec
   * section 8.11. Removing a single attachment directly is a hard delete
   * and does not use this flag; see attachmentsStorage.hardDeleteAttachment.
   */
  isDeleted?: boolean
}
