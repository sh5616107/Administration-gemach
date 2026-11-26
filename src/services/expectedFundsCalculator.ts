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
  fund_id?: string  // UUID foreign key - קופה משוייכת
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
  recurring_series_id?: string  // UUID - מזהה קנוני למשפחת הפקדות מחזוריות
  fund_id?: string  // UUID foreign key - קופה משוייכת
  period_type?: string  // 'fixed' = הפקדה לתקופה קבועה, 'flexible' = גמישה
  due_date?: string  // תאריך החזרת ההפקדה (בקבועה - מוסכם, בגמישה - צפוי, לא חובה)
  withdrawn_amount?: number  // כמה כבר נמשך מההפקדה
}

export interface ExpectedFunds {
  week: number
  month: number
  threeMonths: number
  /** כמה מתוך הסכומים למעלה נוכה בגלל החזר הפקדות (מספר חיובי) */
  depositReturns: {
    week: number
    month: number
    threeMonths: number
  }
}

export type ExpectedPeriod = 'week' | 'month' | 'threeMonths'

export interface FixedDepositReturn {
  id: string
  depositor_id: string
  /** הסכום שצריך להחזיר: סכום ההפקדה פחות מה שכבר נמשך */
  amount: number
  due_date: string
  /** true כשתאריך ההחזר כבר עבר וההפקדה עדיין לא הוחזרה */
  overdue: boolean
  /** הטווחים שההחזר נופל בהם (מצטבר: החזר של השבוע הקרוב נכלל גם בחודש וב-3 חודשים) */
  periods: ExpectedPeriod[]
}

function getRanges(referenceDate: Date) {
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)
  return {
    today,
    oneWeek: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
    oneMonth: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
    threeMonths: new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000),
  }
}

/** YYYY-MM-DD -> Date בשעון מקומי (new Date('2026-02-05') מפרש כ-UTC) */
function parseLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(value)
}

/**
 * הפקדות שצריך להחזיר למפקיד ב-3 החודשים הקרובים.
 *
 * הפקדה עם תאריך החזרה (due_date) היא כסף שהגמ"ח יצטרך להוציא: בהפקדה קבועה
 * זה המועד המוסכם, ובהפקדה גמישה זה מועד צפוי שהמנהל מילא (לא חובה). לכן היא מנוכה מהכסף הצפוי להשתחרר, כדי שמנהל הגמ"ח יוכל לתכנן.
 * הפקדה שתאריך ההחזר שלה כבר עבר ועדיין לא הוחזרה נחשבת כמי שצריך להחזיר מיד.
 * נכללות רק הפקדות פעילות (כסף שכבר נכנס לקופה), בניכוי משיכות חלקיות.
 */
export function getFixedDepositReturns(
  deposits: Deposit[],
  referenceDate: Date = new Date(),
  fundId?: string
): FixedDepositReturn[] {
  const { today, oneWeek, oneMonth, threeMonths } = getRanges(referenceDate)
  const result: FixedDepositReturn[] = []

  for (const deposit of deposits) {
    if (fundId && deposit.fund_id !== fundId) continue
    if (deposit.status !== 'active') continue
    if (!deposit.due_date) continue

    const amount = (deposit.amount || 0) - (deposit.withdrawn_amount || 0)
    if (amount <= 0) continue

    const dueDate = parseLocalDate(deposit.due_date)
    if (isNaN(dueDate.getTime())) continue
    dueDate.setHours(0, 0, 0, 0)
    if (dueDate > threeMonths) continue

    const periods: ExpectedPeriod[] = ['threeMonths']
    if (dueDate <= oneMonth) periods.unshift('month')
    if (dueDate <= oneWeek) periods.unshift('week')

    result.push({
      id: deposit.id,
      depositor_id: deposit.depositor_id,
      amount,
      due_date: deposit.due_date,
      overdue: dueDate < today,
      periods,
    })
  }

  return result.sort((a, b) => a.due_date.localeCompare(b.due_date))
}

/**
 * חישוב כסף עתיד להשתחרר מהלוואות ומהפקדות
 * @param fundId אופציונלי - סינון לפי קופה ספציפית
 */
export function calculateExpectedFunds(
  loans: Loan[],
  deposits: Deposit[],
  referenceDate: Date = new Date(),
  fundId?: string
): ExpectedFunds {
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)
  const oneWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
  const oneMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const threeMonths = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)

  // סינון לפי קופה אם צוין
  let filteredLoans = loans
  let filteredDeposits = deposits
  if (fundId) {
    filteredLoans = loans.filter(l => l.fund_id === fundId)
    filteredDeposits = deposits.filter(d => d.fund_id === fundId)
  }

  const activeLoans = filteredLoans.filter(l => l.status === 'active')

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
  const recurringDeposits = filteredDeposits.filter(d => d.is_recurring === 1 && (d.status === 'active' || d.status === 'planned'))

  for (const deposit of recurringDeposits) {
    const amount = deposit.amount || 0
    const recurringMonths = deposit.recurring_months ?? 1

    // בדיקות תקינות
    if (amount <= 0) continue
    if (recurringMonths <= 0) continue

    const nextDeposits: Date[] = []
    let currentDate = new Date(deposit.deposit_date || today)

    // בדיקת תקינות תאריך
    if (isNaN(currentDate.getTime())) continue

    // מצא את ההפקדה הבאה
    // הערה: משתמשים ב-'<' ולא ב-'<=' כדי לא לדלג על הפקדה שחלה בדיוק היום
    let iterations = 0
    while (currentDate < today && iterations < 100) {
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

  // גריעת החזר הפקדות (קבועות וגמישות עם תאריך החזרה) שמועד ההחזר שלהן מגיע
  const depositReturns = { week: 0, month: 0, threeMonths: 0 }
  for (const ret of getFixedDepositReturns(filteredDeposits, referenceDate)) {
    for (const period of ret.periods) {
      depositReturns[period] += ret.amount
    }
  }
  weekFunds -= depositReturns.week
  monthFunds -= depositReturns.month
  threeMonthsFunds -= depositReturns.threeMonths

  return { week: weekFunds, month: monthFunds, threeMonths: threeMonthsFunds, depositReturns }
}
