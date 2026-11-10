/**
 * Backups list + restore: SqliteBackend (listBackups / restoreFromBackup), persistence wrappers,
 * destructiveGuard.restoreBackupSafely and the (the component has its own test file).
 * Test names are English on purpose so the patch contains no raw Hebrew.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import {
  BAK1_FILE,
  DB_FILE,
  SAFETY_FILES,
  SqliteBackend,
} from '../services/storage/sqliteBackend'
import {
  __resetStorageForTests,
  __setStorageFactoryForTests,
  listBackups,
  loadAppData,
  restoreBackup,
  saveAppData,
} from '../services/persistence'
import { __setSqlJsLoaderForTests } from '../services/storage/sqlJsLoader'
import type { TauriStorage } from '../services/storage/tauriStorageIO'
import { MemoryStorageIO, makeSampleData } from './helpers/memoryStorageIO'

let SQL: SqlJsStatic
beforeAll(async () => {
  SQL = await initSqlJs()
})

const w = () => (globalThis as any).window as Record<string, any>
const sameJson = (a: unknown, b: unknown) => expect(JSON.stringify(a)).toBe(JSON.stringify(b))

function backendFor(io: MemoryStorageIO, backupIntervalMs?: number) {
  return new SqliteBackend(SQL, io, { readLegacySource: async () => null, backupIntervalMs })
}

describe('SqliteBackend.listBackups', () => {
  it('describes safety snapshots with reason, time and counts, and includes automatic copies', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io, 0) // interval 0: every save also rolls bak1
    await b.load()
    await b.save(makeSampleData())
    await b.createSafetySnapshot('delete-all')

    const list = await b.listBackups()
    const safety = list.find(i => i.file === SAFETY_FILES[0])!
    expect(safety).toMatchObject({ kind: 'safety', reason: 'delete-all', valid: true })
    expect(safety.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(safety.counts.borrowers).toBe(12)
    expect(safety.counts.loans).toBe(36)
    expect(safety.sizeBytes).toBeGreaterThan(0)

    const auto = list.find(i => i.file === BAK1_FILE)!
    expect(auto).toMatchObject({ kind: 'auto', reason: 'auto-bak1', valid: true })
    expect(auto.counts.loans).toBe(36)
  })

  it('marks a damaged file as invalid instead of failing the whole list', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    await b.save(makeSampleData())
    await b.createSafetySnapshot('import')
    io.files.set(SAFETY_FILES[0], new Uint8Array([1, 2, 3, 4]))

    const list = await b.listBackups()
    expect(list.find(i => i.file === SAFETY_FILES[0])?.valid).toBe(false)
  })

  it('returns an empty list when nothing exists', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    expect(await b.listBackups()).toEqual([])
  })
})

describe('SqliteBackend.restoreFromBackup', () => {
  async function wipedScenario() {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const original = makeSampleData()
    await b.save(original)
    await b.createSafetySnapshot('delete-all')
    const wiped = JSON.parse(JSON.stringify(original))
    wiped.borrowers = {}
    wiped.loans = {}
    wiped.repayments = {}
    await b.save(wiped)
    return { io, b, original, wiped }
  }

  it('brings the data back, and a fresh load reads the restored state', async () => {
    const { io, b, original } = await wipedScenario()
    await b.restoreFromBackup(SAFETY_FILES[0])

    const reloaded = await backendFor(io).load()
    sameJson(reloaded.data, original)
  })

  it('snapshots the CURRENT state first, so the restore can be undone', async () => {
    const { io, b, wiped } = await wipedScenario()
    await b.restoreFromBackup(SAFETY_FILES[0])

    const list = await b.listBackups()
    const before = list.find(i => i.reason === 'before-restore')!
    expect(before).toBeTruthy()
    expect(before.counts.borrowers).toBe(0)

    // restoring that copy returns to the wiped state
    await backendFor(io).load()
    const b2 = backendFor(io)
    await b2.load()
    await b2.restoreFromBackup(before.file)
    sameJson((await backendFor(io).load()).data, wiped)
  })

  it('works when the chosen copy is the one that rotation would push out (oldest slot)', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    for (let i = 1; i <= 5; i++) {
      data.settings.marker = String(i)
      await b.save(data)
      await b.createSafetySnapshot('manual')
    }
    // SAFETY_FILES[4] holds marker "1" and is dropped by the before-restore snapshot
    await b.restoreFromBackup(SAFETY_FILES[4])
    expect(((await backendFor(io).load()).data as any).settings.marker).toBe('1')
  })

  it('ignores saves after a restore (the stale in-memory data cannot overwrite the restored file)', async () => {
    const { io, b, original } = await wipedScenario()
    await b.restoreFromBackup(SAFETY_FILES[0])
    const writesAfterRestore = io.writes

    const stale = JSON.parse(JSON.stringify(original))
    stale.settings.marker = 'stale'
    await b.save(stale)
    expect(io.writes).toBe(writesAfterRestore)
    sameJson((await backendFor(io).load()).data, original)
  })

  it('rejects unknown file names and a damaged copy, leaving the main file untouched', async () => {
    const { io, b } = await wipedScenario()
    const mainBefore = Buffer.from(io.files.get(DB_FILE)!)

    await expect(b.restoreFromBackup(DB_FILE)).rejects.toThrow()
    await expect(b.restoreFromBackup('../outside.sqlite')).rejects.toThrow()
    await expect(b.restoreFromBackup(SAFETY_FILES[3])).rejects.toThrow() // does not exist

    io.files.set(SAFETY_FILES[0], new Uint8Array([9, 9, 9]))
    await expect(b.restoreFromBackup(SAFETY_FILES[0])).rejects.toThrow()

    expect(Buffer.from(io.files.get(DB_FILE)!).equals(mainBefore)).toBe(true)
  })
})

describe('persistence list/restore wrappers', () => {
  beforeEach(() => {
    __resetStorageForTests()
    __setSqlJsLoaderForTests(async () => SQL)
    localStorage.clear()
    delete w().__TAURI__
    delete w().__TAURI_INTERNALS__
  })
  afterEach(() => {
    __resetStorageForTests()
    __setStorageFactoryForTests(null)
    __setSqlJsLoaderForTests(null)
    delete w().__TAURI_INTERNALS__
    localStorage.clear()
  })

  it('outside SQLite mode: empty list and a clean failure on restore', async () => {
    expect(await listBackups()).toEqual([])
    const res = await restoreBackup(SAFETY_FILES[0])
    expect(res.ok).toBe(false)
  })

  it('in SQLite mode: lists and restores', async () => {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    const factory = async (): Promise<TauriStorage> => ({ io, dirName: 'AppLocalData', readLegacyJson: async () => null })
    __setStorageFactoryForTests(factory)
    await loadAppData()
    const original = makeSampleData()
    await saveAppData(original)

    const { createPreDestructiveBackup } = await import('../services/persistence')
    expect((await createPreDestructiveBackup('import')).ok).toBe(true)
    const list = await listBackups()
    expect(list[0]).toMatchObject({ file: SAFETY_FILES[0], reason: 'import' })

    const wiped = { ...JSON.parse(JSON.stringify(original)), borrowers: {}, loans: {}, repayments: {} }
    await saveAppData(wiped)
    expect((await restoreBackup(SAFETY_FILES[0])).ok).toBe(true)

    __resetStorageForTests()
    sameJson(await loadAppData(), original)
  })
})

describe('destructiveGuard.restoreBackupSafely', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../services/database')
    vi.doUnmock('../services/persistence')
  })

  it('stops when the previous save failed, and passes through otherwise', async () => {
    vi.resetModules()
    let flushFails = true
    const restore = vi.fn(async () => ({ ok: true }))
    vi.doMock('../services/database', () => ({
      flushPendingSave: async () => { if (flushFails) throw new Error('locked') },
      commitData: async () => {},
    }))
    vi.doMock('../services/persistence', () => ({
      createPreDestructiveBackup: async () => ({ ok: true }),
      getSaveFailure: () => null,
      restoreBackup: restore,
    }))
    const guard = await import('../services/destructiveGuard')

    const blocked = await guard.restoreBackupSafely('x')
    expect(blocked.ok).toBe(false)
    expect(restore).not.toHaveBeenCalled()

    flushFails = false
    expect(await guard.restoreBackupSafely('gemach.sqlite.safety1')).toEqual({ ok: true })
    expect(restore).toHaveBeenCalledWith('gemach.sqlite.safety1')
  })
})
