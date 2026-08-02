/**
 * שירות דוחות תקופתיים
 * מחזיר תנועות בטווח תאריכים נתון - הלוואות, פירעונות, תרומות, הפקדות
 * ללא תלות בסטטוס - רק לפי תאריך התנועה בפועל
 */

import { db, loansService, borrowersService, repaymentsService } from './database'

/**
 * הלוואה מלאה - כולל פרטי לווה ומצב יתרה
 */
export interface LoanWithDetails {
  id: string
  loan_number: number
  borrower_id: string
  borrower_name: string
  amount: number
  loan_date: string
  loan_type: string
  due_date?: string
  status: string
  remaining: number
  total_repaid: number
  is_recurring: number
  recurring_loan_number?: number
  recurring_loan_count?: number
  payment_method?: string
  notes?: string
}

/**
 * פירעון מלא - כולל פרטי ההלוואה והלווה
 */
export interface RepaymentWithDetails {
  id: string
  loan_id: string
  loan_number: number
  borrower_name: string
  amount: number
  payment_date: string
  payment_method?: string
  is_recurring?: number
  recurring_repayment_number?: number
  recurring_repayment_count?: number
  notes?: string
}

/**
 * תרומה מלאה
 */
export interface DonationWithDetails {
  id: string
  donor_name: string
  amount: number
  donation_date: string
  payment_method?: string
  notes?: string
}

/**
 * הפקדה מלאה
 */
export interface DepositWithDetails {
  id: string
  depositor_name: string
  amount: number
  deposit_date: string
  period_type: string
  status: string
  is_recurring: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
  payment_method?: string
  notes?: string
}

/**
 * נתוני תקופה מאוחדים
 */
export interface PeriodTransactionsData {
  // הלוואות שניתנו בתקופה
  loans: LoanWithDetails[]
  
  // פירעונות שהתקבלו בתקופה
  repayments: RepaymentWithDetails[]
  
  // תרומות שהתקבלו בתקופה
  donations: DonationWithDetails[]
  
  // הפקדות שהתקבלו בתקופה
  deposits: DepositWithDetails[]
  
  // סיכומים
  summary: {
    totalLoansAmount: number      // סה"כ הלוואות שניתנו
    totalRepaymentsAmount: number // סה"כ פירעונות שהתקבלו
    totalDonationsAmount: number  // סה"כ תרומות
    totalDepositsAmount: number   // סה"כ הפקדות
    loansClosedInPeriod: number   // מספר הלוואות שנסגרו (remaining הגיע ל-0)
  }
}

/**
 * שליפת כל התנועות בטווח תאריכים נתון
 * @param startDate תאריך התחלה (YYYY-MM-DD)
 * @param endDate תאריך סיום (YYYY-MM-DD)
 * @returns נתוני תקופה מאוחדים
 */
