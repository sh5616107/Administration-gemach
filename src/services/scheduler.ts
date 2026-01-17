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

    const today = new Date().toISOString().split('T')[0]
    
    await loansService.create({
      borrower_id: loan.borrower_id,
      amount: loan.amount,
      loan_date: today,
      loan_type: loan.loan_type,
      due_date: loan.due_date,
      guarantor1_id: loan.guarantor1_id,
      guarantor2_id: loan.guarantor2_id,
      is_recurring: loan.is_recurring,
      recurring_months: loan.recurring_months ? loan.recurring_months - 1 : 0,
      recurring_day: loan.recurring_day,
      auto_repayment: loan.auto_repayment,
      repayment_amount: loan.repayment_amount,
      repayment_day: loan.repayment_day,
      repayment_start_date: loan.repayment_start_date,
      notes: `הלוואה מחזורית מהלוואה #${originalLoanId}`
    })

    // Update original loan to reduce recurring months
    if (loan.recurring_months) {
      await loansService.update(originalLoanId, {
        recurring_months: loan.recurring_months - 1
      })
    }

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
    
    await repaymentsService.create({
      loan_id: loanId,
      amount: amount,
      payment_date: today,
      notes: 'פירעון מחזורי אוטומטי'
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
  const activated = await activatePlannedLoans()
  console.log('[SCHEDULER] Activated planned loans:', activated)
  
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
    
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [deposit.depositor_id, deposit.amount, today, deposit.period_type, deposit.due_date, deposit.is_recurring, `הפקדה מחזורית מהפקדה #${originalDepositId}`, 'active', deposit.payment_method || '', deposit.payment_details || '']
    )

    return true
  } catch (error) {
    console.error('Error creating recurring deposit:', error)
    return false
  }
}
