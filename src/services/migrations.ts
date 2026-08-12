// Migration scripts for database schema changes

import { guarantorLoansService, guarantorLoanRepaymentsService, loansService, exportAllData, importAllData, stores } from './database'

// Migration version tracking
const MIGRATION_VERSION_KEY = 'migration_version'
const CURRENT_MIGRATION_VERSION = 14 // Increment this when adding new migrations

/**
 * Get the current migration version from storage
 */
function getMigrationVersion(): number {
  const version = stores.settings.getItem(MIGRATION_VERSION_KEY)
  return version ? parseInt(version, 10) : 0
}

/**
 * Set the migration version in storage
 */
function setMigrationVersion(version: number): void {
  stores.settings.setItem(MIGRATION_VERSION_KEY, String(version))
}

/**
 * Migration: Convert old guarantor loan total_repaid to repayment history
 * 
 * Before: guarantorLoans had only total_repaid field
 * After: guarantorLoanRepayments table with full history
 * 
 * For existing data with total_repaid > 0 but no repayment history,
 * create a single historical repayment record.
 */
export async function migrateGuarantorRepayments(): Promise<{ migrated: number; skipped: number }> {
  console.log('🔄 Starting guarantor repayments migration...')
  
  let migrated = 0
  let skipped = 0
  
  try {
    // Get all guarantor loans
    const guarantorLoans = await guarantorLoansService.getAll()
    
    for (const gl of guarantorLoans) {
      // Check if this loan has total_repaid but no repayment history
      if ((gl.total_repaid || 0) > 0) {
        const existingRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        
        if (existingRepayments.length === 0) {
          // No history exists - create a migration record
          await guarantorLoanRepaymentsService.create({
            guarantor_loan_id: gl.id,
            amount: gl.total_repaid || 0,
            payment_date: gl.created_at.split('T')[0], // Use creation date as fallback
            notes: '🔄 נתון ממוגר - הומר אוטומטית מהמערכת הישנה',
          })
          
          console.log(`✅ Migrated guarantor loan ${gl.id}: ${gl.total_repaid}₪`)
          migrated++
        } else {
          // History already exists - verify total matches
          const historyTotal = existingRepayments.reduce((sum, r) => sum + r.amount, 0)
          if (Math.abs(historyTotal - (gl.total_repaid || 0)) > 0.01) {
            console.warn(`⚠️ Mismatch for guarantor loan ${gl.id}: history=${historyTotal}, total_repaid=${gl.total_repaid}`)
          }
          skipped++
        }
      } else {
        skipped++
      }
    }
    
    console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped`)
    return { migrated, skipped }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

/**
 * Check if migration is needed
 */
export async function needsGuarantorRepaymentsMigration(): Promise<boolean> {
  try {
    const guarantorLoans = await guarantorLoansService.getAll()
    
    for (const gl of guarantorLoans) {
      if ((gl.total_repaid || 0) > 0) {
        const existingRepayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        if (existingRepayments.length === 0) {
          return true // Found at least one loan that needs migration
        }
      }
    }
    
    return false // No migration needed
  } catch (error) {
    console.error('Error checking migration status:', error)
    return false
  }
}

/**
 * Migration: Clean old refund notes from guarantor loans
 * 
 * Old code added refund notes without cleaning old ones.
 * This migration removes all old refund notes and recalculates them.
 */
export async function cleanOldRefundNotes(): Promise<{ cleaned: number }> {
  console.log('🧹 Starting refund notes cleanup migration...')
  
  let cleaned = 0
  
  try {
    const guarantorLoans = await guarantorLoansService.getAll()
    
    for (const gl of guarantorLoans) {
      // Check if notes contain refund messages
      if (gl.notes && gl.notes.includes('מגיע החזר לערב')) {
        // Clean all refund notes
        const cleanNotes = gl.notes
          .split('\n')
          .filter(line => !line.includes('מגיע החזר לערב'))
          .join('\n')
          .trim()
        
        await guarantorLoansService.update(gl.id, {
          notes: cleanNotes
        })
        
        console.log(`✅ Cleaned notes for guarantor loan ${gl.id}`)
        cleaned++
      }
    }
    
    console.log(`✅ Cleanup complete: ${cleaned} guarantor loans cleaned`)
    return { cleaned }
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error)
    throw error
  }
}

/**
 * Migration: Add recurring loan numbers to existing recurring loans
 * 
 * For existing recurring loans without recurring_loan_number/recurring_loan_count,
 * try to calculate them based on notes and creation dates.
 */
export async function migrateRecurringLoanNumbers(): Promise<{ migrated: number; skipped: number }> {
  console.log('🔄 Starting recurring loan numbers migration...')
  
  let migrated = 0
  let skipped = 0
  
  try {
    const allLoans = await loansService.getAll()
    
    // Group recurring loans by borrower
    const recurringLoansByBorrower = new Map<string, any[]>()
    
    for (const loan of allLoans) {
      // הלוואה נחשבת מחזורית אם:
      // 1. is_recurring = 1 (הלוואות חדשות)
      // 2. יש לה הערה "הלוואה מחזורית מהלוואה" (הלוואות ישנות שנוצרו על ידי scheduler)
      const isRecurring = loan.is_recurring === 1 || 
                         (loan.notes && loan.notes.includes('הלוואה מחזורית מהלוואה'))
      
      if (isRecurring) {
        if (!recurringLoansByBorrower.has(loan.borrower_id)) {
          recurringLoansByBorrower.set(loan.borrower_id, [])
        }
        recurringLoansByBorrower.get(loan.borrower_id)!.push(loan)
      }
    }
    
    console.log(`[MIGRATION v3] Found ${recurringLoansByBorrower.size} borrowers with recurring loans`)
    
    // Process each borrower's recurring loans
    for (const [borrowerId, loans] of recurringLoansByBorrower) {
      // Sort by loan_date (oldest first)
      loans.sort((a, b) => new Date(a.loan_date).getTime() - new Date(b.loan_date).getTime())
      
      // Group by amount and recurring settings (same series)
      const seriesMap = new Map<string, any[]>()
      
      for (const loan of loans) {
        // Create a key based on amount and recurring settings
        // For old loans without recurring_day, use a generic key
        const key = `${loan.amount}_${loan.recurring_day || 'any'}`
        if (!seriesMap.has(key)) {
          seriesMap.set(key, [])
        }
        seriesMap.get(key)!.push(loan)
      }
      
      console.log(`[MIGRATION v3] Borrower ${borrowerId}: ${seriesMap.size} series found`)
      
      // Process each series
      for (const [key, seriesLoans] of seriesMap) {
        // Check if any loan in this series already has numbers
        const hasNumbers = seriesLoans.some(l => l.recurring_loan_number && l.recurring_loan_count)
        
        if (hasNumbers) {
          console.log(`[MIGRATION v3] Series ${key}: already has numbers, skipping ${seriesLoans.length} loans`)
          skipped += seriesLoans.length
          continue
        }
        
        // Calculate total count for this series
        // If the first loan has recurring_months, use it to calculate total
        const firstLoan = seriesLoans[0]
        const totalCount = firstLoan.recurring_months 
          ? firstLoan.recurring_months + seriesLoans.length 
          : seriesLoans.length
        
        console.log(`[MIGRATION v3] Series ${key}: migrating ${seriesLoans.length} loans, total count: ${totalCount}`)
        
        // Assign numbers to each loan in the series
        for (let i = 0; i < seriesLoans.length; i++) {
          const loan = seriesLoans[i]
          
          // גם מעדכנים את is_recurring אם הוא לא מוגדר
          const updates: any = {
            recurring_loan_number: i + 1,
            recurring_loan_count: totalCount
          }
          
          if (loan.is_recurring !== 1) {
            updates.is_recurring = 1
          }
          
          await loansService.update(loan.id, updates)
          
          console.log(`✅ Migrated loan ${loan.id}: ${i + 1}/${totalCount}`)
          migrated++
        }
      }
    }
    
    console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped`)
    return { migrated, skipped }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

/**
 * Check if recurring repayment numbers migration is needed
 */
export async function needsRecurringRepaymentNumbersMigration(): Promise<boolean> {
  try {
    const { repaymentsService } = await import('./database')
    const allLoans = await loansService.getAll()
    
    let needsMigration = 0
    
    for (const loan of allLoans) {
      // בדיקה אם זו הלוואה עם פירעון מחזורי
      if (loan.auto_repayment === 1 && loan.repayment_amount && loan.repayment_amount > 0) {
        const repayments = await repaymentsService.getByLoan(loan.id)
        
        // בדיקה אם יש פירעונות ללא מספרים
        for (const repayment of repayments) {
          if (!repayment.recurring_repayment_number) {
            needsMigration++
            break
          }
        }
      }
    }
    
    console.log(`[MIGRATION v4] Found ${needsMigration} loans with repayments needing migration`)
    return needsMigration > 0
  } catch (error) {
    console.error('Error checking repayment migration status:', error)
    return false
  }
}

/**
 * Migration v4: Add recurring repayment numbers to existing repayments
 */
export async function migrateRecurringRepaymentNumbers(): Promise<{ migrated: number; skipped: number }> {
  console.log('🔄 Starting recurring repayment numbers migration...')
  
  let migrated = 0
  let skipped = 0
  
  try {
    const { repaymentsService, db } = await import('./database')
    const { calculateNextRepaymentNumber } = await import('./recurringRepaymentsService')
    const allLoans = await loansService.getAll()
    
    for (const loan of allLoans) {
      // רק הלוואות עם פירעון מחזורי
      if (loan.auto_repayment !== 1 || !loan.repayment_amount || loan.repayment_amount <= 0) {
        continue
      }
      
      const repayments = await repaymentsService.getByLoan(loan.id)
      
      // מיון לפי תאריך
      const sortedRepayments = repayments.sort((a, b) => 
        new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      )
      
      // ✅ תיקון: שימוש בלוגיקה המשותפת לחישוב הספירה
      // זה מטפל נכון גם בהלוואות מחזוריות (loan family)
      const { recurringRepaymentCount } = await calculateNextRepaymentNumber(loan.id)
      
      // עדכון כל פירעון עם המספר שלו
      for (let i = 0; i < sortedRepayments.length; i++) {
        const repayment = sortedRepayments[i]
        
        if (!repayment.recurring_repayment_number) {
          // ✅ שימוש ב-repaymentsService.update במקום db.run שלא מזוהה
          await repaymentsService.update(repayment.id, {
            is_recurring: 1,
            recurring_repayment_number: i + 1,
            recurring_repayment_count: recurringRepaymentCount,
          })
          migrated++
        } else {
          skipped++
        }
      }
    }
    
    console.log(`✅ Recurring repayment numbers migration complete: ${migrated} migrated, ${skipped} skipped`)
    return { migrated, skipped }
  } catch (error) {
    console.error('Error in recurring repayment numbers migration:', error)
    return { migrated, skipped }
  }
}

/**
 * Check if recurring loan numbers migration is needed
 */
export async function needsRecurringLoanNumbersMigration(): Promise<boolean> {
  try {
    const allLoans = await loansService.getAll()
    console.log(`[MIGRATION v3] Checking ${allLoans.length} loans for migration`)
    
    let recurringCount = 0
    let needsMigration = 0
    
    for (const loan of allLoans) {
      // הלוואה נחשבת מחזורית אם:
      // 1. is_recurring = 1 (הלוואות חדשות)
      // 2. יש לה הערה "הלוואה מחזורית מהלוואה" (הלוואות ישנות)
      const isRecurring = loan.is_recurring === 1 || 
                         (loan.notes && loan.notes.includes('הלוואה מחזורית מהלוואה'))
      
      if (isRecurring) {
        recurringCount++
        if (!loan.recurring_loan_number) {
          needsMigration++
          console.log(`[MIGRATION v3] Loan ${loan.id} needs migration (recurring, no number)`)
        }
      }
    }
    
    console.log(`[MIGRATION v3] Found ${recurringCount} recurring loans, ${needsMigration} need migration`)
    return needsMigration > 0
  } catch (error) {
    console.error('Error checking migration status:', error)
    return false
  }
}

/**
 * Migration v6: Fix deposit status (convert number to string) and add recurring numbers
 */
export async function migrateDepositStatusAndRecurring(): Promise<{ migrated: number }> {
  console.log('🔄 Starting deposit status and recurring numbers migration...')
  
  let migrated = 0
  
  try {
    const allData = await exportAllData()
    const deposits = Object.values(allData.deposits || {})
    
    for (const deposit of deposits) {
      let needsUpdate = false
      const updates: any = {}
      
      // Add default status if missing
      if (deposit.status === undefined || deposit.status === null) {
        updates.status = 'active'
        needsUpdate = true
        console.log(`[MIGRATION v6] Deposit ${deposit.id}: added default status 'active'`)
      }
      
      // Fix status if it's a number
      if (typeof deposit.status === 'number') {
        updates.status = deposit.status === 1 ? 'active' : 'withdrawn'
        needsUpdate = true
        console.log(`[MIGRATION v6] Deposit ${deposit.id}: status ${deposit.status} -> '${updates.status}'`)
      }
      
      // Add recurring numbers if missing - BUT ONLY if it's truly recurring
      // A deposit is recurring if: is_recurring = 1 AND has recurring_months defined
      if (deposit.is_recurring === 1 && deposit.recurring_months !== undefined && !deposit.recurring_deposit_number) {
        updates.recurring_deposit_number = 1
        // Calculate recurring_deposit_count from recurring_months
        if (deposit.recurring_months >= 0) {
          updates.recurring_deposit_count = deposit.recurring_months + 1
        }
        needsUpdate = true
        console.log(`[MIGRATION v6] Deposit ${deposit.id}: added recurring numbers (1/${updates.recurring_deposit_count || '?'})`)
      }
      
      // Fix: If is_recurring = 1 but no recurring_months, it's not really recurring
      if (deposit.is_recurring === 1 && deposit.recurring_months === undefined) {
        updates.is_recurring = 0
        needsUpdate = true
        console.log(`[MIGRATION v6] Deposit ${deposit.id}: fixed is_recurring (was 1, no recurring_months)`)
      }
      
      if (needsUpdate) {
        // Update the deposit in storage
        Object.assign(deposit, updates)
        allData.deposits[deposit.id] = deposit
        migrated++
      }
    }
    
    if (migrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v6: Fixed ${migrated} deposits`)
    }
    
  } catch (error) {
    console.error('Error in deposit migration:', error)
  }
  
  return { migrated }
}

/**
 * Migration v8: Add total_refunded field to guarantor loans
 */
export async function migrateGuarantorRefunds(): Promise<{ migrated: number }> {
  console.log('🔄 Starting guarantor refunds migration...')
  
  let migrated = 0
  
  try {
    const allData = await exportAllData()
    const guarantorLoans = Object.values(allData.guarantorLoans || {})
    
    for (const gl of guarantorLoans) {
      // Add total_refunded if missing
      if (gl.total_refunded === undefined) {
        gl.total_refunded = 0
        allData.guarantorLoans[gl.id] = gl
        migrated++
        console.log(`[MIGRATION v8] GuarantorLoan ${gl.id}: added total_refunded = 0`)
      }
    }
    
    if (migrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v8: Updated ${migrated} guarantor loans`)
    }
    
  } catch (error) {
    console.error('Error in guarantor refunds migration:', error)
  }
  
  return { migrated }
}

