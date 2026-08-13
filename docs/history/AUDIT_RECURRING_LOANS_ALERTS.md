# 📋 דוח בדיקה קוד - מערכת הלוואות מחזוריות והתראות

**תאריך ביצוע בדיקה:** 24 באפריל 2026  
**מטרת הבדיקה:** בדיקת הליך יצירת הלוואות מחזוריות והצגת התראות  
**קבצים בדוקים:**
- `src/services/scheduler.ts`
- `src/components/AlertsDialog.tsx`
- `src/__tests__/scheduler.test.ts`
- `src/__tests__/recurringLoanDuplication.test.ts`

---

## 🔍 תקציר הממצאים

| חומרות | בעיה | השפעה | תאריך גילוי |
|--------|------|--------|-----------|
| 🔴 קריטית | שכפול קוד עם הבדלים | עלול להוביל לאי-יצירת הלוואות | תמיד |
| 🔴 קריטית | בדיקת כפילויות חלשה | עלול ליצור הלוואות כפולות | כל חודש |
| 🔴 קריטית | היעדרות בדיקת `isPastRecurringDay` | אי-יצירת הלוואות בעבור אחרי יום קבוע | תמיד |
| � קריטית | Race Condition בין scheduler ל-AlertsDialog | עלול ליצור הלוואות כפולות בריצה בו-זמנית | בתחילת הפעלה |
| 🔴 קריטית | בדיקת "הלוואה נוצרה החודש" חלשה | עלולה לדלג על יצירת הלוואה חדשה | כל חודש |
| 🔴 קריטית | חוסר בדיקת `status = 'active'` ב-checkRecurringLoans | התראות על הלוואות מתוכננות | תמיד |
| �🟡 חמורה | בדיקת `recurring_loan_number` לא עקבית | בלבול בזיהוי הלוואות | כל חודש |
| 🟡 חמורה | שתי מערכות התראות שונות | כפילויות ואי-סדרים | תמיד |

**הערכה כוללת:** ⚠️ **בעיות קריטיות דורשות תיקון דחוף**

---

## 🔴 בעיה 1: שכפול קוד עם הבדלים חמורים

### תיאור הבעיה

קיימות **שתי יישומים שונים** של אותה הלוגיקה ליצירת הלוואות מחזוריות:

