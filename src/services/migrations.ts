// Migration scripts for database schema changes

import { guarantorLoansService, guarantorLoanRepaymentsService, exportAllData, importAllData, stores } from './database'

// Migration version tracking
const MIGRATION_VERSION_KEY = 'migration_version'
const CURRENT_MIGRATION_VERSION = 2 // Increment this when adding new migrations

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
  
  // Update migration version
  setMigrationVersion(CURRENT_MIGRATION_VERSION)
  console.log(`✅ All migrations complete. Version updated to ${CURRENT_MIGRATION_VERSION}`)
}
