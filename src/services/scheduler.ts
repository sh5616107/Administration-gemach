import { loansService, repaymentsService, db, getAllItems } from './database'

interface Alert {
  id: string
  type: 'recurring_loan' | 'auto_repayment' | 'overdue' | 'recurring_deposit'
  title: string
  message: string
  loan_id: string  // UUID
  borrower_name: string
  amount: number
  created_at: string
  read: boolean
  deposit_id?: number
  depositor_name?: string
}

// Lock mechanism to prevent race conditions
let isAutoCreateRunning = false
const AUTO_CREATE_LOCK_TIMEOUT = 30000 // 30 seconds timeout

// Store missed loans alerts to show to user
interface MissedLoanAlert {
  loanId: string  // UUID
  borrowerName: string
  monthsMissed: number
  lastLoanDate: string
  currentRecurringNumber: number
  totalCount: number
}

/**
 * Get the latest loan in a series (with highest recurring_loan_number)
 * This is used to read updated parameters after editing recurring items
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */
async function getLatestLoanInSeries(loan: any, allLoans: any[]): Promise<any> {
  const seriesLoans = allLoans.filter((l: any) =>
    l.borrower_id === loan.borrower_id &&
    l.amount === loan.amount &&
    l.is_recurring === 1 &&
    !l.is_deleted
  )
  
  // Sort by recurring_loan_number descending and return the first (highest number)
  seriesLoans.sort((a: any, b: any) => (b.recurring_loan_number || 1) - (a.recurring_loan_number || 1))
  
  return seriesLoans[0] || loan
}

/**
 * Get the latest deposit in a series (with highest recurring_deposit_number)
 * This is used to read updated parameters after editing recurring items
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */
async function getLatestDepositInSeries(deposit: any, allDeposits: any[]): Promise<any> {
  const seriesDeposits = allDeposits.filter((d: any) =>
    d.depositor_id === deposit.depositor_id &&
    d.amount === deposit.amount &&
    d.is_recurring === 1 &&
    !d.is_deleted
  )
  
  // Sort by recurring_deposit_number descending and return the first (highest number)
  seriesDeposits.sort((a: any, b: any) => (b.recurring_deposit_number || 1) - (a.recurring_deposit_number || 1))
  
  return seriesDeposits[0] || deposit
}

let missedLoansAlerts: MissedLoanAlert[] = []

// Repair Log - Track repair attempts to prevent duplicate creation
const MISSED_LOANS_REPAIR_KEY = 'gemach_missed_loans_repair_log'

// Get last repair attempt date for a loan
function getLastMissedLoanRepairDate(loanId: string): string | null {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    return log[loanId] || null
  } catch {
    return null
  }
}

// Mark that we attempted to repair a loan today
function markMissedLoanRepairAttempt(loanId: string): void {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    log[loanId] = new Date().toISOString().split('T')[0]
    localStorage.setItem(MISSED_LOANS_REPAIR_KEY, JSON.stringify(log))
  } catch (e) {
    console.error('[REPAIR-LOG] Error marking repair attempt:', e)
  }
}

// Function to get and clear missed loans alerts
export function getMissedLoansAlerts(): MissedLoanAlert[] {
  const alerts = [...missedLoansAlerts]
  missedLoansAlerts = [] // Clear after reading
  return alerts
}

// Check for recurring loans that should be created today
export async function checkRecurringLoans(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date()
  const todayDay = today.getDate()
  const todayStr = today.toISOString().split('T')[0]
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // Get the first day of current month
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  try {
    // Get all loans with recurring enabled and active status
    const recurringLoans = await db.query(`
      SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.id
      WHERE l.is_recurring = 1 
      AND l.recurring_months > 0
      AND l.status = 'active'
    `) as any[]

    for (const loan of recurringLoans) {
      // If recurring day is greater than last day of month, use last day
      const effectiveDay = Math.min(loan.recurring_day || 1, lastDayOfMonth)
      
      // Check if today is the recurring day OR if we're past it
      const shouldAlertToday = effectiveDay === todayDay
      const isPastRecurringDay = todayDay > effectiveDay
      
      if (!shouldAlertToday && !isPastRecurringDay) continue
      
      // Check if we already created a loan this month - check by recurring number
      const currentRecurringNumber = loan.recurring_loan_number || 1
      const nextRecurringNumber = currentRecurringNumber + 1
      
      const existingLoan = await db.query(`
        SELECT id FROM loans 
        WHERE borrower_id = ? 
        AND amount = ? 
        AND loan_date >= ?
        AND loan_date <= ?
        AND is_recurring = 1
        AND recurring_loan_number = ?
      `, [loan.borrower_id, loan.amount, firstDayOfMonth, todayStr, nextRecurringNumber])

      if (existingLoan.length === 0) {
        const alertMessage = isPastRecurringDay
          ? `הלוואה מחזורית באיחור (היתה אמורה להיווצר ב-${effectiveDay} לחודש) - ${loan.borrower_name}`
          : `הגיע מועד הלוואה מחזורית עבור ${loan.borrower_name}`
        
        alerts.push({
          id: `recurring_${loan.id}_${todayStr}`,
          type: 'recurring_loan',
          title: isPastRecurringDay ? 'הלוואה מחזורית באיחור' : 'הלוואה מחזורית',
          message: alertMessage,
          loan_id: loan.id,
          borrower_name: loan.borrower_name,
          amount: loan.amount,
          created_at: todayStr,
          read: false
        })
      }
    }
  } catch (error) {
    console.error('Error checking recurring loans:', error)
  }

  return alerts
}

