# 🐛 בעיה: יצירת הלוואות כפולות בחזרה לאחר מחיקה

**תאריך גילוי:** 24 באפריל 2026  
**משקל:** 🔴 **קריטית**  
**סוג:** Data Integrity & Business Logic

---

## 📋 תיאור הבעיה

### התרחיש הבעייתי

1. **פעם ראשונה:** משתמש פותח את התוכנה
   - `autoCreateRecurringLoans()` מוצא הלוואה מחזורית שהוחמצה לפני כמה ימים
   - המערכת יוצרת הלוואה חדשה אוטומטית
   - דוגמה: יום קבוע 5, והיום הוא 25 → `monthsDiff = 20 ימים` → צריך ליצור

2. **משתמש פועל:** משתמש **מוחק** את ההלוואה החדשה שנוצרה
   - הלוואה נמחקת מה-database

3. **פעם שנייה:** משתמש סוגר את התוכנה ופותח שוב
   - `autoCreateRecurringLoans()` רץ שוב
   - **הבעיה:** ההלוואה המקורית עדיין מהחודש הקודם
   - `monthsDiff > 1` עדיין **true**
   - `existingLoanThisMonth` = **false** (כי המשתמש מחק את ההלוואה)
   - **תוצאה:** המערכת יוצרת את ההלוואה **שוב**! 🔁

### הבעיה בקוד

**בקובץ `src/services/scheduler.ts` (שורות 390-410):**

```typescript
if (monthsDiff > 1 && !existingLoanThisMonth) {
  console.warn(`[AUTO-CREATE] ⚠️ Warning: Loan #${loan.id} is ${monthsDiff} months old...`)
  
  // הבעיה:
  // - אנו בודקים את monthsDiff של ההלוואה המקורית
  // - אבל ההלוואה המקורית עדיין מהחודש הקודם
  // - אם המשתמש מחק את ההלוואה החדשה שנוצרה
  // - existingLoanThisMonth יהיה false שוב
  // - אז אנו יוצרים אותה שוב!
  
  missedLoansAlerts.push({...})
}
```

**דוגמה חישובית:**

```
ההלוואה המקורית: 2026-03-05 (חודש מרץ)
תאריך היום:       2026-04-24 (חודש אפריל)

חישוב monthsDiff:
  currentYear = 2026, currentMonth = 3 (אפריל)
  loanYear = 2026,    loanMonth = 2 (מרץ)
  monthsDiff = (2026 - 2026) * 12 + (3 - 2) = 1 ✓

אבל אם נעבור לחודש מאי (5):
  currentMonth = 4 (מאי)
  monthsDiff = (2026 - 2026) * 12 + (4 - 2) = 2 ✓✓ > 1

וזה נשמר! המחיקה של ההלוואה חדשה לא משפיעה על החישוב הזה.
```

---

## 🔍 ניתוח שורש הבעיה

| גורם | הסבר | משקל |
|------|------|------|
| `monthsDiff` מחושב מ-`loan.loan_date` המקורי | הערך הזה לא משתנה | גבוהה |
| אין עדכון ל-`loan.loan_date` לאחר יצירת הלוואה חדשה | הלוגיקה משתמשת בתאריך הישן | גבוהה |
| אין tracking של ניסיונות יצירה | קיימת יצירה חוזרת ללא בדיקה | גבוהה |
| מחיקה hard-delete במקום soft-delete | לא ניתן לדעת שהלוואה נמחקה | גבוהה |

---

## ✅ פתרון 1: Soft-Delete (חזק וקל להטמעה)

### שלב 1: הוסף שדה `is_deleted` להלוואה

**בקובץ `src/services/database.ts`:**

```typescript
// עדכן את ממשק Loan
export interface Loan { 
  id: number
  borrower_id: number
  amount: number
  loan_date: string
  // ... שדות קיימים ...
  is_deleted?: boolean        // ← הוסף את זה
  deleted_at?: string         // ← תעד מתי נמחק
}
```

### שלב 2: עדכן את `create` ו-`delete`

**בקובץ `src/services/database.ts`:**

```typescript
async create(l: Omit<Loan, 'id' | 'created_at' | 'status'>): Promise<{ lastInsertRowid: number }> { 
  const id = generateId('loans')
  const status = new Date(l.loan_date) > new Date() ? 'planned' : 'active'
  setItem('loans', String(id), { 
    ...l, 
    id, 
    status,
    is_deleted: false,              // ← ערך ברירת מחדל
    created_at: new Date().toISOString() 
  })
  return { lastInsertRowid: id } 
}

