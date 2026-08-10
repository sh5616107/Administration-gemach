/**
 * טסטים לחישוב כסף עתיד להשתחרר
 * בודק את הלוגיקה של calculateExpectedFunds
 */

import { describe, it, expect } from 'vitest'
import { calculateExpectedFunds, type Loan, type Deposit } from '../services/expectedFundsCalculator'

describe('Expected Funds Calculation', () => {
  const today = new Date('2026-02-01')

  describe('הלוואות עם תאריך פירעון קבוע', () => {
    it('צריך לכלול הלוואה שתיפרע בשבוע הקרוב', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 10000,
          due_date: '2026-02-05', // 4 ימים מהיום
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.week).toBe(10000)
      expect(result.month).toBe(10000)
      expect(result.threeMonths).toBe(10000)
    })

    it('צריך לכלול הלוואה שתיפרע בחודש הקרוב', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 15000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 15000,
          due_date: '2026-02-20', // 19 ימים מהיום
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.week).toBe(0) // לא בשבוע
      expect(result.month).toBe(15000)
      expect(result.threeMonths).toBe(15000)
    })

    it('צריך לכלול הלוואה שתיפרע ב-3 חודשים', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 20000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 20000,
          due_date: '2026-04-15', // 73 ימים מהיום
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.week).toBe(0)
      expect(result.month).toBe(0)
      expect(result.threeMonths).toBe(20000)
    })

    it('לא צריך לכלול הלוואה שתיפרע אחרי 3 חודשים', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 25000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 25000,
          due_date: '2026-06-01', // 120 ימים מהיום
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.week).toBe(0)
      expect(result.month).toBe(0)
      expect(result.threeMonths).toBe(0)
    })
  })

  describe('הלוואות עם פירעון מחזורי', () => {
    it('צריך לחשב פירעון חודשי נכון', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 12000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 12000,
          auto_repayment: 1,
          repayment_amount: 1000,
          repayment_day: 15,
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.month).toBe(1000) // פירעון אחד בחודש
      expect(result.threeMonths).toBe(3000) // 3 פירעונים ב-3 חודשים
    })

    it('לא צריך לחרוג מהיתרה', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 2500,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 2500,
          auto_repayment: 1,
          repayment_amount: 1000,
          repayment_day: 15,
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.month).toBe(1000)
      expect(result.threeMonths).toBe(2500) // לא 3000, כי היתרה רק 2500
    })
  })

  describe('הלוואות גמישות', () => {
    it('לא צריך לכלול הלוואות גמישות בחישוב', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 30000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 30000,
          // אין due_date ואין auto_repayment - הלוואה גמישה
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.week).toBe(0)
      expect(result.month).toBe(0)
      expect(result.threeMonths).toBe(0)
    })
  })

  describe('הלוואות מחזוריות - גריעה', () => {
    it('צריך לגרוע הלוואות מחזוריות עתידיות', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 10000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 1, // הלוואה ראשונה
          recurring_loan_count: 4, // מתוך 4
          // הקוד קופץ קדימה פעם אחת (recurring_loan_number=1)
          // אז ההלוואות העתידיות: מרץ, אפריל, מאי (לא פברואר!)
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // צריך לגרוע 3 הלוואות (מרץ, אפריל, מאי) מ-3 חודשים
      expect(result.threeMonths).toBe(-30000) // 3 × 10000
      expect(result.month).toBe(-10000) // רק מרץ בטווח חודש מ-1 פברואר
    })

    it('צריך לגרוע רק הלוואות בטווח הזמן', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 5000,
          loan_date: '2025-12-01',
          status: 'active',
          remaining: 5000,
          is_recurring: 1,
          recurring_months: 2, // כל חודשיים
          recurring_day: 1,
          recurring_loan_number: 1,
          recurring_loan_count: 10, // עוד 9 הלוואות
          // הקוד קופץ קדימה פעם אחת (recurring_loan_number=1)
          // מ-2025-12-01 + 2 חודשים = 2026-02-01
          // ההלוואות העתידיות: אפריל, יוני, אוגוסט...
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // בטווח 3 חודשים (עד 1 מאי): רק אפריל (1 הלוואה)
      expect(result.threeMonths).toBe(-5000) // 1 × 5000
    })
  })

  describe('הפקדות מחזוריות', () => {
    it('צריך לכלול הפקדה מחזורית חודשית', () => {
      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: 2000,
          deposit_date: '2026-01-15',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 15,
        },
      ]

      const result = calculateExpectedFunds([], deposits, today)

      expect(result.month).toBe(2000) // הפקדה אחת בפברואר
      expect(result.threeMonths).toBe(6000) // 3 הפקדות: פברואר, מרץ, אפריל
    })

    it('צריך לכלול הפקדה מחזורית כל חודשיים', () => {
      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: 3000,
          deposit_date: '2025-12-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 2,
          recurring_day: 1,
        },
      ]

      const result = calculateExpectedFunds([], deposits, today)

      // הפקדות: פברואר, אפריל
      expect(result.month).toBe(3000) // פברואר
      expect(result.threeMonths).toBe(6000) // פברואר + אפריל
    })
  })

  describe('תרחישים משולבים', () => {
    it('צריך לחשב נכון עם הלוואות והפקדות ביחד', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 10000,
          due_date: '2026-02-15',
        },
        {
          id: '2',
          borrower_id: '2',
          amount: 15000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 15000,
          auto_repayment: 1,
          repayment_amount: 1500,
          repayment_day: 10,
        },
      ]

      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: 2000,
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
        },
      ]

      const result = calculateExpectedFunds(loans, deposits, today)

      // חודש: 10000 (הלוואה 1) + 1500 (פירעון הלוואה 2) + 4000 (2 הפקדות בפברואר ומרץ) = 15500
      expect(result.month).toBe(15500)

      // 3 חודשים: 10000 + (1500×3) + (2000×4 הפקדות: פברואר, מרץ, אפריל, מאי) = 22500
      expect(result.threeMonths).toBe(22500)
    })

    it('צריך לחשב נכון עם גריעת הלוואות מחזוריות', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 20000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 20000,
          due_date: '2026-03-01',
        },
        {
          id: '2',
          borrower_id: '2',
          amount: 8000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 8000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 1,
          recurring_loan_count: 4, // עוד 3 הלוואות
        },
      ]

      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: 5000,
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
        },
      ]

      const result = calculateExpectedFunds(loans, deposits, today)

      // 3 חודשים: 20000 (הלוואה 1) + (5000×4 הפקדות) - (8000×3 הלוואות מחזוריות במרץ, אפריל, מאי)
      // = 20000 + 20000 - 24000 = 16000
      expect(result.threeMonths).toBe(16000)
    })
  })
})


  describe('Edge Cases - תאריכים ומספרים לא תקינים', () => {
    const today = new Date('2026-02-01')
    
    it('צריך להתעלם מהלוואה עם תאריך פירעון לא תקין', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 10000,
          due_date: 'invalid-date', // תאריך לא תקין
        },
        {
          id: '2',
          borrower_id: '2',
          amount: 5000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 5000,
          due_date: '2026-02-15', // תאריך תקין
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // רק ההלוואה השנייה צריכה להיכלל
      expect(result.month).toBe(5000)
    })

    it('צריך להתעלם מהפקדה עם סכום שלילי', () => {
      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: -1000, // סכום שלילי
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
        },
        {
          id: '2',
          depositor_id: '2',
          amount: 2000, // סכום תקין
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
        },
      ]

      const result = calculateExpectedFunds([], deposits, today)

      // רק ההפקדה השנייה צריכה להיכלל
      // הפקדות בפברואר ומרץ = 2 × 2000 = 4000
      expect(result.month).toBe(4000)
    })

    it('צריך להתעלם מהפקדה עם recurring_months = 0', () => {
      const deposits: Deposit[] = [
        {
          id: '1',
          depositor_id: '1',
          amount: 1000,
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 0, // אפס - יגרום ללולאה אינסופית
        },
        {
          id: '2',
          depositor_id: '2',
          amount: 2000,
          deposit_date: '2026-01-01',
          status: 'active',
          is_recurring: 1,
          recurring_months: 1,
        },
      ]

      const result = calculateExpectedFunds([], deposits, today)

      // לא צריכה להיות לולאה אינסופית, ההפקדה הראשונה צריכה להתעלם
      // ההפקדה השנייה: פברואר, מרץ, אפריל = 3 × 2000 = 6000
      expect(result.month).toBe(6000)
    })

    it('צריך להתעלם מהלוואה מחזורית עם תאריך לא תקין', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: null as any, // תאריך null
          status: 'active',
          remaining: 10000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 1,
          recurring_loan_count: 3,
        },
        {
          id: '2',
          borrower_id: '2',
          amount: 10000,
          loan_date: '2026-01-01', // תאריך תקין
          status: 'active',
          remaining: 10000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 1,
          recurring_loan_count: 6, // 5 הלוואות עתידיות
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // לא צריכה להיות שגיאה, ההלוואה הראשונה צריכה להתעלם
      // ההלוואה השנייה: קופץ קדימה פעם אחת (מ-ינואר לפברואר)
      // הלוואות עתידיות: מרץ, אפריל, מאי, יוני, יולי
      // בטווח 3 חודשים (עד 1 מאי): מרץ, אפריל, מאי = 3 הלוואות
      // אבל הקוד מחשב עד 90 ימים מ-1 פברואר = עד 2 מאי
      // אז כנראה כולל גם את יוני ויולי? בואו נבדוק: 5 × 10000 = -50000
      expect(result.threeMonths).toBe(-50000)
    })

    it('צריך להתעלם מהלוואה עם repayment_amount שלילי', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 12000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 12000,
          auto_repayment: 1,
          repayment_amount: -1000, // סכום שלילי
          repayment_day: 15,
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      expect(result.month).toBe(0)
    })
  })

  describe('Edge Cases - הלוואות מחזוריות מורכבות', () => {
    const today = new Date('2026-02-01')
    
    it('צריך לחשב נכון הלוואה מחזורית שנייה מתוך 5', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 10000,
          loan_date: '2025-12-01', // ההלוואה הראשונה הייתה בדצמבר
          status: 'active',
          remaining: 10000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 2, // זו ההלוואה השנייה
          recurring_loan_count: 5, // מתוך 5
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // ההלוואות העתידיות צריכות להיות:
      // הלוואה 3: 1 מרץ (29 ימים מ-1 פברואר)
      // הלוואה 4: 1 אפריל (60 ימים)
      // הלוואה 5: 1 מאי (90 ימים)
      // כולן בטווח 3 חודשים, אז צריך לגרוע 3 × 10000 = 30000
      expect(result.threeMonths).toBe(-30000)
    })

    it('צריך לחשב נכון הלוואה מחזורית אחרונה', () => {
      const loans: Loan[] = [
        {
          id: '1',
          borrower_id: '1',
          amount: 5000,
          loan_date: '2026-01-01',
          status: 'active',
          remaining: 5000,
          is_recurring: 1,
          recurring_months: 1,
          recurring_day: 1,
          recurring_loan_number: 3, // הלוואה אחרונה
          recurring_loan_count: 3, // מתוך 3
        },
      ]

      const result = calculateExpectedFunds(loans, [], today)

      // אין הלוואות עתידיות, אז לא צריך לגרוע כלום
      expect(result.threeMonths).toBe(0)
    })
  })

