/**
 * פילוח הלוואות לפי גודל הלוואה ולפי תקופת הלוואה - לדו"ח הסטטיסטיקות.
 *
 * המטרה: שמנהל הגמ"ח יראה אילו סכומים מבוקשים הכי הרבה ולכמה זמן,
 * ולא רק "כמה הלוואות ובאיזה סכום כולל".
 * פונקציות טהורות, בלי תלות ב-database.
 */

export interface BreakdownLoan {
  amount: number
  loan_date: string
  due_date?: string
  auto_repayment?: number
  repayment_amount?: number
}

export interface BreakdownRow {
  key: string
  label: string
  count: number
  total: number
  /** אחוז מכלל ההלוואות (לפי מספר), מעוגל לשלמים */
  percent: number
}

export interface LoanBreakdown {
  byAmount: BreakdownRow[]
  byPeriod: BreakdownRow[]
  totalCount: number
  totalAmount: number
  averageAmount: number
  /** ממוצע תקופה בחודשים - רק להלוואות שיש להן תקופה ידועה */
  averageMonths: number | null
}

interface Bucket {
  key: string
  label: string
  /** גבול עליון כולל; undefined = ללא גבול */
  max?: number
}

export const AMOUNT_BUCKETS: Bucket[] = [
  { key: 'upTo1k', label: 'עד ₪1,000', max: 1000 },
  { key: 'upTo3k', label: '₪1,001 - ₪3,000', max: 3000 },
  { key: 'upTo5k', label: '₪3,001 - ₪5,000', max: 5000 },
  { key: 'upTo10k', label: '₪5,001 - ₪10,000', max: 10000 },
  { key: 'upTo20k', label: '₪10,001 - ₪20,000', max: 20000 },
  { key: 'upTo50k', label: '₪20,001 - ₪50,000', max: 50000 },
  { key: 'over50k', label: 'מעל ₪50,000' },
]

export const PERIOD_BUCKETS: Bucket[] = [
  { key: 'upTo1m', label: 'עד חודש', max: 1 },
  { key: 'upTo3m', label: '2 - 3 חודשים', max: 3 },
  { key: 'upTo6m', label: '4 - 6 חודשים', max: 6 },
  { key: 'upTo12m', label: '7 - 12 חודשים', max: 12 },
  { key: 'upTo24m', label: '13 - 24 חודשים', max: 24 },
  { key: 'over24m', label: 'מעל שנתיים' },
]

export const FLEXIBLE_PERIOD_KEY = 'flexible'
const FLEXIBLE_PERIOD_LABEL = 'גמישה (ללא תאריך פירעון)'

function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

/**
 * תקופת ההלוואה המתוכננת בחודשים (מעוגל למעלה), או null כשאין תקופה ידועה.
 * - פירעון חודשי אוטומטי: מספר התשלומים = סכום ÷ תשלום חודשי
 * - תאריך פירעון קבוע: המרחק בין תאריך ההלוואה לתאריך הפירעון
 * - הלוואה גמישה: null
 */
export function getLoanPeriodMonths(loan: BreakdownLoan): number | null {
  if (loan.auto_repayment === 1 && (loan.repayment_amount || 0) > 0 && loan.amount > 0) {
    return Math.max(1, Math.ceil(loan.amount / (loan.repayment_amount as number)))
  }
  if (loan.due_date) {
    const start = parseYmd(loan.loan_date)
    const end = parseYmd(loan.due_date)
    if (!start || !end || end < start) return null
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth()) +
      (end.getDate() > start.getDate() ? 1 : 0)
    return Math.max(1, months)
  }
  return null
}

function bucketFor(value: number, buckets: Bucket[]): Bucket {
  return buckets.find(b => b.max === undefined || value <= b.max) || buckets[buckets.length - 1]
}

export function buildLoanBreakdown(loans: BreakdownLoan[]): LoanBreakdown {
  const totalCount = loans.length
  const totalAmount = loans.reduce((s, l) => s + (l.amount || 0), 0)
  const pct = (n: number) => (totalCount ? Math.round((n / totalCount) * 100) : 0)

  const amountRows = new Map<string, BreakdownRow>(
    AMOUNT_BUCKETS.map(b => [b.key, { key: b.key, label: b.label, count: 0, total: 0, percent: 0 }])
  )
  const periodRows = new Map<string, BreakdownRow>(
    [...PERIOD_BUCKETS, { key: FLEXIBLE_PERIOD_KEY, label: FLEXIBLE_PERIOD_LABEL }].map(b => [
      b.key,
      { key: b.key, label: b.label, count: 0, total: 0, percent: 0 },
    ])
  )

  let monthsSum = 0
  let monthsCount = 0

  for (const loan of loans) {
    const amount = loan.amount || 0

    const amountRow = amountRows.get(bucketFor(amount, AMOUNT_BUCKETS).key)!
    amountRow.count++
    amountRow.total += amount

    const months = getLoanPeriodMonths(loan)
    const periodKey = months === null ? FLEXIBLE_PERIOD_KEY : bucketFor(months, PERIOD_BUCKETS).key
    const periodRow = periodRows.get(periodKey)!
    periodRow.count++
    periodRow.total += amount
    if (months !== null) {
      monthsSum += months
      monthsCount++
    }
  }

  const finish = (rows: Map<string, BreakdownRow>) =>
    [...rows.values()].map(r => ({ ...r, percent: pct(r.count) }))

  return {
    byAmount: finish(amountRows),
    byPeriod: finish(periodRows),
    totalCount,
    totalAmount,
    averageAmount: totalCount ? Math.round(totalAmount / totalCount) : 0,
    averageMonths: monthsCount ? Math.round((monthsSum / monthsCount) * 10) / 10 : null,
  }
}
