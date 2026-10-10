# תכנית יישום - מערכת קופות מרובות (Phase 2-5)

## סקירה

**מה כבר קיים (Phase 1 הושלם)**:
- ✅ `Fund` interface ב-`database.ts`
- ✅ `fundsService` מלא עם כל הפונקציות (getAll, create, update, delete, setDefault, getActive, getById, getDefault)
- ✅ `fundsMigration` עובד (11/11 בדיקות)
- ✅ `fund_id` קיים ב-Loan, Donation, Deposit, Expense interfaces
- ✅ loansService.create(), depositsService.create(), donationsService.create() תומכות ב-fund_id עם default fund
- ✅ scheduler.ts עודכן - הלוואות/הפקדות חוזרות יורשות fund_id

**מה נותר לבנות (Phase 2-5)**:
- Phase 2: Backend - getByFund, changeFund, statsService updates, expectedFundsCalculator
- Phase 3: הלוואות מחזוריות - ירושת fund_id (כבר קיים!)
- Phase 4-5: UI - ניהול קופות, סלקטורים, Dashboard

---

## Phase 2: Backend Services (4-5 שעות)

### 2.1 הוספת getByFund() לשירותים

#### loansService.getByFund()
**קובץ**: `src/services/database.ts` (שורה ~1200)
**מיקום**: אחרי `getActiveLoansForExistingBorrowers()`

```typescript
async getByFund(fundId: string): Promise<Loan[]> {
  return (await this.getAll()).filter(l => l.fund_id === fundId)
}
```

#### loansService.changeFund()
**מיקום**: אחרי `getByFund()`

```typescript
async changeFund(loanId: string, newFundId: string, reason: string): Promise<void> {
  const loan = await this.getById(loanId)
  if (!loan) throw new Error('הלוואה לא נמצאה')
  
  const newFund = await fundsService.getById(newFundId)
  if (!newFund) throw new Error('קופה לא נמצאה')
  
  const oldFundId = loan.fund_id
  await this.update(loanId, { fund_id: newFundId })
  
  // רישום ב-audit log
  const { auditLogService } = await import('./auditLog')
  await auditLogService.logAction({
    action: 'loan_fund_change',
    entity_type: 'loan',
    entity_id: loanId,
    actor: 'user',
    before_data: JSON.stringify({ fund_id: oldFundId }),
    after_data: JSON.stringify({ fund_id: newFundId }),
    metadata: JSON.stringify({ reason })
  })
}
```

**בדיקה**: `npm run test -- loansService`

---

#### depositsService.getByFund()
**קובץ**: `src/services/database.ts` (שורה ~2400)
**מיקום**: אחרי `getById()`

```typescript
async getByFund(fundId: string): Promise<Deposit[]> {
  return (await this.getAll()).filter(d => d.fund_id === fundId)
}
```

---

#### donationsService.getByFund()
**קובץ**: `src/services/database.ts` (שורה ~2500)
**מיקום**: אחרי `getByDonor()`

```typescript
async getByFund(fundId: string): Promise<Donation[]> {
  return (await this.getAll()).filter(d => d.fund_id === fundId)
}
```

---

#### expensesService.getByFund()
**קובץ**: `src/services/database.ts` (שורה ~2018)
**מיקום**: אחרי `getAll()`

```typescript
async getByFund(fundId: string): Promise<Expense[]> {
  return (await this.getAll()).filter(e => e.fund_id === fundId)
}
```

**הערה**: לבדוק אם `Expense` interface כולל `fund_id`. אם לא - להוסיף.

---

### 2.2 עדכון statsService

**קובץ**: `src/services/database.ts` (שורה ~1700)

#### פונקציה חדשה: getStatsByFund()

**מיקום**: אחרי `getTotalGemachExpenses()`

