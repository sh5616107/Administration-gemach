/**
 * החזר הפקדות קבועות בחישוב "כסף צפוי להשתחרר"
 * הפקדה קבועה עם תאריך החזר מנוכה מהכסף הצפוי בטווח שבו חל מועד ההחזר.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateExpectedFunds,
  getFixedDepositReturns,
  type Deposit,
} from '../services/expectedFundsCalculator'

const today = new Date(2026, 1, 1) // 01/02/2026 שעון מקומי

const fixed = (over: Partial<Deposit>): Deposit => ({
  id: 'd1',
  depositor_id: 'p1',
  amount: 10000,
  deposit_date: '2025-02-01',
  status: 'active',
  period_type: 'fixed',
  due_date: '2026-02-05',
  ...over,
})

describe('החזר הפקדות קבועות', () => {
  it('מנכה החזר שחל בשבוע הקרוב מכל הטווחים', () => {
    const result = calculateExpectedFunds([], [fixed({})], today)
    expect(result.week).toBe(-10000)
    expect(result.month).toBe(-10000)
    expect(result.threeMonths).toBe(-10000)
    expect(result.depositReturns).toEqual({ week: 10000, month: 10000, threeMonths: 10000 })
  })

  it('החזר בעוד חודשיים מנוכה רק מ-3 חודשים', () => {
    const result = calculateExpectedFunds([], [fixed({ due_date: '2026-04-01' })], today)
    expect(result.week).toBe(0)
    expect(result.month).toBe(0)
    expect(result.threeMonths).toBe(-10000)
  })

  it('לא מנכה החזר רחוק מ-3 חודשים', () => {
    const result = calculateExpectedFunds([], [fixed({ due_date: '2026-08-01' })], today)
    expect(result.threeMonths).toBe(0)
    expect(result.depositReturns.threeMonths).toBe(0)
  })

  it('מתעלם מהפקדה גמישה, ממשוכה ומהפקדה בלי תאריך החזר', () => {
    const deposits = [
      fixed({ id: 'a', period_type: 'flexible' }),
      fixed({ id: 'b', status: 'withdrawn' }),
      fixed({ id: 'c', due_date: '' }),
      fixed({ id: 'd', status: 'planned' }),
    ]
    expect(getFixedDepositReturns(deposits, today)).toEqual([])
    expect(calculateExpectedFunds([], deposits, today).month).toBe(0)
  })

  it('מנכה רק את היתרה אחרי משיכה חלקית', () => {
    const result = calculateExpectedFunds([], [fixed({ withdrawn_amount: 4000 })], today)
    expect(result.month).toBe(-6000)
  })

  it('החזר שמועדו עבר ועדיין לא הוחזר מנוכה מיד ומסומן כבאיחור', () => {
    const returns = getFixedDepositReturns([fixed({ due_date: '2026-01-15' })], today)
    expect(returns).toHaveLength(1)
    expect(returns[0].overdue).toBe(true)
    expect(returns[0].periods).toEqual(['week', 'month', 'threeMonths'])
  })

  it('מקזז מול פירעון הלוואה באותו טווח', () => {
    const result = calculateExpectedFunds(
      [{ id: 'l1', borrower_id: 'b1', amount: 15000, loan_date: '2026-01-01', status: 'active', remaining: 15000, due_date: '2026-02-20' }],
      [fixed({ due_date: '2026-02-10' })],
      today
    )
    expect(result.week).toBe(0)
    expect(result.month).toBe(5000)
  })

  it('מסנן לפי קופה', () => {
    const deposits = [fixed({ id: 'a', fund_id: 'f1' }), fixed({ id: 'b', fund_id: 'f2', amount: 3000 })]
    const result = calculateExpectedFunds([], deposits, today, 'f2')
    expect(result.month).toBe(-3000)
  })
})
