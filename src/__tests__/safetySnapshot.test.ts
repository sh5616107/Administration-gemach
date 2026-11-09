/**
 * Safety snapshots before destructive actions (sqliteBackend, persistence, destructiveGuard).
 * Test names are English on purpose so the patch contains no raw Hebrew.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs, { type SqlJsStatic } from 'sql.js'
import {
  DB_FILE,
  SAFETY_FILES,
  RECOVERY_FILES,
  SqliteBackend,
} from '../services/storage/sqliteBackend'
import {
  __resetStorageForTests,
  __setStorageFactoryForTests,
  createPreDestructiveBackup,
  loadAppData,
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

function backendFor(io: MemoryStorageIO) {
  return new SqliteBackend(SQL, io, { readLegacySource: async () => null })
}

/** Opens the bytes of a safety file as if it were the main database and returns its data. */
async function dataOfFile(io: MemoryStorageIO, name: string): Promise<any> {
  const copy = new MemoryStorageIO()
  copy.files.set(DB_FILE, new Uint8Array(io.files.get(name)!))
  return (await backendFor(copy).load()).data
}

describe('SqliteBackend.createSafetySnapshot', () => {
  it('writes a valid copy of the current state to safety1', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)

    await b.createSafetySnapshot()

    expect(io.files.has(SAFETY_FILES[0])).toBe(true)
    expect(JSON.stringify(await dataOfFile(io, SAFETY_FILES[0]))).toBe(JSON.stringify(data))
  })

  it('keeps the pre-delete state even after the data is wiped and saved', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    await b.save(data)
    await b.createSafetySnapshot()

    data.loans = {}
    data.borrowers = {}
    await b.save(data)

    const snapshot = await dataOfFile(io, SAFETY_FILES[0])
    expect(Object.keys(snapshot.borrowers).length).toBe(12)
    expect(Object.keys(snapshot.loans).length).toBe(36)
  })

  it('rotates 5 slots, newest first, and drops the oldest', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    const data = makeSampleData()
    for (let i = 1; i <= 6; i++) {
      data.settings.marker = String(i)
      await b.save(data)
      await b.createSafetySnapshot()
    }
    const markers: string[] = []
    for (const name of SAFETY_FILES) markers.push((await dataOfFile(io, name)).settings.marker)
    expect(markers).toEqual(['6', '5', '4', '3', '2'])
    expect(io.names().filter(n => n.includes('.safety'))).toHaveLength(5)
  })

  it('throws when the write fails, so the caller can abort', async () => {
    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    await b.save(makeSampleData())
    io.failWrites = 1
    await expect(b.createSafetySnapshot()).rejects.toThrow('disk full')
  })

  it('throws before load (no database in memory)', async () => {
    const b = backendFor(new MemoryStorageIO())
    await expect(b.createSafetySnapshot()).rejects.toThrow()
  })

  it('is not an auto-recovery source', async () => {
    expect((RECOVERY_FILES as readonly string[]).some(f => (SAFETY_FILES as readonly string[]).includes(f))).toBe(false)

    const io = new MemoryStorageIO()
    const b = backendFor(io)
    await b.load()
    await b.save(makeSampleData())
    await b.createSafetySnapshot()

    // main file disappears; only the safety slot remains -> must NOT be used for recovery
    io.files.delete(DB_FILE)
    const outcome = await backendFor(io).load()
    expect(outcome.origin).toBe('new')
    expect(outcome.data).toBeNull()
  })
})

describe('persistence.createPreDestructiveBackup', () => {
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

  it('outside SQLite mode it is skipped (ok)', async () => {
    expect(await createPreDestructiveBackup()).toEqual({ ok: true, skipped: true })
  })

  it('in SQLite mode it creates safety1', async () => {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    const factory = async (): Promise<TauriStorage> => ({ io, dirName: 'AppLocalData', readLegacyJson: async () => null })
    __setStorageFactoryForTests(factory)
    await loadAppData()
    await saveAppData(makeSampleData())

    expect(await createPreDestructiveBackup()).toEqual({ ok: true })
    expect(io.files.has(SAFETY_FILES[0])).toBe(true)
  })

  it('returns ok:false (does not throw) when the snapshot cannot be written', async () => {
    w().__TAURI_INTERNALS__ = {}
    const io = new MemoryStorageIO()
    const factory = async (): Promise<TauriStorage> => ({ io, dirName: 'AppLocalData', readLegacyJson: async () => null })
    __setStorageFactoryForTests(factory)
    await loadAppData()
    await saveAppData(makeSampleData())

    io.failWrites = 1
    const result = await createPreDestructiveBackup()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('disk full')
  })
})

describe('destructiveGuard', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../services/database')
    vi.doUnmock('../services/persistence')
  })

  it('ensureSafetyBackup aborts (ok:false) when the previous save failed', async () => {
    vi.resetModules()
    vi.doMock('../services/database', () => ({
      flushPendingSave: async () => { throw new Error('locked') },
      commitData: async () => {},
    }))
    vi.doMock('../services/persistence', () => ({
      createPreDestructiveBackup: async () => ({ ok: true }),
      getSaveFailure: () => null,
    }))
    const guard = await import('../services/destructiveGuard')
    const result = await guard.ensureSafetyBackup()
    expect(result.ok).toBe(false)
    expect(result.error).toContain('locked')
  })

  it('ensureSafetyBackup passes through the snapshot result', async () => {
    vi.resetModules()
    vi.doMock('../services/database', () => ({ flushPendingSave: async () => {}, commitData: async () => {} }))
    vi.doMock('../services/persistence', () => ({
      createPreDestructiveBackup: async () => ({ ok: false, error: 'boom' }),
      getSaveFailure: () => null,
    }))
    const guard = await import('../services/destructiveGuard')
    expect(await guard.ensureSafetyBackup()).toEqual({ ok: false, error: 'boom' })
  })

  it('confirmSavedToDisk returns null when saved, a message when commit fails or a failure is active', async () => {
    vi.resetModules()
    let commitFails = false
    let activeFailure: unknown = null
    vi.doMock('../services/database', () => ({
      flushPendingSave: async () => {},
      commitData: async () => { if (commitFails) throw new Error('x') },
    }))
    vi.doMock('../services/persistence', () => ({
      createPreDestructiveBackup: async () => ({ ok: true }),
      getSaveFailure: () => activeFailure,
    }))
    const guard = await import('../services/destructiveGuard')

    expect(await guard.confirmSavedToDisk()).toBeNull()
    commitFails = true
    expect(await guard.confirmSavedToDisk()).toBe(guard.SAVE_FAILED_MESSAGE)
    commitFails = false
    activeFailure = { message: 'still failing', since: 0, attempts: 1 }
    expect(await guard.confirmSavedToDisk()).toBe(guard.SAVE_FAILED_MESSAGE)
  })
})
