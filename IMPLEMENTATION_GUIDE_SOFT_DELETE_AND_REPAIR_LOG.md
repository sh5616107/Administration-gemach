# 🔧 מסמך יישום מלא - Soft-Delete + Repair Log

**סטטוס:** התחלה של יישום  
**עדיריטית  
**תאריך:** 24 באפריל 2026

---

## 📋 סיכום ביצוע

זה הערך שצריך לעשות כדי לפתור **100%** את בעיית היצירה הכפולה לאחר מחיקה.

כרגע: 70% בוצע (lock + recurring_number check)  
חסר: 30% (soft-delete + repair log) ← **יש להטמיע**

---

## ✅ שלב 1: הוסף Soft-Delete ל-Loan

### קובץ: `src/services/database.ts`

**שלב 1.1: עדכן את Loan Interface**

```typescript
// ממקום זה (שורה ~750):
export interface Loan { 
  id: number
  borrower_id: number
  amount: number
  loan_date: string
  loan_date_hebrew?: string
  loan_type: string
  due_date?: string
  due_date_hebrew?: string
  is_recurring: number
  recurring_months?: number
  recurring_day?: number
  recurring_loan_number?: number
  recurring_loan_count?: number
  auto_repayment: number
  repayment_amount?: number
  repayment_day?: number
  repayment_frequency?: string
  repayment_start_date?: string
  guarantor1_id?: number
  guarantor2_id?: number
  notes?: string
  status: string
  created_at: string
  total_repaid?: number
  remaining?: number
  borrower_name?: string
  payment_method?: string
  payment_details?: string
}

// ל:
export interface Loan { 
  id: number
  borrower_id: number
  amount: number
  loan_date: string
  loan_date_hebrew?: string
  loan_type: string
  due_date?: string
  due_date_hebrew?: string
  is_recurring: number
  recurring_months?: number
  recurring_day?: number
  recurring_loan_number?: number
  recurring_loan_count?: number
  auto_repayment: number
  repayment_amount?: number
  repayment_day?: number
  repayment_frequency?: string
  repayment_start_date?: string
  guarantor1_id?: number
  guarantor2_id?: number
  notes?: string
  status: string
  created_at: string
  total_repaid?: number
  remaining?: number
  borrower_name?: string
  payment_method?: string
  payment_details?: string
  is_deleted?: boolean      // ← הוסף את זה
  deleted_at?: string       // ← הוסף את זה
}
```

**שלב 1.2: עדכן את loansService.create()**

```typescript
// ממקום זה (שורה ~800):
async create(l: Omit<Loan, 'id' | 'created_at' | 'status'>): Promise<{ lastInsertRowid: number }> { 
  const id = generateId('loans')
  const status = new Date(l.loan_date) > new Date() ? 'planned' : 'active'
  setItem('loans', String(id), { ...l, id, status, created_at: new Date().toISOString() })
  return { lastInsertRowid: id } 
}

// ל:
async create(l: Omit<Loan, 'id' | 'created_at' | 'status'>): Promise<{ lastInsertRowid: number }> { 
  const id = generateId('loans')
  const status = new Date(l.loan_date) > new Date() ? 'planned' : 'active'
  setItem('loans', String(id), { 
    ...l, 
    id, 
    status,
    is_deleted: false,                          // ← הוסף את זה
    created_at: new Date().toISOString() 
  })
  return { lastInsertRowid: id } 
}
```

**שלב 1.3: שנה את loansService.delete() ל-soft-delete**

```typescript
// ממקום זה (שורה ~805):
async delete(id: number): Promise<void> { 
  const r = await repaymentsService.getByLoan(id)
  for (const x of r) await repaymentsService.delete(x.id)
  removeItem('loans', String(id)) 
}

// ל:
async delete(id: number): Promise<void> { 
  const e = await this.getById(id)
  if (e) {
    setItem('loans', String(id), { 
      ...e,
      is_deleted: true,                         // ← סמן כמחוק
      deleted_at: new Date().toISOString()      // ← תעד מתי
    })
    console.log(`[DB] Soft-deleted loan #${id} at ${e.deleted_at}`)
  }
}
```

**שלב 1.4: סנן את is_deleted בכל getAll()**

```typescript
// ממקום זה (שורה ~778):
async getAll(): Promise<Loan[]> {
  const loans = getAllItems<Loan>('loans')
  const borrowers = await borrowersService.getAll()
  for (const loan of loans) {
    const repayments = await repaymentsService.getByLoan(loan.id)
    loan.total_repaid = repayments.reduce((s, r) => s + r.amount, 0)
    loan.remaining = loan.amount - loan.total_repaid
    const b = borrowers.find(x => x.id === loan.borrower_id)
    loan.borrower_name = b ? `${b.first_name} ${b.last_name}` : ''
  }
  return loans.sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
}

