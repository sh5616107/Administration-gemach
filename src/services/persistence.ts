const STORAGE_KEY = 'gemach_data_v1'
const DATA_FILE = 'gemach_data.json'
const TMP_FILE = 'gemach_data.json.tmp'

/**
 * Writes `json` to `fileName` atomically within `baseDir`: writes to a
 * temporary sibling file first, then renames it over the real file.
 * A crash/power-loss mid-write leaves either the old file intact or the
 * new one fully written — never a half-written gemach_data.json.
 * (See spec: "אפיון פיצ'ר: צירוף מסמכים" section 7.3.)
 */
async function writeFileAtomic(fileName: string, json: string, baseDir: any): Promise<void> {
  const { writeTextFile, rename, remove, exists } = await import('@tauri-apps/plugin-fs')

  await writeTextFile(TMP_FILE, json, { baseDir })

  try {
    await rename(TMP_FILE, fileName, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
  } catch (renameError) {
    // Clean up the temp file if the rename itself failed, so we don't
    // leave stray .tmp files behind on repeated failures.
    try {
      if (await exists(TMP_FILE, { baseDir })) {
        await remove(TMP_FILE, { baseDir })
      }
    } catch {
      // best-effort cleanup only
    }
    throw renameError
  }
}

export async function saveAppData(obj: unknown): Promise<void> {
  const json = JSON.stringify(obj)

  // Try Tauri fs
  if ((window as any).__TAURI__) {
    try {
      const { BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')
      
      // Get the app local data directory
      const localDataDir = await appLocalDataDir()
      console.log('🔍 App Local Data Dir:', localDataDir)
      
      // Try to write to local data directory (should be next to exe in portable mode)
      try {
        await writeFileAtomic(DATA_FILE, json, BaseDirectory.AppLocalData)
        console.log('💾 ✅ Saved to AppLocalData:', localDataDir)
        return
      } catch (localError) {
        console.warn('⚠️ Cannot write to AppLocalData, trying AppData:', localError)
        // Fall back to AppData
        await writeFileAtomic(DATA_FILE, json, BaseDirectory.AppData)
        console.log('💾 Saved to AppData (fallback)')
        return
      }
    } catch (e) {
      console.warn('Tauri write failed, falling back to localStorage:', e)
    }
  }

  // Fallback: localStorage (writes are already effectively atomic here —
  // the browser either commits the full string or throws, e.g. on quota)
  try {
    localStorage.setItem(STORAGE_KEY, json)
    console.log('💾 Saved to localStorage')
    return
  } catch (e) {
    console.error('localStorage save failed:', e)
    throw e
  }
}

export async function loadAppData(): Promise<any | null> {
  // Try Tauri fs
  if ((window as any).__TAURI__) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')
      
      // Get the app local data directory
      const localDataDir = await appLocalDataDir()
      console.log('🔍 App Local Data Dir:', localDataDir)
      
      // Try to read from local data directory
      try {
        const content = await readTextFile('gemach_data.json', { baseDir: BaseDirectory.AppLocalData })
        console.log('� ✅ tLoaded from AppLocalData:', localDataDir)
        return JSON.parse(content)
      } catch (localError) {
        console.warn('⚠️ Cannot read from AppLocalData, trying AppData:', localError)
        // Fall back to AppData
        const content = await readTextFile('gemach_data.json', { baseDir: BaseDirectory.AppData })
        console.log('📂 Loaded from AppData (fallback)')
        return JSON.parse(content)
      }
    } catch (e) {
      console.warn('Tauri read failed, will try localStorage:', e)
    }
  }

  // Fallback: localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      console.log('📂 Loaded from localStorage')
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('localStorage load failed:', e)
  }

  return null
}
