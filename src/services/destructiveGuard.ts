/**
 * Guards for destructive actions (delete all, import):
 *  - ensureSafetyBackup(): call BEFORE the action; if it returns ok:false the action must be aborted.
 *  - confirmSavedToDisk(): call AFTER the action; returns an error message, or null if it reached disk.
 */

import { commitData, flushPendingSave } from './database'
import { createPreDestructiveBackup, getSaveFailure, restoreBackup, type PreDestructiveBackupResult } from './persistence'

export async function ensureSafetyBackup(reason: string = 'manual'): Promise<PreDestructiveBackupResult> {
  try {
    await flushPendingSave()
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, error: '\u05d4\u05e9\u05de\u05d9\u05e8\u05d4 \u05d4\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4, \u05d5\u05dc\u05db\u05df \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05d9\u05e6\u05d5\u05e8 \u05d2\u05d9\u05d1\u05d5\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea. ' + detail }
  }
  return createPreDestructiveBackup(reason)
}

/**
 * Restores a listed backup. Waits for pending saves first (so the automatic 'before-restore' snapshot
 * has the latest data). The caller reloads the app when this returns ok.
 */
export async function restoreBackupSafely(file: string): Promise<PreDestructiveBackupResult> {
  try {
    await flushPendingSave()
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return { ok: false, error: '\u05d4\u05e9\u05de\u05d9\u05e8\u05d4 \u05d4\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4 \u05e0\u05db\u05e9\u05dc\u05d4, \u05d5\u05dc\u05db\u05df \u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e9\u05d7\u05d6\u05e8 \u05db\u05e8\u05d2\u05e2. ' + detail }
  }
  return restoreBackup(file)
}

export const SAVE_FAILED_MESSAGE =
  '\u05d4\u05e4\u05e2\u05d5\u05dc\u05d4 \u05d1\u05d5\u05e6\u05e2\u05d4 \u05d1\u05d6\u05d9\u05db\u05e8\u05d5\u05df \u05d0\u05da \u05d4\u05e9\u05de\u05d9\u05e8\u05d4 \u05dc\u05d3\u05d9\u05e1\u05e7 \u05e0\u05db\u05e9\u05dc\u05d4. \u05d9\u05e9 \u05dc\u05d4\u05e9\u05d0\u05d9\u05e8 \u05d0\u05ea \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05e4\u05ea\u05d5\u05d7\u05d4 \u05e2\u05d3 \u05e9\u05d4\u05e9\u05de\u05d9\u05e8\u05d4 \u05ea\u05e6\u05dc\u05d9\u05d7.'

export async function confirmSavedToDisk(): Promise<string | null> {
  try {
    await commitData()
  } catch {
    return SAVE_FAILED_MESSAGE
  }
  return getSaveFailure() ? SAVE_FAILED_MESSAGE : null
}