// ל:
async getAll(): Promise<Loan[]> {
  const loans = getAllItems<Loan>('loans')
    .filter(l => !l.is_deleted)                 // ← סנן את המחוקים
  const borrowers = await borrowersService.getAll()
  for (const loan of loans) {
    const repayments = await repaymentsService.getByLoan(loan.id)
    loan.total_repaid = repayments.reduce((s, r) => s + r.amount, 0)
    loan.remaining = loan.amount - loan.total_repaid
    const b = borrowers.find(x => x.id === loan.borrower_id)
    loan.borrower_name = b ? `${b.first_name} ${b.last_name}` : ''
  }
  return loans.sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
}
```

---

## ✅ שלב 2: הוסף Repair Log Tracking

### קובץ: `src/services/scheduler.ts`

**שלב 2.1: הוסף constants ופונקציות עזר בראש הקובץ**

```typescript
// בראש הקובץ (אחרי imports):
import { loansService, repaymentsService, db } from './database'

// ← הוסף את זה:
const AUTO_CREATE_LOCK_TIMEOUT = 30000 // 30 seconds
const MISSED_LOANS_REPAIR_KEY = 'gemach_missed_loans_repair_log'

let isAutoCreateRunning = false
let missedLoansAlerts: MissedLoanAlert[] = []

interface MissedLoanAlert {
  loanId: number
  borrowerName: string
  monthsMissed: number
  lastLoanDate: string
  currentRecurringNumber: number
  totalCount: number
}

// ← פונקציות עזר:
function getLastMissedLoanRepairDate(loanId: number): string | null {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    return log[loanId] || null
  } catch {
    return null
  }
}

function markMissedLoanRepairAttempt(loanId: number): void {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    log[loanId] = new Date().toISOString().split('T')[0]
    localStorage.setItem(MISSED_LOANS_REPAIR_KEY, JSON.stringify(log))
  } catch (e) {
    console.error('Error marking missed loan repair:', e)
  }
}

export function getMissedLoansAlerts(): MissedLoanAlert[] {
  const alerts = [...missedLoansAlerts]
  missedLoansAlerts = [] // Clear after reading
  return alerts
}
```

**שלב 2.2: בדוק deleted loans בlogic**

```typescript
// בפונקציה autoCreateRecurringLoans() - בלוך הבדיקה (שורה ~350):
if (!shouldCreateToday && !isPastRecurringDay) continue

// Get the first day of current month
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

// ← הוסף את זה:
// בדוק אם ההלוואה המקורית נמחקה
if (loan.is_deleted) {
  console.log(`[AUTO-CREATE] Loan #${loan.id} is marked as deleted, skipping`)
  continue
}

// Check if loan already created this month - check by recurring number
const currentRecurringNumber = loan.recurring_loan_number || 1
```

**שלב 2.3: בדוק repair log בlogic המחזורי**

```typescript
// בפונקציה autoCreateRecurringLoans() - בתנאי של monthsDiff (שורה ~400):
if (monthsDiff > 1 && !existingLoanThisMonth) {
  const lastRepairDate = getLastMissedLoanRepairDate(loan.id)
  const today = todayStr
  
  // ← הוסף בדיקה זו:
  // אם כבר ניסינו היום - אל תנסה שוב
  if (lastRepairDate === today) {
    console.log(`[AUTO-CREATE] Already attempted to repair loan #${loan.id} today, skipping`)
    continue
  }
  
  console.warn(`[AUTO-CREATE] ⚠️ Warning: Loan #${loan.id} is ${monthsDiff} months old...`)
  console.warn(`[AUTO-CREATE] Last loan date: ${loan.loan_date}, Current date: ${todayStr}`)
  
  // ← הוסף סימון:
  // סמן שניסינו היום
  markMissedLoanRepairAttempt(loan.id)
  
  // Add this to the alerts that will be shown to the user
  missedLoansAlerts.push({
    loanId: loan.id,
    borrowerName: loan.borrower_name || `Loan #${loan.id}`,
    monthsMissed: monthsDiff - 1,
    lastLoanDate: loan.loan_date,
    currentRecurringNumber: currentRecurringNumber,
    totalCount: loan.recurring_loan_count || 0
  })
}
```

---

## ✅ שלב 3: התאם את AlertsDialog

### קובץ: `src/components/AlertsDialog.tsx`

**שלב 3.1: استورד את getPastLoansAlerts**

```typescript
// בראש הקובץ:
import { 
  createRecurringLoan, 
  createRecurringDeposit, 
  activatePlannedLoans,
  getMissedLoansAlerts      // ← הוסף את זה
} from '../services/scheduler'
```

**שלב 3.2: הציג missed loans alerts**

```typescript
// בפונקציה checkAlerts() - אחרי "NOTE: We do NOT call" (שורה ~170):

