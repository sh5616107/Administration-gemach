const STORAGE_KEY = 'gemach_data_v1'

export async function saveAppData(obj: unknown): Promise<void> {
  const json = JSON.stringify(obj)

  // Try Tauri fs
  if ((window as any).__TAURI__) {
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')
      
      // Get the app local data directory
      const localDataDir = await appLocalDataDir()
      console.log('🔍 App Local Data Dir:', localDataDir)
      
      // Try to write to local data directory (should be next to exe in portable mode)
      try {
        await writeTextFile('gemach_data.json', json, { baseDir: BaseDirectory.AppLocalData })
        console.log('💾 ✅ Saved to AppLocalData:', localDataDir)
        return
      } catch (localError) {
        console.warn('⚠️ Cannot write to AppLocalData, trying AppData:', localError)
        // Fall back to AppData
        await writeTextFile('gemach_data.json', json, { baseDir: BaseDirectory.AppData })
        console.log('💾 Saved to AppData (fallback)')
        return
      }
    } catch (e) {
      console.warn('Tauri write failed, falling back to localStorage:', e)
    }
  }

  // Fallback: localStorage
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