**קובץ: `src/services/scheduler.ts` (שורות 280-330)**
```typescript
async function autoCreateRecurringLoans(): Promise<void> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  try {
    const allLoans = await loansService.getAll() as any[]
    
    for (const loan of allLoans) {
      // Skip if not recurring or no more loans to create
      if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
      
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // ✅ בודק גם את shouldCreateToday וגם isPastRecurringDay
      const shouldCreateToday = effectiveRecurringDay === day
      const isPastRecurringDay = day > effectiveRecurringDay
      
      // ... בדיקות נוספות ...
      
      if (shouldCreateToday || isPastRecurringDay) {
        console.log(`[AUTO-CREATE] Creating recurring loan from loan #${loan.id}...`)
        const success = await createRecurringLoan(loan.id)
      }
    }
  } catch (error) {
    console.error('[AUTO-CREATE] Error:', error)
  }
}
```

**קובץ: `src/components/AlertsDialog.tsx` (שורות 407-445)**
```typescript
const autoCreateRecurringLoans = async () => {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  try {
    const allLoans = await loansService.getAll() as any[]
    
    for (const loan of allLoans) {
      // Skip if not recurring or no more loans to create
      if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
      
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      // ❌ בודקת רק אם היום הוא יום קבוע
      if (effectiveRecurringDay !== day) continue
      
      // בדיקה פשוטה מדי - לא כוללת recurring_loan_number
      const existingLoanToday = allLoans.find((l: any) => 
        l.borrower_id === loan.borrower_id && 
        l.amount === loan.amount && 
        l.loan_date === todayStr &&
        l.id !== loan.id
      )
      
      if (existingLoanToday) {
        console.log(`[AUTO-CREATE] Loan already exists for today: loan #${loan.id}`)
        continue
      }
      
      const success = await createRecurringLoan(loan.id)
    }
  } catch (error) {
    console.error('[AUTO-CREATE] Error:', error)
  }
}
```

### 🎯 למה זו בעיה?

#### דוגמה מעשית - תרחיש בדיקה:

**נתוני ההלוואה:**
- משתכן: יוני כהן
- סכום: ₪5,000
- יום קבוע: 5 לחודש
- תאריך: 25 באפריל 2026

**מה קורה:**

| תנאי | scheduler.ts | AlertsDialog.tsx |
|------|-------------|-----------------|
| today = 25, day = 25, effectiveRecurringDay = 5 | `shouldCreateToday = false`<br>`isPastRecurringDay = true`<br>✅ **יוצר הלוואה** | `if (5 !== 25) continue`<br>❌ **דילג** |
| today = 5, day = 5, effectiveRecurringDay = 5 | ✅ **יוצר הלוואה** | ✅ **יוצר הלוואה** |

**תוצאה:** אם הבדיקה מתרחשת בתאריך שגוי (למשל 25 לחודש כאשר היום קבוע הוא 5), AlertsDialog לא יוצר הלוואה!

---

## 🔴 בעיה 2: בדיקת כפילויות בעיתית

### תיאור הבעיה

**בקובץ `src/services/scheduler.ts` (שורה 40-55):**

```typescript
export async function checkRecurringLoans(): Promise<Alert[]> {
  // ...
  const recurringLoans = await db.query(`
    SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
    FROM loans l
    JOIN borrowers b ON l.borrower_id = b.id
    WHERE l.is_recurring = 1 
    AND l.recurring_months > 0
  `) as any[]

  for (const loan of recurringLoans) {
    const effectiveDay = Math.min(loan.recurring_day || 1, lastDayOfMonth)
    
    if (effectiveDay !== todayDay) continue
    
    // ❌ בדיקת הלוואה קיימת - חלשה מדי
    const existingLoan = await db.query(`
      SELECT id FROM loans 
      WHERE borrower_id = ? 
      AND amount = ? 
      AND loan_date = ?
    `, [loan.borrower_id, loan.amount, todayStr])

    if (existingLoan.length === 0) {
      alerts.push({
        id: `recurring_${loan.id}_${todayStr}`,
        type: 'recurring_loan',
        // ... alert data ...
      })
    }
  }
}
```

### 🎯 למה זו בעיה?

**תרחיש בעייתי:**

נניח שלמשתכן "עודד לוי" יש שתי הלוואות מחזוריות:

| הלוואה | סכום | יום קבוע | recurring_loan_number |
|--------|------|---------|----------------------|
| ID: 1 | ₪10,000 | 5 | 1/12 |
| ID: 2 | ₪10,000 | 10 | 1/12 |

**בתאריך 5 באפריל:**

1. `checkRecurringLoans()` מחפש הלוואות עם `borrower_id=עודד` ו-`amount=10000` ו-`loan_date=2026-04-05`
2. הוא לא מוצא אף הלוואה (כי הן עדיין לא נוצרו)
3. הוא בודק ההלוואה #1 ומציע לבדוק אם צריך ליצור הלוואה מחדש
4. הוא **לא בודק את `recurring_loan_number`** כדי להבדיל בין שתי ההלוואות
5. זה עלול להוביל להתראות שגויות או בלבול

### 🔧 הפתרון:

צריך להוסיף בדיקה של `recurring_loan_number`:

```typescript
// ✅ בדיקה משופרת
const existingLoan = await db.query(`
  SELECT id FROM loans 
  WHERE borrower_id = ? 
  AND amount = ? 
  AND loan_date = ?
  AND recurring_loan_number = ?  // ← הוסף זאת!
`, [loan.borrower_id, loan.amount, todayStr, (loan.recurring_loan_number || 1) + 1])
```

---

## 🔴 בעיה 3: Race Condition בין scheduler ל-AlertsDialog

### תיאור הבעיה

הקוד מריץ שתי גרסאות של אותה לוגיקה במקביל באתחול האפליקציה:

- `src/services/scheduler.ts` - `runStartupChecks()` קורא ל-`autoCreateRecurringLoans()`
- `src/components/AlertsDialog.tsx` - `checkAlerts()` קורא ל-`autoCreateRecurringLoans()` מקומית

### 🎯 למה זו בעיה?

אם האפליקציה מריצה את `runStartupChecks()` בטעינה ו-AlertsDialog נפתח בו-זמנית, שתי הפונקציות עלולות לרוץ במקביל על אותו קובץ הלוואות.

זה יוצר מצב שבו אפשר לקרוא ל-`createRecurringLoan()` פעמיים עבור אותה הלוואה, ולגרום ליצירת הלוואות כפולות או ליצירת רשומות לא עקביות.

### 🔧 הפתרון:

- להסיר את `autoCreateRecurringLoans()` המקומי מ-`AlertsDialog.tsx`
- לשים את כל הלוגיקה של יצירת הלוואות מחזוריות ב-`scheduler.ts`
- לקרוא בהצגת התראות לפונקציה המשותפת מ-`scheduler.ts` בלבד

---

## 🔴 בעיה 4: בדיקת "הלוואה נוצרה החודש" חלשה

### תיאור הבעיה

ב-`src/services/scheduler.ts` (שורות 300-304):

```typescript
// IMPORTANT: Skip if this loan was created this month!
if (loan.loan_date >= firstDayOfMonth && loan.loan_date <= todayStr) {
  console.log(`[AUTO-CREATE] Loan #${loan.id} was created this month, skipping`)
  continue
}
```

### 🎯 למה זו בעיה?

הבדיקה שוחקת את התאריך של ההלוואה המקורית, לא את ההלוואה החדשה שצריכה להיווצר.

### דוגמה בעייתית:

- יום 5 באפריל: נוצרה הלוואה 2/12 (`loan_date = 2026-04-05`)
- יום 6 באפריל: ישראל מריץ את ה-scheduler שוב
- תנאי הבדיקה בודק את `loan.loan_date` של ההלוואה המקורית, ולכן דילג על יצירת 3/12

**תוצאה:** לא יוצרת הלוואה 3/12 למרות שצריך.

### 🔧 הפתרון:

- להחליף את הבדיקה בבדיקה של קיום הלוואה עם `recurring_loan_number === nextRecurringNumber` בחודש זה
- לא להסתמך על `loan.loan_date` של ההלוואה המקורית לבדו

---

## 🔴 בעיה 5: אין בדיקת `status` ב-checkRecurringLoans

### תיאור הבעיה

ב-`src/services/scheduler.ts` (שורות 28-35):

```typescript
const recurringLoans = await db.query(`
  SELECT l.*, b.first_name || ' ' || b.last_name as borrower_name
  FROM loans l
  JOIN borrowers b ON l.borrower_id = b.id
  WHERE l.is_recurring = 1 
  AND l.recurring_months > 0
`) as any[]
```

### 🎯 למה זו בעיה?

אין `AND l.status = 'active'` בסלקט.

זה מאפשר להצגת התראות גם על הלוואות מתוכננות (`status = 'planned'`), מה שלא הגיוני עבור התראה על הלוואה מחזורית שצריכה להיווצר היום.

### 🔧 הפתרון:

להוסיף את התנאי הבא לשאילתא:

```sql
AND l.status = 'active'
```

---

## 🔴 בעיה 6: בדיקת `isPastRecurringDay` לא עקבית

### תיאור הבעיה

**ב-`scheduler.ts` - בפונקציה `autoCreateRecurringLoans()` (שורות 287-319):**

```typescript
// בודק גם את shouldCreateToday וגם isPastRecurringDay
const shouldCreateToday = effectiveRecurringDay === day
const isPastRecurringDay = day > effectiveRecurringDay

