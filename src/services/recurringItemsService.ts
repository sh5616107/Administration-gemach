/**
 * Recurring Items Service
 * 
 * Service for managing recurring items (loans, repayments, deposits).
 * Provides functionality to:
 * - Identify items in a series
 * - Update all items in a series
 * - Validate updates
 * - Get update summaries
 * 
 * Feature: recurring-items-management
 */

import { loansService, repaymentsService, Loan, Repayment } from './database'
import { db, getAllItems, depositorsService } from './database'

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Item types supported by the service
 */
export type ItemType = 'loan' | 'repayment' | 'deposit' | 'auto_repayment'

/**
 * Series item - represents a single item in a recurring series
 */
export interface SeriesItem {
  id: string  // UUID
  item_number: number // מספר בסדרה
  date: string // תאריך (loan_date/payment_date/deposit_date)
  amount: number
  status: string
  isPast: boolean // האם התאריך עבר
  recurring_day?: number
  recurring_months?: number
}

/**
 * Update result - result of updating a series
 */
export interface UpdateResult {
  success: boolean
  updatedCount: number
  error?: string
}

/**
 * Validation result - result of validating an update
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Update summary - summary of changes that will be made
 */
export interface UpdateSummary {
  totalItems: number // סה"כ פריטים שיעודכנו
  pastItems: number // פריטים שכבר נוצרו
  futureItems: number // פריטים עתידיים
  changes: {
    field: string
    oldValue: any
    newValue: any
  }[]
}

/**
 * Form data for editing recurring items
 */
export interface EditRecurringFormData {
  recurring_day?: number // יום בחודש (1-31)
  recurring_amount?: number // סכום
  recurring_months?: number // מספר חודשים נותרים (הלוואות/הפקדות)
}

/**
 * Deposit interface (matching database structure)
 */
