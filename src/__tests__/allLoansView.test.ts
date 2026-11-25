import { describe, it, expect } from 'vitest'
import { buildAllLoansList } from '../utils/allLoansView'

const loans = [
  { id: 'a', loan_number: 1, loan_date: '2026-03-10', amount: 5000, total_repaid: 5000, borrower_name: 'תת' },
  { id: 'b', loan_number: 2, loan_date: '2026-01-05', amount: 2000, total_repaid: 0, borrower_name: 'אא' },
  { id: 'c', loan_number: 3, loan_date: '2026-06-20', amount: 8000, total_repaid: 1000, borrower_name: 'בב' },
  { id: 'd', loan_number: 4, loan_date: '2026-06-20', amount: 1000, total_repaid: 0, borrower_name: 'גג' },
]
const due: Record<string, string | undefined> = { a: undefined, b: '2026-02-01', c: '2026-12-01', d: undefined }
const ids = (list: typeof loans) => list.map(l => l.id)
const build = (o: Partial<Parameters<typeof buildAllLoansList>[1]>) =>
  buildAllLoansList(loans, { sort: 'dateDesc', status: 'all', ...o }, l => due[l.id])

describe('תצוגת כל ההלוואות', () => {
  it('ממיין לפי תאריך הלוואה ולא לפי שם הלווה, מהחדש לישן', () => {
    expect(ids(build({}))).toEqual(['d', 'c', 'a', 'b'])
  })

  it('ממיין מהישן לחדש', () => {
    expect(ids(build({ sort: 'dateAsc' }))).toEqual(['b', 'a', 'c', 'd'])
  })

  it('פירעון קרוב: עם תאריך קודם, בלי תאריך בסוף', () => {
    expect(ids(build({ sort: 'due' }))).toEqual(['b', 'c', 'd', 'a'])
  })

  it('לפי סכום ולפי יתרה', () => {
    expect(ids(build({ sort: 'amountDesc' }))).toEqual(['c', 'a', 'b', 'd'])
    expect(ids(build({ sort: 'balanceDesc' }))).toEqual(['c', 'b', 'd', 'a'])
  })

  it('מסנן פעילות / נפרעו', () => {
    expect(ids(build({ status: 'open' }))).toEqual(['d', 'c', 'b'])
    expect(ids(build({ status: 'paid' }))).toEqual(['a'])
  })

  it('מסנן לפי טווח תאריכי הלוואה (כולל הקצוות)', () => {
    expect(ids(build({ fromDate: '2026-03-10', toDate: '2026-06-19' }))).toEqual(['a'])
    expect(ids(build({ fromDate: '2026-06-20' }))).toEqual(['d', 'c'])
  })
})