// ...בדיקות נוספות...

if (shouldCreateToday || isPastRecurringDay) {
  console.log(`[AUTO-CREATE] Creating recurring loan from loan #${loan.id}...`)
  const success = await createRecurringLoan(loan.id)
}
```

**הבדיקות המוקדמות:**

```typescript
// IMPORTANT: Skip if this loan was created this month!
if (loan.loan_date >= firstDayOfMonth && loan.loan_date <= todayStr) {
  console.log(`[AUTO-CREATE] Loan #${loan.id} was created this month, skipping`)
  continue
}

// Check if loan already created this month - check by recurring number
const currentRecurringNumber = loan.recurring_loan_number || 1
const nextRecurringNumber = currentRecurringNumber + 1

const existingLoanThisMonth = allLoans.find((l: any) => 
  l.borrower_id === loan.borrower_id && 
  l.amount === loan.amount && 
  l.loan_date >= firstDayOfMonth &&
  l.loan_date <= todayStr &&
  l.id !== loan.id &&
  l.is_recurring === 1 &&
  l.recurring_loan_number === nextRecurringNumber  // ✅ בודק את המספר
)
```

### 🎯 למה זו בעיה?

**תרחיש בעייתי - "תצפית מאוחרת":**

1. **היום 1 באפריל** - יום קבוע הוא 5:
   - לא בודקים כי `effectiveRecurringDay (5) !== day (1)`
   - ✅ נכון - אין צורך להיות חרדים

2. **היום 15 באפריל** - יום קבוע הוא 5:
   - `shouldCreateToday = false` (15 ≠ 5)
   - `isPastRecurringDay = true` (15 > 5)
   - הכן - צריך להיות מהימן כאן

3. **אבל בבדיקת AlertsDialog** - היא לא בודקת `isPastRecurringDay` כלל!

### הבדלים קריטיים:

| בדיקה | scheduler.ts | AlertsDialog.tsx |
|--------|-------------|-----------------|
| `shouldCreateToday` | ✅ | ✅ |
| `isPastRecurringDay` | ✅ | ❌ |
| `recurring_loan_number` | ✅ | ❌ |

---

## 🟡 בעיה 4: שתי מערכות התראות שונות

### תיאור הבעיה

**מערכת 1: `scheduler.ts`**
```typescript
// בפונקציה checkRecurringLoans()
export async function checkRecurringLoans(): Promise<Alert[]> {
  // מחזירה Alert[] עם type = 'recurring_loan'
  // משנה להכין הלוואה
}

