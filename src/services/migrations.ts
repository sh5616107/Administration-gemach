// Migration scripts for database schema changes

import { guarantorLoansService, guarantorLoanRepaymentsService, loansService, exportAllData, importAllData, stores } from './database'

// Migration version tracking
const MIGRATION_VERSION_KEY = 'migration_version'
const CURRENT_MIGRATION_VERSION = 8 // Increment this when adding new migrations

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
    const recurringLoansByBorrower = new Map<number, any[]>()
    
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
      
      // חישוב סה"כ פירעונות צפויים
      const totalCount = Math.ceil(loan.amount / loan.repayment_amount)
      
      // עדכון כל פירעון עם המספר שלו
      for (let i = 0; i < sortedRepayments.length; i++) {
        const repayment = sortedRepayments[i]
        
        if (!repayment.recurring_repayment_number) {
          await db.run(
            'UPDATE repayments SET is_recurring = ?, recurring_repayment_number = ?, recurring_repayment_count = ? WHERE id = ?',
            [1, i + 1, totalCount, repayment.id]
          )
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
  
  // Update migration version
  setMigrationVersion(CURRENT_MIGRATION_VERSION)
  console.log(`✅ All migrations complete. Version updated to ${CURRENT_MIGRATION_VERSION}`)
}
