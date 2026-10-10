import { describe, it, expect, beforeEach } from 'vitest'
import { db, loansService, depositsService, donationsService, expensesService, fundsService, statsService } from '../services/database'

describe('אינווריאנט קופות - עקביות נתונים', () => {
  let defaultFundId: string

  beforeEach(async () => {
    // ניקוי נתונים לפני כל בדיקה (לא מנקים funds כי זה לא נתמך ב-SQL)
    await db.run('DELETE FROM loans', [])
    await db.run('DELETE FROM deposits', [])
    await db.run('DELETE FROM donations', [])
    await db.run('DELETE FROM expenses', [])

    // ווידוא שיש קופת ברירת מחדל
    const funds = await fundsService.getAll()
    if (funds.length === 0) {
      const result = await fundsService.create({
        name: 'קופה ראשית',
        description: 'קופה ראשית של הגמ"ח',
        is_default: true,
        is_active: true
      })
      defaultFundId = result.id
    } else {
      const defaultFund = funds.find(f => f.is_default)
      if (!defaultFund) {
        throw new Error('לא נמצאה קופת ברירת מחדל בסטאפ')
      }
      defaultFundId = defaultFund.id
    }
  })

  it('סכום כל הקופות שווה לסכום הכולל', async () => {
    // יצירת קופה נוספת
    const fund1 = await fundsService.getDefault()
    const fund2 = await fundsService.create({
      name: 'קופה 2',
      description: 'קופה נוספת לבדיקה',
      is_active: true
    })

    // הוספת תרומה לקופה 1
    await donationsService.create({
      donor_id: 1,
      fund_id: fund1.id,
      amount: 10000,
      donation_date: '2024-01-01',
      notes: 'תרומה לבדיקה'
    })

    // הוספת תרומה לקופה 2
    await donationsService.create({
      donor_id: 1,
      fund_id: fund2.id,
      amount: 5000,
      donation_date: '2024-01-01',
      notes: 'תרומה נוספת לבדיקה'
    })

    // קבלת סטטיסטיקות
    const dashboardStats = await statsService.getDashboardStats()

    // חישוב סכום קופות
    let totalByFunds = 0
    for (const fundStat of dashboardStats.byFund) {
      totalByFunds += fundStat.availableCash
    }

    // חישוב סכום כולל
    const totalOverall = 
      dashboardStats.donations.total +
      dashboardStats.deposits.total -
      dashboardStats.activeLoans.total -
      dashboardStats.gemachExpenses

    // השוואה
    expect(Math.abs(totalByFunds - totalOverall)).toBeLessThan(0.01) // טולרנס לעיגול
  })

  it('תמיד יש בדיוק קופת ברירת מחדל אחת', async () => {
    const allFunds = await fundsService.getAll()
    const defaultFunds = allFunds.filter(f => f.is_default)

    expect(defaultFunds.length).toBe(1)
    expect(defaultFunds[0].name).toBe('קופה ראשית')
  })

  it('כל הישויות מקושרות לקופה קיימת', async () => {
    const fund1 = await fundsService.getDefault()
    
    // יצירת הלוואה
    const loan = await loansService.create({
      borrower_id: 'test-borrower',
      amount: 1000,
      loan_date: '2024-01-01',
      loan_type: 'flexible',
      fund_id: fund1.id
    })

    // יצירת הפקדה
    const deposit = await depositsService.create({
      depositor_id: 'test-depositor',
      amount: 500,
      deposit_date: '2024-01-01',
      status: 'active',
      fund_id: fund1.id
    })

    // יצירת תרומה
    const donation = await donationsService.create({
      donor_id: 1,
      amount: 200,
      donation_date: '2024-01-01',
      notes: 'בדיקה',
      fund_id: fund1.id
    })

    // יצירת הוצאה
    const expense = await expensesService.create({
      description: 'הוצאה לבדיקה',
      amount: 50,
      expense_date: '2024-01-01',
      category: 'אחר',
      paid_by: 'gemach',
      fund_id: fund1.id
    })

    // וידוא שכולם מקושרים לקופה קיימת
    const allFunds = await fundsService.getAll()
    const fundIds = new Set(allFunds.map(f => f.id))

    const loanResult = await loansService.getById(loan.lastInsertRowid)
    expect(fundIds.has(loanResult!.fund_id)).toBe(true)

    const depositResult = await depositsService.getById(deposit.lastInsertRowid)
    expect(fundIds.has(depositResult!.fund_id)).toBe(true)

    const donationResult = await donationsService.getById(donation.lastInsertRowid)
    expect(fundIds.has(donationResult!.fund_id)).toBe(true)

    const expenseResult = await expensesService.getById(expense.lastInsertRowid)
    expect(fundIds.has(expenseResult!.fund_id)).toBe(true)
  })
})
