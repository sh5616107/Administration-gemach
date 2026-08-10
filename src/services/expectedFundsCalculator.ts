/**
 * חישוב כספים צפויים להשתחרר
 * מחשב כמה כסף צפוי להיכנס לגמ"ח בטווחי זמן שונים
 */

export interface Loan {
  id: string
  borrower_id: string
  amount: number
  loan_date: string
  status: string
  remaining: number
  due_date?: string
  auto_repayment?: number
  repayment_amount?: number
  repayment_day?: number
  is_recurring?: number
  recurring_months?: number
  recurring_day?: number
  recurring_loan_number?: number
  recurring_loan_count?: number
}

export interface Deposit {
  id: string
  depositor_id: string
  amount: number
  deposit_date: string
  status: string
  is_recurring?: number
  recurring_months?: number
  recurring_day?: number
}

export interface ExpectedFunds {
  week: number
  month: number
  threeMonths: number
}

/**
 * חישוב כסף עתיד להשתחרר מהלוואות ומהפקדות
 */
export function calculateExpectedFunds(
  loans: Loan[],
  deposits: Deposit[],
  referenceDate: Date = new Date()
): ExpectedFunds {
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)
  const oneWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const oneMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const threeMonths = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

  const activeLoans = loans.filter(l => l.status === 'active')

  let weekFunds = 0
  let monthFunds = 0
  let threeMonthsFunds = 0

  // חישוב כסף מהלוואות פעילות
  for (const loan of activeLoans) {
    const remaining = loan.remaining || 0
    if (remaining <= 0) continue

    // רק הלוואות עם פירעון מחזורי או תאריך פירעון קבוע
    if (loan.auto_repayment === 1 && loan.repayment_amount && loan.repayment_day) {
      // הלוואות עם פירעון מחזורי
      const monthlyAmount = loan.repayment_amount

      // בדיקת תקינות
      if (monthlyAmount <= 0) continue

      const paymentsInWeek = Math.min(1, Math.ceil(7 / 30))
      const paymentsInMonth = 1
      const paymentsInThreeMonths = 3

      weekFunds += Math.min(paymentsInWeek * monthlyAmount, remaining)
      monthFunds += Math.min(paymentsInMonth * monthlyAmount, remaining)
      threeMonthsFunds += Math.min(paymentsInThreeMonths * monthlyAmount, remaining)
    } else if (loan.due_date) {
      // הלוואות עם תאריך פירעון קבוע
      const dueDate = new Date(loan.due_date)
      
      // בדיקת תקינות תאריך
      if (isNaN(dueDate.getTime())) continue
      
      dueDate.setHours(0, 0, 0, 0)

      if (dueDate <= threeMonths) {
        threeMonthsFunds += remaining
        if (dueDate <= oneMonth) {
          monthFunds += remaining
          if (dueDate <= oneWeek) {
            weekFunds += remaining
          }
        }
      }
    }
    // הלוואות גמישות - לא מחשבים כי אין ודאות מתי יפרעו
  }

  // חישוב כסף מהפקדות מחזוריות (כולל מתוכננות)
  const recurringDeposits = deposits.filter(d => d.is_recurring === 1 && (d.status === 'active' || d.status === 'planned'))

  for (const deposit of recurringDeposits) {
    const amount = deposit.amount || 0
    const recurringMonths = deposit.recurring_months || 1

    // בדיקות תקינות
    if (amount <= 0) continue
    if (recurringMonths <= 0) continue

    const nextDeposits: Date[] = []
    let currentDate = new Date(deposit.deposit_date || today)

    // בדיקת תקינות תאריך
    if (isNaN(currentDate.getTime())) continue

    // מצא את ההפקדה הבאה
    let iterations = 0
    while (currentDate <= today && iterations < 100) {
      currentDate.setMonth(currentDate.getMonth() + recurringMonths)
      iterations++
    }

    if (iterations >= 100) continue

    // צור רשימה של הפקדות עתידיות עד 3 חודשים
    while (currentDate <= threeMonths && nextDeposits.length < 10) {
      nextDeposits.push(new Date(currentDate))
      currentDate.setMonth(currentDate.getMonth() + recurringMonths)
    }

    // חשב כמה הפקדות בכל טווח
    for (const depositDate of nextDeposits) {
      if (depositDate <= oneWeek) {
        weekFunds += amount
      }
      if (depositDate <= oneMonth) {
        monthFunds += amount
      }
      if (depositDate <= threeMonths) {
        threeMonthsFunds += amount
      }
    }
  }

  // גריעת הלוואות מחזוריות קיימות שטרם נוצרו
  const recurringLoans = activeLoans.filter(
    l =>
      l.is_recurring === 1 &&
      l.recurring_loan_number &&
      l.recurring_loan_count &&
      l.recurring_loan_number < l.recurring_loan_count
  )

  for (const loan of recurringLoans) {
    const currentNumber = loan.recurring_loan_number || 0
    const remainingLoans = (loan.recurring_loan_count || 0) - currentNumber
    const loanAmount = loan.amount

    // בדיקות תקינות
    if (loanAmount <= 0) continue
    if (remainingLoans <= 0) continue

    if (loan.recurring_day && loan.recurring_months) {
      const recurringMonths = loan.recurring_months || 1
      
      if (recurringMonths <= 0) continue

      let futureDate = new Date(loan.loan_date)

      // בדיקת תקינות תאריך
      if (isNaN(futureDate.getTime())) continue

      // קפוץ קדימה לפי מספר ההלוואות שכבר נוצרו
      for (let i = 0; i < currentNumber; i++) {
        futureDate.setMonth(futureDate.getMonth() + recurringMonths)
      }

      // עכשיו חשב את ההלוואות העתידיות
      for (let i = 1; i <= remainingLoans; i++) {
        futureDate = new Date(futureDate)
        futureDate.setMonth(futureDate.getMonth() + recurringMonths)

        if (futureDate <= threeMonths) {
          threeMonthsFunds -= loanAmount
          if (futureDate <= oneMonth) {
            monthFunds -= loanAmount
            if (futureDate <= oneWeek) {
              weekFunds -= loanAmount
            }
          }
        }
      }
    }
  }

  return { week: weekFunds, month: monthFunds, threeMonths: threeMonthsFunds }
}