// בפונקציה checkAutoRepayments()
export async function checkAutoRepayments(): Promise<Alert[]> {
  // מחזירה Alert[] עם type = 'auto_repayment'
  // משנה להכין פירעון
}
```

**מערכת 2: `AlertsDialog.tsx`**
```typescript
// בפונקציה checkAlerts()
const checkAlerts = async () => {
  const newAlerts: Alert[] = []
  
  // קריאה ל-scheduler
  await activatePlannedLoans()
  await autoCreateRecurringLoans()  // ← יצירת הלוואות
  
  // בדיקות משלה
  const overdueLoans = await loansService.getOverdue()
  overdueLoans.forEach((loan: any) => {
    newAlerts.push({
      type: 'overdue',
      // ...
    })
  })
  
  // בדיקות נוספות - דומות ל-scheduler אך לא זהות
  allLoans.forEach((loan: any) => {
    if (loan.is_recurring && loan.loan_date === todayStr && loan.recurring_loan_number > 1) {
      newAlerts.push({
        type: 'info',
        title: 'הלוואה מחזורית נוצרה',
        // ...
      })
    }
  })
}
```

### 🎯 למה זו בעיה?

1. **דינמיקה לא ברורה** - זה לא ברור מה בא קודם
2. **כפילויות** - אותה בדיקה מתבצעת בשני מקומות
3. **אי-עקביות** - בעיות שונות בכל יישום
4. **maintenance nightmare** - תיקון באג דורש שינוי בשני מקומות

### דוגמה - זרימת הנתונים:

```
App starts
    ↓
AlertsDialog opens
    ↓
checkAlerts() called
    ├─→ activatePlannedLoans() from scheduler
    ├─→ autoCreateRecurringLoans() (local version)
    │   └─→ createRecurringLoan() from scheduler
    └─→ Manual alert checking
    
scheduler.ts also has:
    ├─→ runStartupChecks()
    ├─→ autoCreateRecurringLoans()
    └─→ checkRecurringLoans()
```

זה בלבול עצום! יש פונקציות בשתי וגם מקומות וזה לא ברור מה קוראה למה.

---

## 🟡 בעיה 5: בדיקת `recurring_loan_number` לא עקבית

### תיאור הבעיה

**ב-`scheduler.ts` - `autoCreateRecurringLoans()`:**

```typescript
// ✅ בודקת את recurring_loan_number
const currentRecurringNumber = loan.recurring_loan_number || 1
const nextRecurringNumber = currentRecurringNumber + 1

const existingLoanThisMonth = allLoans.find((l: any) => 
  l.borrower_id === loan.borrower_id && 
  l.amount === loan.amount && 
  l.loan_date >= firstDayOfMonth &&
  l.loan_date <= todayStr &&
  l.id !== loan.id &&
  l.is_recurring === 1 &&
  l.recurring_loan_number === nextRecurringNumber  // ← בודקת המספר
)
```

**ב-`AlertsDialog.tsx` - `autoCreateRecurringLoans()`:**

```typescript
// ❌ לא בודקת את recurring_loan_number כלל
const existingLoanToday = allLoans.find((l: any) => 
  l.borrower_id === loan.borrower_id && 
  l.amount === loan.amount && 
  l.loan_date === todayStr &&
  l.id !== loan.id
  // Missing: recurring_loan_number check
)
```

### 🎯 למה זו בעיה?

**תרחיש בעייתי:**

משתכן "יעקב כהן" יש 3 הלוואות מחזוריות (כל אחת ₪5,000 בחודש אחר):

| הלוואה | יום קבוע | recurring_loan_number |
|--------|---------|----------------------|
| ID: 10 | 15 | 1/3 |
| ID: 11 | 20 | 1/3 |
| ID: 12 | 25 | 1/3 |

**בתאריך 15 באפריל:**

**AlertsDialog בודקת:**
```javascript
const existingLoanToday = allLoans.find((l: any) => 
  l.borrower_id === 1 &&           // יעקב
  l.amount === 5000 &&             // ₪5,000
  l.loan_date === '2026-04-15' &&  // היום
  l.id !== 10
)
```

זה עלול **להשווות את הלוואה #10 להלוואות #11 ו-#12** ולא למצוא כשום קיימת, כמו שלא צריך!

---

## 📊 ניתוח השפעות

### 1. התאימות ביצירת הלוואות

```
╔════════════════════════════════════════════╗
║ מסקנה: לא קיימת הערובה שהלוואה תיווצר   ║
║ בכל הסיטואציות האפשריות                  ║
╚════════════════════════════════════════════╝