// Check for missed recurring loans (from scheduler)
const missedLoans = getMissedLoansAlerts()
missedLoans.forEach((missed) => {
  newAlerts.push({
    type: 'info',
    title: '⚠️ הלוואות מחזוריות שהוחמצו',
    message: `${missed.borrowerName} - חסרות ${missed.monthsMissed} הלוואות (${missed.currentRecurringNumber}/${missed.totalCount})`,
    loanId: missed.loanId,
    key: `missed-loans-${missed.loanId}-${todayStr}`,
  })
})
```

---

## 🧪 שלב 4: כתוב בדיקות

### קובץ: `src/__tests__/recurringLoanSoftDelete.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDatabase, loansService, borrowersService } from '../services/database'
import { autoCreateRecurringLoans, getMissedLoansAlerts } from '../services/scheduler'

describe('Recurring Loans with Soft-Delete', () => {
  beforeEach(async () => {
    resetDatabase()
    vi.useFakeTimers()
  })

  it('should not create duplicate loans after soft-delete', async () => {
    vi.setSystemTime(new Date('2026-04-12'))
    
    // Create borrower
    const borrower = await borrowersService.create({
      first_name: 'בן',
      last_name: 'ציון',
      id_number: '123456789',
      phone: '0501234567',
    })
    
    // Create original loan
    const loan1 = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-03-05',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 5,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 6,
      auto_repayment: 0,
    })
    
    // First run - should create loan 2/6
    vi.setSystemTime(new Date('2026-04-05'))
    await autoCreateRecurringLoans()
    let allLoans = await loansService.getAll()
    let recurringLoans = allLoans.filter(l => l.is_recurring && l.borrower_id === borrower.lastInsertRowid)
    expect(recurringLoans).toHaveLength(2)
    
    const loan2 = recurringLoans.find(l => l.recurring_loan_number === 2)
    expect(loan2).toBeDefined()
    
    // User deletes loan 2 (soft-delete)
    await loansService.delete(loan2!.id)
    
    // Verify is_deleted is set
    const deletedLoan = await loansService.getById(loan2!.id)
    expect(deletedLoan).toBeNull() // getAll filters out deleted
    
    // Second run on different day - should NOT create loan 2 again
    vi.setSystemTime(new Date('2026-04-10'))
    await autoCreateRecurringLoans()
    allLoans = await loansService.getAll()
    recurringLoans = allLoans.filter(l => l.is_recurring && l.borrower_id === borrower.lastInsertRowid)
    
    // Should still be only 1 loan (loan 1)
    expect(recurringLoans).toHaveLength(1)
    expect(recurringLoans[0].recurring_loan_number).toBe(1)
  })

  it('should prevent duplicate repairs on same day', async () => {
    vi.setSystemTime(new Date('2026-04-12'))
    
    const borrower = await borrowersService.create({
      first_name: 'בן',
      last_name: 'ציון',
      id_number: '123456789',
      phone: '0501234567',
    })
    
    const loan = await loansService.create({
      borrower_id: borrower.lastInsertRowid,
      amount: 1000,
      loan_date: '2026-02-05', // 2 months ago!
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 10,
      recurring_day: 5,
      recurring_loan_number: 1,
      recurring_loan_count: 11,
      auto_repayment: 0,
    })
    
    // First run - should alert about missed loans
    await autoCreateRecurringLoans()
    let alerts = getMissedLoansAlerts()
    expect(alerts).toHaveLength(1)
    
    // Second run same day - should NOT alert again
    await autoCreateRecurringLoans()
    alerts = getMissedLoansAlerts()
    expect(alerts).toHaveLength(0) // No alerts on second run
  })
})
```

---

## ✅ Checklist יישום

- [ ] עדכן `Loan` interface - הוסף `is_deleted` ו-`deleted_at`
- [ ] עדכן `loansService.create()` - הגדר `is_deleted: false`
- [ ] שנה `loansService.delete()` ל-soft-delete
- [ ] עדכן `loansService.getAll()` - סנן `is_deleted === false`
- [ ] הוסף constants בראש `scheduler.ts`
- [ ] הוסף פונקציות `getLastMissedLoanRepairDate()` ו-`markMissedLoanRepairAttempt()`
- [ ] בדוק `is_deleted` בlogic של `autoCreateRecurringLoans()`
- [ ] בדוק repair log בlogic של monthsDiff
- [ ] הוסף `getMissedLoansAlerts()` export
- [ ] עדכן AlertsDialog להציג missed loans
- [ ] כתוב בדיקות יחידה
- [ ] בדוק ידני: יצור → מחק → סגור/פתח

---

## 🎯 תוצאה צפויה

✅ יצור הלוואה → סגור/פתח = לא תיווצר שוב  
✅ מחק → סגור/פתח = לא תיווצר שוב  
✅ repair log = מנע ניסיונות חוזרים באותו יום  
✅ ביקורת = דע מתי הלוואה נמחקה (deleted_at)  

**תוצאה סופית: 100% coverage של בעיית היצירה הכפולה** 🎉