// Check for auto repayments that should be made today
export async function checkAutoRepayments(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date()
  const todayDay = today.getDate()
  const todayStr = today.toISOString().split('T')[0]
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // Get the first day of current month
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  try {
    // Get all loans with auto repayment enabled
    // CRITICAL: Only process active loans, not planned ones
    const autoRepaymentLoans = await db.query(`
      SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.id
      WHERE l.auto_repayment = 1 
      AND l.repayment_amount > 0
      AND l.repayment_start_date <= ?
      AND l.status = 'active'
      AND (l.remaining > 0 OR l.remaining IS NULL)
    `, [todayStr]) as any[]

    for (const loan of autoRepaymentLoans) {
      // If repayment day is greater than last day of month, use last day
      const effectiveDay = Math.min(loan.repayment_day || 1, lastDayOfMonth)
      
      // Show alert if:
      // 1. Today is the repayment day, OR
      // 2. We're past the repayment day this month and no repayment was made yet this month
      const shouldAlertToday = effectiveDay === todayDay
      const isPastRepaymentDay = todayDay > effectiveDay
      
      // Check if we already made a repayment this month
      const existingRepaymentThisMonth = await db.query(`
        SELECT id FROM repayments 
        WHERE loan_id = ? 
        AND payment_date >= ?
        AND payment_date <= ?
      `, [loan.id, firstDayOfMonth, todayStr])

      if (existingRepaymentThisMonth.length === 0 && (shouldAlertToday || isPastRepaymentDay)) {
        const remaining = loan.remaining || loan.amount
        const repaymentAmount = Math.min(loan.repayment_amount, remaining)

        const alertMessage = isPastRepaymentDay 
          ? `פירעון מחזורי באיחור (היה אמור להתבצע ב-${effectiveDay} לחודש) - ${loan.borrower_name}`
          : `הגיע מועד פירעון מחזורי עבור ${loan.borrower_name}`

        alerts.push({
          id: `repayment_${loan.id}_${todayStr}`,
          type: 'auto_repayment',
          title: isPastRepaymentDay ? 'פירעון מחזורי באיחור' : 'פירעון מחזורי',
          message: alertMessage,
          loan_id: loan.id,
          borrower_name: loan.borrower_name,
          amount: repaymentAmount,
          created_at: todayStr,
          read: false
        })
      }
    }
  } catch (error) {
    console.error('Error checking auto repayments:', error)
  }

  return alerts
}