// שנה את delete להיות soft-delete
async delete(id: number): Promise<void> { 
  const e = await this.getById(id)
  if (e) {
    setItem('loans', String(id), { 
      ...e, 
      is_deleted: true,                          // ← סמן כמחוק
      deleted_at: new Date().toISOString()       // ← תעד מתי
    })
  }
}
```

### שלב 3: סנן את ה-deleted loans בכל query

**בקובץ `src/services/database.ts` - בפונקציה `getAll`:**

```typescript
async getAll(): Promise<Loan[]> {
  const loans = getAllItems<Loan>('loans')
    .filter(l => !l.is_deleted)  // ← סנן את המחוקים
  const borrowers = await borrowersService.getAll()
  // ... שאר הקוד ...
}
```

### שלב 4: בדוק בScheduler אם ההלוואה המקורית נמחקה

**בקובץ `src/services/scheduler.ts` - בפונקציה `autoCreateRecurringLoans`:**

```typescript
for (const loan of allLoans) {
  // Skip if not recurring or no more loans to create
  if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
  
  // ← הוסף בדיקה זו
  // בדוק אם ההלוואה המקורית נמחקה
  if (loan.is_deleted) {
    console.log(`[AUTO-CREATE] Loan #${loan.id} is marked as deleted, skipping`)
    continue
  }
  
  const recurringDay = loan.recurring_day || 1
  const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
  
  // ... שאר הלוגיקה ...
  
  // בדוק אם זה loan שהוחמץ
  if (monthsDiff > 1 && !existingLoanThisMonth) {
    if (loan.is_deleted) {
      console.log(`[AUTO-CREATE] Loan #${loan.id} was deleted, not creating new one`)
      continue  // ← אל תיצור!
    }
    
    // ... משך הקוד ...
  }
}
```

---

## ✅ פתרון 2: Repair Log (קל להטמעה)

### שלב 1: הוסף tracking של ניסיונות תיקון

**בקובץ `src/services/scheduler.ts`:**

```typescript
const MISSED_LOANS_REPAIR_KEY = 'gemach_missed_loans_repair_log'

// מקבל את תאריך הניסיון האחרון לתיקון הלוואה
function getLastMissedLoanRepairDate(loanId: number): string | null {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    return log[loanId] || null
  } catch {
    return null
  }
}