export async function getTransactionsForPeriod(
  startDate: string,
  endDate: string
): Promise<PeriodTransactionsData> {
  
  console.log(`📊 [REPORTS] שליפת תנועות לתקופה: ${startDate} - ${endDate}`)
  
  // 1. שליפת הלוואות שניתנו בתקופה
  // שאילתה ישירה על loans - לפי loan_date, ללא סינון status
  const allLoans = await loansService.getAll()
  const borrowers = await borrowersService.getAll()
  
  const periodLoans = allLoans.filter(loan => {
    // רק הלוואות שלא נמחקו
    if (loan.is_deleted) return false
    
    // בטווח התאריכים
    return loan.loan_date >= startDate && loan.loan_date <= endDate
  })
  
  const loansWithDetails: LoanWithDetails[] = periodLoans.map(loan => {
    const borrower = borrowers.find(b => b.id === loan.borrower_id)
    const borrowerName = borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לווה לא ידוע'
    
    return {
      id: loan.id,
      loan_number: loan.loan_number,
      borrower_id: loan.borrower_id,
      borrower_name: borrowerName,
      amount: loan.amount,
      loan_date: loan.loan_date,
      loan_type: loan.loan_type,
      due_date: loan.due_date,
      status: loan.status,
      remaining: loan.remaining || 0,
      total_repaid: loan.total_repaid || 0,
      is_recurring: loan.is_recurring,
      recurring_loan_number: loan.recurring_loan_number,
      recurring_loan_count: loan.recurring_loan_count,
      payment_method: loan.payment_method,
      notes: loan.notes
    }
  })
  
  // 2. שליפת פירעונות שהתקבלו בתקופה
  // שאילתה ישירה על repayments - לפי payment_date, ללא תלות בסטטוס ההלוואה
  const allRepayments = await db.query('SELECT * FROM repayments WHERE is_deleted = 0') as any[]
  
  const periodRepayments = allRepayments.filter(rep => {
    return rep.payment_date >= startDate && rep.payment_date <= endDate
  })
  
  const repaymentsWithDetails: RepaymentWithDetails[] = []
  
  for (const rep of periodRepayments) {
    // מציאת ההלוואה המקורית (גם אם נסגרה)
    const loan = allLoans.find(l => l.id === rep.loan_id)
    if (!loan) continue
    
    const borrower = borrowers.find(b => b.id === loan.borrower_id)
    const borrowerName = borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לווה לא ידוע'
    
    repaymentsWithDetails.push({
      id: rep.id,
      loan_id: rep.loan_id,
      loan_number: loan.loan_number,
      borrower_name: borrowerName,
      amount: rep.amount,
      payment_date: rep.payment_date,
      payment_method: rep.payment_method,
      is_recurring: rep.is_recurring,
      recurring_repayment_number: rep.recurring_repayment_number,
      recurring_repayment_count: rep.recurring_repayment_count,
      notes: rep.notes
    })
  }
  
  // 3. שליפת תרומות שהתקבלו בתקופה
  const allDonations = await db.query(`
    SELECT d.*, (dn.first_name || ' ' || dn.last_name) as donor_name
    FROM donations d
    JOIN donors dn ON d.donor_id = dn.id
  `) as any[]
  
  const periodDonations = allDonations.filter(don => {
    return don.donation_date >= startDate && don.donation_date <= endDate
  })
  
  const donationsWithDetails: DonationWithDetails[] = periodDonations.map(don => ({
    id: don.id,
    donor_name: don.donor_name,
    amount: don.amount,
    donation_date: don.donation_date,
    payment_method: don.payment_method,
    notes: don.notes
  }))
  
  // 4. שליפת הפקדות שהתקבלו בתקופה
  const allDeposits = await db.query(`
    SELECT d.*, (dp.first_name || ' ' || dp.last_name) as depositor_name
    FROM deposits d
    JOIN depositors dp ON d.depositor_id = dp.id
    WHERE d.is_deleted = 0
  `) as any[]
  
  const periodDeposits = allDeposits.filter(dep => {
    return dep.deposit_date >= startDate && dep.deposit_date <= endDate
  })
  
  const depositsWithDetails: DepositWithDetails[] = periodDeposits.map(dep => ({
    id: dep.id,
    depositor_name: dep.depositor_name,
    amount: dep.amount,
    deposit_date: dep.deposit_date,
    period_type: dep.period_type,
    status: dep.status,
    is_recurring: dep.is_recurring,
    recurring_deposit_number: dep.recurring_deposit_number,
    recurring_deposit_count: dep.recurring_deposit_count,
    payment_method: dep.payment_method,
    notes: dep.notes
  }))
  
  // 5. חישוב הלוואות שנסגרו בתקופה
  // הלוואות שהגיעו ל-remaining=0 עקב פירעון שבוצע בתקופה
  const loansClosedInPeriod = new Set<string>()
  
  for (const rep of periodRepayments) {
    const loan = allLoans.find(l => l.id === rep.loan_id)
    if (loan && loan.remaining === 0) {
      loansClosedInPeriod.add(loan.id)
    }
  }
  
  // 6. סיכומים
  const totalLoansAmount = loansWithDetails.reduce((sum, loan) => sum + loan.amount, 0)
  const totalRepaymentsAmount = repaymentsWithDetails.reduce((sum, rep) => sum + rep.amount, 0)
  const totalDonationsAmount = donationsWithDetails.reduce((sum, don) => sum + don.amount, 0)
  const totalDepositsAmount = depositsWithDetails.reduce((sum, dep) => sum + dep.amount, 0)
  
  console.log(`✅ [REPORTS] נמצאו:`)
  console.log(`   📤 הלוואות: ${loansWithDetails.length} (${totalLoansAmount} ₪)`)
  console.log(`   📥 פירעונות: ${repaymentsWithDetails.length} (${totalRepaymentsAmount} ₪)`)
  console.log(`   💝 תרומות: ${donationsWithDetails.length} (${totalDonationsAmount} ₪)`)
  console.log(`   💰 הפקדות: ${depositsWithDetails.length} (${totalDepositsAmount} ₪)`)
  console.log(`   ✅ הלוואות שנסגרו: ${loansClosedInPeriod.size}`)
  
  return {
    loans: loansWithDetails,
    repayments: repaymentsWithDetails,
    donations: donationsWithDetails,
    deposits: depositsWithDetails,
    summary: {
      totalLoansAmount,
      totalRepaymentsAmount,
      totalDonationsAmount,
      totalDepositsAmount,
      loansClosedInPeriod: loansClosedInPeriod.size
    }
  }
}

/**
 * קבלת טווח תאריכים לחודש מסוים
 */
export function getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  // month: 1-12
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  
  // יום אחרון בחודש
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  
  return { startDate, endDate }
}

/**
 * קבלת טווח תאריכים לשנה מסוימת
 */
export function getYearRange(year: number): { startDate: string; endDate: string } {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`
  }
}