// Create a recurring loan
export async function createRecurringLoan(originalLoanId: string): Promise<boolean> {
  try {
    const loan = await loansService.getById(originalLoanId) as any
    if (!loan) return false

    // בדיקה: אם אין יותר הלוואות ליצור, לא יוצרים
    if (!loan.recurring_months || loan.recurring_months <= 0) {
      console.log(`[CREATE RECURRING] Loan #${originalLoanId} has no more recurring months (${loan.recurring_months})`)
      return false
    }

    const today = new Date().toISOString().split('T')[0]
    
    // חישוב מספר ההלוואה המחזורית
    // אם ההלוואה המקורית היא 1/12 ויש לה recurring_months=11
    // אז ההלוואה החדשה תהיה 2/12
    const originalNumber = loan.recurring_loan_number || 1
    const totalCount = loan.recurring_loan_count || (loan.recurring_months ? loan.recurring_months + 1 : 1)
    const newLoanNumber = originalNumber + 1
    
    // ✅ תיקון: אם להלוואה המקורית אין recurring_series_id, ליצור לה אחד
    let seriesId = loan.recurring_series_id
    if (!seriesId) {
      // יצירת UUID חדש למשפחה
      seriesId = crypto.randomUUID()
      console.log(`[CREATE RECURRING] Creating new series_id for loan family: ${seriesId}`)
      
      // עדכון ההלוואה המקורית עם ה-series_id החדש
      await loansService.update(originalLoanId, {
        recurring_series_id: seriesId
      })
    }
    
    await loansService.create({
      borrower_id: loan.borrower_id,
      amount: loan.amount,
      loan_date: today,
      loan_type: loan.loan_type,
      due_date: loan.due_date,
      guarantor1_id: loan.guarantor1_id,
      guarantor2_id: loan.guarantor2_id,
      is_recurring: loan.is_recurring,
      recurring_months: loan.recurring_months - 1,
      recurring_day: loan.recurring_day,
      recurring_loan_number: newLoanNumber,
      recurring_loan_count: totalCount,
      recurring_series_id: seriesId,  // ✅ העברת ה-series_id להלוואה החדשה
      auto_repayment: loan.auto_repayment,
      repayment_amount: loan.repayment_amount,
      repayment_day: loan.repayment_day,
      repayment_start_date: loan.repayment_start_date,
      notes: `הלוואה מחזורית מהלוואה #${originalLoanId} (${newLoanNumber}/${totalCount})`
    })

    // Update original loan to reduce recurring months
    // ⚠️ CRITICAL: Do NOT update recurring_loan_number of the original loan!
    // Each loan keeps its own number. Only the NEW loan gets the next number.
    await loansService.update(originalLoanId, {
      recurring_months: loan.recurring_months - 1
    })

    return true
  } catch (error) {
    console.error('Error creating recurring loan:', error)
    return false
  }
}

// Process an auto repayment
export async function processAutoRepayment(loanId: string, amount: number): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Get loan details to calculate repayment number
    const loan = await loansService.getById(loanId) as any
    if (!loan) return false
    
    // Get existing repayments for this loan to calculate the number
    const existingRepayments = await repaymentsService.getByLoan(loanId)
    
    // IMPORTANT: Check if repayment already exists today to prevent duplicates
    // This check now works correctly because getByLoan filters out deleted repayments
    const repaymentToday = existingRepayments.find(r => r.payment_date === today)
    if (repaymentToday) {
      console.log(`[AUTO-REPAYMENT] Repayment already exists today for loan #${loanId}`)
      return false
    }
    
    // Also check in ALL repayments (including deleted) to see if repayment was created and then deleted
    const allRepaymentsIncludingDeleted = getAllItems<any>('repayments').filter(r => r.loan_id === loanId)
    const deletedRepaymentToday = allRepaymentsIncludingDeleted.find(r => 
      r.payment_date === today && 
      r.is_deleted === true &&
      r.notes?.includes('פירעון מחזורי')
    )
    
    if (deletedRepaymentToday) {
      console.log(`[AUTO-REPAYMENT] Repayment was created and then deleted today for loan #${loanId}, not recreating`)
      return false
    }
    
    // ✅ תיקון: שימוש בפונקציה המשותפת לחישוב מספור
    const { calculateNextRepaymentNumber } = await import('./recurringRepaymentsService')
    const { recurringRepaymentNumber, recurringRepaymentCount } = await calculateNextRepaymentNumber(loanId)
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: amount,
      payment_date: today,
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: recurringRepaymentNumber,
      recurring_repayment_count: recurringRepaymentCount
    })

    return true
  } catch (error) {
    console.error('Error processing auto repayment:', error)
    return false
  }
}


// Run all checks on app startup
export async function runStartupChecks(): Promise<Alert[]> {
  console.log('[SCHEDULER] runStartupChecks started')
  
  // First, activate planned loans that have reached their date
  const activatedLoans = await activatePlannedLoans()
  console.log('[SCHEDULER] Activated planned loans:', activatedLoans)
  
  // Activate planned deposits that have reached their date
  const activatedDeposits = await activatePlannedDeposits()
  console.log('[SCHEDULER] Activated planned deposits:', activatedDeposits)
  
  // Auto-create recurring loans that are due today
  await autoCreateRecurringLoans()
  
  // Auto-create recurring deposits that are due today
  await autoCreateRecurringDeposits()
  console.log('[SCHEDULER] Auto-created recurring deposits')
  
  const recurringAlerts = await checkRecurringLoans()
  const repaymentAlerts = await checkAutoRepayments()
  const depositAlerts = await checkRecurringDeposits()
  const plannedLoanAlerts = await checkPlannedLoansToday()
  
  console.log('[SCHEDULER] Alerts:', {
    recurring: recurringAlerts.length,
    repayment: repaymentAlerts.length,
    deposit: depositAlerts.length,
    planned: plannedLoanAlerts.length
  })
  
  return [...recurringAlerts, ...repaymentAlerts, ...depositAlerts, ...plannedLoanAlerts]
}

