/**
 * בדיקת באג: לווה חדש עם שם דומה יורש הלוואות של לווה שנמחק
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Mock localStorage
const mockStorage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value },
  removeItem: (key: string) => { delete mockStorage[key] },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) }
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

// Simple mock of the database logic with counter fix
interface DataStore {
  borrowers: Record<string, any>
  loans: Record<string, any>
  settings: Record<string, string>
}

let data: DataStore = { borrowers: {}, loans: {}, settings: {} }

function generateId(storeName: 'borrowers' | 'loans'): number {
  // שומרים counter נפרד לכל store כדי שלא יהיה שימוש חוזר ב-ID
  const counterKey = `_counter_${storeName}`
  const currentCounter = parseInt(data.settings[counterKey] || '0', 10)
  const items = Object.values(data[storeName]) as { id: number }[]
  const maxExistingId = items.reduce((max, item) => Math.max(max, item.id || 0), 0)
  const newId = Math.max(currentCounter, maxExistingId) + 1
  data.settings[counterKey] = String(newId)
  return newId
}

const borrowersService = {
  create: (b: { first_name: string; last_name: string; phone: string }) => {
    const id = generateId('borrowers')
    data.borrowers[String(id)] = { ...b, id, created_at: new Date().toISOString() }
    return { lastInsertRowid: id }
  },
  delete: (id: number) => {
    delete data.borrowers[String(id)]
  },
  getAll: () => Object.values(data.borrowers),
  getById: (id: number) => data.borrowers[String(id)] || null
}

const loansService = {
  create: (l: { borrower_id: number; amount: number }) => {
    const id = generateId('loans')
    data.loans[String(id)] = { ...l, id, status: 'paid', created_at: new Date().toISOString() }
    return { lastInsertRowid: id }
  },
  getByBorrower: (borrowerId: number) => {
    return Object.values(data.loans).filter((l: any) => l.borrower_id === borrowerId)
  },
  getAll: () => Object.values(data.loans)
}

describe('באג: לווה חדש יורש הלוואות של לווה שנמחק', () => {
  beforeEach(() => {
    data = { borrowers: {}, loans: {}, settings: {} }
  })

  it('לווה חדש עם שם זהה לא צריך לקבל הלוואות של לווה שנמחק', () => {
    // 1. יצירת לווה ראשון
    const result1 = borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      phone: '050-1111111'
    })
    const borrower1Id = result1.lastInsertRowid
    console.log('לווה 1 נוצר עם ID:', borrower1Id)

    // 2. יצירת הלוואה ללווה
    loansService.create({ borrower_id: borrower1Id, amount: 1000 })
    console.log('הלוואה נוצרה ללווה 1')

    // 3. בדיקה שיש הלוואה ללווה
    const loans1 = loansService.getByBorrower(borrower1Id)
    expect(loans1.length).toBe(1)
    console.log('לווה 1 יש לו', loans1.length, 'הלוואות')

    // 4. מחיקת הלווה
    borrowersService.delete(borrower1Id)
    console.log('לווה 1 נמחק')

    // 5. יצירת לווה חדש עם אותו שם אבל טלפון שונה
    const result2 = borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      phone: '050-2222222'
    })
    const borrower2Id = result2.lastInsertRowid
    console.log('לווה 2 נוצר עם ID:', borrower2Id)

    // 6. בדיקה - האם הלווה החדש קיבל את ההלוואות הישנות?
    const loans2 = loansService.getByBorrower(borrower2Id)
    console.log('לווה 2 יש לו', loans2.length, 'הלוואות')
    console.log('IDs: לווה1=' + borrower1Id + ', לווה2=' + borrower2Id)

    // הבדיקה: לווה חדש לא צריך לקבל הלוואות של לווה אחר
    if (borrower1Id === borrower2Id) {
      console.log('⚠️ באג! הלווה החדש קיבל את אותו ID כמו הלווה שנמחק')
    }
    
    expect(loans2.length).toBe(0) // לווה חדש לא צריך הלוואות
  })

  it('לווה חדש עם שם שונה לא צריך לקבל הלוואות של לווה שנמחק', () => {
    // 1. יצירת לווה ראשון
    const result1 = borrowersService.create({
      first_name: 'ישראל',
      last_name: 'ישראלי',
      phone: '050-1111111'
    })
    const borrower1Id = result1.lastInsertRowid

    // 2. יצירת הלוואה ללווה
    loansService.create({ borrower_id: borrower1Id, amount: 1000 })

    // 3. מחיקת הלווה
    borrowersService.delete(borrower1Id)

    // 4. יצירת לווה חדש עם שם שונה
    const result2 = borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-3333333'
    })
    const borrower2Id = result2.lastInsertRowid
    console.log('משה כהן נוצר עם ID:', borrower2Id)

    // 5. בדיקה
    const loans2 = loansService.getByBorrower(borrower2Id)
    console.log('משה כהן יש לו', loans2.length, 'הלוואות')
    console.log('IDs: ישראל=' + borrower1Id + ', משה=' + borrower2Id)

    expect(loans2.length).toBe(0)
  })
})
