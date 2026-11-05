import { describe, it, expect } from 'vitest'
import { buildLoanListItems } from '../utils/loanListSort'

type L = { id: string; loan_date: string; amount: number; total_repaid?: number; due?: string }
const loan = (id: string, loan_date: string, due?: string, amount = 1000, total_repaid = 0): L =>
  ({ id, loan_date, amount, total_repaid, due })
const getDue = (l: L) => l.due
const ids = (items: ReturnType<typeof buildLoanListItems<L>>) =>
  items.map(i => (i.kind === 'family' ? `F:${i.family[0].id}` : i.loan.id))

describe('buildLoanListItems - פירעון קרוב', () => {
  it('הלוואה בודדת באיחור קודמת למשפחה עם פירעון עתידי', () => {
    const fam = [loan('f1', '2026-01-01', '2026-12-01'), loan('f2', '2026-02-01', '2026-12-15')]
    const late = loan('late', '2026-03-01', '2026-10-01')
    expect(ids(buildLoanListItems([fam], [late], 'due', getDue))).toEqual(['late', 'F:f1'])
  })

  it('משפחה ממוקמת לפי הפירעון הקרוב ביותר של חבריה', () => {
    const fam = [loan('f1', '2026-01-01', '2026-12-01'), loan('f2', '2026-02-01', '2026-11-08')]
    const a = loan('a', '2026-03-01', '2026-11-20')
    const b = loan('b', '2026-03-01', '2026-11-05')
    expect(ids(buildLoanListItems([fam], [a, b], 'due', getDue))).toEqual(['b', 'F:f1', 'a'])
  })

  it('בלי תאריך (גמישות / שנפרעו) בסוף, החדשה ראשונה', () => {
    const items = buildLoanListItems<L>(
      [],
      [loan('flex-old', '2026-01-01'), loan('dated', '2026-02-01', '2026-12-01'), loan('flex-new', '2026-05-01')],
      'due',
      getDue
    )
    expect(ids(items)).toEqual(['dated', 'flex-new', 'flex-old'])
  })

  it('משפחה שכולה בלי תאריך יורדת לסוף', () => {
    const fam = [loan('f1', '2026-06-01'), loan('f2', '2026-07-01')]
    const dated = loan('dated', '2026-01-01', '2027-01-01')
    expect(ids(buildLoanListItems([fam], [dated], 'due', getDue))).toEqual(['dated', 'F:f1'])
  })

  it('בשוויון בפירעון - החדשה ראשונה', () => {
    const a = loan('a', '2026-01-01', '2026-12-01')
    const b = loan('b', '2026-05-01', '2026-12-01')
    expect(ids(buildLoanListItems<L>([], [a, b], 'due', getDue))).toEqual(['b', 'a'])
  })
})

describe('buildLoanListItems - שיטות אחרות', () => {
  it('newest: לפי תאריך הלוואה, משפחה לפי ההלוואה הראשונה שלה', () => {
    const fam = [loan('f1', '2026-03-01'), loan('f2', '2026-09-01')]
    const a = loan('a', '2026-05-01')
    const b = loan('b', '2026-01-01')
    expect(ids(buildLoanListItems([fam], [a, b], 'newest', getDue))).toEqual(['a', 'F:f1', 'b'])
  })

  it('balance: יתרה מהגבוהה לנמוכה, משפחה לפי סכום היתרות, שנפרעו בסוף', () => {
    const fam = [loan('f1', '2026-01-01', undefined, 500, 0), loan('f2', '2026-02-01', undefined, 500, 100)]
    const big = loan('big', '2026-03-01', undefined, 2000, 0)
    const paid = loan('paid', '2026-04-01', undefined, 300, 300)
    const small = loan('small', '2026-05-01', undefined, 100, 0)
    expect(ids(buildLoanListItems([fam], [paid, small, big], 'balance', getDue))).toEqual([
      'big', 'F:f1', 'small', 'paid',
    ])
  })

  it('לא משנה את הסדר הפנימי של משפחה ולא את המערכים שהתקבלו', () => {
    const fam = [loan('f2', '2026-02-01', '2026-12-15'), loan('f1', '2026-01-01', '2026-12-01')]
    const standalone = [loan('b', '2026-01-01', '2026-12-09'), loan('a', '2026-01-01', '2026-12-08')]
    const out = buildLoanListItems([fam], standalone, 'due', getDue)
    const family = out.find(i => i.kind === 'family')!
    expect(family.kind === 'family' && family.family.map(l => l.id)).toEqual(['f2', 'f1'])
    expect(standalone.map(l => l.id)).toEqual(['b', 'a'])
  })
})
