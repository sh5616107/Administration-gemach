/**
 * רגרסיה: אירועי לוח שנה "תקועים" על התאריך המקורי / פירעונות מחזוריים אחרי תום החוב.
 *
 * באג 1: עריכת תאריך (פירעון קבוע / יום פירעון / תחילת פירעון / יום הלוואה מחזורית)
 *        לא באה לידי ביטוי בלוח השנה.
 * באג 2: פירעון מחזורי ממשיך להופיע בלוח השנה גם אחרי שהחוב נפרע (או אחרי שהתוכנית נגמרה).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loansService, borrowersService, repaymentsService, db } from '../services/database'
import { getEventsForMonth, CalendarEvent } from '../services/calendarService'

// "היום" קבוע: 10 ביוני 2026. מזייפים רק את Date כדי לא לתקוע טיימרים של שמירה.
const TODAY = new Date(2026, 5, 10)

const planned = (events: CalendarEvent[], loanId?: string) =>
  events.filter(e =>
    e.type === 'repayment' &&
    e.title.includes('מתוכנן') &&
    (loanId === undefined || e.relatedId === loanId)
  )

/** אירועי חודש לפי offset מהחודש הנוכחי (0 = יוני 2026) */
const monthEvents = (offset: number) => {
  const d = new Date(2026, 5 + offset, 1)
  return getEventsForMonth(d.getFullYear(), d.getMonth())
}

async function createBorrower() {
  const r = await borrowersService.create({
    first_name: 'משה',
    last_name: 'כהן',
    id_number: '123456789',
    phone: '0501234567',
    email: 'moshe@test.com',
    address: 'רחוב 1'
  })
  return r.lastInsertRowid
}