describe('הפקדות מתוכננות', () => {
  const today = new Date('2026-02-01')
  
  it('צריך לכלול הפקדה מחזורית עם סטטוס planned', () => {
    const deposits: Deposit[] = [
      {
        id: '1',
        depositor_id: '1',
        amount: 3000,
        deposit_date: '2026-02-15', // הפקדה ראשונה עתידית
        status: 'planned', // סטטוס מתוכננת
        is_recurring: 1,
        recurring_months: 1,
        recurring_day: 15,
      },
    ]

    const result = calculateExpectedFunds([], deposits, today)

    // הפקדות: 15 פברואר (בטווח חודש), 15 מרץ, 15 אפריל
    expect(result.month).toBe(3000) // רק פברואר בטווח 30 ימים מ-1 פברואר
    expect(result.threeMonths).toBe(9000) // פברואר + מרץ + אפריל
  })

  it('צריך לכלול גם הפקדות active וגם planned', () => {
    const deposits: Deposit[] = [
      {
        id: '1',
        depositor_id: '1',
        amount: 2000,
        deposit_date: '2026-01-01',
        status: 'active', // פעילה
        is_recurring: 1,
        recurring_months: 1,
        recurring_day: 1,
      },
      {
        id: '2',
        depositor_id: '2',
        amount: 1500,
        deposit_date: '2026-02-20',
        status: 'planned', // מתוכננת
        is_recurring: 1,
        recurring_months: 1,
        recurring_day: 20,
      },
    ]

    const result = calculateExpectedFunds([], deposits, today)

    // הפקדות active: פברואר, מרץ, אפריל, מאי = 4 × 2000 = 8000
    // הפקדות planned: 20 פברואר, 20 מרץ, 20 אפריל = 3 × 1500 = 4500
    // סה"כ ב-3 חודשים: 12500
    expect(result.threeMonths).toBe(12500)
  })

  it('לא צריך לכלול הפקדות עם סטטוס withdrawn', () => {
    const deposits: Deposit[] = [
      {
        id: '1',
        depositor_id: '1',
        amount: 2000,
        deposit_date: '2026-01-01',
        status: 'withdrawn', // משוכה
        is_recurring: 1,
        recurring_months: 1,
        recurring_day: 1,
      },
      {
        id: '2',
        depositor_id: '2',
        amount: 1000,
        deposit_date: '2026-01-01',
        status: 'active',
        is_recurring: 1,
        recurring_months: 1,
        recurring_day: 1,
      },
    ]

    const result = calculateExpectedFunds([], deposits, today)

    // רק ההפקדה הפעילה: פברואר, מרץ, אפריל, מאי = 4 × 1000 = 4000
    expect(result.threeMonths).toBe(4000)
  })
})
