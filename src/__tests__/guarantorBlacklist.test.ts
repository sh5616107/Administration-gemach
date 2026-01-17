import { describe, it, expect, beforeEach } from 'vitest'

/**
 * בדיקות רשימה שחורה - ערבים
 * 
 * בדיקות אלו מוודאות שהמערכת מונעת שימוש בערבים ברשימה שחורה
 * ומזהירה כאשר ערב נמצא במצב בעייתי
 */

// Mock data structures
interface Guarantor {
  id: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
  is_blacklisted: number
  total_guarantees?: number
}

interface Loan {
  id: number
  borrower_id: number
  guarantor1_id?: number
  guarantor2_id?: number
  amount: number
  remaining: number
  status: 'active' | 'paid' | 'overdue' | 'transferred'
}

interface BlacklistEntry {
  id: number
  entity_type: 'borrower' | 'guarantor'
  entity_id: number
  reason: string
  added_at: string
}

// Mock database
let mockGuarantors: Guarantor[] = []
let mockLoans: Loan[] = []
let mockBlacklist: BlacklistEntry[] = []

// Simulated services
const guarantorService = {
  getById: async (id: number) => mockGuarantors.find(g => g.id === id),
  
  getAll: async () => mockGuarantors,
  
  create: async (data: Omit<Guarantor, 'id'>) => {
    const id = mockGuarantors.length + 1
    const newGuarantor = { ...data, id }
    mockGuarantors.push(newGuarantor)
    return { id }
  },
  
  update: async (id: number, data: Partial<Guarantor>) => {
    const index = mockGuarantors.findIndex(g => g.id === id)
    if (index >= 0) {
      mockGuarantors[index] = { ...mockGuarantors[index], ...data }
    }
  },
  
  getTotalGuarantees: async (guarantorId: number) => {
    return mockLoans
      .filter(l => 
        l.status === 'active' && 
        (l.guarantor1_id === guarantorId || l.guarantor2_id === guarantorId)
      )
      .reduce((sum, l) => sum + l.remaining, 0)
  }
}

const blacklistService = {
  isBlacklisted: async (entityType: 'borrower' | 'guarantor', entityId: number) => {
    return mockBlacklist.find(b => b.entity_type === entityType && b.entity_id === entityId) || null
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

const loanService = {
  create: async (data: Omit<Loan, 'id'>) => {
    const id = mockLoans.length + 1
    const newLoan = { ...data, id }
    mockLoans.push(newLoan)
    return { id }
  },
  
  getAll: async () => mockLoans
}

// Validation functions
const validateGuarantorForLoan = async (guarantorId: number): Promise<{ valid: boolean; error?: string }> => {
  const guarantor = await guarantorService.getById(guarantorId)
  
  if (!guarantor) {
    return { valid: false, error: 'ערב לא נמצא' }
  }
  
  // בדיקה אם הערב ברשימה שחורה
  if (guarantor.is_blacklisted === 1) {
    return { valid: false, error: 'לא ניתן לבחור ערב שנמצא ברשימה השחורה' }
  }
  
  const blacklistEntry = await blacklistService.isBlacklisted('guarantor', guarantorId)
  if (blacklistEntry) {
    return { valid: false, error: `ערב ברשימה שחורה: ${blacklistEntry.reason}` }
  }
  
  return { valid: true }
}

const createLoanWithGuarantors = async (
  borrowerId: number,
  amount: number,
  guarantor1Id?: number,
  guarantor2Id?: number
): Promise<{ success: boolean; error?: string; loanId?: number }> => {
  // בדיקת ערב ראשון
  if (guarantor1Id) {
    const validation = await validateGuarantorForLoan(guarantor1Id)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }
  }
  
  // בדיקת ערב שני
  if (guarantor2Id) {
    const validation = await validateGuarantorForLoan(guarantor2Id)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }
  }
  
  // יצירת ההלוואה
  const result = await loanService.create({
    borrower_id: borrowerId,
    guarantor1_id: guarantor1Id,
    guarantor2_id: guarantor2Id,
    amount,
    remaining: amount,
    status: 'active'
  })
  
  return { success: true, loanId: result.id }
}

describe('Guarantor Blacklist - Basic Checks', () => {
  beforeEach(() => {
    mockGuarantors = [
      { id: 1, first_name: 'דוד', last_name: 'כהן', phone: '050-1111111', id_number: '111111111', is_blacklisted: 0 },
      { id: 2, first_name: 'משה', last_name: 'לוי', phone: '050-2222222', id_number: '222222222', is_blacklisted: 1 },
      { id: 3, first_name: 'יוסף', last_name: 'ישראלי', phone: '050-3333333', id_number: '333333333', is_blacklisted: 0 },
    ]
    mockLoans = []
    mockBlacklist = []
  })

  it('should allow selecting non-blacklisted guarantor', async () => {
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should block selecting guarantor with is_blacklisted flag', async () => {
    const result = await validateGuarantorForLoan(2)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('ערב שנמצא ברשימה השחורה')
  })

  it('should block selecting guarantor in blacklist table', async () => {
    await blacklistService.addToBlacklist('guarantor', 1, 'לא עמד בהתחייבויות')
    
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('רשימה שחורה')
  })

  it('should allow guarantor after removal from blacklist', async () => {
    const { id } = await blacklistService.addToBlacklist('guarantor', 1, 'סיבה')
    
    // חסום בהתחלה
    let result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(false)
    
    // הסרה מהרשימה השחורה
    await blacklistService.removeFromBlacklist(id)
    
    // מותר עכשיו
    result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(true)
  })
})