```typescript
async getStatsByFund(fundId: string): Promise<{
  activeLoans: { count: number; total: number }
  plannedLoans: { count: number; total: number }
  availableCash: number
}> {
  const today = new Date().toISOString().split('T')[0]
  
  // הלוואות פעילות בקופה
  const allLoans = await loansService.getByFund(fundId)
  const activeLoans = allLoans.filter(l => 
    l.status === 'active' && 
    l.loan_date <= today && 
    (l.remaining || 0) > 0
  )
  
  // הלוואות מתוכננות בקופה
  const plannedLoans = allLoans.filter(l => 
    l.status === 'planned' || l.loan_date > today
  )
  
  // תרומות בקופה
  const donations = await donationsService.getByFund(fundId)
  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0)
  
  // הפקדות בקופה
  const deposits = await depositsService.getByFund(fundId)
  const realizedDeposits = deposits.filter(d =>
    d.status !== 'planned' && d.deposit_date <= today
  )
  
  let totalDeposits = 0
  for (const d of realizedDeposits) {
    const depositAmount = d.amount
    const withdrawals = await depositWithdrawalsService.getByDeposit(d.id)
    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    totalDeposits += (depositAmount - totalWithdrawn)
  }
  
  // הוצאות בקופה
  const expenses = await expensesService.getByFund(fundId)
  const gemachExpenses = expenses
    .filter(e => e.paid_by === 'gemach')
    .reduce((sum, e) => sum + e.amount, 0)
  
  // חישוב כסף זמין
  const totalActiveLoans = activeLoans.reduce((sum, l) => sum + (l.remaining || 0), 0)
  const availableCash = totalDonations + totalDeposits - totalActiveLoans - gemachExpenses
  
  return {
    activeLoans: { count: activeLoans.length, total: totalActiveLoans },
    plannedLoans: { 
      count: plannedLoans.length, 
      total: plannedLoans.reduce((sum, l) => sum + l.amount, 0) 
    },
    availableCash
  }
}
```

**בדיקה**: `npm run test -- statsService`

---

#### עדכון getDashboardStats()

**מיקום**: בתוך `getDashboardStats()`, בסוף הפונקציה, לפני ה-`return`

```typescript
// הוספה בסוף, לפני return:
const allFunds = await fundsService.getAll()
const byFund = await Promise.all(
  allFunds.map(async (fund) => {
    const stats = await this.getStatsByFund(fund.id)
    return {
      fundId: fund.id,
      fundName: fund.name,
      activeLoans: stats.activeLoans,
      plannedLoans: stats.plannedLoans,
      availableCash: stats.availableCash
    }
  })
)

return {
  ...result,
  byFund
}
```

---

### 2.3 עדכון expectedFundsCalculator

**קובץ**: `src/services/expectedFundsCalculator.ts`

**שינוי**: הוספת פרמטר אופציונלי `fundId`

```typescript
export function calculateExpectedFunds(
  loans: Loan[],
  deposits: Deposit[],
  referenceDate: Date = new Date(),
  fundId?: string  // ← פרמטר חדש
): ExpectedFunds {
  // סינון לפי קופה אם סופק fundId
  const filteredLoans = fundId ? loans.filter(l => l.fund_id === fundId) : loans
  const filteredDeposits = fundId ? deposits.filter(d => d.fund_id === fundId) : deposits
  
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)
  
  // המשך הקוד הקיים עובד עם filteredLoans ו-filteredDeposits
  const activeLoans = filteredLoans.filter(l => l.status === 'active')
  // ... שאר הלוגיקה ללא שינוי
}
```

**בדיקה**: `npm run test -- expectedFunds.test.ts`

---

### 2.4 בדיקות אינווריאנט

**קובץ חדש**: `src/__tests__/fundsInvariant.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { 
  resetDatabase, 
  fundsService, 
  statsService 
} from '../services/database'

describe('Funds System Invariants', () => {
  beforeEach(async () => {
    resetDatabase()
  })
  
  it('סכום כל הקופות שווה לסכום הכולל', async () => {
    // יצירת קופות
    const fund1 = await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })
    
    const fund2 = await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })
    
    // TODO: הוסף לוגיקה ליצירת הלוואות
    
    // חישוב סטטיסטיקות
    const overall = await statsService.getDashboardStats()
    const fundStats = await Promise.all([
      statsService.getStatsByFund(fund1.id),
      statsService.getStatsByFund(fund2.id)
    ])
    
    const sumOfFunds = fundStats.reduce((sum, f) => sum + f.activeLoans.total, 0)
    expect(sumOfFunds).toBe(overall.activeLoans.total)
  })
  
  it('תמיד יש בדיוק קופת ברירת מחדל אחת', async () => {
    const allFunds = await fundsService.getAll()
    const defaultFunds = allFunds.filter(f => f.is_default)
    expect(defaultFunds.length).toBe(1)
  })
})
```

**בדיקה**: `npm run test -- fundsInvariant.test.ts`

---
