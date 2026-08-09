/**
 * טסט לקיבוץ הלוואות למשפחות (שלב 2)
 * 
 * מוודא שהלוגיקה של קיבוץ הלוואות למשפחות עובדת נכון
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDatabase, loansService, borrowersService, type Loan } from '../services/database'

// פונקציה שמדמה את הלוגיקה מ-UnifiedLoansPage
function groupLoansIntoFamilies(loans: Loan[]) {
  const familiesMap = new Map<string, Loan[]>();
  const standaloneLoans: Loan[] = [];

  loans.forEach(loan => {
    if (loan.is_recurring === 1 && loan.recurring_series_id) {
      // Recurring loan with series_id - group by family
      const familyKey = loan.recurring_series_id;
      if (!familiesMap.has(familyKey)) {
        familiesMap.set(familyKey, []);
      }
      familiesMap.get(familyKey)!.push(loan);
    } else {
      // Standalone loan (not recurring or no series_id)
      standaloneLoans.push(loan);
    }
  });

  // Convert map to array of families, each sorted by loan number
  const families = Array.from(familiesMap.values()).map(family => {
    return family.sort((a, b) => (a.recurring_loan_number || 0) - (b.recurring_loan_number || 0));
  });

  // Sort families by first loan date
  families.sort((a, b) => {
    const dateA = new Date(a[0].loan_date).getTime();
    const dateB = new Date(b[0].loan_date).getTime();
    return dateB - dateA; // newest first
  });

  return { families, standaloneLoans };
}

describe('קיבוץ הלוואות למשפחות', () => {
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    
    const borrowerResult = await borrowersService.create({
      first_name: 'שרה',
      last_name: 'לוי',
      phone: '0501234567'
    })
    borrowerId = borrowerResult.lastInsertRowid
  })

  it('משפחה אחת של 3 הלוואות + 2 הלוואות בודדות', async () => {
    const seriesId = crypto.randomUUID()
    
    // משפחה: 3 הלוואות מחזוריות
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: seriesId,
      recurring_loan_number: 1,
      recurring_loan_count: 3
    })
    
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-02-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: seriesId,
      recurring_loan_number: 2,
      recurring_loan_count: 3
    })
    
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-03-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: seriesId,
      recurring_loan_number: 3,
      recurring_loan_count: 3
    })
    
    // הלוואה בודדת 1
    await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-04-01',
      loan_type: 'רגילה',
      is_recurring: 0
    })
    
    // הלוואה בודדת 2
    await loansService.create({
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2024-05-01',
      loan_type: 'רגילה',
      is_recurring: 0
    })
    
    const allLoans = await loansService.getAll()
    const { families, standaloneLoans } = groupLoansIntoFamilies(allLoans)
    
    // ✅ משפחה אחת עם 3 הלוואות
    expect(families.length).toBe(1)
    expect(families[0].length).toBe(3)
    
    // ✅ ממוינות לפי מספר
    expect(families[0][0].recurring_loan_number).toBe(1)
    expect(families[0][1].recurring_loan_number).toBe(2)
    expect(families[0][2].recurring_loan_number).toBe(3)
    
    // ✅ 2 הלוואות בודדות
    expect(standaloneLoans.length).toBe(2)
  })

  it('שתי משפחות נפרדות', async () => {
    const series1 = crypto.randomUUID()
    const series2 = crypto.randomUUID()
    
    // משפחה 1: 2 הלוואות
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: series1,
      recurring_loan_number: 1,
      recurring_loan_count: 2
    })
    
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-02-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: series1,
      recurring_loan_number: 2,
      recurring_loan_count: 2
    })
    
    // משפחה 2: 3 הלוואות
    await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-03-10',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: series2,
      recurring_loan_number: 1,
      recurring_loan_count: 3
    })
    
    await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-04-10',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: series2,
      recurring_loan_number: 2,
      recurring_loan_count: 3
    })
    
    await loansService.create({
      borrower_id: borrowerId,
      amount: 500,
      loan_date: '2024-05-10',
      loan_type: 'רגילה',
      is_recurring: 1,
      recurring_series_id: series2,
      recurring_loan_number: 3,
      recurring_loan_count: 3
    })
    
    const allLoans = await loansService.getAll()
    const { families, standaloneLoans } = groupLoansIntoFamilies(allLoans)
    
    // ✅ 2 משפחות
    expect(families.length).toBe(2)
    
    // ✅ משפחה חדשה יותר ראשונה (מיון לפי תאריך)
    expect(families[0].length).toBe(3)
    expect(families[0][0].amount).toBe(500)
    
    expect(families[1].length).toBe(2)
    expect(families[1][0].amount).toBe(1000)
    
    // ✅ אין הלוואות בודדות
    expect(standaloneLoans.length).toBe(0)
  })

  it('הלוואה מחזורית ללא recurring_series_id נחשבת בודדת', async () => {
    // הלוואה מחזורית ישנה ללא series_id
    await loansService.create({
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2024-01-05',
      loan_type: 'רגילה',
      is_recurring: 1,
      // אין recurring_series_id!
      recurring_loan_number: 1,
      recurring_loan_count: 5
    })
    
    const allLoans = await loansService.getAll()
    const { families, standaloneLoans } = groupLoansIntoFamilies(allLoans)
    
    // ✅ אין משפחות (כי אין series_id)
    expect(families.length).toBe(0)
    
    // ✅ נחשבת בודדת
    expect(standaloneLoans.length).toBe(1)
  })
})
