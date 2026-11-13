import { exportAllData, importAllData } from './database'
import { ensureFundsIntegrity } from './fundsIntegrity'

/**
 * "Delete all": removes every record in ONE step (a single save), keeping only the settings.
 * Because the whole new state is written at once, a crash or power loss can never leave
 * half-deleted data on disk, and no intermediate state ends up in the automatic backup copies.
 * The default fund is recreated afterwards, exactly as after an import.
 * (Attachment files in the archive are removed separately by the caller.)
 */
export async function clearAllDataKeepSettings(): Promise<void> {
  const current = await exportAllData()
  await importAllData({ settings: current.settings })
  await ensureFundsIntegrity()
}
