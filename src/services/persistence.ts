const STORAGE_KEY = 'gemach_data_v1'

export async function saveAppData(obj: unknown): Promise<void> {
  const json = JSON.stringify(obj)

  // Try Tauri fs (AppData) when available
  if ((window as any).__TAURI__) {
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      await writeTextFile('gemach_data.json', json, { baseDir: BaseDirectory.AppData })
      console.log('💾 Saved to Tauri AppData')
      return
    } catch (e) {
      console.warn('Tauri write failed, falling back:', e)
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
  // Try Tauri fs (AppData)
  if ((window as any).__TAURI__) {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const content = await readTextFile('gemach_data.json', { baseDir: BaseDirectory.AppData })
      console.log('📂 Loaded from Tauri AppData')
      return JSON.parse(content)
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
