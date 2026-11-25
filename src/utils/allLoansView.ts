/**
 * תצוגת "כל ההלוואות" - כל ההלוואות של כל הלווים ברשימה אחת,
 * עם מיון לפי תאריך ההלוואה (ולא לפי שם הלווה) וסינון בסיסי.
 * פונקציות טהורות, בלי תלות ב-database.
 */

export type AllLoansSortMode = 'dateDesc' | 'dateAsc' | 'due' | 'amountDesc' | 'balanceDesc'
export type AllLoansStatusFilter = 'all' | 'open' | 'paid'

export const ALL_LOANS_SORT_LABELS: Record<AllLoansSortMode, string> = {
  dateDesc: 'תאריך הלוואה (חדש לישן)',
  dateAsc: 'תאריך הלוואה (ישן לחדש)',
  due: 'פירעון קרוב',
  amountDesc: 'סכום (גבוה לנמוך)',
  balanceDesc: 'יתרה (גבוהה לנמוכה)',
}

export const ALL_LOANS_STATUS_LABELS: Record<AllLoansStatusFilter, string> = {
  all: 'כל ההלוואות',
  open: 'פעילות (עם יתרה)',
  paid: 'נפרעו',
}

export interface AllLoansItem {
  loan_date: string
  amount: number
  total_repaid?: number
  loan_number?: number
}

export interface AllLoansOptions {
  sort: AllLoansSortMode
  status: AllLoansStatusFilter
  /** YYYY-MM-DD, כולל */
  fromDate?: string
  /** YYYY-MM-DD, כולל */
  toDate?: string
}

export const loanBalance = (l: AllLoansItem) => Math.max(0, l.amount - (l.total_repaid ?? 0))

const day = (s: string) => (s || '').slice(0, 10)

export function buildAllLoansList<T extends AllLoansItem>(
  loans: T[],
  options: AllLoansOptions,
  getDueDate: (loan: T) => string | undefined
): T[] {
  const { sort, status, fromDate, toDate } = options

  const filtered = loans.filter(l => {
    const balance = loanBalance(l)
    if (status === 'open' && balance <= 0) return false
    if (status === 'paid' && balance > 0) return false
    const d = day(l.loan_date)
    if (fromDate && d < fromDate) return false
    if (toDate && d > toDate) return false
    return true
  })

  // שובר שוויון קבוע: מספר הלוואה (גבוה = חדש יותר)
  const byNumberDesc = (a: T, b: T) => (b.loan_number ?? 0) - (a.loan_number ?? 0)
  const byDateDesc = (a: T, b: T) => day(b.loan_date).localeCompare(day(a.loan_date)) || byNumberDesc(a, b)

  const dueCache = new Map<T, string | undefined>()
  const dueOf = (l: T) => {
    if (!dueCache.has(l)) dueCache.set(l, getDueDate(l))
    return dueCache.get(l)
  }

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case 'dateAsc':
        return day(a.loan_date).localeCompare(day(b.loan_date)) || -byNumberDesc(a, b)
      case 'due': {
        const da = dueOf(a)
        const db = dueOf(b)
        if (da && !db) return -1
        if (!da && db) return 1
        if (da && db && da !== db) return da < db ? -1 : 1
        return byDateDesc(a, b)
      }
      case 'amountDesc':
        return b.amount - a.amount || byDateDesc(a, b)
      case 'balanceDesc':
        return loanBalance(b) - loanBalance(a) || byDateDesc(a, b)
      case 'dateDesc':
      default:
        return byDateDesc(a, b)
    }
  })
}
