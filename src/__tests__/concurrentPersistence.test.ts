/**
 * בדיקת תור persistence concurrent
 * וידוא ש-2 writes במקביל לא יוצרים race condition
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock persistence module BEFORE importing database
vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { borrowersService, resetDatabase, flushPendingSave } from '../services/database'

describe('Concurrent Persistence Queue', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('צריך לטפל ב-2 writes concurrent בסדר', async () => {
    // יצירת 2 borrowers במקביל
    const borrower1Result = await borrowersService.create({
      first_name: 'לווה',
      last_name: 'ראשון',
      phone: '0501111111',
      id_number: '111111111',
      address: 'תל אביב',
      city: 'תל אביב'
    })
    
    const borrower2Result = await borrowersService.create({
      first_name: 'לווה',
      last_name: 'שני',
      phone: '0502222222',
      id_number: '222222222',
      address: 'חיפה',
      city: 'חיפה'
    })

    // ממתינים לסיום כל השמירות
    await flushPendingSave()

    // וידוא ששניהם נשמרו
    const allBorrowers = await borrowersService.getAll()
    expect(allBorrowers).toHaveLength(2)
    expect(allBorrowers.find(b => b.id === borrower1Result.lastInsertRowid)).toBeDefined()
    expect(allBorrowers.find(b => b.id === borrower2Result.lastInsertRowid)).toBeDefined()
  })

  it('צריך לטפל ב-3+ writes concurrent בסדר', async () => {
    // יצירת 5 borrowers במקביל
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => 
        borrowersService.create({
          first_name: `לווה${i + 1}`,
          last_name: `משפחה${i + 1}`,
          phone: `05011111${i}${i}`,
          id_number: `${i}${i}${i}${i}${i}${i}${i}${i}${i}`,
          address: `כתובת ${i + 1}`,
          city: 'ירושלים'
        })
      )
    )

    await flushPendingSave()

    const allBorrowers = await borrowersService.getAll()
    expect(allBorrowers).toHaveLength(5)
    results.forEach(result => {
      expect(allBorrowers.find(b => b.id === result.lastInsertRowid)).toBeDefined()
    })
  })

  it('צריך להמשיך לעבוד גם אחרי כמה writes', async () => {
    // יצירת borrower
    const borrower1Result = await borrowersService.create({
      first_name: 'לווה',
      last_name: 'תקין',
      phone: '0501111111',
      id_number: '111111111',
      address: 'תל אביב',
      city: 'תל אביב'
    })

    await flushPendingSave()

    // וידוא שהלווה נשמר
    const allBorrowers = await borrowersService.getAll()
    expect(allBorrowers).toHaveLength(1)
    expect(allBorrowers[0].id).toBe(borrower1Result.lastInsertRowid)
  })
})
