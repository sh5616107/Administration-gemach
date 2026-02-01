/**
 * טסט לבדיקת מניעת ערבות עצמית
 * בודק שלא ניתן לרשום אדם כערב להלוואה שלו עצמו
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkGuarantorForLoan } from '../services/crossCheck'
import { borrowersService, guarantorsService } from '../services/database'

// Mock the database services
vi.mock('../services/database', () => ({
  borrowersService: {
    getById: vi.fn(),
    getAll: vi.fn(),
  },
  guarantorsService: {
    getById: vi.fn(),
    getAll: vi.fn(),
  },
  loansService: {
    getAll: vi.fn(),
  },
}))

describe('Self-Guarantor Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should prevent borrower from being guarantor for their own loan - same phone', async () => {
    // משה כהן רשום גם כלווה וגם כערב עם אותו טלפון
    const borrower = {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-1234567',
      id_number: '123456789'
    }

    const guarantor = {
      id: 10,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-1234567',
      id_number: '123456789'
    }

    vi.mocked(borrowersService.getById).mockResolvedValue(borrower as any)
    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)

    // בדיקה עם borrowerId
    const results = await checkGuarantorForLoan(10, 1)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('error')
    expect(results[0].message).toContain('לא ניתן לבחור את הלווה כערב להלוואה שלו עצמו')
  })

  it('should prevent borrower from being guarantor for their own loan - same ID number', async () => {
    // משה כהן רשום עם אותה ת.ז. אבל טלפונים שונים
    const borrower = {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-1111111',
      id_number: '123456789'
    }

    const guarantor = {
      id: 10,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-2222222',
      id_number: '123456789'
    }

    vi.mocked(borrowersService.getById).mockResolvedValue(borrower as any)
    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)

    const results = await checkGuarantorForLoan(10, 1)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('error')
    expect(results[0].message).toContain('לא ניתן לבחור את הלווה כערב להלוואה שלו עצמו')
  })

  it('should allow different people with different phone and ID', async () => {
    // שני אנשים שונים לגמרי
    const borrower = {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-1111111',
      id_number: '111111111'
    }

    const guarantor = {
      id: 10,
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '050-2222222',
      id_number: '222222222'
    }

    vi.mocked(borrowersService.getById).mockResolvedValue(borrower as any)
    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)
    vi.mocked(borrowersService.getAll).mockResolvedValue([])
    vi.mocked(guarantorsService.getAll).mockResolvedValue([])
    
    // Mock loansService for getGuarantorActiveCount
    const { loansService } = await import('../services/database')
    vi.mocked(loansService.getAll).mockResolvedValue([])

    const results = await checkGuarantorForLoan(10, 1)

    // לא צריכה להיות שגיאה חוסמת
    const hasError = results.some(r => r.type === 'error')
    expect(hasError).toBe(false)
  })

  it('should work without borrowerId parameter (backward compatibility)', async () => {
    const guarantor = {
      id: 10,
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '050-2222222',
      id_number: '222222222'
    }

    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)
    vi.mocked(borrowersService.getAll).mockResolvedValue([])
    vi.mocked(guarantorsService.getAll).mockResolvedValue([])
    
    // Mock loansService for getGuarantorActiveCount
    const { loansService } = await import('../services/database')
    vi.mocked(loansService.getAll).mockResolvedValue([])

    // קריאה ללא borrowerId - לא צריכה לזרוק שגיאה
    const results = await checkGuarantorForLoan(10)

    // לא צריכה להיות שגיאה חוסמת
    const hasError = results.some(r => r.type === 'error')
    expect(hasError).toBe(false)
  })

  it('should normalize phone numbers correctly', async () => {
    // טלפונים עם פורמטים שונים אבל אותם ספרות
    const borrower = {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-123-4567',
      id_number: '123456789'
    }

    const guarantor = {
      id: 10,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567',
      id_number: '123456789'
    }

    vi.mocked(borrowersService.getById).mockResolvedValue(borrower as any)
    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)

    const results = await checkGuarantorForLoan(10, 1)

    expect(results).toHaveLength(1)
    expect(results[0].type).toBe('error')
  })

  it('should handle missing phone or ID gracefully', async () => {
    // לווה בלי ת.ז., ערב בלי טלפון - לא אותו אדם
    const borrower = {
      id: 1,
      first_name: 'משה',
      last_name: 'כהן',
      phone: '050-1234567',
      id_number: undefined
    }

    const guarantor = {
      id: 10,
      first_name: 'דוד',
      last_name: 'לוי',
      phone: undefined,
      id_number: '222222222'
    }

    vi.mocked(borrowersService.getById).mockResolvedValue(borrower as any)
    vi.mocked(guarantorsService.getById).mockResolvedValue(guarantor as any)
    vi.mocked(borrowersService.getAll).mockResolvedValue([])
    vi.mocked(guarantorsService.getAll).mockResolvedValue([])
    
    // Mock loansService for getGuarantorActiveCount
    const { loansService } = await import('../services/database')
    vi.mocked(loansService.getAll).mockResolvedValue([])

    const results = await checkGuarantorForLoan(10, 1)

    // לא צריכה להיות שגיאה חוסמת
    const hasError = results.some(r => r.type === 'error')
    expect(hasError).toBe(false)
  })
})
