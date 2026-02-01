/**
 * Cross-check service for validating relationships between borrowers and guarantors
 * Identifies potential issues when the same person appears in multiple roles
 */

import { borrowersService, guarantorsService, loansService } from './database'

export interface CrossCheckResult {
  type: 'warning' | 'error'
  message: string
  details?: string
}

export interface PersonMatch {
  type: 'borrower' | 'guarantor'
  id: number
  name: string
  phone: string
  idNumber?: string
}

/**
 * Find matching person in borrowers table by phone or ID number
 */
export async function findMatchingBorrower(phone: string, idNumber?: string): Promise<PersonMatch | null> {
  const borrowers = await borrowersService.getAll() as any[]
  
  for (const b of borrowers) {
    // Match by phone (normalize by removing non-digits)
    const normalizedPhone = phone.replace(/\D/g, '')
    const borrowerPhone = (b.phone || '').replace(/\D/g, '')
    
    if (normalizedPhone && borrowerPhone && normalizedPhone === borrowerPhone) {
      return {
        type: 'borrower',
        id: b.id,
        name: `${b.first_name} ${b.last_name}`,
        phone: b.phone,
        idNumber: b.id_number
      }
    }
    
    // Match by ID number if both exist
    if (idNumber && b.id_number && idNumber === b.id_number) {
      return {
        type: 'borrower',
        id: b.id,
        name: `${b.first_name} ${b.last_name}`,
        phone: b.phone,
        idNumber: b.id_number
      }
    }
  }
  
  return null
}

/**
 * Find matching person in guarantors table by phone or ID number
 */
export async function findMatchingGuarantor(phone: string, idNumber?: string): Promise<PersonMatch | null> {
  const guarantors = await guarantorsService.getAll() as any[]
  
  for (const g of guarantors) {
    const normalizedPhone = phone.replace(/\D/g, '')
    const guarantorPhone = (g.phone || '').replace(/\D/g, '')
    
    if (normalizedPhone && guarantorPhone && normalizedPhone === guarantorPhone) {
      return {
        type: 'guarantor',
        id: g.id,
        name: `${g.first_name} ${g.last_name}`,
        phone: g.phone,
        idNumber: g.id_number
      }
    }
    
    if (idNumber && g.id_number && idNumber === g.id_number) {
      return {
        type: 'guarantor',
        id: g.id,
        name: `${g.first_name} ${g.last_name}`,
        phone: g.phone,
        idNumber: g.id_number
      }
    }
  }
  
  return null
}

/**
 * Get total active debt for a borrower
 */
export async function getBorrowerActiveDebt(borrowerId: number): Promise<number> {
  const loans = await loansService.getAll() as any[]
  return loans
    .filter(l => l.borrower_id === borrowerId && l.status === 'active')
    .reduce((sum, l) => sum + (l.remaining || 0), 0)
}

/**
 * Count active guarantor commitments
 */
export async function getGuarantorActiveCount(guarantorId: number): Promise<number> {
  const loans = await loansService.getAll() as any[]
  return loans.filter(l => 
    l.status === 'active' && 
    (l.guarantor1_id === guarantorId || l.guarantor2_id === guarantorId)
  ).length
}

/**
 * Check if a guarantor has issues that should be warned about
 * Called when selecting a guarantor for a loan
 * 
 * @param guarantorId - The ID of the guarantor to check
 * @param borrowerId - Optional: The ID of the borrower for this loan (to prevent self-guaranteeing)
 */