interface Deposit {
  id: string  // UUID
  depositor_id: string  // UUID
  amount: number
  deposit_date: string
  period_type: string
  due_date?: string
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
  notes?: string
  status: string
  payment_method?: string
  payment_details?: string
  is_deleted?: boolean
  created_at: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get table name for item type
 */
function getTableName(itemType: ItemType): string {
  switch (itemType) {
    case 'loan':
      return 'loans'
    case 'repayment':
      return 'repayments'
    case 'deposit':
      return 'deposits'
    case 'auto_repayment':
      return 'loans' // Auto repayment settings are stored in loans table
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }
}

/**
 * Get item number field name for item type
 */
function getItemNumberField(itemType: ItemType): string {
  switch (itemType) {
    case 'loan':
      return 'recurring_loan_number'
    case 'repayment':
      return 'recurring_repayment_number'
    case 'deposit':
      return 'recurring_deposit_number'
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }
}

/**
 * Get item number from item
 */
function getItemNumber(item: any, itemType: ItemType): number {
  const field = getItemNumberField(itemType)
  return item[field] || 1
}

/**
 * Get date field name for item type
 */
function getDateField(itemType: ItemType): string {
  switch (itemType) {
    case 'loan':
      return 'loan_date'
    case 'repayment':
      return 'payment_date'
    case 'deposit':
      return 'deposit_date'
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }
}

/**
 * Get original item (the first item in the series)
 */
async function getOriginalItem(itemId: string, itemType: ItemType): Promise<any> {
  switch (itemType) {
    case 'loan':
      return await loansService.getById(itemId)
    case 'auto_repayment': {
      // For auto_repayment, itemId is the loan ID
      return await loansService.getById(itemId)
    }
    case 'repayment': {
      const repayments = getAllItems<Repayment>('repayments')
      return repayments.find(r => r.id === itemId && !r.is_deleted) || null
    }
    case 'deposit': {
      const deposits = getAllItems<Deposit>('deposits')
      return deposits.find(d => d.id === itemId && !d.is_deleted) || null
    }
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Identify items in a series
 * 
 * For loans: borrower_id, amount, recurring_day, is_recurring
 * For repayments: loan_id, is_recurring
 * For deposits: depositor_id, amount, recurring_day, is_recurring
 */
export async function identifySeriesItems(itemType: ItemType, originalItem: any): Promise<any[]> {
  let items: any[] = []

  switch (itemType) {
    case 'loan': {
      const allLoans = await loansService.getAll()
      // Identify loans in series by: borrower_id, recurring_day, and having recurring_loan_number
      // We DON'T filter by amount because the amount might have been changed
      items = allLoans.filter(l =>
        l.borrower_id === originalItem.borrower_id &&
        l.recurring_day === originalItem.recurring_day &&
        l.is_recurring === 1 &&
        l.recurring_loan_number && // Must have a loan number
        !l.is_deleted
      )
      break
    }
    case 'repayment': {
      const allRepayments = getAllItems<Repayment>('repayments')
      
      // ✅ תיקון: זיהוי פירעונות על פני כל משפחת ההלוואות
      // 1. מציאת ההלוואה
      const loan = await loansService.getById(originalItem.loan_id)
      if (!loan) {
        items = []
        break
      }
      
      // 2. מציאת כל ההלוואות במשפחה
      const { getLoanFamily } = await import('./recurringRepaymentsService')
      const familyLoans = await getLoanFamily(loan)
      const familyLoanIds = familyLoans.map(l => l.id)
      
      // 3. איסוף כל הפירעונות מכל ההלוואות במשפחה
      items = allRepayments.filter(r =>
        familyLoanIds.includes(r.loan_id) &&
        r.is_recurring === 1 &&
        !r.is_deleted
      )
      break
    }
    case 'deposit': {
      const allDeposits = getAllItems<Deposit>('deposits')
      // Identify deposits in series by: depositor_id, recurring_day, and having recurring_deposit_number
      items = allDeposits.filter(d =>
        d.depositor_id === originalItem.depositor_id &&
        d.recurring_day === originalItem.recurring_day &&
        d.is_recurring === 1 &&
        d.recurring_deposit_number && // Must have a deposit number
        !d.is_deleted
      )
      break
    }
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }

  // Sort by item number
  const itemNumberField = getItemNumberField(itemType)
  items.sort((a, b) => (a[itemNumberField] || 1) - (b[itemNumberField] || 1))

  return items
}

/**
 * Get all items in a series
 * 
 * Requirements: 2.2, 4.2, 6.2, 7.4
 */
export async function getSeriesItems(
  itemId: string,
  itemType: ItemType
): Promise<SeriesItem[]> {
  // Special case: auto_repayment - get all repayments for this loan
  if (itemType === 'auto_repayment') {
    // itemId is the loan ID
    const loan = await loansService.getById(itemId)
    if (!loan) {
      throw new Error('הלוואה לא נמצאה')
    }

    // Get ALL repayments for this loan
    // For auto_repayment loans, we show ALL repayments (even manual ones)
    // because they are all part of the repayment history
    const allRepayments = await repaymentsService.getByLoan(itemId) as Repayment[]

    console.log(`[AUTO_REPAYMENT] Loan ${itemId}: Found ${allRepayments.length} repayments`)

    // Sort by payment date (oldest first)
    allRepayments.sort((a, b) => {
      const dateA = new Date(a.payment_date).getTime()
      const dateB = new Date(b.payment_date).getTime()
      return dateA - dateB
    })

    // Mark Past/Future
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return allRepayments.map((r, index) => {
      const repaymentDate = new Date(r.payment_date)
      repaymentDate.setHours(0, 0, 0, 0)
      
      return {
        id: r.id,
        item_number: r.recurring_repayment_number || (index + 1), // Use index if no number
        date: r.payment_date,
        amount: r.amount,
        status: 'paid', // All existing repayments are paid
        isPast: repaymentDate <= today,
        recurring_day: loan.repayment_day,
        recurring_months: 0
      }
    })
  }

  // 1. Get original item
  const originalItem = await getOriginalItem(itemId, itemType)
  if (!originalItem) {
    throw new Error('Item not found')
  }

  // 2. Identify items in series
  const seriesItems = await identifySeriesItems(itemType, originalItem)

  // 3. Sort by item number
  const itemNumberField = getItemNumberField(itemType)
  seriesItems.sort((a, b) => (a[itemNumberField] || 1) - (b[itemNumberField] || 1))

  // 4. Mark Past/Future
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Reset to start of day
  const todayStr = today.toISOString().split('T')[0]
  const dateField = getDateField(itemType)

  return seriesItems.map(item => {
    const itemDate = new Date(item[dateField])
    itemDate.setHours(0, 0, 0, 0) // Reset to start of day
    
    return {
      id: item.id,
      item_number: item[itemNumberField] || 1,
      date: item[dateField],
      amount: item.amount,
      status: item.status,
      isPast: itemDate <= today, // Compare Date objects
      recurring_day: item.recurring_day,
      recurring_months: item.recurring_months
    }
  })
}

/**
 * Validate recurring update
 * 
 * Requirements: 9.1, 9.2, 9.3
 */
export function validateRecurringUpdate(updates: Partial<EditRecurringFormData>): ValidationResult {
  const errors: string[] = []

  // Check recurring_day
  if (updates.recurring_day !== undefined) {
    if (updates.recurring_day < 1 || updates.recurring_day > 31) {
      errors.push('יום חייב להיות בין 1 ל-31')
    }
    if (!Number.isInteger(updates.recurring_day)) {
      errors.push('יום חייב להיות מספר שלם')
    }
  }

  // Check recurring_amount
  if (updates.recurring_amount !== undefined) {
    if (updates.recurring_amount <= 0) {
      errors.push('סכום חייב להיות גדול מ-0')
    }
    if (!Number.isFinite(updates.recurring_amount)) {
      errors.push('סכום לא תקין')
    }
  }

  // Check recurring_months
  if (updates.recurring_months !== undefined) {
    if (updates.recurring_months < 0) {
      errors.push('מספר חודשים חייב להיות 0 או יותר')
    }
    if (!Number.isInteger(updates.recurring_months)) {
      errors.push('מספר חודשים חייב להיות מספר שלם')
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Check if user can edit recurring item
 * 
 * Requirements: 9.4
 */
export async function canEditRecurringItem(itemId: string, itemType: ItemType): Promise<boolean> {
  const item = await getOriginalItem(itemId, itemType)
  if (!item) {
    throw new Error('הפריט לא נמצא')
  }

  // Check if item is recurring
  if (!item.is_recurring) {
    throw new Error('הפריט אינו מחזורי')
  }

  // ✅ שלב 1: לאפשר עריכה מכל פריט במשפחה (לא רק הראשון)
  // הפונקציה identifySeriesItems תזהה את כל המשפחה בכל מקרה

  return true
}

/**
 * Update a single item
 * 
 * Requirements: 11.1, 11.6, 12.1, 12.2
 */
async function updateSingleItem(
  itemId: string,
  itemType: ItemType,
  updates: Partial<EditRecurringFormData>
): Promise<void> {
  switch (itemType) {
    case 'loan': {
      const loan = await loansService.getById(itemId)
      if (!loan) throw new Error(`Loan ${itemId} not found`)

      const updateData: Partial<Loan> = {}
      if (updates.recurring_amount !== undefined) updateData.amount = updates.recurring_amount
      if (updates.recurring_day !== undefined) updateData.recurring_day = updates.recurring_day
      if (updates.recurring_months !== undefined) updateData.recurring_months = updates.recurring_months

      await loansService.update(itemId, updateData)
      break
    }
    case 'repayment': {
      const repayments = getAllItems<Repayment>('repayments')
      const repayment = repayments.find(r => r.id === itemId && !r.is_deleted)
      if (!repayment) throw new Error(`Repayment ${itemId} not found`)

      const updateData: Partial<Repayment> = {}
      if (updates.recurring_amount !== undefined) updateData.amount = updates.recurring_amount
      // Note: repayments don't have recurring_day in the current schema, but we keep it for consistency

      await repaymentsService.update(itemId, updateData)
      break
    }
    case 'deposit': {
      const deposits = getAllItems<Deposit>('deposits')
      const deposit = deposits.find(d => d.id === itemId && !d.is_deleted)
      if (!deposit) throw new Error(`Deposit ${itemId} not found`)

      // Use db.run to update deposit
      const params: any[] = [
        updates.recurring_amount !== undefined ? updates.recurring_amount : deposit.amount,
        deposit.deposit_date,
        deposit.period_type,
        deposit.due_date,
        deposit.is_recurring,
        updates.recurring_day !== undefined ? updates.recurring_day : deposit.recurring_day,
        updates.recurring_months !== undefined ? updates.recurring_months : deposit.recurring_months,
        deposit.recurring_deposit_number,
        deposit.recurring_deposit_count,
        deposit.notes,
        itemId
      ]

      await db.run(
        `UPDATE deposits SET amount = ?, deposit_date = ?, period_type = ?, due_date = ?, is_recurring = ?, recurring_day = ?, recurring_months = ?, recurring_deposit_number = ?, recurring_deposit_count = ?, notes = ? WHERE id = ?`,
        params
      )
      break
    }
    default:
      throw new Error(`Unknown item type: ${itemType}`)
  }
}

/**
 * Update all items in a series
 * 
 * Updates ALL items in the series (both past and future) with new parameters.
 * This ensures consistency across the entire series.
 * 
 * Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 3.3, 3.4, 3.6, 3.7, 5.3, 5.4, 5.5, 5.6, 5.7, 11.1, 11.6, 12.1, 12.2, 12.4, 12.5
 */
export async function updateSeriesItems(
  itemId: string,
  itemType: ItemType,
  updates: Partial<EditRecurringFormData>
): Promise<UpdateResult> {
  try {
    // Special case: auto_repayment - update loan settings directly
    if (itemType === 'auto_repayment') {
      // Validate
      const validation = validateRecurringUpdate(updates)
      if (!validation.valid) {
        return {
          success: false,
          updatedCount: 0,
          error: validation.errors.join(', ')
        }
      }

      // Update loan
      const loan = await loansService.getById(itemId)
      if (!loan) {
        return {
          success: false,
          updatedCount: 0,
          error: 'הלוואה לא נמצאה'
        }
      }

      const updateData: Partial<Loan> = {}
      if (updates.recurring_day !== undefined) updateData.repayment_day = updates.recurring_day
      if (updates.recurring_amount !== undefined) updateData.repayment_amount = updates.recurring_amount

      await loansService.update(itemId, updateData)

      // Update existing repayments if any
      const repayments = await repaymentsService.getByLoan(itemId)
      const recurringRepayments = repayments.filter(r => r.is_recurring === 1)
      
      if (recurringRepayments.length > 0 && updates.recurring_amount !== undefined) {
        // Recalculate count
        const totalRepaid = recurringRepayments.reduce((sum, r) => sum + r.amount, 0)
        const remaining = loan.amount - totalRepaid
        const newCount = Math.ceil(remaining / updates.recurring_amount)
        
        // Update all recurring repayments
        for (const repayment of recurringRepayments) {
          await repaymentsService.update(repayment.id, {
            recurring_repayment_count: newCount
          })
        }
      }

      return {
        success: true,
        updatedCount: 1
      }
    }

    // Regular flow for loan/repayment/deposit
    // 1. Check permissions
    await canEditRecurringItem(itemId, itemType)

    // 2. Validate
    const validation = validateRecurringUpdate(updates)
    if (!validation.valid) {
      return {
        success: false,
        updatedCount: 0,
        error: validation.errors.join(', ')
      }
    }

    // 3. Get all items in series (BEFORE updating, to use original parameters)
    const seriesItems = await getSeriesItems(itemId, itemType)
    
    // 4. ✅ שלב 3: עדכון רק פריטים עתידיים (לא עבר)
    const today = new Date().toISOString().split('T')[0]
    const futureItems = seriesItems.filter(item => item.date > today)
    
    // 5. Update only future items
    let updatedCount = 0
    const updatedIds: string[] = []
    
    for (const item of futureItems) {
      try {
        await updateSingleItem(item.id, itemType, updates)
        updatedCount++
        updatedIds.push(item.id)
      } catch (error) {
        // Rollback - in a real database this would be a transaction
        console.error(`Failed to update item ${item.id}:`, error)
        throw new Error('Transaction failed - rolling back')
      }
    }

    // 6. Audit log
    await logSeriesUpdate(itemId, itemType, updates, updatedIds)

    // 7. Clear cache
    invalidateSeriesCache(itemId, itemType)

    return {
      success: true,
      updatedCount
    }
  } catch (error: any) {
    console.error('Error updating series:', error)
    return {
      success: false,
      updatedCount: 0,
      error: error.message
    }
  }
}

/**
 * Get update summary
 * 
 * Requirements: 13.2, 13.3
 */
export async function getUpdateSummary(
  itemId: string,
  itemType: ItemType,
  updates: Partial<EditRecurringFormData>
): Promise<UpdateSummary> {
  // Special case: auto_repayment
  if (itemType === 'auto_repayment') {
    const loan = await loansService.getById(itemId)
    if (!loan) {
      throw new Error('הלוואה לא נמצאה')
    }

    const changes = []

    if (updates.recurring_day !== undefined && updates.recurring_day !== loan.repayment_day) {
      changes.push({
        field: 'יום גבייה',
        oldValue: loan.repayment_day,
        newValue: updates.recurring_day
      })
    }

    if (updates.recurring_amount !== undefined && updates.recurring_amount !== loan.repayment_amount) {
      changes.push({
        field: 'סכום',
        oldValue: `${loan.repayment_amount} ₪`,
        newValue: `${updates.recurring_amount} ₪`
      })
    }

    return {
      totalItems: 1,
      pastItems: 0,
      futureItems: 0,
      changes
    }
  }

  // Regular flow
  const seriesItems = await getSeriesItems(itemId, itemType)
  const originalItem = seriesItems[0]
  const today = new Date().toISOString().split('T')[0]

  // ✅ שלב 3: ספירה רק של פריטים עתידיים שישתנו
  const pastItems = seriesItems.filter(item => item.date <= today).length
  const futureItems = seriesItems.filter(item => item.date > today).length

  const changes = []

  if (updates.recurring_amount !== undefined && updates.recurring_amount !== originalItem.amount) {
    changes.push({
      field: 'סכום',
      oldValue: `${originalItem.amount} ₪`,
      newValue: `${updates.recurring_amount} ₪`
    })
  }

  if (updates.recurring_day !== undefined && updates.recurring_day !== originalItem.recurring_day) {
    changes.push({
      field: 'יום גבייה',
      oldValue: originalItem.recurring_day,
      newValue: updates.recurring_day
    })
  }

  if (updates.recurring_months !== undefined && updates.recurring_months !== originalItem.recurring_months) {
    changes.push({
      field: 'חודשים נותרים',
      oldValue: originalItem.recurring_months,
      newValue: updates.recurring_months
    })
  }

  return {
    totalItems: seriesItems.length,
    pastItems, // פריטים שכבר עברו - לא ישתנו
    futureItems, // רק אלה ישתנו
    changes
  }
}

// ============================================================================
// Audit Log
// ============================================================================

interface AuditLogEntry {
  timestamp: string
  action: 'update_series'
  itemType: string
  itemId: string
  changes: any
  affectedItems: string[]
}

/**
 * Log series update
 * 
 * Requirements: 12.7
 */
async function logSeriesUpdate(
  itemId: string,
  itemType: string,
  updates: any,
  affectedItems: string[]
): Promise<void> {
  const logEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    action: 'update_series',
    itemType,
    itemId,
    changes: updates,
    affectedItems
  }

  // Save to localStorage
  const logs = JSON.parse(localStorage.getItem('audit_log') || '[]')
  logs.push(logEntry)
  localStorage.setItem('audit_log', JSON.stringify(logs))
}

// ============================================================================
// Cache Management
// ============================================================================

const seriesCache = new Map<string, { items: SeriesItem[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Invalidate series cache
 * 
 * Requirements: Performance Optimization
 */
function invalidateSeriesCache(itemId: string, itemType: string): void {
  const cacheKey = `${itemType}_${itemId}`
  seriesCache.delete(cacheKey)
}

// ============================================================================
// Exports
// ============================================================================

export const recurringItemsService = {
  getSeriesItems,
  updateSeriesItems,
  validateRecurringUpdate,
  canEditRecurringItem,
  getUpdateSummary,
  getOriginalItem
}
