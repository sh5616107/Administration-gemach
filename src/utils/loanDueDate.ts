/**
 * חישוב תאריך פירעון להצגה (כרטיס הלוואה, דיאלוג "הלוואות פעילות") ולמיון.
 *
 * פונקציות טהורות, בלי תלות ב-database / בקובץ הנתונים, כדי שיעבדו אותו דבר
 * גם אחרי המעבר ל-SQLite. כל ההשוואות הן על מחרוזות YYYY-MM-DD (שעון מקומי),
 * כמו בשאר המערכת (למשל getOverdue ב-database.ts).
 */

import { toLocalDateStr } from './localDate'

export type LoanDueKind = 'fixed' | 'recurring' | 'none'
export type LoanDueStatus = 'overdue' | 'due-soon' | 'ok' | 'none'

export interface LoanDueInfo {
  /** YYYY-MM-DD. חסר כשאין תאריך (הלוואה גמישה, נסגרה, הועברה לערבים...). */
  date?: string
  kind: LoanDueKind
  status: LoanDueStatus
}

/** השדות של הלוואה שהחישוב צריך (תואם ל-Loan ב-database.ts). */
export interface LoanDueInput {
  status: string
  loan_date: string
  loan_type: string
  amount: number
  due_date?: string
  auto_repayment?: number
  repayment_day?: number
  repayment_start_date?: string
  remaining?: number
  total_repaid?: number
}

export interface LoanDueOptions {
  /** תאריך הפירעון האחרון שנרשם להלוואה (YYYY-MM-DD). נחוץ רק להלוואות עם פירעון אוטומטי. */
  lastRepaymentDate?: string
  /** "היום" (YYYY-MM-DD). ברירת מחדל: היום לפי שעון מקומי. לבדיקות. */
  today?: string
}

/** כמה ימים לפני התאריך נחשב "מתקרב" */
export const DUE_SOON_DAYS = 7

const pad = (n: number) => String(n).padStart(2, '0')

function ymd(year: number, month0: number, day: number): string {
  // new Date מטפל בגלישת חודש/שנה (month0 = 12 -> ינואר שנה הבאה)
  const d = new Date(year, month0, day)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseYmd(s: string): { y: number; m0: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return { y, m0: m - 1, d }
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

/** יום הפירעון בחודש נתון; חודש קצר מקבל את היום האחרון שלו (31 -> 30/28). */
function dueInMonth(year: number, month0: number, repaymentDay: number): string {
  const real = new Date(year, month0, 1)
  const y = real.getFullYear()
  const m0 = real.getMonth()
  return ymd(y, m0, Math.min(repaymentDay, lastDayOfMonth(y, m0)))
}

/** הפירעון הראשון שחל ביום repaymentDay בתאריך start או אחריו. */
function firstDueOnOrAfter(start: string, repaymentDay: number): string {
  const { y, m0 } = parseYmd(start)
  for (let i = 0; i < 3; i++) {
    const candidate = dueInMonth(y, m0 + i, repaymentDay)
    if (candidate >= start) return candidate
  }
  return dueInMonth(y, m0 + 3, repaymentDay)
}

function addDays(dateStr: string, days: number): string {
  const { y, m0, d } = parseYmd(dateStr)
  return ymd(y, m0, d + days)
}

/**
 * הפירעון האוטומטי הבא של הלוואה, באותו היגיון של ה-scheduler:
 * אם החודש כבר נרשם פירעון -> החודש הבא.
 * אם לא נרשם ויום הפירעון עבר -> התאריך של החודש הנוכחי (וזה "באיחור").
 */
function nextRecurringDue(
  repaymentDay: number,
  today: string,
  lastRepaymentDate: string | undefined,
  startDate: string | undefined
): string {
  const { y, m0 } = parseYmd(today)
  const firstOfMonth = ymd(y, m0, 1)
  const paidThisMonth = !!lastRepaymentDate && lastRepaymentDate >= firstOfMonth

  let candidate = dueInMonth(y, m0 + (paidThisMonth ? 1 : 0), repaymentDay)

  // הפירעון הראשון לא יכול לחול לפני תחילת ההלוואה/הפירעונות
  if (startDate && candidate < startDate) {
    candidate = firstDueOnOrAfter(startDate, repaymentDay)
  }
  return candidate
}

function outstanding(loan: LoanDueInput): number {
  if (typeof loan.remaining === 'number') return loan.remaining
  return loan.amount - (loan.total_repaid ?? 0)
}

const NONE: LoanDueInfo = { kind: 'none', status: 'none' }

export function getLoanDueDate(loan: LoanDueInput, options: LoanDueOptions = {}): LoanDueInfo {
  const today = options.today ?? toLocalDateStr()

  // רק הלוואות שעדיין לא נסגרו ולא הועברו לערבים
  if (loan.status !== 'active' && loan.status !== 'overdue' && loan.status !== 'planned') return NONE
  if (outstanding(loan) <= 0) return NONE

  let date: string | undefined
  let kind: LoanDueKind = 'none'

  if (loan.auto_repayment === 1 && loan.repayment_day) {
    kind = 'recurring'
    date = nextRecurringDue(
      loan.repayment_day,
      today,
      options.lastRepaymentDate,
      loan.repayment_start_date || loan.loan_date
    )
  } else if (loan.loan_type === 'fixed' && loan.due_date) {
    // לפי loan_type ולא לפי קיום השדה: הלוואה גמישה ישנה עלולה להחזיק due_date שנשאר
    kind = 'fixed'
    date = loan.due_date.slice(0, 10)
  }

  if (!date) return NONE

  // הלוואה עתידית: מציגים את התאריך אבל בלי סימון איחור/קרוב
  const isPlanned = loan.status === 'planned' || loan.loan_date > today
  let status: LoanDueStatus = 'ok'
  if (!isPlanned) {
    if (date < today) status = 'overdue'
    else if (date <= addDays(today, DUE_SOON_DAYS)) status = 'due-soon'
  }

  return { date, kind, status }
}

/**
 * ערך מיון לפי פירעון: מחרוזת תאריך, או undefined כשאין תאריך.
 * ב-ItemsListDialog ערך null/undefined נשלח תמיד לסוף, בשני כיווני המיון.
 */
export function dueSortValue(info: LoanDueInfo): string | undefined {
  return info.date
}

/**
 * מיון ברירת מחדל: פירעון קרוב ראשון (באיחור = הכי ראשון), בלי תאריך בסוף,
 * ובשוויון - לפי תאריך ההלוואה מהחדש לישן.
 */
export function sortByDueDate<T extends { loan_date: string }>(
  items: T[],
  getInfo: (item: T) => LoanDueInfo
): T[] {
  return [...items].sort((a, b) => {
    const da = getInfo(a).date
    const db = getInfo(b).date
    if (da && !db) return -1
    if (!da && db) return 1
    if (da && db && da !== db) return da < db ? -1 : 1
    return b.loan_date.localeCompare(a.loan_date)
  })
}

/** "dd.mm.yyyy" לתצוגה, בלי תלות באזור זמן. */
export function formatDueDate(dateStr: string): string {
  const { y, m0, d } = parseYmd(dateStr)
  return `${d}.${m0 + 1}.${y}`
}
