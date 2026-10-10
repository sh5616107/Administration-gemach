/**
 * @vitest-environment jsdom
 *
 * רגרסיה: לחיצה על כתובת מייל בכרטיס לווה קראה ל-openEmailWithDocument עם
 * נושא ותוכן ריקים. בספק gmail_oauth השליחה ישירה, ולכן יצאה הודעה ריקה
 * לנמען בלי שהמשתמש ראה או אישר אותה.
 * עכשיו: שליחה ישירה עוברת תמיד דרך חלון עריכה/אישור, והודעה ריקה לא נשלחת.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invokeMock = vi.fn()
vi.mock('jspdf', () => ({ default: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }))
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      getItem: vi.fn().mockResolvedValue('gemach@gmail.com'),
    }),
  },
}))

import { openEmailWithDocument, type EmailData } from '../services/documents'
import {
  isEmailContentEmpty,
  registerEmailComposeHandler,
  requestEmailCompose,
} from '../services/emailComposeBridge'

const blank = (): EmailData => ({
  to: 'borrower@example.com',
  subject: '',
  body: '',
  documentType: 'borrower_report',
})

describe('isEmailContentEmpty', () => {
  it('treats missing or whitespace-only subject and body as empty', () => {
    expect(isEmailContentEmpty({ subject: '', body: '' })).toBe(true)
    expect(isEmailContentEmpty({ subject: '  ', body: '\n ' })).toBe(true)
  })
  it('is not empty when either subject or body has text', () => {
    expect(isEmailContentEmpty({ subject: 'שלום', body: '' })).toBe(false)
    expect(isEmailContentEmpty({ subject: '', body: 'תוכן' })).toBe(false)
  })
})

describe('requestEmailCompose', () => {
  afterEach(() => registerEmailComposeHandler(null))

  it('passes the data to the registered handler and returns its result', async () => {
    registerEmailComposeHandler(async (d) => ({ ...d, subject: 'ערוך' }))
    const out = await requestEmailCompose(blank())
    expect(out?.subject).toBe('ערוך')
  })
  it('returns null when the handler cancels', async () => {
    registerEmailComposeHandler(async () => null)
    expect(await requestEmailCompose(blank())).toBeNull()
  })
})

describe('openEmailWithDocument with gmail_oauth', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
  })
  afterEach(() => {
    registerEmailComposeHandler(null)
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('never sends when the user cancels the compose dialog', async () => {
    registerEmailComposeHandler(async () => null)
    const result = await openEmailWithDocument(blank(), 'gmail_oauth')
    expect(result.success).toBe(false)
    expect(result.cancelled).toBe(true)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('never sends an empty message even if the dialog returns it unchanged', async () => {
    registerEmailComposeHandler(async (d) => d)
    const result = await openEmailWithDocument(blank(), 'gmail_oauth')
    expect(result.success).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('sends exactly what the user wrote in the dialog', async () => {
    registerEmailComposeHandler(async (d) => ({ ...d, subject: 'תזכורת', body: 'שלום, תזכורת לפירעון' }))
    const result = await openEmailWithDocument(blank(), 'gmail_oauth')
    expect(result.success).toBe(true)
    expect(invokeMock).toHaveBeenCalledTimes(1)
    const [command, args] = invokeMock.mock.calls[0] as [string, { request: Record<string, unknown> }]
    expect(command).toBe('send_gmail_oauth_email')
    expect(args.request.subject).toBe('תזכורת')
    expect(args.request.body).toBe('שלום, תזכורת לפירעון')
    expect(args.request.to).toBe('borrower@example.com')
  })

  it('rejects an invalid recipient edited in the dialog', async () => {
    registerEmailComposeHandler(async (d) => ({ ...d, to: 'not-an-email', subject: 'x', body: 'y' }))
    const result = await openEmailWithDocument(blank(), 'gmail_oauth')
    expect(result.success).toBe(false)
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