// רשום ניסיון תיקון
function markMissedLoanRepairAttempt(loanId: number): void {
  try {
    const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
    log[loanId] = new Date().toISOString().split('T')[0]
    localStorage.setItem(MISSED_LOANS_REPAIR_KEY, JSON.stringify(log))
  } catch (e) {
    console.error('Error marking missed loan repair:', e)
  }
}
```

### שלב 2: בדוק בלוגיקת `autoCreateRecurringLoans`

```typescript
if (monthsDiff > 1 && !existingLoanThisMonth) {
  const lastRepairDate = getLastMissedLoanRepairDate(loan.id)
  const today = todayStr
  
  // אם כבר ניסינו היום - אל תנסה שוב
  if (lastRepairDate === today) {
    console.log(`[AUTO-CREATE] Already attempted to repair loan #${loan.id} today, skipping`)
    continue  // ← דילוג!
  }
  
  console.warn(`[AUTO-CREATE] ⚠️ Detected missed loans for #${loan.id}`)
  missedLoansAlerts.push({
    loanId: loan.id,
    borrowerName: loan.borrower_name || `Loan #${loan.id}`,
    monthsMissed: monthsDiff - 1,
    lastLoanDate: loan.loan_date,
    currentRecurringNumber: currentRecurringNumber,
    totalCount: loan.recurring_loan_count || 0
  })
  
  // סמן שניסינו היום
  markMissedLoanRepairAttempt(loan.id)
}
```

---

## 📊 השוואת הפתרונות

| קריטריון | Soft-Delete | Repair Log |
|---------|-----------|-----------|
| **קל להטמעה** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Data Integrity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **שימור היסטוריה** | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Recovery אפשרי** | ⭐⭐⭐⭐⭐ | ⭐ |
| **ביקורת עתידית** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **ביצועים** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 המלצה

### הפתרון הטוב ביותר: **Soft-Delete + Repair Log**

השתמש בשניהם:

1. **Soft-Delete** למשך ארוך (שמירה ובדיקה בעתיד)
2. **Repair Log** להיום (מניעת יצירה חוזרת בימים הקרובים)

```typescript
if (monthsDiff > 1 && !existingLoanThisMonth) {
  // 1. בדיקה ראשונה: האם הלוואה נמחקה?
  if (loan.is_deleted) {
    console.log(`[AUTO-CREATE] Loan #${loan.id} is deleted`)
    continue
  }
  
  // 2. בדיקה שנייה: האם כבר ניסינו היום?
  const lastRepairDate = getLastMissedLoanRepairAttempt(loan.id)
  if (lastRepairDate === today) {
    console.log(`[AUTO-CREATE] Already repaired today`)
    continue
  }
  
  // 3. צור התראה וסמן ניסיון
  missedLoansAlerts.push({...})
  markMissedLoanRepairAttempt(loan.id)
}
```

---

## 🧪 בדיקות להוסיף

### Test 1: Soft-Delete חוסם יצירת הלוואות כפולות

```typescript
it('should not create duplicate loans after deleting original', async () => {
  // צור הלוואה מחזורית
  const loan = await loansService.create({...})
  
  // מחק אותה (soft-delete)
  await loansService.delete(loan.lastInsertRowid)
  
  // נסה ליצור הלוואה חדשה
  await autoCreateRecurringLoans()
  
  // בדוק שלא נוצרה הלוואה חדשה
  const allLoans = await loansService.getAll()
  const newLoans = allLoans.filter(l => l.loan_date === today)
  expect(newLoans).toHaveLength(0)
})
```

### Test 2: Repair Log חוסם יצירת כפולה

```typescript
it('should prevent duplicate repairs on same day', async () => {
  // סמן ניסיון תיקון
  markMissedLoanRepairAttempt(1)
  
  // נסה שוב באותו יום
  const shouldRepair = shouldAttemptRepair(1)
  
  expect(shouldRepair).toBe(false)
})
```

### Test 3: שילוב שניהם

```typescript
it('should use both soft-delete and repair log', async () => {
  // יום 1: מצא הלוואה שהוחמצה, צור חדשה
  await autoCreateRecurringLoans()
  let newLoans = await loansService.getAll().filter(l => l.loan_date === day1)
  expect(newLoans).toHaveLength(1)
  
  // משתמש מחק
  await loansService.delete(newLoans[0].id)
  
  // יום 2: אל תיצור שוב (דבר ראשון - repair log)
  await autoCreateRecurringLoans()
  newLoans = await loansService.getAll().filter(l => l.loan_date === day2)
  expect(newLoans).toHaveLength(0)
  
  // יום 3: עדיין אל תיצור (דבר שני - soft-delete)
  await autoCreateRecurringLoans()
  newLoans = await loansService.getAll().filter(l => l.loan_date === day3)
  expect(newLoans).toHaveLength(0)
})
```

---

## 📋 Checklist היישום

- [ ] הוסף `is_deleted` ו-`deleted_at` ל-`Loan` interface
- [ ] עדכן את `loansService.create()` להגדיר `is_deleted: false`
- [ ] שנה את `loansService.delete()` ל-soft-delete
- [ ] עדכן `loansService.getAll()` לסנן `is_deleted === false`
- [ ] הוסף `getMissedLoansRepairDate()` ו-`markMissedLoanRepairAttempt()` ב-scheduler
- [ ] בדוק בדיקה של `is_deleted` ב-`autoCreateRecurringLoans()`
- [ ] בדוק בדיקה של repair log
- [ ] כתוב בדיקות יחידה
- [ ] בדוק ידני בתוכנה

---

## 🎉 תוצאה הצפויה

✅ משתמש מחק הלוואה ופתח שוב? → **לא תיווצר שוב**  
✅ ניסיון יצירה חוזרת? → **יזוהה ויילכד**  
✅ ניתן לשחזר הלוואה שנמחקה בטעות? → **כן!**  
✅ ביקורת מלאה? → **כן, עם `deleted_at`**