// Auto-create recurring loans that are due today
export async function autoCreateRecurringLoans(): Promise<void> {
  // Prevent race conditions - only one execution at a time
  if (isAutoCreateRunning) {
    console.log('[AUTO-CREATE] Already running, skipping...')
    return
  }
  
  isAutoCreateRunning = true
  const lockStartTime = Date.now()
  
  // Set timeout to release lock in case of error
  const timeoutId = setTimeout(() => {
    if (isAutoCreateRunning) {
      console.warn('[AUTO-CREATE] Lock timeout reached, forcing release')
      isAutoCreateRunning = false
    }
  }, AUTO_CREATE_LOCK_TIMEOUT)
  
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // Clear previous missed loans alerts
  missedLoansAlerts = []
  
  try {
    const allLoans = await loansService.getAll() as any[]
    // Also get deleted loans to check if a loan was deleted
    const allLoansIncludingDeleted = getAllItems<any>('loans')
    
    for (const loan of allLoans) {
      // Skip if not recurring or no more loans to create
      if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
      
      // ✅ SOFT-DELETE CHECK: Skip if loan is marked as deleted
      if (loan.is_deleted) {
        console.log(`[AUTO-CREATE] Loan #${loan.id} is marked as deleted, skipping`)
        continue
      }
      
      // ✅ INTEGRATION WITH RECURRING ITEMS SERVICE:
      // Get the LATEST loan in the series to read updated parameters
      const latestLoan = await getLatestLoanInSeries(loan, allLoansIncludingDeleted)
      const recurringDay = latestLoan.recurring_day || 1
      const amount = latestLoan.amount
      const recurringMonths = latestLoan.recurring_months
      
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // Check if we should create a loan:
      // 1. Today is the recurring day, OR
      // 2. We're past the recurring day this month and no loan was created yet this month
      const shouldCreateToday = effectiveRecurringDay === day
      const isPastRecurringDay = day > effectiveRecurringDay
      
      if (!shouldCreateToday && !isPastRecurringDay) continue
      
      // Get loan date info for various checks
      const loanDate = new Date(loan.loan_date)
      const loanMonth = loanDate.getMonth()
      const loanYear = loanDate.getFullYear()
      const currentMonth = today.getMonth()
      const currentYear = today.getFullYear()
      
      // ✅ CRITICAL FIX #1: Only the LATEST loan in a series should create new loans
      // Check if there's a HIGHER numbered loan from this series (in ANY month)
      // If yes, skip this older loan - only the newest loan should create the next one
      const currentRecurringNumber = loan.recurring_loan_number || 1
      const nextRecurringNumber = currentRecurringNumber + 1
      
      // ✅ תיקון באג 4: סינון !l.is_deleted כדי למנוע תקיעה אם האחרונה נמחקה
      const newerLoanExists = allLoansIncludingDeleted.find((l: any) => 
        l.borrower_id === loan.borrower_id && 
        l.amount === loan.amount && 
        l.id !== loan.id &&
        l.is_recurring === 1 &&
        l.recurring_loan_number > currentRecurringNumber && // ← הלוואה עם מספר גבוה יותר (בכל חודש)
        !l.is_deleted // ← רק הלוואות שלא נמחקו
      )
      
      if (newerLoanExists) {
        console.log(`[AUTO-CREATE] Skipping loan #${loan.id} (number ${currentRecurringNumber}) - newer loan #${newerLoanExists.id} (number ${newerLoanExists.recurring_loan_number}) exists`)
        continue
      }
      
      // ✅ CRITICAL FIX #2: Skip if this loan was already created THIS MONTH
      // This prevents processing newly created loans in the same month
      if (loanYear === currentYear && loanMonth === currentMonth) {
        console.log(`[AUTO-CREATE] Loan #${loan.id} was created this month (${loan.loan_date}), skipping`)
        continue
      }
      
      // Get the first day of current month
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      // Now check if the NEXT loan in sequence already exists
      // Check in ALL loans (including deleted) to see if loan was created and then deleted
      const existingLoanThisMonth = allLoansIncludingDeleted.find((l: any) => 
        l.borrower_id === loan.borrower_id && 
        l.amount === loan.amount && 
        l.loan_date >= firstDayOfMonth &&
        l.loan_date <= todayStr &&
        l.id !== loan.id &&
        l.is_recurring === 1 &&
        l.recurring_loan_number === nextRecurringNumber // ← בדיקה מדויקת למספר הבא
      )
      
      if (existingLoanThisMonth) {
        // Check if it was deleted
        if (existingLoanThisMonth.is_deleted) {
          console.log(`[AUTO-CREATE] Loan #${existingLoanThisMonth.recurring_loan_number} was created and then deleted, not recreating`)
          continue
        }
        console.log(`[AUTO-CREATE] Loan #${existingLoanThisMonth.recurring_loan_number} already exists for this month: loan #${loan.id}`)
        continue
      }
      
      // IMPORTANT: Check if this loan's last occurrence was in a previous month
      // If so, we might have missed creating loans for previous months
      const monthsDiff = (currentYear - loanYear) * 12 + (currentMonth - loanMonth)
      
      if (monthsDiff > 1 && !existingLoanThisMonth) {
        // ✅ REPAIR LOG CHECK: Check if we already attempted to repair this loan today
        const lastRepairDate = getLastMissedLoanRepairDate(loan.id)
        if (lastRepairDate === todayStr) {
          console.log(`[AUTO-CREATE] Already attempted to repair loan #${loan.id} today (${lastRepairDate}), skipping`)
          continue
        }
        
        console.warn(`[AUTO-CREATE] ⚠️ Warning: Loan #${loan.id} is ${monthsDiff} months old. This might indicate missed recurring loans.`)
        console.warn(`[AUTO-CREATE] Last loan date: ${loan.loan_date}, Current date: ${todayStr}`)
        console.warn(`[AUTO-CREATE] Consider creating missed loans manually or running a catch-up process.`)
        
        // Add this to the alerts that will be shown to the user
        missedLoansAlerts.push({
          loanId: loan.id,
          borrowerName: loan.borrower_name || `Loan #${loan.id}`,
          monthsMissed: monthsDiff - 1, // -1 because we're creating current month
          lastLoanDate: loan.loan_date,
          currentRecurringNumber: currentRecurringNumber,
          totalCount: loan.recurring_loan_count || 0
        })
        
        // ✅ REPAIR LOG: Mark that we attempted to repair this loan today
        markMissedLoanRepairAttempt(loan.id)
      }
      
      // Create loan if today is the day OR if we're past the day and no loan exists
      if (shouldCreateToday || isPastRecurringDay) {
        console.log(`[AUTO-CREATE] Creating recurring loan from loan #${loan.id} (day: ${effectiveRecurringDay}, today: ${day})`)
        const success = await createRecurringLoan(loan.id)
        
        if (success) {
          console.log(`[AUTO-CREATE] ✅ Successfully created recurring loan from #${loan.id}`)
        } else {
          console.error(`[AUTO-CREATE] ❌ Failed to create recurring loan from #${loan.id}`)
        }
      }
    }
  } catch (error) {
    console.error('[AUTO-CREATE] Error in autoCreateRecurringLoans:', error)
  } finally {
    // Always release the lock
    clearTimeout(timeoutId)
    isAutoCreateRunning = false
    const duration = Date.now() - lockStartTime
    console.log(`[AUTO-CREATE] Completed in ${duration}ms`)
  }
}

