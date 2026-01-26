import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * בדיקות רשימה שחורה
 * 
 * בדיקות אלו מוודאות שהמערכת מונעת יצירת הלוואות ללווים ברשימה שחורה
 */

// Mock data
let mockBlacklist: Array<{ id: number; entity_type: 'borrower' | 'guarantor'; entity_id: number; reason: string; added_at: string }> = []
let mockBorrowers: Array<{ id: number; first_name: string; last_name: string }> = []
let mockLoans: Array<{ id: number; borrower_id: number; amount: number; status: string }> = []

// Simulated blacklist service
const blacklistService = {
  getAll: () => Promise.resolve([...mockBlacklist]),
  
  isBlacklisted: async (entityType: 'borrower' | 'guarantor', entityId: number) => {
    const item = mockBlacklist.find(b => b.entity_type === entityType && b.entity_id === entityId)
    return item || null
  },
  
  getBlacklistedBorrowerIds: async () => {
    return mockBlacklist.filter(b => b.entity_type === 'borrower').map(b => b.entity_id)
  },
  
  getBlacklistedGuarantorIds: async () => {
    return mockBlacklist.filter(b => b.entity_type === 'guarantor').map(b => b.entity_id)
  },
  
  addToBlacklist: async (entityType: 'borrower' | 'guarantor', entityId: number, reason: string) => {
    const id = mockBlacklist.length + 1
    mockBlacklist.push({
      id,
      entity_type: entityType,
      entity_id: entityId,
      reason,
      added_at: new Date().toISOString()
    })
    return { id }
  },
  
  removeFromBlacklist: async (id: number) => {
    mockBlacklist = mockBlacklist.filter(b => b.id !== id)
  }
}

// Simulated loan creation with blacklist validation
const createLoanWithValidation = async (borrowerId: number, amount: number) => {
  // Check if borrower is blacklisted
  const blacklistedIds = await blacklistService.getBlacklistedBorrowerIds()
  if (blacklistedIds.includes(borrowerId)) {
    throw new Error('לא ניתן ליצור הלוואה ללווה שנמצא ברשימה השחורה')
  }
  
  // Create loan
  const id = mockLoans.length + 1
  mockLoans.push({ id, borrower_id: borrowerId, amount, status: 'active' })
  return { id }
}

describe('Blacklist Service', () => {
  beforeEach(() => {
    // Reset mock data
    mockBlacklist = []
    mockBorrowers = [
      { id: 1, first_name: 'ישראל', last_name: 'ישראלי' },
      { id: 2, first_name: 'משה', last_name: 'כהן' },
      { id: 3, first_name: 'דוד', last_name: 'לוי' },
    ]
    mockLoans = []
  })

  describe('isBlacklisted', () => {
    it('should return null for non-blacklisted borrower', async () => {
      const result = await blacklistService.isBlacklisted('borrower', 1)
      expect(result).toBeNull()
    })

    it('should return blacklist item for blacklisted borrower', async () => {
      await blacklistService.addToBlacklist('borrower', 1, 'חוב לא שולם')
      
      const result = await blacklistService.isBlacklisted('borrower', 1)
      expect(result).not.toBeNull()
      expect(result?.entity_id).toBe(1)
      expect(result?.reason).toBe('חוב לא שולם')
    })

    it('should distinguish between borrowers and guarantors', async () => {
      await blacklistService.addToBlacklist('guarantor', 1, 'ערב לא אמין')
      
      // Same ID but different type
      const borrowerResult = await blacklistService.isBlacklisted('borrower', 1)
      const guarantorResult = await blacklistService.isBlacklisted('guarantor', 1)
      
      expect(borrowerResult).toBeNull()
      expect(guarantorResult).not.toBeNull()
    })
  })

  describe('getBlacklistedBorrowerIds', () => {
    it('should return empty array when no borrowers blacklisted', async () => {
      const ids = await blacklistService.getBlacklistedBorrowerIds()
      expect(ids).toEqual([])
    })

    it('should return only borrower IDs, not guarantor IDs', async () => {
      await blacklistService.addToBlacklist('borrower', 1, 'סיבה 1')
      await blacklistService.addToBlacklist('borrower', 3, 'סיבה 2')
      await blacklistService.addToBlacklist('guarantor', 2, 'ערב')
      
      const ids = await blacklistService.getBlacklistedBorrowerIds()
      expect(ids).toContain(1)
      expect(ids).toContain(3)
      expect(ids).not.toContain(2)
      expect(ids.length).toBe(2)
    })
  })

  describe('getBlacklistedGuarantorIds', () => {
    it('should return only guarantor IDs', async () => {
      await blacklistService.addToBlacklist('borrower', 1, 'לווה')
      await blacklistService.addToBlacklist('guarantor', 2, 'ערב 1')
      await blacklistService.addToBlacklist('guarantor', 3, 'ערב 2')
      
      const ids = await blacklistService.getBlacklistedGuarantorIds()
      expect(ids).not.toContain(1)
      expect(ids).toContain(2)
      expect(ids).toContain(3)
      expect(ids.length).toBe(2)
    })
  })

  describe('removeFromBlacklist', () => {
    it('should remove item from blacklist', async () => {
      const { id } = await blacklistService.addToBlacklist('borrower', 1, 'סיבה')
      
      let result = await blacklistService.isBlacklisted('borrower', 1)
      expect(result).not.toBeNull()
      
      await blacklistService.removeFromBlacklist(id)
      
      result = await blacklistService.isBlacklisted('borrower', 1)
      expect(result).toBeNull()
    })
  })
})