/**
 * Migration v9: Remove duplicate blacklist entries
 * 
 * Bug: When a borrower had multiple loans transferred to guarantors,
 * they were added to blacklist multiple times.
 * This migration keeps only the first entry for each entity.
 */
export async function removeDuplicateBlacklistEntries(): Promise<{ removed: number }> {
  console.log('🔄 Starting blacklist duplicates cleanup...')
  
  let removed = 0
  
  try {
    const allData = await exportAllData()
    const blacklistObj = allData.blacklist || {}
    const blacklist = Object.values(blacklistObj)
    
    if (blacklist.length === 0) {
      console.log('✅ Migration v9: No blacklist entries found')
      return { removed: 0 }
    }
    
    console.log(`[MIGRATION v9] Found ${blacklist.length} blacklist entries`)
    
    // Track seen entities (type + id)
    const seen = new Map<string, any>()
    const toKeep: any[] = []
    
    // Sort by added_at to keep the oldest entry
    const sortedBlacklist = blacklist.sort((a, b) => {
      const dateA = new Date(a.added_at || 0).getTime()
      const dateB = new Date(b.added_at || 0).getTime()
      return dateA - dateB
    })
    
    for (const entry of sortedBlacklist) {
      const key = `${entry.entity_type}_${entry.entity_id}`
      
      if (!seen.has(key)) {
        // First occurrence - keep it
        seen.set(key, entry)
        toKeep.push(entry)
        console.log(`[MIGRATION v9] Keeping: ${entry.entity_type} #${entry.entity_id} (id: ${entry.id}, date: ${entry.added_at})`)
      } else {
        // Duplicate - remove it
        const original = seen.get(key)
        console.log(`[MIGRATION v9] Removing duplicate: ${entry.entity_type} #${entry.entity_id} (id: ${entry.id}, date: ${entry.added_at}) - keeping id: ${original.id}`)
        removed++
      }
    }
    
    if (removed > 0) {
      // Rebuild blacklist with only unique entries
      allData.blacklist = {}
      toKeep.forEach(entry => {
        allData.blacklist[entry.id] = entry
      })
      
      await importAllData(allData)
      console.log(`✅ Migration v9: Removed ${removed} duplicate blacklist entries, kept ${toKeep.length}`)
    } else {
      console.log('✅ Migration v9: No duplicates found')
    }
    
  } catch (error) {
    console.error('Error in blacklist duplicates cleanup:', error)
  }
  
  return { removed }
}