// Auto-create recurring deposits that are due today
export async function autoCreateRecurringDeposits(): Promise<void> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  try {
    const deposits = await db.query(`
      SELECT * FROM deposits 
      WHERE is_recurring = 1 
      AND status = 'active'
      AND recurring_months > 0
    `) as any[]
    
    // Also get deleted deposits to check if a deposit was deleted
    const allDepositsIncludingDeleted = getAllItems<any>('deposits')
    
    for (const deposit of deposits) {
      // ✅ SOFT-DELETE CHECK: Skip if deposit is marked as deleted
      if (deposit.is_deleted) {
        console.log(`[AUTO-CREATE] Deposit #${deposit.id} is marked as deleted, skipping`)
        continue
      }
      
      // ✅ INTEGRATION WITH RECURRING ITEMS SERVICE:
      // Get the LATEST deposit in the series to read updated parameters
      const latestDeposit = await getLatestDepositInSeries(deposit, allDepositsIncludingDeleted)
      const recurringDay = latestDeposit.recurring_day || new Date(latestDeposit.deposit_date).getDate()
      const amount = latestDeposit.amount
      const recurringMonths = latestDeposit.recurring_months
      
      // ✅ בדיקה: אם אין יותר הפקדות ליצור, לא יוצרים
      if (!recurringMonths || recurringMonths <= 0) {
        console.log(`[AUTO-CREATE] Deposit #${deposit.id} has no more recurring months (${recurringMonths}), skipping`)
        continue
      }
      
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // Check if we should create a deposit:
      // 1. Today is the recurring day, OR
      // 2. We're past the recurring day this month and no deposit was created yet this month
      const shouldCreateToday = effectiveRecurringDay === day
      const isPastRecurringDay = day > effectiveRecurringDay
      
      if (!shouldCreateToday && !isPastRecurringDay) continue
      
      // Get the first day of current month
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      // Check if deposit already created this month - check by recurring number
      const currentRecurringNumber = deposit.recurring_deposit_number || 1
      const nextRecurringNumber = currentRecurringNumber + 1
      
      // ✅ CRITICAL FIX #1 (מקביל לתיקון בהלוואות): רק ההפקדה האחרונה בסדרה יוצרת את הבאה
      // מונע כפילויות כאשר כל הפקדה בסדרה מנסה ליצור את "הבאה שלה"
      // ✅ תיקון באג 4: סינון !d.is_deleted כדי למנוע תקיעה אם האחרונה נמחקה
      const newerDepositExists = allDepositsIncludingDeleted.find((d: any) =>
        d.depositor_id === deposit.depositor_id &&
        d.amount === amount &&
        d.id !== deposit.id &&
        d.is_recurring === 1 &&
        d.recurring_deposit_number > currentRecurringNumber &&
        !d.is_deleted // ← רק הפקדות שלא נמחקו
      )
      
      if (newerDepositExists) {
        console.log(`[AUTO-CREATE] Skipping deposit #${deposit.id} (number ${currentRecurringNumber}) - newer deposit #${newerDepositExists.id} exists`)
        continue
      }
      
      // Check in ALL deposits (including deleted) to see if deposit was created and then deleted
      const existingDepositThisMonth = allDepositsIncludingDeleted.find((d: any) => 
        d.depositor_id === deposit.depositor_id && 
        d.amount === amount && // Use updated amount
        d.deposit_date >= firstDayOfMonth &&
        d.deposit_date <= todayStr &&
        d.id !== deposit.id &&
        d.is_recurring === 1 &&
        d.recurring_deposit_number === nextRecurringNumber // Check for the NEXT number
      )
      
      if (existingDepositThisMonth) {
        // Check if it was deleted
        if (existingDepositThisMonth.is_deleted) {
          console.log(`[AUTO-CREATE] Deposit #${nextRecurringNumber} was created and then deleted, not recreating`)
          continue
        }
        console.log(`[AUTO-CREATE] Deposit #${nextRecurringNumber} already exists for this month: deposit #${deposit.id}`)
        continue
      }
      
      // Create deposit if today is the day OR if we're past the day and no deposit exists
      if (shouldCreateToday || isPastRecurringDay) {
        console.log(`[AUTO-CREATE] Creating recurring deposit from deposit #${deposit.id} (day: ${effectiveRecurringDay}, today: ${day})`)
        const success = await createRecurringDeposit(deposit.id)
        
        if (success) {
          console.log(`[AUTO-CREATE] ✅ Successfully created recurring deposit from #${deposit.id}`)
        } else {
          console.error(`[AUTO-CREATE] ❌ Failed to create recurring deposit from #${deposit.id}`)
        }
      }
    }
  } catch (error) {
    console.error('[AUTO-CREATE] Error in autoCreateRecurringDeposits:', error)
  }
}