describe('Loan Creation with Blacklist Validation', () => {
  beforeEach(() => {
    mockBlacklist = []
    mockLoans = []
  })

  it('should allow loan creation for non-blacklisted borrower', async () => {
    const result = await createLoanWithValidation(1, 5000)
    expect(result.id).toBeDefined()
    expect(mockLoans.length).toBe(1)
  })

  it('should block loan creation for blacklisted borrower', async () => {
    await blacklistService.addToBlacklist('borrower', 1, 'חוב קודם')
    
    await expect(createLoanWithValidation(1, 5000))
      .rejects.toThrow('לא ניתן ליצור הלוואה ללווה שנמצא ברשימה השחורה')
    
    expect(mockLoans.length).toBe(0)
  })

  it('should allow loan to borrower after removal from blacklist', async () => {
    const { id } = await blacklistService.addToBlacklist('borrower', 1, 'חוב')
    
    // Should fail while blacklisted
    await expect(createLoanWithValidation(1, 5000)).rejects.toThrow()
    
    // Remove from blacklist
    await blacklistService.removeFromBlacklist(id)
    
    // Should succeed now
    const result = await createLoanWithValidation(1, 5000)
    expect(result.id).toBeDefined()
  })

  it('should allow loan to different borrower even if one is blacklisted', async () => {
    await blacklistService.addToBlacklist('borrower', 1, 'חוב')
    
    // Borrower 1 is blacklisted
    await expect(createLoanWithValidation(1, 5000)).rejects.toThrow()
    
    // Borrower 2 is not blacklisted - should work
    const result = await createLoanWithValidation(2, 5000)
    expect(result.id).toBeDefined()
  })

  it('should not block loan if only guarantor is blacklisted (not borrower)', async () => {
    // Blacklist as guarantor, not borrower
    await blacklistService.addToBlacklist('guarantor', 1, 'ערב לא אמין')
    
    // Same person ID but as borrower should be allowed
    const result = await createLoanWithValidation(1, 5000)
    expect(result.id).toBeDefined()
  })
})

describe('Multiple Blacklist Entries', () => {
  beforeEach(() => {
    mockBlacklist = []
  })

  it('should handle multiple blacklist entries for same entity', async () => {
    await blacklistService.addToBlacklist('borrower', 1, 'סיבה ראשונה')
    await blacklistService.addToBlacklist('borrower', 1, 'סיבה שנייה')
    
    const ids = await blacklistService.getBlacklistedBorrowerIds()
    // Should appear twice (or deduplicated depending on implementation)
    expect(ids.filter(id => id === 1).length).toBeGreaterThanOrEqual(1)
  })

  it('should handle mixed borrower and guarantor blacklist', async () => {
    await blacklistService.addToBlacklist('borrower', 1, 'לווה 1')
    await blacklistService.addToBlacklist('guarantor', 1, 'ערב 1')
    await blacklistService.addToBlacklist('borrower', 2, 'לווה 2')
    await blacklistService.addToBlacklist('guarantor', 3, 'ערב 3')
    
    const borrowerIds = await blacklistService.getBlacklistedBorrowerIds()
    const guarantorIds = await blacklistService.getBlacklistedGuarantorIds()
    
    expect(borrowerIds).toContain(1)
    expect(borrowerIds).toContain(2)
    expect(guarantorIds).toContain(1)
    expect(guarantorIds).toContain(3)
  })
})

describe('Transfer to Guarantor - Blacklist Duplicate Prevention', () => {
  beforeEach(() => {
    mockBlacklist = []
    mockLoans = []
  })

  it('should not add borrower to blacklist twice when multiple loans transferred', async () => {
    const borrowerId = 1
    
    // Simulate first loan transfer to guarantor
    const existingBlacklist1 = await blacklistService.isBlacklisted('borrower', borrowerId)
    if (!existingBlacklist1) {
      await blacklistService.addToBlacklist('borrower', borrowerId, 'הלוואה #1 הועברה לערב - חוב לא שולם')
    }
    
    // Simulate second loan transfer to guarantor for same borrower
    const existingBlacklist2 = await blacklistService.isBlacklisted('borrower', borrowerId)
    if (!existingBlacklist2) {
      await blacklistService.addToBlacklist('borrower', borrowerId, 'הלוואה #2 הועברה לערב - חוב לא שולם')
    }
    
    // Should only have one blacklist entry for this borrower
    const allBlacklist = await blacklistService.getAll()
    const borrowerEntries = allBlacklist.filter(b => b.entity_type === 'borrower' && b.entity_id === borrowerId)
    
    expect(borrowerEntries).toHaveLength(1)
    expect(borrowerEntries[0].reason).toBe('הלוואה #1 הועברה לערב - חוב לא שולם')
  })

  it('should check blacklist before adding when transferring loan', async () => {
    const borrowerId = 1
    
    // Add to blacklist first time
    await blacklistService.addToBlacklist('borrower', borrowerId, 'סיבה ראשונה')
    
    // Try to add again (simulating second transfer)
    const isAlreadyBlacklisted = await blacklistService.isBlacklisted('borrower', borrowerId)
    expect(isAlreadyBlacklisted).not.toBeNull()
    
    // Should not add again
    if (!isAlreadyBlacklisted) {
      await blacklistService.addToBlacklist('borrower', borrowerId, 'סיבה שנייה')
    }
    
    const allEntries = await blacklistService.getAll()
    const borrowerEntries = allEntries.filter(b => b.entity_type === 'borrower' && b.entity_id === borrowerId)
    
    expect(borrowerEntries).toHaveLength(1)
  })
})