describe('Calendar - stale / over-extended recurring events', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(TODAY)
    await db.run('DELETE FROM repayments')
    await db.run('DELETE FROM loans')
    await db.run('DELETE FROM borrowers')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ---------------------------------------------------------------- באג 2
  describe('bug 2: no repayment events after the debt is finished', () => {
    it('stops projecting repayments after ceil(remaining / repayment_amount) months', async () => {
      const borrowerId = await createBorrower()
      // 3000 ₪, 1000 לחודש, מתחיל 1.6.2026, יום 20 => 20.6, 20.7, 20.8 ותו לא
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 3000,
        loan_date: '2026-06-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 20,
        repayment_start_date: '2026-06-01'
      })

      expect(planned(await monthEvents(0), loanId)).toHaveLength(1) // יוני
      expect(planned(await monthEvents(1), loanId)).toHaveLength(1) // יולי
      expect(planned(await monthEvents(2), loanId)).toHaveLength(1) // אוגוסט
      expect(planned(await monthEvents(3), loanId)).toHaveLength(0) // ספטמבר - החוב נגמר
      expect(planned(await monthEvents(4), loanId)).toHaveLength(0)
      expect(planned(await monthEvents(24), loanId)).toHaveLength(0)
    })

    it('last projected repayment is capped to what is left', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 2500,
        loan_date: '2026-06-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 20,
        repayment_start_date: '2026-06-01'
      })

      expect(planned(await monthEvents(0), loanId)[0].amount).toBe(1000)
      expect(planned(await monthEvents(1), loanId)[0].amount).toBe(1000)
      expect(planned(await monthEvents(2), loanId)[0].amount).toBe(500)
      expect(planned(await monthEvents(3), loanId)).toHaveLength(0)
    })

    it('counts repayments already made: only the remaining debt is projected', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 4000,
        loan_date: '2026-04-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 20,
        repayment_start_date: '2026-04-01'
      })
      // שולמו אפריל, מאי ויוני (כבר החודש) => מתוך 4000 נשאר 1000 => פירעון אחד בלבד, ביולי
      for (const d of ['2026-04-20', '2026-05-20', '2026-06-08']) {
        await repaymentsService.create({ loan_id: loanId, amount: 1000, payment_date: d })
      }

      expect(planned(await monthEvents(0), loanId)).toHaveLength(0) // יוני - כבר שולם
      expect(planned(await monthEvents(1), loanId)).toHaveLength(1) // יולי - האחרון
      expect(planned(await monthEvents(1), loanId)[0].amount).toBe(1000)
      expect(planned(await monthEvents(2), loanId)).toHaveLength(0)
      expect(planned(await monthEvents(12), loanId)).toHaveLength(0)
    })

    it('shows nothing once the loan is fully repaid and closed', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2026-05-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 20,
        repayment_start_date: '2026-05-01'
      })
      await repaymentsService.create({ loan_id: loanId, amount: 1000, payment_date: '2026-05-20' })
      await loansService.update(loanId, { status: 'closed' })

      for (const offset of [0, 1, 2, 6]) {
        expect(planned(await monthEvents(offset), loanId)).toHaveLength(0)
      }
    })
  })

  // ---------------------------------------------------------------- באג 1
  describe('bug 1: edited dates are reflected in the calendar', () => {
    it('fixed loan: moving due_date later moves the loan_due event', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 5000,
        loan_date: '2026-05-01',
        loan_type: 'fixed',
        due_date: '2026-07-15',
        is_recurring: 0,
        auto_repayment: 0
      })
      expect((await monthEvents(1)).filter(e => e.type === 'loan_due')).toHaveLength(1)

      await loansService.update(loanId, { due_date: '2026-09-15' })

      expect((await monthEvents(1)).filter(e => e.type === 'loan_due')).toHaveLength(0)
      const sept = (await monthEvents(3)).filter(e => e.type === 'loan_due')
      expect(sept).toHaveLength(1)
      expect(sept[0].date).toBe('2026-09-15')
    })

    it('auto repayment: changing repayment_day moves the planned event (no leftover on the old day)', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 6000,
        loan_date: '2026-06-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 5,
        repayment_start_date: '2026-06-01'
      })
      expect(planned(await monthEvents(1), loanId).map(e => e.date)).toEqual(['2026-07-05'])

      await loansService.update(loanId, { repayment_day: 25 })

      expect(planned(await monthEvents(1), loanId).map(e => e.date)).toEqual(['2026-07-25'])
    })

    it('auto repayment: postponing repayment_start_date removes earlier events and never lands before the start date', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 3000,
        loan_date: '2026-06-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 5,
        repayment_start_date: '2026-06-01'
      })
      expect(planned(await monthEvents(1), loanId)).toHaveLength(1) // 5.7

      // דוחים את תחילת הפירעון ל-10.9 (יום הפירעון 5 => הראשון הוא 5.10, לא 5.9)
      await loansService.update(loanId, { repayment_start_date: '2026-09-10' })

      expect(planned(await monthEvents(0), loanId)).toHaveLength(0) // יוני
      expect(planned(await monthEvents(1), loanId)).toHaveLength(0) // יולי
      expect(planned(await monthEvents(2), loanId)).toHaveLength(0) // אוגוסט
      expect(planned(await monthEvents(3), loanId)).toHaveLength(0) // ספטמבר: 5.9 < 10.9
      expect(planned(await monthEvents(4), loanId).map(e => e.date)).toEqual(['2026-10-05'])
      expect(planned(await monthEvents(5), loanId).map(e => e.date)).toEqual(['2026-11-05'])
      expect(planned(await monthEvents(6), loanId).map(e => e.date)).toEqual(['2026-12-05'])
      expect(planned(await monthEvents(7), loanId)).toHaveLength(0) // החוב נגמר
    })

    it('auto repayment: no planned events before the loan itself started (no start date set)', async () => {
      const borrowerId = await createBorrower()
      const { lastInsertRowid: loanId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 3000,
        loan_date: '2026-06-01',
        loan_type: 'interest_free',
        is_recurring: 0,
        auto_repayment: 1,
        repayment_amount: 1000,
        repayment_day: 20
      })
      expect(planned(await monthEvents(-3), loanId)).toHaveLength(0) // מרץ - לפני ההלוואה
      expect(planned(await monthEvents(0), loanId)).toHaveLength(1)
    })

    it('recurring loans: the series is read from its LATEST loan, so an edited day replaces the old one', async () => {
      const borrowerId = await createBorrower()
      const seriesId = 'series-1'
      // הלוואה 1 (ישנה) נשארה עם יום 10; ההלוואה האחרונה (2) עודכנה ליום 20 בעריכת סדרה
      await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2026-04-10',
        loan_type: 'interest_free',
        is_recurring: 1,
        recurring_months: 4,
        recurring_day: 10,
        recurring_loan_number: 1,
        recurring_loan_count: 6,
        recurring_series_id: seriesId,
        auto_repayment: 0
      })
      const { lastInsertRowid: latestId } = await loansService.create({
        borrower_id: borrowerId,
        amount: 1000,
        loan_date: '2026-05-10',
        loan_type: 'interest_free',
        is_recurring: 1,
        recurring_months: 4,
        recurring_day: 20,
        recurring_loan_number: 2,
        recurring_loan_count: 6,
        recurring_series_id: seriesId,
        auto_repayment: 0
      })

      const plannedLoans = (events: CalendarEvent[]) =>
        events.filter(e => e.type === 'planned_loan' && e.title.includes('מחזורית'))

      // יוני: ההלוואה הבאה (3/6) ביום 20 - ולא גם ביום 10
      const june = plannedLoans(await monthEvents(0))
      expect(june.map(e => e.date)).toEqual(['2026-06-20'])
      expect(june[0].description).toContain('3/6')

      // יולי..ספטמבר: 4/6, 5/6, 6/6 - ואז נגמר
      expect(plannedLoans(await monthEvents(1)).map(e => e.date)).toEqual(['2026-07-20'])
      expect(plannedLoans(await monthEvents(2)).map(e => e.date)).toEqual(['2026-08-20'])
      expect(plannedLoans(await monthEvents(3)).map(e => e.date)).toEqual(['2026-09-20'])
      expect(plannedLoans(await monthEvents(4))).toHaveLength(0)
      expect(plannedLoans(await monthEvents(12))).toHaveLength(0)
      void latestId
    })
  })
})
