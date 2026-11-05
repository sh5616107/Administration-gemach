/**
 * מיון רשימת ההלוואות במסך "לווים והלוואות".
 *
 * המסך מציג שני סוגי פריטים: "משפחות" (סדרת הלוואות מחזוריות מקובצת) והלוואות בודדות.
 * כאן הם ממוינים יחד לרשימה אחת, כך שהלוואה בודדת באיחור לא נשארת מתחת למשפחות.
 * פונקציות טהורות, בלי תלות בקובץ הנתונים / SQLite.
 */

export type LoanSortMode = 'due' | 'newest' | 'balance'

export const LOAN_SORT_LABELS: Record<LoanSortMode, string> = {
  due: 'פירעון קרוב',
  newest: 'תאריך הלוואה (חדש לישן)',
  balance: 'יתרה (גבוהה לנמוכה)',
}

export type LoanListItem<T> =
  | { kind: 'family'; family: T[] }
  | { kind: 'loan'; loan: T }

interface SortableLoan {
  loan_date: string
  amount: number
  total_repaid?: number
}

const balanceOf = (l: SortableLoan) => Math.max(0, l.amount - (l.total_repaid ?? 0))

/**
 * @param families        משפחות מחזוריות (כל משפחה כבר ממוינת לפי מספר הלוואה - לא משנים אותה)
 * @param standalone      הלוואות בודדות
 * @param mode            שיטת המיון
 * @param getDueDate      תאריך פירעון של הלוואה (YYYY-MM-DD) או undefined אם אין
 *
 * מיון "פירעון קרוב": באיחור ראשון, אחריו הקרובות, אחריהן בלי תאריך (גמישות / שנפרעו).
 * משפחה מקבלת את הפירעון הקרוב ביותר מבין ההלוואות שלה.
 * בשוויון - החדשה ראשונה.
 */
export function buildLoanListItems<T extends SortableLoan>(
  families: T[][],
  standalone: T[],
  mode: LoanSortMode,
  getDueDate: (loan: T) => string | undefined
): LoanListItem<T>[] {
  type Entry = { item: LoanListItem<T>; due?: string; newest: string; balance: number }

  const entries: Entry[] = [
    ...families.map((family): Entry => {
      const dates = family.map(getDueDate).filter((d): d is string => !!d).sort()
      return {
        item: { kind: 'family', family },
        due: dates[0],
        // כמו שהיה עד היום: משפחה ממוקמת לפי תאריך ההלוואה הראשונה שלה
        newest: family[0].loan_date,
        balance: family.reduce((sum, l) => sum + balanceOf(l), 0),
      }
    }),
    ...standalone.map((loan): Entry => ({
      item: { kind: 'loan', loan },
      due: getDueDate(loan),
      newest: loan.loan_date,
      balance: balanceOf(loan),
    })),
  ]

  const byNewest = (a: Entry, b: Entry) => b.newest.localeCompare(a.newest)

  entries.sort((a, b) => {
    if (mode === 'due') {
      if (a.due && !b.due) return -1
      if (!a.due && b.due) return 1
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1
      return byNewest(a, b)
    }
    if (mode === 'balance') {
      return b.balance - a.balance || byNewest(a, b)
    }
    return byNewest(a, b)
  })

  return entries.map(e => e.item)
}
