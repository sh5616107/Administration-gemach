/**
 * בדיקות ל-getLoanDueDate / sortByDueDate (utils/loanDueDate.ts).
 * כל הבדיקות מקבלות today מפורש, כדי שלא יהיו תלויות בתאריך האמיתי.
 */
import { describe, it, expect } from 'vitest'
import { getLoanDueDate, sortByDueDate, formatDueDate, type LoanDueInput } from '../utils/loanDueDate'

const base: LoanDueInput = {
  status: 'active',
  loan_date: '2026-01-01',
  loan_type: 'flexible',
  amount: 1000,
  total_repaid: 0,
}

describe('getLoanDueDate - הלוואה קבועה', () => {
  const fixed = { ...base, loan_type: 'fixed', due_date: '2026-11-20' }

  it('מציגה את due_date', () => {
    const r = getLoanDueDate(fixed, { today: '2026-11-04' })
    expect(r).toEqual({ date: '2026-11-20', kind: 'fixed', status: 'ok' })
  })

  it('עד 7 ימים = due-soon', () => {
    expect(getLoanDueDate(fixed, { today: '2026-11-13' }).status).toBe('due-soon')
    expect(getLoanDueDate(fixed, { today: '2026-11-12' }).status).toBe('ok')
  })

  it('היום עצמו = due-soon, אתמול = overdue', () => {
    expect(getLoanDueDate(fixed, { today: '2026-11-20' }).status).toBe('due-soon')
    expect(getLoanDueDate(fixed, { today: '2026-11-21' }).status).toBe('overdue')
  })

  it('הלוואה שנפרעה לא מציגה תאריך', () => {
    expect(getLoanDueDate({ ...fixed, total_repaid: 1000 }, { today: '2026-11-04' }).kind).toBe('none')
    expect(getLoanDueDate({ ...fixed, remaining: 0 }, { today: '2026-11-04' }).date).toBeUndefined()
  })

  it('סטטוס closed / transferred לא מציג', () => {
    expect(getLoanDueDate({ ...fixed, status: 'closed' }, { today: '2026-11-04' }).date).toBeUndefined()
    expect(getLoanDueDate({ ...fixed, status: 'transferred' }, { today: '2026-11-04' }).date).toBeUndefined()
  })

  it('הלוואה עתידית (planned) מציגה תאריך בלי סימון איחור', () => {
    const r = getLoanDueDate(
      { ...fixed, status: 'planned', loan_date: '2026-12-01', due_date: '2026-11-01' },
      { today: '2026-11-04' }
    )
    expect(r.date).toBe('2026-11-01')
    expect(r.status).toBe('ok')
  })
})

describe('getLoanDueDate - הלוואה גמישה', () => {
  it('בלי תאריך', () => {
    expect(getLoanDueDate(base, { today: '2026-11-04' })).toEqual({ kind: 'none', status: 'none' })
  })

  it('due_date שנשאר מהעבר לא מוצג (לפי loan_type)', () => {
    expect(getLoanDueDate({ ...base, due_date: '2026-11-20' }, { today: '2026-11-04' }).date).toBeUndefined()
  })
})

describe('getLoanDueDate - פירעון אוטומטי', () => {
  const rec = { ...base, auto_repayment: 1, repayment_day: 10, loan_date: '2026-01-01' }

  it('עוד לא עבר יום הפירעון ולא שולם -> החודש', () => {
    const r = getLoanDueDate(rec, { today: '2026-11-04' })
    expect(r).toEqual({ date: '2026-11-10', kind: 'recurring', status: 'due-soon' })
  })

  it('כבר שולם החודש -> החודש הבא', () => {
    const r = getLoanDueDate(rec, { today: '2026-11-04', lastRepaymentDate: '2026-11-02' })
    expect(r.date).toBe('2026-12-10')
    expect(r.status).toBe('ok')
  })

  it('יום הפירעון עבר ולא שולם החודש -> באיחור (תאריך החודש הנוכחי)', () => {
    const r = getLoanDueDate(rec, { today: '2026-11-20', lastRepaymentDate: '2026-10-10' })
    expect(r.date).toBe('2026-11-10')
    expect(r.status).toBe('overdue')
  })

  it('יום 31 בחודש קצר -> היום האחרון של החודש', () => {
    const r = getLoanDueDate({ ...rec, repayment_day: 31 }, { today: '2026-11-04' })
    expect(r.date).toBe('2026-11-30')
    const feb = getLoanDueDate({ ...rec, repayment_day: 31 }, { today: '2027-02-03' })
    expect(feb.date).toBe('2027-02-28')
  })

  it('גלישת שנה: שולם בדצמבר -> ינואר', () => {
    const r = getLoanDueDate(rec, { today: '2026-12-05', lastRepaymentDate: '2026-12-01' })
    expect(r.date).toBe('2027-01-10')
  })

  it('הלוואה חדשה בלי פירעונות עדיין מציגה תאריך', () => {
    const r = getLoanDueDate({ ...rec, loan_date: '2026-11-01' }, { today: '2026-11-04' })
    expect(r.date).toBe('2026-11-10')
  })

  it('הלוואה שנוצרה אחרי יום הפירעון של החודש: לא באיחור, הפירעון הבא בחודש הבא', () => {
    const r = getLoanDueDate({ ...rec, loan_date: '2026-11-15' }, { today: '2026-11-20' })
    expect(r.date).toBe('2026-12-10')
    expect(r.status).toBe('ok')
  })

  it('repayment_start_date עתידי -> הפירעון הראשון אחריו', () => {
    const r = getLoanDueDate(
      { ...rec, repayment_start_date: '2027-02-15' },
      { today: '2026-11-04' }
    )
    expect(r.date).toBe('2027-03-10')
  })

  it('repayment_start_date שיום הפירעון בדיוק בו -> אותו תאריך', () => {
    const r = getLoanDueDate({ ...rec, repayment_start_date: '2027-02-10' }, { today: '2026-11-04' })
    expect(r.date).toBe('2027-02-10')
  })

  it('הלוואה שנפרעה לא מציגה', () => {
    expect(getLoanDueDate({ ...rec, total_repaid: 1000 }, { today: '2026-11-04' }).kind).toBe('none')
  })
})

describe('sortByDueDate', () => {
  const mk = (id: string, loan_date: string, due?: string) => ({ id, loan_date, due })
  const info = (x: { due?: string }) => ({ date: x.due, kind: 'fixed' as const, status: 'ok' as const })

  it('פירעון קרוב ראשון, בלי תאריך בסוף, שוויון לפי תאריך הלוואה חדש->ישן', () => {
    const items = [
      mk('none-old', '2026-01-01'),
      mk('late', '2026-02-01', '2026-12-01'),
      mk('soon-old', '2026-01-05', '2026-11-10'),
      mk('soon-new', '2026-03-01', '2026-11-10'),
      mk('overdue', '2026-02-01', '2026-10-01'),
      mk('none-new', '2026-05-01'),
    ]
    expect(sortByDueDate(items, info).map(i => i.id)).toEqual([
      'overdue', 'soon-new', 'soon-old', 'late', 'none-new', 'none-old',
    ])
  })

  it('לא משנה את המערך המקורי', () => {
    const items = [mk('b', '2026-01-01', '2026-12-01'), mk('a', '2026-01-01', '2026-11-01')]
    sortByDueDate(items, info)
    expect(items[0].id).toBe('b')
  })
})

describe('formatDueDate', () => {
  it('dd.m.yyyy בלי אפסים מובילים, כמו he-IL', () => {
    expect(formatDueDate('2026-09-05')).toBe('5.9.2026')
  })
})
