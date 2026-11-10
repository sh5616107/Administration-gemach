// @vitest-environment jsdom
/**
 * SafetyBackupsCard: list rendering, confirm-then-restore, failure display.
 * Runs under jsdom (the project's default test environment is node). Test names are English on purpose.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  listBackups: vi.fn(),
  restoreBackupSafely: vi.fn(),
}))
vi.mock('../services/persistence', () => ({ listBackups: mocks.listBackups }))
vi.mock('../services/destructiveGuard', () => ({ restoreBackupSafely: mocks.restoreBackupSafely }))

import SafetyBackupsCard from '../components/SafetyBackupsCard'

const items = [
  { file: 'gemach.sqlite.safety1', kind: 'safety', reason: 'delete-all', createdAt: '2026-11-09T10:00:00.000Z', sizeBytes: 360000, counts: { borrowers: 14, loans: 89 }, valid: true },
  { file: 'gemach.sqlite.safety2', kind: 'safety', reason: 'import', createdAt: '2026-11-08T10:00:00.000Z', sizeBytes: 100, counts: {}, valid: false },
]

function mountCard(list: unknown[] = items) {
  mocks.listBackups.mockResolvedValue(list)
  const onRestored = vi.fn()
  render(createElement(SafetyBackupsCard, { onRestored }))
  return { onRestored }
}

beforeEach(() => {
  // src/__tests__/setup.ts replaces window with a small stub; react-dom needs the real jsdom window
  ;(globalThis as any).window = globalThis
  mocks.listBackups.mockReset()
  mocks.restoreBackupSafely.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SafetyBackupsCard', () => {
  it('shows the items; the damaged one cannot be restored', async () => {
    mountCard()
    const good = await screen.findByTestId('restore-gemach.sqlite.safety1')
    expect((good as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTestId('restore-gemach.sqlite.safety2') as HTMLButtonElement).disabled).toBe(true)
  })

  it('restore needs confirmation, then restores and triggers the reload callback', async () => {
    mocks.restoreBackupSafely.mockResolvedValue({ ok: true })
    const { onRestored } = mountCard()

    fireEvent.click(await screen.findByTestId('restore-gemach.sqlite.safety1'))
    expect(mocks.restoreBackupSafely).not.toHaveBeenCalled()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    fireEvent.click(await screen.findByTestId('confirm-restore'))
    await waitFor(() => expect(mocks.restoreBackupSafely).toHaveBeenCalledWith('gemach.sqlite.safety1'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(onRestored).toHaveBeenCalledTimes(1)
  })

  it('on failure: shows the error and does not reload', async () => {
    mocks.restoreBackupSafely.mockResolvedValue({ ok: false, error: 'boom' })
    const { onRestored } = mountCard()

    fireEvent.click(await screen.findByTestId('restore-gemach.sqlite.safety1'))
    fireEvent.click(await screen.findByTestId('confirm-restore'))
    await screen.findByText(/boom/)
    expect(onRestored).not.toHaveBeenCalled()
  })

  it('empty list renders without restore buttons', async () => {
    mountCard([])
    await waitFor(() => expect(screen.queryByTestId('backups-refresh')).not.toBeNull())
    expect(screen.queryAllByTestId(/^restore-/)).toHaveLength(0)
  })
})
