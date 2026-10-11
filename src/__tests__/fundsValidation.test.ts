import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, fundsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('fundsService - חסימות ווולידציות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('לא ניתן להשבית קופת ברירת מחדל יחידה', async () => {
    const fundId = (await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })).id
    
    await expect(
      fundsService.update(fundId, { is_active: false })
    ).rejects.toThrow('לא ניתן להשבית')
  })

  it('לא ניתן להסיר is_default מקופת ברירת מחדל יחידה', async () => {
    const fundId = (await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })).id
    
    await expect(
      fundsService.update(fundId, { is_default: false })
    ).rejects.toThrow('לא ניתן להסיר')
  })

  it('ניתן להשבית קופת ברירת מחדל אם יש קופה אחרת פעילה', async () => {
    const fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })
    
    // עכשיו אפשר להשבית
    await expect(
      fundsService.update(fund1Id, { is_active: false })
    ).resolves.not.toThrow()
  })

  it('ניתן להסיר is_default אם יש קופת ברירת מחדל אחרת', async () => {
    const fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    const fund2Id = (await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })).id
    
    // הפוך את קופה 2 לברירת מחדל
    await fundsService.update(fund2Id, { is_default: true })
    
    // עכשיו אפשר להסיר is_default מקופה 1
    await expect(
      fundsService.update(fund1Id, { is_default: false })
    ).resolves.not.toThrow()
  })
})