// Activate planned loans that have reached their loan date
export async function activatePlannedLoans(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  let activatedCount = 0
  
  console.log('[SCHEDULER] activatePlannedLoans called, today:', today)
  
  try {
    const loans = await loansService.getAll()
    console.log('[SCHEDULER] Total loans:', loans.length)
    
    const plannedLoans = loans.filter(l => l.status === 'planned')
    console.log('[SCHEDULER] Planned loans:', plannedLoans.length)
    
    for (const loan of plannedLoans) {
      console.log(`[SCHEDULER] Checking loan #${loan.id}: status=${loan.status}, loan_date=${loan.loan_date}, today=${today}`)
      
      // If loan is planned and loan_date has arrived or passed
      if (loan.loan_date <= today) {
        console.log(`[SCHEDULER] Activating loan #${loan.id}`)
        await loansService.update(loan.id, { status: 'active' })
        activatedCount++
        console.log(`[SCHEDULER] ✅ Activated planned loan #${loan.id} for ${loan.borrower_name}`)
      }
    }
    
    console.log('[SCHEDULER] Total activated:', activatedCount)
  } catch (error) {
    console.error('[SCHEDULER] Error activating planned loans:', error)
  }
  
  return activatedCount
}

// Activate planned deposits that have reached their deposit date
export async function activatePlannedDeposits(): Promise<number> {
  const today = new Date().toISOString().split('T')[0]
  let activatedCount = 0
  
  console.log('[SCHEDULER] activatePlannedDeposits called, today:', today)
  
  try {
    const deposits = await db.query('SELECT * FROM deposits WHERE status = ?', ['planned']) as any[]
    console.log('[SCHEDULER] Planned deposits:', deposits.length)
    
    for (const deposit of deposits) {
      console.log(`[SCHEDULER] Checking deposit #${deposit.id}: status=${deposit.status}, deposit_date=${deposit.deposit_date}, today=${today}`)
      
      // If deposit is planned and deposit_date has arrived or passed
      if (deposit.deposit_date <= today) {
        console.log(`[SCHEDULER] Activating deposit #${deposit.id}`)
        await db.run('UPDATE deposits SET status = ? WHERE id = ?', ['active', deposit.id])
        activatedCount++
        console.log(`[SCHEDULER] ✅ Activated planned deposit #${deposit.id}`)
      }
    }
    
    console.log('[SCHEDULER] Total activated deposits:', activatedCount)
  } catch (error) {
    console.error('[SCHEDULER] Error activating planned deposits:', error)
  }
  
  return activatedCount
}