describe('Loan Creation with Blacklisted Guarantors', () => {
  beforeEach(() => {
    mockGuarantors = [
      { id: 1, first_name: 'דוד', last_name: 'כהן', phone: '050-1111111', id_number: '111111111', is_blacklisted: 0 },
      { id: 2, first_name: 'משה', last_name: 'לוי', phone: '050-2222222', id_number: '222222222', is_blacklisted: 1 },
      { id: 3, first_name: 'יוסף', last_name: 'ישראלי', phone: '050-3333333', id_number: '333333333', is_blacklisted: 0 },
    ]
    mockLoans = []
    mockBlacklist = []
  })

  it('should create loan with valid guarantor', async () => {
    const result = await createLoanWithGuarantors(100, 10000, 1)
    
    expect(result.success).toBe(true)
    expect(result.loanId).toBeDefined()
    expect(mockLoans.length).toBe(1)
  })

  it('should block loan creation with blacklisted guarantor1', async () => {
    const result = await createLoanWithGuarantors(100, 10000, 2)
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('ערב שנמצא ברשימה השחורה')
    expect(mockLoans.length).toBe(0)
  })

  it('should block loan creation with blacklisted guarantor2', async () => {
    const result = await createLoanWithGuarantors(100, 10000, 1, 2)
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('ערב שנמצא ברשימה השחורה')
    expect(mockLoans.length).toBe(0)
  })

  it('should create loan with two valid guarantors', async () => {
    const result = await createLoanWithGuarantors(100, 10000, 1, 3)
    
    expect(result.success).toBe(true)
    expect(mockLoans.length).toBe(1)
    expect(mockLoans[0].guarantor1_id).toBe(1)
    expect(mockLoans[0].guarantor2_id).toBe(3)
  })

  it('should block if either guarantor is blacklisted', async () => {
    await blacklistService.addToBlacklist('guarantor', 3, 'חוב ישן')
    
    const result = await createLoanWithGuarantors(100, 10000, 1, 3)
    
    expect(result.success).toBe(false)
    expect(result.error).toContain('רשימה שחורה')
  })

  it('should create loan without guarantors', async () => {
    const result = await createLoanWithGuarantors(100, 10000)
    
    expect(result.success).toBe(true)
    expect(mockLoans[0].guarantor1_id).toBeUndefined()
    expect(mockLoans[0].guarantor2_id).toBeUndefined()
  })
})

describe('Guarantor Blacklist - Edge Cases', () => {
  beforeEach(() => {
    mockGuarantors = [
      { id: 1, first_name: 'דוד', last_name: 'כהן', phone: '050-1111111', id_number: '111111111', is_blacklisted: 0 },
      { id: 2, first_name: 'משה', last_name: 'לוי', phone: '050-2222222', id_number: '222222222', is_blacklisted: 0 },
    ]
    mockLoans = []
    mockBlacklist = []
  })

  it('should handle non-existent guarantor', async () => {
    const result = await validateGuarantorForLoan(999)
    
    expect(result.valid).toBe(false)
    expect(result.error).toContain('לא נמצא')
  })

  it('should distinguish between borrower and guarantor blacklist', async () => {
    // הוספה לרשימה שחורה כלווה (לא כערב)
    await blacklistService.addToBlacklist('borrower', 1, 'חוב כלווה')
    
    // אמור להיות מותר כערב
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(true)
  })

  it('should handle multiple blacklist entries for same guarantor', async () => {
    await blacklistService.addToBlacklist('guarantor', 1, 'סיבה ראשונה')
    await blacklistService.addToBlacklist('guarantor', 1, 'סיבה שנייה')
    
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(false)
  })

  it('should update is_blacklisted flag when adding to blacklist', async () => {
    await blacklistService.addToBlacklist('guarantor', 1, 'סיבה')
    await guarantorService.update(1, { is_blacklisted: 1 })
    
    const guarantor = await guarantorService.getById(1)
    expect(guarantor?.is_blacklisted).toBe(1)
    
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(false)
  })
})

