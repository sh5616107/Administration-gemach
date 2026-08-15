import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    }
  }
})()

globalThis.localStorage = localStorageMock as Storage

// Mock window object with document
globalThis.window = {
  localStorage: localStorageMock,
  document: {
    createElement: vi.fn(() => ({}))
  }
} as any

// Mock document for html2canvas
if (!globalThis.document) {
  globalThis.document = {
    createElement: vi.fn(() => ({}))
  } as any
}

// Cleanup after each test
afterEach(() => {
  cleanup()
  localStorage.clear()
})