Scheduler.ts:  יוצר ❌ ✅ ✅     (בודק isPastRecurringDay)
AlertsDialog:  יוצר ❌ ❌ ✅     (לא בודק isPastRecurringDay)

Day 5 (recurring_day = 5):        ✅ ✅ שניהם יוצרים
Day 10 (recurring_day = 5):       ✅ ❌ רק scheduler יוצר
Day 15 (recurring_day = 5):       ✅ ❌ רק scheduler יוצר
Day 25 (recurring_day = 5):       ✅ ❌ רק scheduler יוצר
```

---

## 💾 בדיקות קיימות

**בקובץ `src/__tests__/recurringLoanDuplication.test.ts`:**

```typescript
it('should not create duplicate loans when running scheduler multiple times', async () => {
  vi.setSystemTime(new Date('2026-04-12'))
  
  // Create loan 2/12 from March 5
  const loan2 = await loansService.create({
    // ...
    recurring_loan_number: 2,
    recurring_loan_count: 12,
  })
  
  // First run - should create loan 3/12
  const firstRun = await autoCreateRecurringLoans()
  expect(firstRun).toHaveLength(1)
  expect(firstRun[0]).toBe(loan2.lastInsertRowid)
  
  // Second run - should NOT create anything (loan 3 already exists)
  const secondRun = await autoCreateRecurringLoans()
  expect(secondRun).toHaveLength(0)  // Should be empty!
})
```

✅ **הבדיקה קיימת ונראית טובה** - אבל היא בודקת רק את scheduler, לא את AlertsDialog!

---

## 🛠️ המלצות לתיקון

### ✅ תיקון 1: הסר שכפול קוד

**תיקון ב-`AlertsDialog.tsx`:**

```typescript
// ❌ כרגע יש שכפול קוד
const autoCreateRecurringLoans = async () => { ... }

// ✅ צריך להיות
// זו פונקציה שקוראים מ-scheduler
import { autoCreateRecurringLoans as scheduleAutoCreate } from '../services/scheduler'

const checkAlerts = async () => {
  // ... 
  await scheduleAutoCreate()  // ← השתמש בגרסה מ-scheduler
  // ...
}
```

---

### ✅ תיקון 2: שפר בדיקות כפילויות

**ב-`scheduler.ts` - שדרג את `checkRecurringLoans()`:**

```typescript
export async function checkRecurringLoans(): Promise<Alert[]> {
  // ...
  for (const loan of recurringLoans) {
    const effectiveDay = Math.min(loan.recurring_day || 1, lastDayOfMonth)
    
    if (effectiveDay !== todayDay) continue
    
    // ✅ בדיקה משופרת
    const existingLoan = await db.query(`
      SELECT id FROM loans 
      WHERE borrower_id = ? 
      AND amount = ? 
      AND loan_date = ?
      AND recurring_loan_number = ?  // ← הוסף זאת
    `, [
      loan.borrower_id, 
      loan.amount, 
      todayStr,
      (loan.recurring_loan_number || 1) + 1
    ])

    if (existingLoan.length === 0) {
      alerts.push({
        // ...
      })
    }
  }
}
```

---

### ✅ תיקון 3: הוסף הערות בדוק `isPastRecurringDay`

```typescript
// בדוק אם צריך להיות חרדים לגבי "ימים מאוחרים"
// 
// דוגמה:
// - recurring_day = 5
// - today = 15
// 
// זה אומר שהיום הוא 10 ימים אחרי יום קבוע
// אנו לא יצרנו הלוואה בתאריך 5, אז אנו צריכים ליצור אותה עכשיו
// (אבל רק אם היא עדיין לא קיימת בחודש זה)

