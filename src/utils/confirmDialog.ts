/**
 * Async, Tauri-native confirmation dialog.
 *
 * BUG THIS FIXES:
 * The app used the browser's built-in `window.confirm()` for every destructive
 * action ("האם למחוק...?"). Inside the Tauri webview, `window.confirm()` is not
 * guaranteed to block execution the way it does in a normal browser tab — the
 * calling code can carry on (and perform the delete) before the user has
 * actually answered the native dialog. In practice this means:
 *   1. The delete runs immediately, before the confirmation dialog is answered.
 *   2. Clicking "Cancel" does nothing, because the delete already happened.
 *
 * `@tauri-apps/plugin-dialog` (already a dependency of this app, currently only
 * used for the file picker) exposes a proper `confirm()` that returns a Promise
 * which resolves only once the user actually clicks a button on the native
 * dialog. Using `await confirmAction(...)` guarantees the code that follows only
 * runs after a real answer.
 *
 * Use this everywhere a destructive/irreversible action needs user confirmation,
 * instead of the global `confirm()`.
 */
import { confirm as tauriConfirm } from '@tauri-apps/plugin-dialog'

export async function confirmAction(message: string, title = 'אישור פעולה'): Promise<boolean> {
  try {
    return await tauriConfirm(message, { title, kind: 'warning' })
  } catch (e) {
    // Fallback for non-Tauri environments (e.g. `npm run dev` in a plain browser,
    // or unit tests) where the plugin isn't available.
    console.warn('Tauri confirm dialog unavailable, falling back to window.confirm', e)
    return window.confirm(message)
  }
}