// Check for planned loans that become active today (for alerts)
export async function checkPlannedLoansToday(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const loans = await loansService.getAll()
    
    for (const loan of loans) {
      // If loan date is today (just activated)
      if (loan.loan_date === today && loan.status === 'active') {
        alerts.push({
          id: `planned_loan_${loan.id}_${today}`,
          type: 'recurring_loan', // Using existing type for now
          title: 'הלוואה מתוכננת הופעלה',
          message: `הלוואה מתוכננת עבור ${loan.borrower_name} הופעלה היום`,
          loan_id: loan.id,
          borrower_name: loan.borrower_name || '',
          amount: loan.amount,
          created_at: today,
          read: false
        })
      }
    }
  } catch (error) {
    console.error('Error checking planned loans:', error)
  }
  
  return alerts
}

// Check for recurring deposits that should be created today
export async function checkRecurringDeposits(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date()
  const todayDay = today.getDate()
  const todayStr = today.toISOString().split('T')[0]
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  // Get the first day of current month
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  try {
    // Get all active recurring deposits
    const recurringDeposits = await db.query(`
      SELECT d.*, dp.first_name || ' ' || dp.last_name as depositor_name
      FROM deposits d
      JOIN depositors dp ON d.depositor_id = dp.id
      WHERE d.is_recurring = 1 
      AND d.status = 'active'
    `) as any[]

    for (const deposit of recurringDeposits) {
      // בדיקה: רק הפקדות עם recurring_months > 0 צריכות ליצור התראות
      // הפקדה עם recurring_months = 0 היא ההפקדה האחרונה בסדרה
      if (!deposit.recurring_months || deposit.recurring_months <= 0) {
        continue
      }
      
      // בדיקה: אם ההפקדה נוצרה היום, לא צריך התראה
      if (deposit.deposit_date === todayStr) {
        continue
      }
      
      // Check if recurring_day matches today, or fallback to deposit date day
      const recurringDay = deposit.recurring_day || new Date(deposit.deposit_date).getDate()
      // If recurring day is greater than last day of month, use last day
      const effectiveDay = Math.min(recurringDay, lastDayOfMonth)
      
      // Show alert if:
      // 1. Today is the recurring day, OR
      // 2. We're past the recurring day this month and no deposit was created yet this month
      const shouldAlertToday = effectiveDay === todayDay
      const isPastRecurringDay = todayDay > effectiveDay
      
      if (shouldAlertToday || isPastRecurringDay) {
        // Check if we already created a deposit this month
        const existingDepositThisMonth = await db.query(`
          SELECT id FROM deposits 
          WHERE depositor_id = ? 
          AND amount = ? 
          AND deposit_date >= ?
          AND deposit_date <= ?
          AND id != ?
        `, [deposit.depositor_id, deposit.amount, firstDayOfMonth, todayStr, deposit.id])

        if (existingDepositThisMonth.length === 0) {
          const alertMessage = isPastRecurringDay
            ? `הפקדה מחזורית באיחור (היתה אמורה להתבצע ב-${effectiveDay} לחודש) - ${deposit.depositor_name}`
            : `הגיע מועד הפקדה מחזורית עבור ${deposit.depositor_name}`
          
          alerts.push({
            id: `recurring_deposit_${deposit.id}_${todayStr}`,
            type: 'recurring_deposit',
            title: isPastRecurringDay ? 'הפקדה מחזורית באיחור' : 'הפקדה מחזורית',
            message: alertMessage,
            loan_id: '', // No loan for deposits
            borrower_name: '',
            deposit_id: deposit.id,
            depositor_name: deposit.depositor_name,
            amount: deposit.amount,
            created_at: todayStr,
            read: false
          })
        }
      }
    }
  } catch (error) {
    console.error('Error checking recurring deposits:', error)
  }

  return alerts
}

