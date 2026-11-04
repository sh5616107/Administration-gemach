import { describe, it, expect, vi } from 'vitest'
import {
  runAutoBackup,
  isBackupDue,
  normalizeBackupFolder,
  AUTO_BACKUP_ERROR_KEY,
  type AutoBackupStore,
} from '../services/autoBackupService'

function makeStore(initial: Record<string, unknown>): AutoBackupStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...initial }
  return {
    data,
    getItem: async <T,>(key: string) => (key in data ? (data[key] as T) : null),
    setItem: async (key: string, value: unknown) => { data[key] = value },
    removeItem: async (key: string) => { delete data[key] },
  }
}

const NOW = new Date(2026, 10, 3, 15, 0, 0) // 2026-11-03 מקומי
const exportData = async () => ({ borrowers: {}, loans: {} })

function setup(storeInit: Record<string, unknown>, opts: { isDesktop?: boolean; writeFails?: boolean } = {}) {
  const store = makeStore(storeInit)
  const writeToFolder = vi.fn(async (folder: string, fileName: string) => {
    if (opts.writeFails) throw new Error('access denied')
    return `${folder}\\${fileName}`
  })
  const downloadViaBrowser = vi.fn()
  const run = () =>
    runAutoBackup(exportData, {
      store,
      writeToFolder,
      downloadViaBrowser,
      isDesktop: () => opts.isDesktop ?? true,
      now: () => NOW,
    })
  return { store, writeToFolder, downloadViaBrowser, run }
}

describe('autoBackupService — נתיב גיבוי מוגדר (רגרסיה: הגיבוי ירד תמיד להורדות)', () => {
  it('כותב לנתיב שהוגדר ולא מוריד דרך הדפדפן', async () => {
    const { run, writeToFolder, downloadViaBrowser, store } = setup({
      auto_backup: 'daily',
      auto_backup_path: 'D:\\Backups\\Gemach',
    })

    const result = await run()

    expect(result).toEqual({ status: 'folder', path: 'D:\\Backups\\Gemach\\gemach_auto_backup_2026-11-03.json' })
    expect(writeToFolder).toHaveBeenCalledTimes(1)
    expect(writeToFolder.mock.calls[0][0]).toBe('D:\\Backups\\Gemach')
    expect(writeToFolder.mock.calls[0][1]).toBe('gemach_auto_backup_2026-11-03.json')
    expect(JSON.parse(writeToFolder.mock.calls[0][2]).autoBackup).toBe(true)
    expect(downloadViaBrowser).not.toHaveBeenCalled()
    expect(store.data['last_auto_backup']).toBe(NOW.toISOString())
  })

  it('מנקה מרכאות ורווחים מהנתיב ("Copy as path" ב-Windows)', async () => {
    const { run, writeToFolder } = setup({ auto_backup: 'daily', auto_backup_path: '  "E:\\Gemach Backups"  ' })
    await run()
    expect(writeToFolder.mock.calls[0][0]).toBe('E:\\Gemach Backups')
  })

  it('בלי נתיב מוגדר - מוריד דרך הדפדפן כמו קודם', async () => {
    const { run, writeToFolder, downloadViaBrowser, store } = setup({ auto_backup: 'daily', auto_backup_path: '' })
    const result = await run()
    expect(result).toEqual({ status: 'download' })
    expect(writeToFolder).not.toHaveBeenCalled()
    expect(downloadViaBrowser).toHaveBeenCalledTimes(1)
    expect(store.data['last_auto_backup']).toBe(NOW.toISOString())
  })

  it('מחוץ לאפליקציית שולחן העבודה - מוריד דרך הדפדפן גם אם הוגדר נתיב', async () => {
    const { run, writeToFolder, downloadViaBrowser } = setup(
      { auto_backup: 'daily', auto_backup_path: 'D:\\Backups' },
      { isDesktop: false },
    )
    const result = await run()
    expect(result).toEqual({ status: 'download' })
    expect(writeToFolder).not.toHaveBeenCalled()
    expect(downloadViaBrowser).toHaveBeenCalledTimes(1)
  })

  it('כשל בכתיבה לנתיב - fallback להורדה, והכשל מתועד ולא נבלע', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { run, downloadViaBrowser, store } = setup(
      { auto_backup: 'daily', auto_backup_path: 'Z:\\Missing' },
      { writeFails: true },
    )

    const result = await run()

    expect(result.status).toBe('download-fallback')
    expect(downloadViaBrowser).toHaveBeenCalledTimes(1)
    expect(store.data[AUTO_BACKUP_ERROR_KEY]).toMatchObject({ path: 'Z:\\Missing', message: 'access denied' })
    expect(store.data['last_auto_backup']).toBe(NOW.toISOString())
    consoleError.mockRestore()
  })

  it('כתיבה מוצלחת מנקה כשל קודם', async () => {
    const { run, store } = setup({
      auto_backup: 'daily',
      auto_backup_path: 'D:\\Backups',
      [AUTO_BACKUP_ERROR_KEY]: { path: 'Z:\\Old', message: 'x', at: NOW.toISOString() },
    })
    await run()
    expect(store.data[AUTO_BACKUP_ERROR_KEY]).toBeUndefined()
  })

  it('כשגם הורדה נכשלת - last_auto_backup לא מתעדכן', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { run, downloadViaBrowser, store } = setup({ auto_backup: 'daily', auto_backup_path: '' })
    downloadViaBrowser.mockImplementation(() => { throw new Error('boom') })
    const result = await run()
    expect(result.status).toBe('error')
    expect(store.data['last_auto_backup']).toBeUndefined()
    consoleError.mockRestore()
  })

  it('גיבוי כבוי או שעוד לא הגיע הזמן - לא עושה כלום', async () => {
    const off = setup({ auto_backup: 'off', auto_backup_path: 'D:\\B' })
    expect(await off.run()).toEqual({ status: 'skipped' })
    expect(off.writeToFolder).not.toHaveBeenCalled()

    const notYet = setup({
      auto_backup: 'weekly',
      auto_backup_path: 'D:\\B',
      last_auto_backup: new Date(2026, 10, 1).toISOString(),
    })
    expect(await notYet.run()).toEqual({ status: 'skipped' })
    expect(notYet.writeToFolder).not.toHaveBeenCalled()
    expect(notYet.downloadViaBrowser).not.toHaveBeenCalled()
  })
})

describe('isBackupDue', () => {
  it('מכבד תדירות יומית/שבועית/חודשית', () => {
    const day = 24 * 60 * 60 * 1000
    const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString()
    expect(isBackupDue('daily', ago(1), NOW)).toBe(true)
    expect(isBackupDue('daily', ago(0), NOW)).toBe(false)
    expect(isBackupDue('weekly', ago(6), NOW)).toBe(false)
    expect(isBackupDue('weekly', ago(7), NOW)).toBe(true)
    expect(isBackupDue('monthly', ago(29), NOW)).toBe(false)
    expect(isBackupDue('monthly', ago(30), NOW)).toBe(true)
    expect(isBackupDue('daily', null, NOW)).toBe(true)
    expect(isBackupDue('off', null, NOW)).toBe(false)
  })
})

describe('normalizeBackupFolder', () => {
  it('מטפל בערכים ריקים', () => {
    expect(normalizeBackupFolder(undefined)).toBe('')
    expect(normalizeBackupFolder(null)).toBe('')
    expect(normalizeBackupFolder('   ')).toBe('')
  })
})
