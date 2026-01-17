import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findMatchingBorrower,
  findMatchingGuarantor,
  checkGuarantorForLoan,
  checkBorrowerForLoan,
  checkNewGuarantor,
  checkNewBorrower,
} from '../services/crossCheck'

// Mock the database services
vi.mock('../services/database', () => ({
  borrowersService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  guarantorsService: {
    getAll: vi.fn(),
    getById: vi.fn(),
  },
  loansService: {
    getAll: vi.fn(),
  },
}))

import { borrowersService, guarantorsService, loansService } from '../services/database'

describe('crossCheck service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findMatchingBorrower', () => {
    it('should find borrower by phone number', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '123456789' },
        { id: 2, first_name: 'משה', last_name: 'כהן', phone: '052-9876543', id_number: '987654321' },
      ] as any)

      const result = await findMatchingBorrower('0501234567')
      
      expect(result).not.toBeNull()
      expect(result?.id).toBe(1)
      expect(result?.name).toBe('ישראל ישראלי')
    })

    it('should find borrower by ID number', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '123456789' },
      ] as any)

      const result = await findMatchingBorrower('999', '123456789')
      
      expect(result).not.toBeNull()
      expect(result?.id).toBe(1)
    })

    it('should return null when no match found', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '123456789' },
      ] as any)

      const result = await findMatchingBorrower('053-0000000')
      
      expect(result).toBeNull()
    })

    it('should normalize phone numbers (remove dashes)', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-123-4567', id_number: '' },
      ] as any)

      const result = await findMatchingBorrower('0501234567')
      
      expect(result).not.toBeNull()
      expect(result?.id).toBe(1)
    })
  })

  describe('findMatchingGuarantor', () => {
    it('should find guarantor by phone number', async () => {
      vi.mocked(guarantorsService.getAll).mockResolvedValue([
        { id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '555555555' },
      ] as any)

      const result = await findMatchingGuarantor('054-5555555')
      
      expect(result).not.toBeNull()
      expect(result?.id).toBe(10)
      expect(result?.type).toBe('guarantor')
    })

    it('should find guarantor by ID number', async () => {
      vi.mocked(guarantorsService.getAll).mockResolvedValue([
        { id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '555555555' },
      ] as any)

      const result = await findMatchingGuarantor('000', '555555555')
      
      expect(result).not.toBeNull()
      expect(result?.id).toBe(10)
    })
  })

  describe('checkGuarantorForLoan', () => {
    it('should warn if guarantor has active debt as borrower', async () => {
      vi.mocked(guarantorsService.getById).mockResolvedValue({
        id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '555555555'
      } as any)
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '555555555' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([
        { id: 100, borrower_id: 1, status: 'active', remaining: 5000 },
      ] as any)

      const warnings = await checkGuarantorForLoan(10)
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].type).toBe('warning')
      expect(warnings[0].message).toContain('הלוואה פעילה')
    })

    it('should warn if guarantor already guarantees 3+ loans', async () => {
      vi.mocked(guarantorsService.getById).mockResolvedValue({
        id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: ''
      } as any)
      vi.mocked(borrowersService.getAll).mockResolvedValue([] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([
        { id: 100, borrower_id: 1, status: 'active', guarantor1_id: 10 },
        { id: 101, borrower_id: 2, status: 'active', guarantor1_id: 10 },
        { id: 102, borrower_id: 3, status: 'active', guarantor2_id: 10 },
      ] as any)

      const warnings = await checkGuarantorForLoan(10)
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings.some(w => w.message.includes('3 הלוואות'))).toBe(true)
    })

    it('should return empty array if no issues', async () => {
      vi.mocked(guarantorsService.getById).mockResolvedValue({
        id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: ''
      } as any)
      vi.mocked(borrowersService.getAll).mockResolvedValue([] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([] as any)

      const warnings = await checkGuarantorForLoan(10)
      
      expect(warnings).toEqual([])
    })
  })

  describe('checkBorrowerForLoan', () => {
    it('should warn if borrower is guarantor for other loans', async () => {
      vi.mocked(borrowersService.getById).mockResolvedValue({
        id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '123456789'
      } as any)
      vi.mocked(guarantorsService.getAll).mockResolvedValue([
        { id: 10, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '123456789' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([
        { id: 100, borrower_id: 99, status: 'active', guarantor1_id: 10 },
      ] as any)

      const warnings = await checkBorrowerForLoan(1)
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].message).toContain('ערב')
    })

    it('should return empty array if borrower is not a guarantor', async () => {
      vi.mocked(borrowersService.getById).mockResolvedValue({
        id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: ''
      } as any)
      vi.mocked(guarantorsService.getAll).mockResolvedValue([] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([] as any)

      const warnings = await checkBorrowerForLoan(1)
      
      expect(warnings).toEqual([])
    })
  })

  describe('checkNewGuarantor', () => {
    it('should warn if person exists as borrower with debt', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([
        { id: 100, borrower_id: 1, status: 'active', remaining: 10000 },
      ] as any)

      const warnings = await checkNewGuarantor('050-1234567')
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].message).toContain('לווה')
      expect(warnings[0].message).toContain('חוב')
    })

    it('should warn (softer) if person exists as borrower without debt', async () => {
      vi.mocked(borrowersService.getAll).mockResolvedValue([
        { id: 1, first_name: 'ישראל', last_name: 'ישראלי', phone: '050-1234567', id_number: '' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([] as any)

      const warnings = await checkNewGuarantor('050-1234567')
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].message).toContain('ללא חוב פעיל')
    })
  })

  describe('checkNewBorrower', () => {
    it('should warn if person exists as guarantor with active guarantees', async () => {
      vi.mocked(guarantorsService.getAll).mockResolvedValue([
        { id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([
        { id: 100, borrower_id: 99, status: 'active', guarantor1_id: 10 },
      ] as any)

      const warnings = await checkNewBorrower('054-5555555')
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].message).toContain('ערב')
    })

    it('should warn (softer) if person exists as guarantor without active guarantees', async () => {
      vi.mocked(guarantorsService.getAll).mockResolvedValue([
        { id: 10, first_name: 'דוד', last_name: 'לוי', phone: '054-5555555', id_number: '' },
      ] as any)
      vi.mocked(loansService.getAll).mockResolvedValue([] as any)

      const warnings = await checkNewBorrower('054-5555555')
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].message).toBe('קיים ערב עם פרטים זהים')
    })
  })
})