const shouldCreateToday = effectiveRecurringDay === day
const isPastRecurringDay = day > effectiveRecurringDay

if (shouldCreateToday || isPastRecurringDay) {
  // פעמיים בדיקה: בחודש זה לא קיימת הלוואה?
  if (existingLoanThisMonth) {
    console.log(`[AUTO-CREATE] Loan #${nextRecurringNumber} already exists`)
    continue
  }
  
  await createRecurringLoan(loan.id)
}
```

---

### ✅ תיקון 4: הוסף בדיקה ל-`recurring_loan_number` בכל מקום

**ב-`AlertsDialog.tsx`:**

```typescript
// ❌ כיום
const existingLoanToday = allLoans.find((l: any) => 
  l.borrower_id === loan.borrower_id && 
  l.amount === loan.amount && 
  l.loan_date === todayStr &&
  l.id !== loan.id
)

// ✅ צריך להיות
const currentRecurringNumber = loan.recurring_loan_number || 1
const nextRecurringNumber = currentRecurringNumber + 1

const existingLoanToday = allLoans.find((l: any) => 
  l.borrower_id === loan.borrower_id && 
  l.amount === loan.amount && 
  l.loan_date === todayStr &&
  l.id !== loan.id &&
  l.recurring_loan_number === nextRecurringNumber  // ← הוסף זאת
)
```

---

### ✅ תיקון 5: יחידות - מקור אמת אחד

**ארכיטקטורה משופרת:**

```
scheduler.ts (מקור אמת לכל הלוגיקה)
├─ runStartupChecks()
│  ├─ activatePlannedLoans()
│  ├─ autoCreateRecurringLoans()  ← ✅ תמיד כאן
│  └─ checkRecurringLoans()
├─ autoCreateRecurringLoans()     ← ✅ ממקור אחד
├─ checkRecurringLoans()
└─ checkAutoRepayments()

AlertsDialog.tsx (קורא מ-scheduler)
├─ checkAlerts()
│  ├─ await activatePlannedLoans()      // ← מ-scheduler
│  ├─ await autoCreateRecurringLoans()  // ← מ-scheduler
│  ├─ await checkOverdue()              // ← משלה (נצפה)
│  └─ // הצגת התראות
```

---

## 📝 סיכום המלצות

| # | תיקון | קובץ | עדיפות | זמן משוער |
|---|------|------|--------|----------|
| 1 | הסר שכפול קוד | AlertsDialog.tsx | 🔴 גבוהה | 15 דקות |
| 2 | הוסף `recurring_loan_number` בכל בדיקה | scheduler.ts, AlertsDialog.tsx | 🔴 גבוהה | 20 דקות |
| 3 | הוסף הערות ל-`isPastRecurringDay` | scheduler.ts | 🟡 בינונית | 10 דקות |
| 4 | עדכן בדיקות | recurringLoanDuplication.test.ts | 🟡 בינונית | 20 דקות |
| 5 | תיעוד ברור | קובץ זה | 🟢 נמוכה | כבר בוצע |

**סך הכל:** ~65 דקות

---

## 🧪 בדיקות חדשות המזומנות

```typescript
// בעמוד AlertsDialog - בדיקה שהיא יוצרת נכון
it('should create recurring loan on past due day in AlertsDialog', async () => {
  vi.setSystemTime(new Date('2026-04-15'))  // 15 באפריל
  
  const loan = await loansService.create({
    // recurring_day = 5
    // day = 15
    // isPastRecurringDay = true
  })
  
  await AlertsChecks.autoCreateRecurringLoans()
  
  // ✅ צריך ליצור!
  const allLoans = await loansService.getAll()
  expect(allLoans.filter(l => l.recurring_loan_number === 2)).toHaveLength(1)
})

// בדיקה על למניעת כפילויות real-world
it('should handle multiple recurring loans same day differently', async () => {
  // יש 3 הלוואות בימי שונים לאותו משתכן
  // כדי לוודא שלא יהיו בלבול
})
```

---

## 📌 מסקנה

**הקוד בעיקרו טוב ובעל הגיון טוב**, אך **הבעיות בשכפול הקוד וחוסר עקביות יכולים להוביל לבאגים עדינים שקשה לאתר**.

**המלצה סופית:** בצע את כל התיקונים הנ"ל כדי להבטיח יציבות ואמינות של המערכת במשך הזמן.