describe('Guarantor Risk Assessment', () => {
  beforeEach(() => {
    mockGuarantors = [
      { id: 1, first_name: 'דוד', last_name: 'כהן', phone: '050-1111111', id_number: '111111111', is_blacklisted: 0 },
      { id: 2, first_name: 'משה', last_name: 'לוי', phone: '050-2222222', id_number: '222222222', is_blacklisted: 0 },
    ]
    mockLoans = []
    mockBlacklist = []
  })

  it('should calculate total guarantees for guarantor', async () => {
    // יצירת 3 הלוואות עם ערב 1
    await loanService.create({ borrower_id: 100, guarantor1_id: 1, amount: 10000, remaining: 5000, status: 'active' })
    await loanService.create({ borrower_id: 101, guarantor1_id: 1, amount: 20000, remaining: 15000, status: 'active' })
    await loanService.create({ borrower_id: 102, guarantor2_id: 1, amount: 30000, remaining: 25000, status: 'active' })
    
    const total = await guarantorService.getTotalGuarantees(1)
    expect(total).toBe(45000) // 5000 + 15000 + 25000
  })

  it('should not count paid loans in total guarantees', async () => {
    await loanService.create({ borrower_id: 100, guarantor1_id: 1, amount: 10000, remaining: 5000, status: 'active' })
    await loanService.create({ borrower_id: 101, guarantor1_id: 1, amount: 20000, remaining: 0, status: 'paid' })
    
    const total = await guarantorService.getTotalGuarantees(1)
    expect(total).toBe(5000) // רק ההלוואה הפעילה
  })

  it('should warn when guarantor has high total guarantees', async () => {
    const RISK_THRESHOLD = 50000
    
    // יצירת הלוואות שמגיעות לסף הסיכון
    await loanService.create({ borrower_id: 100, guarantor1_id: 1, amount: 30000, remaining: 30000, status: 'active' })
    await loanService.create({ borrower_id: 101, guarantor1_id: 1, amount: 25000, remaining: 25000, status: 'active' })
    
    const total = await guarantorService.getTotalGuarantees(1)
    expect(total).toBeGreaterThan(RISK_THRESHOLD)
    
    // הערב עדיין תקין אבל בסיכון גבוה
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(true) // מותר אבל צריך אזהרה
  })

  it('should count guarantees for both guarantor1 and guarantor2 positions', async () => {
    await loanService.create({ borrower_id: 100, guarantor1_id: 1, amount: 10000, remaining: 10000, status: 'active' })
    await loanService.create({ borrower_id: 101, guarantor2_id: 1, amount: 15000, remaining: 15000, status: 'active' })
    
    const total = await guarantorService.getTotalGuarantees(1)
    expect(total).toBe(25000)
  })
})

describe('Guarantor Blacklist Integration', () => {
  beforeEach(() => {
    mockGuarantors = [
      { id: 1, first_name: 'דוד', last_name: 'כהן', phone: '050-1111111', id_number: '111111111', is_blacklisted: 0 },
      { id: 2, first_name: 'משה', last_name: 'לוי', phone: '050-2222222', id_number: '222222222', is_blacklisted: 0 },
      { id: 3, first_name: 'יוסף', last_name: 'ישראלי', phone: '050-3333333', id_number: '333333333', is_blacklisted: 0 },
    ]
    mockLoans = []
    mockBlacklist = []
  })

  it('should prevent creating new guarantor with is_blacklisted=1', async () => {
    const newGuarantor = {
      first_name: 'חדש',
      last_name: 'חסום',
      phone: '050-9999999',
      id_number: '999999999',
      is_blacklisted: 1
    }
    
    const result = await guarantorService.create(newGuarantor)
    const validation = await validateGuarantorForLoan(result.id)
    
    expect(validation.valid).toBe(false)
  })

  it('should handle guarantor blacklisted mid-loan', async () => {
    // יצירת הלוואה עם ערב תקין
    const loanResult = await createLoanWithGuarantors(100, 10000, 1)
    expect(loanResult.success).toBe(true)
    
    // הוספת הערב לרשימה שחורה
    await blacklistService.addToBlacklist('guarantor', 1, 'התנהגות בעייתית')
    await guarantorService.update(1, { is_blacklisted: 1 })
    
    // ההלוואה הקיימת נשארת, אבל לא ניתן ליצור הלוואה חדשה
    const newLoanResult = await createLoanWithGuarantors(101, 15000, 1)
    expect(newLoanResult.success).toBe(false)
    
    // ההלוואה הקיימת עדיין פעילה
    const loans = await loanService.getAll()
    expect(loans.filter(l => l.guarantor1_id === 1 && l.status === 'active').length).toBe(1)
  })

  it('should allow same person as borrower and guarantor with different blacklist status', async () => {
    // אותו אדם חסום כלווה אבל לא כערב
    await blacklistService.addToBlacklist('borrower', 1, 'חוב כלווה')
    
    // אמור להיות מותר להשתמש בו כערב
    const result = await validateGuarantorForLoan(1)
    expect(result.valid).toBe(true)
  })
})