export async function checkGuarantorForLoan(guarantorId: number, borrowerId?: number): Promise<CrossCheckResult[]> {
  const results: CrossCheckResult[] = []
  const guarantor = await guarantorsService.getById(guarantorId) as any
  
  if (!guarantor) return results
  
  // Check if guarantor is the same person as the borrower (if borrowerId provided)
  if (borrowerId) {
    const borrower = await borrowersService.getById(borrowerId) as any
    if (borrower) {
      const borrowerPhone = (borrower.phone || '').replace(/\D/g, '')
      const guarantorPhone = (guarantor.phone || '').replace(/\D/g, '')
      
      const isSamePerson = 
        (borrowerPhone && guarantorPhone && borrowerPhone === guarantorPhone) ||
        (borrower.id_number && guarantor.id_number && borrower.id_number === guarantor.id_number)
      
      if (isSamePerson) {
        results.push({
          type: 'error',
          message: 'לא ניתן לבחור את הלווה כערב להלוואה שלו עצמו',
          details: `הערב "${guarantor.first_name} ${guarantor.last_name}" הוא אותו אדם כמו הלווה`
        })
        return results // Return immediately - this is a blocking error
      }
    }
  }
  
  // Check if guarantor exists as borrower with active debt
  const matchingBorrower = await findMatchingBorrower(guarantor.phone, guarantor.id_number)
  
  if (matchingBorrower) {
    const debt = await getBorrowerActiveDebt(matchingBorrower.id)
    if (debt > 0) {
      results.push({
        type: 'warning',
        message: `לערב זה יש הלוואה פעילה בסך ${formatCurrency(debt)}`,
        details: `הערב "${guarantor.first_name} ${guarantor.last_name}" מופיע גם כלווה עם חוב פעיל`
      })
    }
  }
  
  // Check how many loans this guarantor is already guaranteeing
  const activeCount = await getGuarantorActiveCount(guarantorId)
  if (activeCount >= 3) {
    results.push({
      type: 'warning',
      message: `ערב זה כבר ערב ל-${activeCount} הלוואות פעילות`,
      details: 'ייתכן שזה מעמיס יותר מדי אחריות על ערב אחד'
    })
  }
  
  return results
}

/**
 * Check if a borrower has issues when creating a new loan
 */
export async function checkBorrowerForLoan(borrowerId: number): Promise<CrossCheckResult[]> {
  const results: CrossCheckResult[] = []
  const borrower = await borrowersService.getById(borrowerId) as any
  
  if (!borrower) return results
  
  // Check if borrower is also a guarantor for other loans
  const matchingGuarantor = await findMatchingGuarantor(borrower.phone, borrower.id_number)
  
  if (matchingGuarantor) {
    const activeCount = await getGuarantorActiveCount(matchingGuarantor.id)
    if (activeCount > 0) {
      results.push({
        type: 'warning',
        message: `לווה זה משמש כערב ל-${activeCount} הלוואות אחרות`,
        details: `"${borrower.first_name} ${borrower.last_name}" מופיע גם כערב במערכת`
      })
    }
  }
  
  return results
}

/**
 * Check when creating a new guarantor if they already exist as borrower
 */
export async function checkNewGuarantor(phone: string, idNumber?: string): Promise<CrossCheckResult[]> {
  const results: CrossCheckResult[] = []
  
  const matchingBorrower = await findMatchingBorrower(phone, idNumber)
  
  if (matchingBorrower) {
    const debt = await getBorrowerActiveDebt(matchingBorrower.id)
    if (debt > 0) {
      results.push({
        type: 'warning',
        message: `קיים לווה עם פרטים זהים וחוב של ${formatCurrency(debt)}`,
        details: `נמצא לווה בשם "${matchingBorrower.name}" עם אותו טלפון/ת.ז.`
      })
    } else {
      results.push({
        type: 'warning',
        message: 'קיים לווה עם פרטים זהים (ללא חוב פעיל)',
        details: `נמצא לווה בשם "${matchingBorrower.name}" עם אותו טלפון/ת.ז.`
      })
    }
  }
  
  return results
}

/**
 * Check when creating a new borrower if they already exist as guarantor
 */
export async function checkNewBorrower(phone: string, idNumber?: string): Promise<CrossCheckResult[]> {
  const results: CrossCheckResult[] = []
  
  const matchingGuarantor = await findMatchingGuarantor(phone, idNumber)
  
  if (matchingGuarantor) {
    const activeCount = await getGuarantorActiveCount(matchingGuarantor.id)
    if (activeCount > 0) {
      results.push({
        type: 'warning',
        message: `קיים ערב עם פרטים זהים שערב ל-${activeCount} הלוואות`,
        details: `נמצא ערב בשם "${matchingGuarantor.name}" עם אותו טלפון/ת.ז.`
      })
    } else {
      results.push({
        type: 'warning',
        message: 'קיים ערב עם פרטים זהים',
        details: `נמצא ערב בשם "${matchingGuarantor.name}" עם אותו טלפון/ת.ז.`
      })
    }
  }
  
  return results
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(amount)
}