// Create a recurring deposit
export async function createRecurringDeposit(originalDepositId: string): Promise<boolean> {
  try {
    const deposits = await db.query('SELECT * FROM deposits WHERE id = ?', [originalDepositId]) as any[]
    if (deposits.length === 0) return false
    
    const deposit = deposits[0]
    const today = new Date().toISOString().split('T')[0]
    
    // ✅ תיקון באג 3: מציאת ההפקדה האחרונה במשפחה (לפי recurring_deposit_number הגבוה ביותר)
    // כדי לחשב נכון את המספר הבא
    const allDeposits = await db.query(
      'SELECT * FROM deposits WHERE depositor_id = ? AND is_recurring = 1',
      [deposit.depositor_id]
    ) as any[]
    
    const latestDeposit = allDeposits.reduce((latest, current) => {
      const latestNum = latest.recurring_deposit_number || 1
      const currentNum = current.recurring_deposit_number || 1
      return currentNum > latestNum ? current : latest
    }, allDeposits[0])
    
    // חישוב מספר ההפקדה המחזורית מההפקדה האחרונה
    const originalNumber = latestDeposit.recurring_deposit_number || 1
    const totalCount = latestDeposit.recurring_deposit_count || (latestDeposit.recurring_months ? latestDeposit.recurring_months + 1 : 1)
    const newDepositNumber = originalNumber + 1
    
    console.log(`[CREATE-RECURRING] Creating deposit #${newDepositNumber} from latest #${originalNumber} (original deposit id: ${originalDepositId})`)
    
    // ✅ תיקון באג 3: בדיקה מדויקת - האם כבר קיימת הפקדה עם המספר הבא?
    const allDepositsIncludingDeleted = getAllItems<any>('deposits')
    const existingDeposit = allDepositsIncludingDeleted.find(d =>
      d.depositor_id === deposit.depositor_id &&
      d.is_recurring === 1 &&
      d.recurring_deposit_number === newDepositNumber &&
      !d.is_deleted
    )
    
    if (existingDeposit) {
      console.log(`[CREATE-RECURRING] Deposit #${newDepositNumber} already exists (${existingDeposit.id}), skipping`)
      return false
    }
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        latestDeposit.depositor_id, 
        latestDeposit.amount, 
        today, 
        latestDeposit.period_type, 
        latestDeposit.due_date, 
        latestDeposit.is_recurring, 
        latestDeposit.recurring_day,
        latestDeposit.recurring_months ? latestDeposit.recurring_months - 1 : 0,
        newDepositNumber,
        totalCount,
        `הפקדה מחזורית מהפקדה #${originalDepositId} (${newDepositNumber}/${totalCount})`, 
        'active', 
        latestDeposit.payment_method || '', 
        latestDeposit.payment_details || ''
      ]
    )
    
    // עדכון ההפקדה האחרונה להפחית את recurring_months
    if (latestDeposit.recurring_months) {
      await db.run(
        'UPDATE deposits SET recurring_months = ? WHERE id = ?',
        [latestDeposit.recurring_months - 1, latestDeposit.id]
      )
    }

    return true
  } catch (error) {
    console.error('Error creating recurring deposit:', error)
    return false
  }
}