/**
 * Migration v11: Convert all numeric IDs to UUIDs
 * 
 * This migration converts the primary keys from auto-increment numbers to UUIDs
 * for better data integrity and to prevent the phone="0" duplicate bug.
 * 
 * Tables to migrate:
 * - borrowers
 * - guarantors
 * - donors
 * - depositors
 * - loans (including foreign keys: borrower_id, guarantor1_id, guarantor2_id)
 * - repayments (including foreign key: loan_id)
 * - deposits (including foreign key: depositor_id)
 * - donations (including foreign key: donor_id)
 * - guarantorLoans (including foreign keys)
 * - guarantorLoanRepayments (including foreign key)
 * - blacklist (including foreign key: entity_id)
 * - waitlist (including foreign key: borrower_id)
 * - expenses (including foreign key: borrower_id)
 */
export async function migrateToUUIDs(): Promise<{ migrated: number }> {
  console.log('🔄 Starting UUID migration...')
  console.log('⚠️  This is a major migration that will convert all IDs to UUIDs')
  
  let totalMigrated = 0
  
  try {
    const allData = await exportAllData()
    
    // Step 1: Create ID mapping for all entities
    const idMaps = {
      borrowers: new Map<number, string>(),
      guarantors: new Map<number, string>(),
      donors: new Map<number, string>(),
      depositors: new Map<number, string>(),
      loans: new Map<number, string>(),
      deposits: new Map<number, string>()
    }
    
    // Helper function to generate UUID (with fallback)
    const generateUUID = (): string => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
      // Fallback for older environments
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
    
    // Step 2: Migrate borrowers
    const newBorrowers: any = {}
    for (const [oldId, borrower] of Object.entries(allData.borrowers || {})) {
      const numericId = typeof borrower.id === 'number' ? borrower.id : parseInt(oldId, 10)
      
      // Check if already has UUID (36 chars)
      if (typeof borrower.id === 'string' && borrower.id.length === 36) {
        newBorrowers[borrower.id] = borrower
        idMaps.borrowers.set(numericId, borrower.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.borrowers.set(numericId, newId)
      newBorrowers[newId] = { ...borrower, id: newId }
      totalMigrated++
      console.log(`  ✓ Borrower: ${borrower.first_name} ${borrower.last_name} (${oldId} → ${newId})`)
    }
    allData.borrowers = newBorrowers
    
    // Step 3: Migrate guarantors
    const newGuarantors: any = {}
    for (const [oldId, guarantor] of Object.entries(allData.guarantors || {})) {
      const numericId = typeof guarantor.id === 'number' ? guarantor.id : parseInt(oldId, 10)
      
      if (typeof guarantor.id === 'string' && guarantor.id.length === 36) {
        newGuarantors[guarantor.id] = guarantor
        idMaps.guarantors.set(numericId, guarantor.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.guarantors.set(numericId, newId)
      newGuarantors[newId] = { ...guarantor, id: newId }
      totalMigrated++
      console.log(`  ✓ Guarantor: ${guarantor.first_name} ${guarantor.last_name} (${oldId} → ${newId})`)
    }
    allData.guarantors = newGuarantors
    
    // Step 4: Migrate donors
    const newDonors: any = {}
    for (const [oldId, donor] of Object.entries(allData.donors || {})) {
      const numericId = typeof donor.id === 'number' ? donor.id : parseInt(oldId, 10)
      
      if (typeof donor.id === 'string' && donor.id.length === 36) {
        newDonors[donor.id] = donor
        idMaps.donors.set(numericId, donor.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.donors.set(numericId, newId)
      newDonors[newId] = { ...donor, id: newId }
      totalMigrated++
      console.log(`  ✓ Donor: ${donor.first_name} ${donor.last_name} (${oldId} → ${newId})`)
    }
    allData.donors = newDonors
    
    // Step 5: Migrate depositors
    const newDepositors: any = {}
    for (const [oldId, depositor] of Object.entries(allData.depositors || {})) {
      const numericId = typeof depositor.id === 'number' ? depositor.id : parseInt(oldId, 10)
      
      if (typeof depositor.id === 'string' && depositor.id.length === 36) {
        newDepositors[depositor.id] = depositor
        idMaps.depositors.set(numericId, depositor.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.depositors.set(numericId, newId)
      newDepositors[newId] = { ...depositor, id: newId }
      totalMigrated++
      console.log(`  ✓ Depositor: ${depositor.first_name} ${depositor.last_name} (${oldId} → ${newId})`)
    }
    allData.depositors = newDepositors
    
    // Step 6: Migrate loans (with foreign keys)
    const newLoans: any = {}
    for (const [oldId, loan] of Object.entries(allData.loans || {})) {
      const numericId = typeof loan.id === 'number' ? loan.id : parseInt(oldId, 10)
      
      if (typeof loan.id === 'string' && loan.id.length === 36) {
        newLoans[loan.id] = loan
        idMaps.loans.set(numericId, loan.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.loans.set(numericId, newId)
      
      // Update foreign keys
      const newLoan = { ...loan, id: newId }
      if (loan.borrower_id && idMaps.borrowers.has(loan.borrower_id)) {
        newLoan.borrower_id = idMaps.borrowers.get(loan.borrower_id)
      }
      if (loan.guarantor1_id && idMaps.guarantors.has(loan.guarantor1_id)) {
        newLoan.guarantor1_id = idMaps.guarantors.get(loan.guarantor1_id)
      }
      if (loan.guarantor2_id && idMaps.guarantors.has(loan.guarantor2_id)) {
        newLoan.guarantor2_id = idMaps.guarantors.get(loan.guarantor2_id)
      }
      
      newLoans[newId] = newLoan
      totalMigrated++
    }
    allData.loans = newLoans
    
    // Step 7: Migrate repayments (with foreign key: loan_id)
    const newRepayments: any = {}
    for (const [oldId, repayment] of Object.entries(allData.repayments || {})) {
      const numericId = typeof repayment.id === 'number' ? repayment.id : parseInt(oldId, 10)
      
      if (typeof repayment.id === 'string' && repayment.id.length === 36) {
        newRepayments[repayment.id] = repayment
        continue
      }
      
      const newId = generateUUID()
      const newRepayment = { ...repayment, id: newId }
      
      // Update foreign key
      if (repayment.loan_id && idMaps.loans.has(repayment.loan_id)) {
        newRepayment.loan_id = idMaps.loans.get(repayment.loan_id)
      }
      
      newRepayments[newId] = newRepayment
      totalMigrated++
    }
    allData.repayments = newRepayments
    
    // Step 8: Migrate deposits (with foreign key: depositor_id)
    const newDeposits: any = {}
    for (const [oldId, deposit] of Object.entries(allData.deposits || {})) {
      const numericId = typeof deposit.id === 'number' ? deposit.id : parseInt(oldId, 10)
      
      if (typeof deposit.id === 'string' && deposit.id.length === 36) {
        newDeposits[deposit.id] = deposit
        idMaps.deposits.set(numericId, deposit.id)
        continue
      }
      
      const newId = generateUUID()
      idMaps.deposits.set(numericId, newId)
      const newDeposit = { ...deposit, id: newId }
      
      // Update foreign key
      if (deposit.depositor_id && idMaps.depositors.has(deposit.depositor_id)) {
        newDeposit.depositor_id = idMaps.depositors.get(deposit.depositor_id)
      }
      
      newDeposits[newId] = newDeposit
      totalMigrated++
    }
    allData.deposits = newDeposits
    
    // Step 9: Migrate donations (with foreign key: donor_id)
    const newDonations: any = {}
    for (const [oldId, donation] of Object.entries(allData.donations || {})) {
      const numericId = typeof donation.id === 'number' ? donation.id : parseInt(oldId, 10)
      
      if (typeof donation.id === 'string' && donation.id.length === 36) {
        newDonations[donation.id] = donation
        continue
      }
      
      const newId = generateUUID()
      const newDonation = { ...donation, id: newId }
      
      // Update foreign key
      if (donation.donor_id && idMaps.donors.has(donation.donor_id)) {
        newDonation.donor_id = idMaps.donors.get(donation.donor_id)
      }
      
      newDonations[newId] = newDonation
      totalMigrated++
    }
    allData.donations = newDonations
    
    // Step 10: Migrate guarantorLoans (with foreign keys: guarantor_id, loan_id)
    const newGuarantorLoans: any = {}
    for (const [oldId, gl] of Object.entries(allData.guarantorLoans || {})) {
      const numericId = typeof gl.id === 'number' ? gl.id : parseInt(oldId, 10)
      
      if (typeof gl.id === 'string' && gl.id.length === 36) {
        newGuarantorLoans[gl.id] = gl
        continue
      }
      
      const newId = generateUUID()
      const newGL = { ...gl, id: newId }
      
      // Update foreign keys
      if (gl.guarantor_id && idMaps.guarantors.has(gl.guarantor_id)) {
        newGL.guarantor_id = idMaps.guarantors.get(gl.guarantor_id)
      }
      if (gl.loan_id && idMaps.loans.has(gl.loan_id)) {
        newGL.loan_id = idMaps.loans.get(gl.loan_id)
      }
      
      newGuarantorLoans[newId] = newGL
      totalMigrated++
    }
    allData.guarantorLoans = newGuarantorLoans
    
    // Step 11: Migrate guarantorLoanRepayments (with foreign key: guarantor_loan_id)
    const newGuarantorLoanRepayments: any = {}
    for (const [oldId, glr] of Object.entries(allData.guarantorLoanRepayments || {})) {
      const numericId = typeof glr.id === 'number' ? glr.id : parseInt(oldId, 10)
      
      if (typeof glr.id === 'string' && glr.id.length === 36) {
        newGuarantorLoanRepayments[glr.id] = glr
        continue
      }
      
      const newId = generateUUID()
      const newGLR = { ...glr, id: newId }
      
      // Update foreign key - need to find the new guarantor loan ID
      if (glr.guarantor_loan_id) {
        // Find the old guarantor loan ID from the old guarantorLoans
        const oldGuarantorLoans = Object.values(allData.guarantorLoans || {})
        const matchingGL = oldGuarantorLoans.find((gl: any) => String(gl.id) === String(glr.guarantor_loan_id))
        if (matchingGL) {
          newGLR.guarantor_loan_id = matchingGL.id // Use the new UUID
        }
      }
      
      newGuarantorLoanRepayments[newId] = newGLR
      totalMigrated++
    }
    allData.guarantorLoanRepayments = newGuarantorLoanRepayments
    
    // Step 12: Migrate guarantorRefunds (with foreign key: guarantor_loan_id)
    const newGuarantorRefunds: any = {}
    for (const [oldId, refund] of Object.entries(allData.guarantorRefunds || {})) {
      const numericId = typeof refund.id === 'number' ? refund.id : parseInt(oldId, 10)
      
      if (typeof refund.id === 'string' && refund.id.length === 36) {
        newGuarantorRefunds[refund.id] = refund
        continue
      }
      
      const newId = generateUUID()
      const newRefund = { ...refund, id: newId }
      
      // Update foreign key
      if (refund.guarantor_loan_id) {
        const oldGuarantorLoans = Object.values(allData.guarantorLoans || {})
        const matchingGL = oldGuarantorLoans.find((gl: any) => String(gl.id) === String(refund.guarantor_loan_id))
        if (matchingGL) {
          newRefund.guarantor_loan_id = matchingGL.id
        }
      }
      
      newGuarantorRefunds[newId] = newRefund
      totalMigrated++
    }
    allData.guarantorRefunds = newGuarantorRefunds
    
    // Step 13: Migrate blacklist (with foreign key: entity_id - could be borrower/guarantor/donor/depositor)
    const newBlacklist: any = {}
    for (const [oldId, bl] of Object.entries(allData.blacklist || {})) {
      const numericId = typeof bl.id === 'number' ? bl.id : parseInt(oldId, 10)
      
      if (typeof bl.id === 'string' && bl.id.length === 36) {
        newBlacklist[bl.id] = bl
        continue
      }
      
      const newId = generateUUID()
      const newBL = { ...bl, id: newId }
      
      // Update entity_id based on entity_type
      if (bl.entity_id) {
        const entityId = typeof bl.entity_id === 'number' ? bl.entity_id : parseInt(bl.entity_id, 10)
        
        if (bl.entity_type === 'borrower' && idMaps.borrowers.has(entityId)) {
          newBL.entity_id = idMaps.borrowers.get(entityId)
        } else if (bl.entity_type === 'guarantor' && idMaps.guarantors.has(entityId)) {
          newBL.entity_id = idMaps.guarantors.get(entityId)
        } else if (bl.entity_type === 'donor' && idMaps.donors.has(entityId)) {
          newBL.entity_id = idMaps.donors.get(entityId)
        } else if (bl.entity_type === 'depositor' && idMaps.depositors.has(entityId)) {
          newBL.entity_id = idMaps.depositors.get(entityId)
        }
      }
      
      newBlacklist[newId] = newBL
      totalMigrated++
    }
    allData.blacklist = newBlacklist
    
    // Step 14: Migrate waitlist (with foreign key: borrower_id)
    const newWaitlist: any = {}
    for (const [oldId, wl] of Object.entries(allData.waitlist || {})) {
      const numericId = typeof wl.id === 'number' ? wl.id : parseInt(oldId, 10)
      
      if (typeof wl.id === 'string' && wl.id.length === 36) {
        newWaitlist[wl.id] = wl
        continue
      }
      
      const newId = generateUUID()
      const newWL = { ...wl, id: newId }
      
      // Update foreign key
      if (wl.borrower_id && idMaps.borrowers.has(wl.borrower_id)) {
        newWL.borrower_id = idMaps.borrowers.get(wl.borrower_id)
      }
      
      newWaitlist[newId] = newWL
      totalMigrated++
    }
    allData.waitlist = newWaitlist
    
    // Step 15: Migrate expenses (with foreign key: borrower_id - optional)
    const newExpenses: any = {}
    for (const [oldId, exp] of Object.entries(allData.expenses || {})) {
      const numericId = typeof exp.id === 'number' ? exp.id : parseInt(oldId, 10)
      
      if (typeof exp.id === 'string' && exp.id.length === 36) {
        newExpenses[exp.id] = exp
        continue
      }
      
      const newId = generateUUID()
      const newExp = { ...exp, id: newId }
      
      // Update foreign key if exists
      if (exp.borrower_id && idMaps.borrowers.has(exp.borrower_id)) {
        newExp.borrower_id = idMaps.borrowers.get(exp.borrower_id)
      }
      
      newExpenses[newId] = newExp
      totalMigrated++
    }
    allData.expenses = newExpenses
    
    // Step 16: Migrate depositWithdrawals (with foreign key: deposit_id)
    const newDepositWithdrawals: any = {}
    for (const [oldId, dw] of Object.entries(allData.depositWithdrawals || {})) {
      const numericId = typeof dw.id === 'number' ? dw.id : parseInt(oldId, 10)
      
      if (typeof dw.id === 'string' && dw.id.length === 36) {
        newDepositWithdrawals[dw.id] = dw
        continue
      }
      
      const newId = generateUUID()
      const newDW = { ...dw, id: newId }
      
      // Update foreign key
      if (dw.deposit_id && idMaps.deposits.has(dw.deposit_id)) {
        newDW.deposit_id = idMaps.deposits.get(dw.deposit_id)
      }
      
      newDepositWithdrawals[newId] = newDW
      totalMigrated++
    }
    allData.depositWithdrawals = newDepositWithdrawals
    
    // Step 17: Migrate contacts (if exists - this is a new table)
    const newContacts: any = {}
    for (const [oldId, contact] of Object.entries(allData.contacts || {})) {
      const numericId = typeof contact.id === 'number' ? contact.id : parseInt(oldId, 10)
      
      if (typeof contact.id === 'string' && contact.id.length === 36) {
        newContacts[contact.id] = contact
        continue
      }
      
      const newId = generateUUID()
      newContacts[newId] = { ...contact, id: newId }
      totalMigrated++
    }
    allData.contacts = newContacts
    
    console.log(`✅ UUID Migration: Converting ${totalMigrated} records`)
    
    // Save the migrated data
    if (totalMigrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v11 complete: ${totalMigrated} records migrated to UUIDs`)
    } else {
      console.log(`✅ Migration v11: All records already have UUIDs`)
    }
    
  } catch (error) {
    console.error('❌ UUID Migration failed:', error)
    throw error
  }
  
  return { migrated: totalMigrated }
}

/**
 * Migration v12: Add receipt numbers to existing donations
 * 
 * Existing donations use their ID as receipt number which can be a long UUID.
 * This migration adds sequential receipt numbers in format 000001, 000002, etc.
 * 
 * IMPORTANT: This migration re-numbers ALL donations to ensure no duplicates.
 * Donations that already have numbers will be renumbered based on their creation order.
 */
export async function migrateDonationReceiptNumbers(): Promise<{ migrated: number }> {
  console.log('🔄 Starting donation receipt numbers migration...')
  
  let migrated = 0
  
  try {
    const allData = await exportAllData()
    const donations = Object.values(allData.donations || {})
    
    if (donations.length === 0) {
      console.log('✅ Migration v12: No donations found')
      return { migrated: 0 }
    }
    
    // Sort donations by creation date (oldest first)
    const sortedDonations = donations.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at || a.donation_date).getTime()
      const dateB = new Date(b.created_at || b.donation_date).getTime()
      return dateA - dateB
    })
    
    console.log(`[MIGRATION v12] Found ${sortedDonations.length} donations to process`)
    
    // Re-assign sequential receipt numbers to ALL donations (even those with existing numbers)
    // This ensures no duplicates
    for (let i = 0; i < sortedDonations.length; i++) {
      const donation: any = sortedDonations[i]
      const newReceiptNumber = String(i + 1).padStart(6, '0') // Format: 000001, 000002, etc.
      
      // Check if the receipt number needs updating
      if (!donation.receipt_number || donation.receipt_number !== newReceiptNumber) {
        const oldReceipt = donation.receipt_number || 'none'
        donation.receipt_number = newReceiptNumber
        allData.donations[donation.id] = donation
        migrated++
        console.log(`  ✓ Donation ${donation.id.toString().substring(0, 8)}: ${oldReceipt} → #${newReceiptNumber}`)
      }
    }
    
    if (migrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v12: Updated receipt numbers for ${migrated} donations`)
    } else {
      console.log('✅ Migration v12: All donations already have correct sequential receipt numbers')
    }
    
  } catch (error) {
    console.error('Error in donation receipt numbers migration:', error)
  }
  
  return { migrated }
}

/**
 * Migration v13: Add recurring_series_id to recurring loan families
 * 
 * מוסיף שדה recurring_series_id להלוואות מחזוריות קיימות.
 * מקבץ הלוואות לפי borrower_id + recurring_day + הגדרות נוספות,
 * ומקצה להן UUID משותף.
 */
export async function migrateRecurringSeriesId(): Promise<{ migrated: number }> {
  console.log('🔄 Starting recurring_series_id migration...')
  
  let migrated = 0
  
  try {
    const allData = await exportAllData()
    const loans = allData.loans as any[]
    
    if (loans.length === 0) {
      console.log('✅ Migration v13: No loans found')
      return { migrated: 0 }
    }
    
    // מיפוי הלוואות לקבוצות (כמו במיגרציה v3)
    const recurringLoansByBorrower: { [key: string]: any[] } = {}
    
    for (const loan of loans) {
      // רק הלוואות מחזוריות
      if (loan.is_recurring !== 1 || loan.is_deleted) continue
      
      const key = `${loan.borrower_id}_${loan.recurring_day}_${loan.amount}_${loan.loan_type}`
      
      if (!recurringLoansByBorrower[key]) {
        recurringLoansByBorrower[key] = []
      }
      recurringLoansByBorrower[key].push(loan)
    }
    
    // עדכון כל קבוצה עם recurring_series_id משותף
    for (const key in recurringLoansByBorrower) {
      const group = recurringLoansByBorrower[key]
      
      // מיון לפי תאריך ההלוואה
      group.sort((a: any, b: any) => 
        new Date(a.loan_date).getTime() - new Date(b.loan_date).getTime()
      )
      
      // בדיקה: האם כבר יש series_id באחת מההלוואות?
      const existingSeriesId = group.find((l: any) => l.recurring_series_id)?.recurring_series_id
      const seriesId = existingSeriesId || crypto.randomUUID()
      
      // עדכון כל ההלוואות בקבוצה
      for (const loan of group) {
        if (!loan.recurring_series_id) {
          loan.recurring_series_id = seriesId
          migrated++
        }
      }
    }
    
    if (migrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v13: Added recurring_series_id to ${migrated} loans`)
    } else {
      console.log('✅ Migration v13: All recurring loans already have series_id')
    }
    
  } catch (error) {
    console.error('Error in recurring_series_id migration:', error)
  }
  
  return { migrated }
}

/**
 * Migration v14: Fix recurring repayment numbers for loan families
 * 
 * מתקן מספור פירעונות מחזוריים שנפגעו מהבאג:
 * כשהלוואה היא גם מחזורית וגם עם פירעון אוטומטי, 
 * כל הפירעונות קיבלו מספר 1 במקום 1,2,3...
 * 
 * המיגרציה:
 * 1. מזהה משפחות הלוואות (לפי recurring_series_id או borrower_id+recurring_day)
 * 2. אוספת את כל הפירעונות מכל ההלוואות במשפחה
 * 3. ממספרת אותם מחדש לפי סדר תאריכים (1,2,3...)
 */
export async function fixRecurringRepaymentNumbersForFamilies(): Promise<{ 
  migrated: number; 
  families: number 
}> {
  console.log('🔄 Starting recurring repayment numbers fix for loan families...')
  
  let migrated = 0
  let families = 0
  
  try {
    const allData = await exportAllData()
    const loans = allData.loans as any[]
    const repayments = allData.repayments as any[]
    
    if (loans.length === 0 || repayments.length === 0) {
      console.log('✅ Migration v14: No loans/repayments found')
      return { migrated: 0, families: 0 }
    }
    
    // מיפוי הלוואות לפי משפחות
    const loanFamilies: { [seriesId: string]: any[] } = {}
    
    for (const loan of loans) {
      // רק הלוואות מחזוריות עם פירעון אוטומטי
      if (loan.is_recurring !== 1 || loan.auto_repayment !== 1 || loan.is_deleted) continue
      
      // זיהוי משפחה
      let familyKey: string
      if (loan.recurring_series_id) {
        familyKey = loan.recurring_series_id
      } else {
        // נופל חזרה לזיהוי לפי borrower+day (תואימות אחורה)
        familyKey = `fallback_${loan.borrower_id}_${loan.recurring_day}_${loan.auto_repayment}`
      }
      
      if (!loanFamilies[familyKey]) {
        loanFamilies[familyKey] = []
      }
      loanFamilies[familyKey].push(loan)
    }
    
    // עיבוד כל משפחה
    for (const familyKey in loanFamilies) {
      const family = loanFamilies[familyKey]
      const familyLoanIds = family.map((l: any) => l.id)
      
      // איסוף כל הפירעונות של המשפחה
      const familyRepayments = repayments.filter((r: any) =>
        familyLoanIds.includes(r.loan_id) &&
        r.is_recurring === 1 &&
        !r.is_deleted
      )
      
      if (familyRepayments.length === 0) continue
      
      // מיון לפי תאריך
      familyRepayments.sort((a: any, b: any) =>
        new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      )
      
      // חישוב סה"כ פירעונות צפויים
      const totalAmount = family.reduce((sum: number, l: any) => sum + l.amount, 0)
      const repaymentAmount = family[0].repayment_amount
      const totalCount = repaymentAmount > 0 ? Math.ceil(totalAmount / repaymentAmount) : undefined
      
      // עדכון מספור
      let needsUpdate = false
      familyRepayments.forEach((r: any, index: number) => {
        const correctNumber = index + 1
        if (r.recurring_repayment_number !== correctNumber || 
            r.recurring_repayment_count !== totalCount) {
          r.recurring_repayment_number = correctNumber
          r.recurring_repayment_count = totalCount
          needsUpdate = true
          migrated++
        }
      })
      
      if (needsUpdate) {
        families++
        console.log(`[Migration v14] Fixed family ${familyKey}: ${familyRepayments.length} repayments`)
      }
    }
    
    if (migrated > 0) {
      await importAllData(allData)
      console.log(`✅ Migration v14: Fixed ${migrated} repayments across ${families} loan families`)
    } else {
      console.log('✅ Migration v14: All repayment numbers are correct')
    }
    
  } catch (error) {
    console.error('Error in recurring repayment numbers fix:', error)
  }
  
  return { migrated, families }
}

/**
 * Run all pending migrations
 */
export async function runPendingMigrations(): Promise<void> {
  const currentVersion = getMigrationVersion()
  
  console.log(`🔍 Current migration version: ${currentVersion}, Target: ${CURRENT_MIGRATION_VERSION}`)
  
  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    console.log('✅ All migrations up to date')
    return
  }
  
  // Migration v1: Guarantor Repayments
  if (currentVersion < 1) {
    if (await needsGuarantorRepaymentsMigration()) {
      console.log('📋 Running migration v1: Guarantor Repayments')
      const result = await migrateGuarantorRepayments()
      console.log(`✅ Migration v1 complete: ${result.migrated} records migrated`)
    } else {
      console.log('⏭️ Migration v1: No data to migrate')
    }
  }
  
  // Migration v2: Clean Old Refund Notes
  if (currentVersion < 2) {
    console.log('📋 Running migration v2: Clean Old Refund Notes')
    const cleanupResult = await cleanOldRefundNotes()
    console.log(`✅ Migration v2 complete: ${cleanupResult.cleaned} records cleaned`)
  }
  
  // Migration v3: Recurring Loan Numbers
  if (currentVersion < 3) {
    if (await needsRecurringLoanNumbersMigration()) {
      console.log('📋 Running migration v3: Recurring Loan Numbers')
      const result = await migrateRecurringLoanNumbers()
      console.log(`✅ Migration v3 complete: ${result.migrated} records migrated`)
    } else {
      console.log('⏭️ Migration v3: No data to migrate')
    }
  }
  
  // Migration v4: Recurring Repayment Numbers
  if (currentVersion < 4) {
    if (await needsRecurringRepaymentNumbersMigration()) {
      console.log('📋 Running migration v4: Recurring Repayment Numbers')
      const result = await migrateRecurringRepaymentNumbers()
      console.log(`✅ Migration v4 complete: ${result.migrated} records migrated`)
    } else {
      console.log('⏭️ Migration v4: No data to migrate')
    }
  }
  
  // Migration v5: Force Update All Recurring Repayments
  if (currentVersion < 5) {
    console.log('📋 Running migration v5: Force Update All Recurring Repayments')
    const result = await migrateRecurringRepaymentNumbers()
    console.log(`✅ Migration v5 complete: ${result.migrated} records migrated`)
  }
  
  // Migration v6: Fix Deposit Status and Recurring Numbers
  if (currentVersion < 6) {
    console.log('📋 Running migration v6: Fix Deposit Status and Recurring Numbers')
    const result = await migrateDepositStatusAndRecurring()
    console.log(`✅ Migration v6 complete: ${result.migrated} deposits fixed`)
  }
  
  // Migration v7: Re-run deposit fix to clean up is_recurring flag
  if (currentVersion < 7) {
    console.log('📋 Running migration v7: Clean up is_recurring flag')
    const result = await migrateDepositStatusAndRecurring()
    console.log(`✅ Migration v7 complete: ${result.migrated} deposits fixed`)
  }
  
  // Migration v8: Add total_refunded to guarantor loans
  if (currentVersion < 8) {
    console.log('📋 Running migration v8: Add total_refunded to guarantor loans')
    const result = await migrateGuarantorRefunds()
    console.log(`✅ Migration v8 complete: ${result.migrated} guarantor loans updated`)
  }
  
  // Migration v9: Remove duplicate blacklist entries
  if (currentVersion < 9) {
    console.log('📋 Running migration v9: Remove duplicate blacklist entries')
    const result = await removeDuplicateBlacklistEntries()
    console.log(`✅ Migration v9 complete: ${result.removed} duplicates removed`)
  }
  
  // Migration v10: Force re-run duplicate blacklist cleanup
  if (currentVersion < 10) {
    console.log('📋 Running migration v10: Force re-run duplicate blacklist cleanup')
    const result = await removeDuplicateBlacklistEntries()
    console.log(`✅ Migration v10 complete: ${result.removed} duplicates removed`)
  }
  
  // Migration v11: Add UUIDs to all existing records
  if (currentVersion < 11) {
    console.log('📋 Running migration v11: Add UUIDs to all existing records')
    const result = await migrateToUUIDs()
    console.log(`✅ Migration v11 complete: ${result.migrated} records migrated`)
  }
  
  // Migration v12: Add receipt numbers to existing donations
  if (currentVersion < 12) {
    console.log('📋 Running migration v12: Add receipt numbers to donations')
    const result = await migrateDonationReceiptNumbers()
    console.log(`✅ Migration v12 complete: ${result.migrated} donations updated`)
  }
  
  // Migration v13: Add recurring_series_id to recurring loans
  if (currentVersion < 13) {
    console.log('📋 Running migration v13: Add recurring_series_id to recurring loans')
    const result = await migrateRecurringSeriesId()
    console.log(`✅ Migration v13 complete: ${result.migrated} loans updated`)
  }
  
  // Migration v14: Fix recurring repayment numbers for loan families
  if (currentVersion < 14) {
    console.log('📋 Running migration v14: Fix recurring repayment numbers for loan families')
    const result = await fixRecurringRepaymentNumbersForFamilies()
    console.log(`✅ Migration v14 complete: ${result.migrated} repayments fixed across ${result.families} families`)
  }
  
  // Update migration version
  setMigrationVersion(CURRENT_MIGRATION_VERSION)
  console.log(`✅ All migrations complete. Version updated to ${CURRENT_MIGRATION_VERSION}`)
}
