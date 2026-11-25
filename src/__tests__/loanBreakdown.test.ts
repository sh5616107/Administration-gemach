import { describe, it, expect } from 'vitest'
import { buildLoanBreakdown, getLoanPeriodMonths } from '../utils/loanBreakdown'

describe('תקופת הלוואה', () => {
  it('פירעון אוטומטי: סכום חלקי תשלום חודשי, מעוגל למעלה', () => {
    expect(getLoanPeriodMonths({ amount: 10000, loan_date: '2026-01-01', auto_repayment: 1, repayment_amount: 1000 })).toBe(10)
    expect(getLoanPeriodMonths({ amount: 10500, loan_date: '2026-01-01', auto_repayment: 1, repayment_amount: 1000 })).toBe(11)
  })

  it('תאריך פירעון קבוע: חודשים בין התאריכים', () => {
    expect(getLoanPeriodMonths({ amount: 5000, loan_date: '2026-01-10', due_date: '2026-07-10' })).toBe(6)
    expect(getLoanPeriodMonths({ amount: 5000, loan_date: '2026-01-10', due_date: '2026-07-11' })).toBe(7)
    expect(getLoanPeriodMonths({ amount: 5000, loan_date: '2026-01-10', due_date: '2026-01-20' })).toBe(1)
  })

  it('הלוואה גמישה או תאריך לא תקין: אין תקופה', () => {
    expect(getLoanPeriodMonths({ amount: 5000, loan_date: '2026-01-10' })).toBeNull()
    expect(getLoanPeriodMonths({ amount: 5000, loan_date: '2026-01-10', due_date: '2025-01-01' })).toBeNull()
  })
})

describe('פילוח הלוואות', () => {
  const loans = [
    { amount: 1000, loan_date: '2026-01-01', due_date: '2026-02-01' },
    { amount: 4000, loan_date: '2026-01-01', auto_repayment: 1, repayment_amount: 500 },
    { amount: 4500, loan_date: '2026-01-01', due_date: '2026-04-01' },
    { amount: 60000, loan_date: '2026-01-01' },
  ]
  const result = buildLoanBreakdown(loans)

  it('סופר לפי טווחי סכום', () => {
    const row = (k: string) => result.byAmount.find(r => r.key === k)!
    expect(row('upTo1k').count).toBe(1)
    expect(row('upTo5k')).toMatchObject({ count: 2, total: 8500, percent: 50 })
    expect(row('over50k').count).toBe(1)
    expect(result.byAmount.reduce((s, r) => s + r.count, 0)).toBe(4)
  })

  it('סופר לפי טווחי תקופה, כולל גמישות', () => {
    const row = (k: string) => result.byPeriod.find(r => r.key === k)!
    expect(row('upTo1m').count).toBe(1)
    expect(row('upTo3m').count).toBe(1)
    expect(row('upTo12m').count).toBe(1) // 4000 / 500 = 8 חודשים
    expect(row('flexible')).toMatchObject({ count: 1, total: 60000 })
  })

  it('ממוצעים', () => {
    expect(result.totalCount).toBe(4)
    expect(result.averageAmount).toBe(17375)
    expect(result.averageMonths).toBe(4) // (1 + 8 + 3) / 3
  })

  it('רשימה ריקה', () => {
    const empty = buildLoanBreakdown([])
    expect(empty.totalCount).toBe(0)
    expect(empty.averageMonths).toBeNull()
    expect(empty.byAmount.every(r => r.percent === 0)).toBe(true)
  })
})
