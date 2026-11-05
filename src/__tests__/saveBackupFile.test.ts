import { describe, it, expect, vi } from 'vitest'
import { saveBackupFile, describeSaveResult, type SaveBackupDeps } from '../services/saveBackupFile'

const OPTS = {
  fileName: 'gemach_backup_2026-11-05.json',
  data: '{"a":1}',
  filterName: 'גיבוי (JSON)',
  extension: 'json',
}

function makeDeps(over: Partial<SaveBackupDeps> = {}) {
  const deps = {
    getFolder: vi.fn(async () => 'D:\\Backups'),
    isDesktop: vi.fn(() => true),
    pickSavePath: vi.fn(async ({ defaultPath }: { defaultPath: string }) => defaultPath),
    joinPath: vi.fn(async (folder: string, fileName: string) => `${folder}\\${fileName}`),
    writeFile: vi.fn(async () => {}),
    downloadViaBrowser: vi.fn(),
    ...over,
  }
  return deps
}

describe('saveBackupFile — ייצוא ידני עם "שמירה בשם"', () => {
  it('פותח את החלון בתיקיית הגיבוי שהוגדרה ושומר למה שנבחר', async () => {
    const deps = makeDeps()
    const result = await saveBackupFile(OPTS, deps)

    expect(deps.pickSavePath).toHaveBeenCalledTimes(1)
    expect(deps.pickSavePath.mock.calls[0][0]).toMatchObject({
      defaultPath: 'D:\\Backups\\gemach_backup_2026-11-05.json',
      extension: 'json',
    })
    expect(result).toEqual({ status: 'saved', path: 'D:\\Backups\\gemach_backup_2026-11-05.json' })
    expect(deps.writeFile).toHaveBeenCalledTimes(1)
    expect(new TextDecoder().decode(deps.writeFile.mock.calls[0][1] as Uint8Array)).toBe('{"a":1}')
    expect(deps.downloadViaBrowser).not.toHaveBeenCalled()
  })

  it('המשתמש יכול לבחור מיקום אחר מהמוגדר', async () => {
    const deps = makeDeps({ pickSavePath: vi.fn(async () => 'E:\\Other\\mine.json') })
    const result = await saveBackupFile(OPTS, deps)
    expect(result).toEqual({ status: 'saved', path: 'E:\\Other\\mine.json' })
    expect(deps.writeFile.mock.calls[0][0]).toBe('E:\\Other\\mine.json')
  })

  it('בלי תיקייה מוגדרת - החלון מקבל רק את שם הקובץ', async () => {
    const deps = makeDeps({ getFolder: vi.fn(async () => '') })
    await saveBackupFile(OPTS, deps)
    expect(deps.joinPath).not.toHaveBeenCalled()
    expect(deps.pickSavePath.mock.calls[0][0]).toMatchObject({ defaultPath: OPTS.fileName })
  })

  it('ביטול החלון - לא נכתב ולא יורד שום דבר', async () => {
    const deps = makeDeps({ pickSavePath: vi.fn(async () => null) })
    const result = await saveBackupFile(OPTS, deps)
    expect(result).toEqual({ status: 'cancelled' })
    expect(deps.writeFile).not.toHaveBeenCalled()
    expect(deps.downloadViaBrowser).not.toHaveBeenCalled()
    expect(describeSaveResult(result, 'x')).toBeNull()
  })

  it('כשל בכתיבה - fallback להורדה, ולא מאבד את הגיבוי', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({ writeFile: vi.fn(async () => { throw new Error('disk full') }) })
    const result = await saveBackupFile(OPTS, deps)
    expect(result).toEqual({ status: 'download-fallback', error: 'disk full' })
    expect(deps.downloadViaBrowser).toHaveBeenCalledTimes(1)
    expect(describeSaveResult(result, 'ok')?.severity).toBe('warning')
    consoleError.mockRestore()
  })

  it('כשל בפתיחת החלון - fallback להורדה', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps({ pickSavePath: vi.fn(async () => { throw new Error('not allowed') }) })
    const result = await saveBackupFile(OPTS, deps)
    expect(result.status).toBe('download-fallback')
    expect(deps.downloadViaBrowser).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('מחוץ לאפליקציית שולחן העבודה - הורדה דרך הדפדפן בלי חלון', async () => {
    const deps = makeDeps({ isDesktop: vi.fn(() => false) })
    const result = await saveBackupFile(OPTS, deps)
    expect(result).toEqual({ status: 'download' })
    expect(deps.pickSavePath).not.toHaveBeenCalled()
    expect(deps.downloadViaBrowser).toHaveBeenCalledTimes(1)
  })

  it('תומך גם בתוכן בינארי (ZIP)', async () => {
    const deps = makeDeps()
    const bytes = new Uint8Array([80, 75, 3, 4])
    await saveBackupFile({ ...OPTS, fileName: 'a.zip', extension: 'zip', data: bytes }, deps)
    expect(deps.writeFile.mock.calls[0][1]).toBe(bytes)
  })
})

describe('describeSaveResult', () => {
  it('מציג את הנתיב אחרי שמירה מוצלחת', () => {
    expect(describeSaveResult({ status: 'saved', path: 'D:\\x.json' }, 'יוצא')).toEqual({
      message: 'יוצא: D:\\x.json',
      severity: 'success',
    })
  })
})
