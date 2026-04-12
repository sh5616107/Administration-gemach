import { loansService, repaymentsService, db } from './database'

interface Alert {
  id: string
  type: 'recurring_loan' | 'auto_repayment' | 'overdue' | 'recurring_deposit'
  title: string
  message: string
  loan_id: number
  borrower_name: string
  amount: number
  created_at: string
  read: boolean
  deposit_id?: number
  depositor_name?: string
}

// Check for recurring loans that should be created today
export async function checkRecurringLoans(): Promise<Alert[]> {
  const alerts: Alert[] = []
  const today = new Date()
  const todayDay = today.getDate()
  const todayStr = today.toISOString().split('T')[0]
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

  try {
    // Get all loans with recurring enabled
    const recurringLoans = await db.query(`
      SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.id
      WHERE l.is_recurring = 1 
      AND l.recurring_months > 0
    `) as any[]

    for (const loan of recurringLoans) {
      // If recurring day is greater than last day of month, use last day
      const effectiveDay = Math.min(loan.recurring_day || 1, lastDayOfMonth)
      
      if (effectiveDay !== todayDay) continue
      
      // Check if we already created a loan this month
      const existingLoan = await db.query(`
        SELECT id FROM loans 
        WHERE borrower_id = ? 
        AND amount = ? 
        AND loan_date = ?
      `, [loan.borrower_id, loan.amount, todayStr])

      if (existingLoan.length === 0) {
        alerts.push({
          id: `recurring_${loan.id}_${todayStr}`,
          type: 'recurring_loan',
          title: 'הלוואה מחזורית',
          message: `הגיע מועד הלוואה מחזורית עבור ${loan.borrower_name}`,
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

  try {
    // Get all loans with auto repayment enabled
    const autoRepaymentLoans = await db.query(`
      SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
      FROM loans l
      JOIN borrowers b ON l.borrower_id = b.id
      WHERE l.auto_repayment = 1 
      AND l.repayment_amount > 0
      AND l.repayment_start_date <= ?
      AND (l.remaining > 0 OR l.remaining IS NULL)
    `, [todayStr]) as any[]

    for (const loan of autoRepaymentLoans) {
      // If repayment day is greater than last day of month, use last day
      const effectiveDay = Math.min(loan.repayment_day || 1, lastDayOfMonth)
      
      if (effectiveDay !== todayDay) continue
      
      // Check if we already made a repayment today
      const existingRepayment = await db.query(`
        SELECT id FROM repayments 
        WHERE loan_id = ? 
        AND payment_date = ?
      `, [loan.id, todayStr])

      if (existingRepayment.length === 0) {
        const remaining = loan.remaining || loan.amount
        const repaymentAmount = Math.min(loan.repayment_amount, remaining)

        alerts.push({
          id: `repayment_${loan.id}_${todayStr}`,
          type: 'auto_repayment',
          title: 'פירעון מחזורי',
          message: `הגיע מועד פירעון מחזורי עבור ${loan.borrower_name}`,
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
export async function createRecurringLoan(originalLoanId: number): Promise<boolean> {
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
      auto_repayment: loan.auto_repayment,
      repayment_amount: loan.repayment_amount,
      repayment_day: loan.repayment_day,
      repayment_start_date: loan.repayment_start_date,
      notes: `הלוואה מחזורית מהלוואה #${originalLoanId} (${newLoanNumber}/${totalCount})`
    })

    // Update original loan to reduce recurring months
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
export async function processAutoRepayment(loanId: number, amount: number): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Get loan details to calculate repayment number
    const loan = await loansService.getById(loanId) as any
    if (!loan) return false
    
    // Get existing repayments for this loan to calculate the number
    const existingRepayments = await repaymentsService.getByLoan(loanId)
    const autoRepayments = existingRepayments.filter(r => r.notes?.includes('פירעון מחזורי'))
    const repaymentNumber = autoRepayments.length + 1
    
    // Calculate total count based on loan amount and repayment amount
    const totalCount = loan.repayment_amount > 0 
      ? Math.ceil(loan.amount / loan.repayment_amount)
      : undefined
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: amount,
      payment_date: today,
      notes: 'פירעון מחזורי אוטומטי',
      is_recurring: 1,
      recurring_repayment_number: repaymentNumber,
      recurring_repayment_count: totalCount
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
  console.log('[SCHEDULER] Auto-created recurring loans')
  
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
async function autoCreateRecurringLoans(): Promise<void> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  try {
    const allLoans = await loansService.getAll() as any[]
    
    for (const loan of allLoans) {
      // Skip if not recurring or no more loans to create
      if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
      
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // Check if we should create a loan:
      // 1. Today is the recurring day, OR
      // 2. We're past the recurring day this month and no loan was created yet this month
      const shouldCreateToday = effectiveRecurringDay === day
      const isPastRecurringDay = day > effectiveRecurringDay
      
      // Get the first day of current month
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      // Check if loan already created this month
      const existingLoanThisMonth = allLoans.find((l: any) => 
        l.borrower_id === loan.borrower_id && 
        l.amount === loan.amount && 
        l.loan_date >= firstDayOfMonth &&
        l.loan_date <= todayStr &&
        l.id !== loan.id &&
        l.is_recurring === 1
      )
      
      if (existingLoanThisMonth) {
        console.log(`[AUTO-CREATE] Loan already exists for this month: loan #${loan.id}`)
        continue
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
  }
}

// Auto-create recurring deposits that are due today
async function autoCreateRecurringDeposits(): Promise<void> {
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
    
    for (const deposit of deposits) {
      const recurringDay = deposit.recurring_day || new Date(deposit.deposit_date).getDate()
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // Check if we should create a deposit:
      // 1. Today is the recurring day, OR
      // 2. We're past the recurring day this month and no deposit was created yet this month
      const shouldCreateToday = effectiveRecurringDay === day
      const isPastRecurringDay = day > effectiveRecurringDay
      
      // Get the first day of current month
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      
      // Check if deposit already created this month
      const existingDepositThisMonth = await db.query(`
        SELECT id FROM deposits 
        WHERE depositor_id = ? 
        AND amount = ? 
        AND deposit_date >= ?
        AND deposit_date <= ?
        AND id != ?
        AND is_recurring = 1
      `, [deposit.depositor_id, deposit.amount, firstDayOfMonth, todayStr, deposit.id])
      
      if (existingDepositThisMonth.length > 0) {
        console.log(`[AUTO-CREATE] Deposit already exists for this month: deposit #${deposit.id}`)
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
      
      if (effectiveDay === todayDay) {
        // Check if we already created a deposit this month
        const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
        const existingDeposit = await db.query(`
          SELECT id FROM deposits 
          WHERE depositor_id = ? 
          AND amount = ? 
          AND deposit_date LIKE ?
          AND id != ?
        `, [deposit.depositor_id, deposit.amount, `${thisMonth}%`, deposit.id])

        if (existingDeposit.length === 0) {
          alerts.push({
            id: `recurring_deposit_${deposit.id}_${todayStr}`,
            type: 'recurring_deposit',
            title: 'הפקדה מחזורית',
            message: `הגיע מועד הפקדה מחזורית עבור ${deposit.depositor_name}`,
            loan_id: 0,
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
export async function createRecurringDeposit(originalDepositId: number): Promise<boolean> {
  try {
    const deposits = await db.query('SELECT * FROM deposits WHERE id = ?', [originalDepositId]) as any[]
    if (deposits.length === 0) return false
    
    const deposit = deposits[0]
    const today = new Date().toISOString().split('T')[0]
    
    // חישוב מספר ההפקדה המחזורית
    const originalNumber = deposit.recurring_deposit_number || 1
    const totalCount = deposit.recurring_deposit_count || (deposit.recurring_months ? deposit.recurring_months + 1 : 1)
    const newDepositNumber = originalNumber + 1
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        deposit.depositor_id, 
        deposit.amount, 
        today, 
        deposit.period_type, 
        deposit.due_date, 
        deposit.is_recurring, 
        deposit.recurring_day,
        deposit.recurring_months ? deposit.recurring_months - 1 : 0,
        newDepositNumber,
        totalCount,
        `הפקדה מחזורית מהפקדה #${originalDepositId} (${newDepositNumber}/${totalCount})`, 
        'active', 
        deposit.payment_method || '', 
        deposit.payment_details || ''
      ]
    )
    
    // עדכון ההפקדה המקורית להפחית את recurring_months
    if (deposit.recurring_months) {
      await db.run(
        'UPDATE deposits SET recurring_months = ? WHERE id = ?',
        [deposit.recurring_months - 1, originalDepositId]
      )
    }

    return true
  } catch (error) {
    console.error('Error creating recurring deposit:', error)
    return false
  }
}
