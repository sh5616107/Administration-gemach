# Recurring State Machine - מערכת הגמ"ח

**תאריך**: 09/09/2026  
**מטרה**: תיעוד מלא של state machine של recurring items

---

## 1. סקירה כללית

המערכת תומכת ב-3 סוגי recurring items:
1. **Recurring Loans** - הלוואות מחזוריות
2. **Auto Repayments** - פירעונות אוטומטיים
3. **Recurring Deposits** - הפקדות מחזוריות

כל סוג עובד עם state machine דומה אך עם הבדלים בפרטים.

---

## 2. Recurring Loans - הלוואות מחזוריות

### 2.1 מצבים (States)

```typescript
interface RecurringLoanState {
  is_recurring: 0 | 1                    // האם מחזורית
  recurring_months: number               // כמה הלוואות נותרו ליצור
  recurring_day: number                  // יום בחודש (1-31)
  recurring_loan_number: number          // מספר בסדרה (1, 2, 3...)
  recurring_loan_count: number           // סה"כ בסדרה (למשל 12)
  recurring_series_id: string | null     // UUID משותף לכל הסדרה
  status: 'planned' | 'active' | 'closed' | 'overdue'
}
```

### 2.2 מעברים (Transitions)

#### יצירה ראשונית
```
Input: משתמש יוצר הלוואה מחזורית
Preconditions:
  - is_recurring = 1
  - recurring_months > 0 (למשל 11, אם רוצה סה"כ 12 הלוואות)
  - recurring_day בין 1-31
  - recurring_loan_number = 1
  - recurring_loan_count = recurring_months + 1
  - recurring_series_id = NULL (יווצר בפעם הראשונה)

Result:
  - הלוואה נוצרת עם המאפיינים המבוקשים
  - status = 'planned' אם loan_date בעתיד, אחרת 'active'
```

#### יצירה אוטומטית של הלוואה הבאה
```
Trigger: scheduler.ts:autoCreateRecurringLoans()
When: כל יום בבוקר (runStartupChecks)
Conditions:
  1. loan.is_recurring = 1
  2. loan.recurring_months > 0
  3. loan.recurring_day = today.getDate()
  4. לא קיימת כבר הלוואה עם recurring_loan_number הבא

Process:
  1. מציאת ההלוואה האחרונה בסדרה (לפי recurring_loan_number הגבוה ביותר)
  2. יצירת recurring_series_id אם לא קיים
  3. יצירת הלוואה חדשה:
     - recurring_loan_number = original + 1
     - recurring_months = original.recurring_months - 1
     - recurring_series_id = אותו ID
     - כל השאר זהה להלוואה המקורית
  4. עדכון ההלוואה המקורית:
     - recurring_months = recurring_months - 1
     - (לא משנים recurring_loan_number!)

Result:
  - הלוואה חדשה במצב 'active'
  - ההלוואה הקודמת: recurring_months פחת ב-1
```

#### סיום סדרה
```
When: recurring_months = 0 בכל ההלוואות בסדרה
Result:
  - לא נוצרות יותר הלוואות חדשות
  - ההלוואות הקיימות נשארות פעילות
  - scheduler מדלג על הסדרה (בדיקה: recurring_months <= 0)
```

### 2.3 Invariants

```typescript
// חובה תמיד
if (loan.is_recurring === 1) {
  assert(loan.recurring_day >= 1 && loan.recurring_day <= 31)
  assert(loan.recurring_months >= 0)
  assert(loan.recurring_loan_number >= 1)
  assert(loan.recurring_loan_count >= loan.recurring_loan_number)
}

// בסדרה
if (loan.recurring_series_id) {
  const series = loans.filter(l => l.recurring_series_id === loan.recurring_series_id)
  
  // כל ההלוואות אותו borrower, amount, recurring_day
  assert(series.every(l => l.borrower_id === loan.borrower_id))
  assert(series.every(l => l.amount === loan.amount))
  assert(series.every(l => l.recurring_day === loan.recurring_day))
  
  // מספרים ייחודיים ורציפים
  const numbers = series.map(l => l.recurring_loan_number).sort()
  assert(numbers[0] === 1)
  assert(numbers.every((n, i) => n === i + 1)) // 1,2,3,4...
  
  // recurring_loan_count זהה לכולם
  assert(series.every(l => l.recurring_loan_count === loan.recurring_loan_count))
}
```

---

## 3. Auto Repayments - פירעונות אוטומטיים

### 3.1 מצבים

```typescript
interface AutoRepaymentState {
  auto_repayment: 0 | 1           // האם פעיל
  repayment_amount: number        // סכום פירעון
  repayment_day: number           // יום בחודש (1-31)
  repayment_frequency: 'monthly' | 'biweekly' | 'weekly'
  repayment_start_date: string    // תאריך התחלה
}
```

### 3.2 מעברים

#### הפעלה
```
Input: משתמש מפעיל פירעון אוטומטי
Preconditions:
  - loan.status = 'active'
  - loan.remaining > 0

Process:
  - auto_repayment = 1
  - repayment_amount > 0
  - repayment_day בין 1-31
  - repayment_frequency חייב להיות תקין

Result:
  - scheduler מתחיל ליצור פירעונות אוטומטית
```

#### יצירת פירעון אוטומטי
```
Trigger: scheduler.ts:checkAutoRepayments()
When: כל יום בבוקר
Conditions:
  1. loan.auto_repayment = 1
  2. loan.status = 'active'
  3. loan.remaining > 0
  4. repayment_day = today.getDate()

Process:
  1. חישוב סכום: min(repayment_amount, remaining)
  2. קבלת מספר פירעון (recurring_repayment_number הבא)
  3. יצירת פירעון:
     - is_recurring = 1
     - recurring_repayment_number = מספר הבא
     - recurring_repayment_count = ? (לא מוגדר היטב)

Result:
  - פירעון חדש
  - loan.remaining פוחת
  - אם remaining = 0, loan.status → 'closed'
```

#### ביטול
```
Input: משתמש מבטל פירעון אוטומטי
Process:
  - auto_repayment = 0

Result:
  - scheduler לא יוצר יותר פירעונות
  - פירעונות קיימים נשארים
```

### 3.3 Invariants

```typescript
if (loan.auto_repayment === 1) {
  assert(loan.repayment_amount > 0)
  assert(loan.repayment_day >= 1 && loan.repayment_day <= 31)
  assert(['monthly', 'biweekly', 'weekly'].includes(loan.repayment_frequency))
}

// פירעון לא יכול לחרוג מיתרה
const repayments = await getRepayments(loan.id)
const totalRepaid = sum(repayments.map(r => r.amount))
assert(totalRepaid <= loan.amount)
```

---

## 4. Recurring Deposits - הפקדות מחזוריות

### 4.1 מצבים

```typescript
interface RecurringDepositState {
  is_recurring: 0 | 1
  recurring_months: number                // כמה הפקדות נותרו
  recurring_day: number                   // יום בחודש
  recurring_deposit_number: number        // מספר בסדרה
  recurring_deposit_count: number         // סה"כ בסדרה
  status: 'active' | 'withdrawn'
}
```

### 4.2 מעברים

דומה מאוד ל-recurring loans:

#### יצירה אוטומטית של הפקדה הבאה
```
Trigger: scheduler.ts:autoCreateRecurringDeposits()
When: כל יום בבוקר
Conditions:
  1. deposit.is_recurring = 1
  2. deposit.recurring_months > 0
  3. deposit.recurring_day = today.getDate()
  4. לא קיימת כבר הפקדה עם recurring_deposit_number הבא

Process:
  1. מציאת ההפקדה האחרונה בסדרה
  2. יצירת הפקדה חדשה:
     - recurring_deposit_number = original + 1
     - recurring_months = original.recurring_months - 1
     - כל השאר זהה
  3. עדכון ההפקדה הקודמת:
     - recurring_months = recurring_months - 1

Result:
  - הפקדה חדשה במצב 'active'
  
⚠️ הערה חשובה:
  - ההפקדה הקודמת נשארת status='active' (לא 'superseded')
  - זה כדי לא לשבור טסטים שתלויים בכך שכל שורה בסדרה נשארת queryable
  - הבאג של "runaway multiplier" נפתר ב-Deposits.tsx, לא כאן
```

### 4.3 Invariants

```typescript
if (deposit.is_recurring === 1) {
  assert(deposit.recurring_day >= 1 && deposit.recurring_day <= 31)
  assert(deposit.recurring_months >= 0)
  assert(deposit.recurring_deposit_number >= 1)
  assert(deposit.recurring_deposit_count >= deposit.recurring_deposit_number)
}

// בסדרה (אם נזהה אותה)
const series = deposits.filter(d =>
  d.depositor_id === deposit.depositor_id &&
  d.is_recurring === 1 &&
  d.recurring_day === deposit.recurring_day &&
  d.amount === deposit.amount
)

// מספרים ייחודיים
const numbers = series.map(d => d.recurring_deposit_number)
assert(new Set(numbers).size === numbers.length) // אין כפילויות

// ⚠️ בעיה ידועה: אין recurring_series_id להפקדות!
// זה מקשה על זיהוי סדרה, צריך להסתמך על heuristics
```

---

## 5. בעיות ידועות ב-State Machine

### 5.1 🔴 P1 - חוסר אחידות בזיהוי סדרות

| Item | ID Field | Status |
|------|----------|--------|
| Loan | `recurring_series_id` | ✅ קיים, נוצר אוטומטית |
| Repayment | ❌ אין | ⚠️ קשה לזהות סדרה |
| Deposit | ❌ אין | ⚠️ מסתמכים על heuristics |

**השפעה**: קשה לוודא invariants על סדרה, קשה לעדכן כל הסדרה.

**פתרון מוצע**:
- להוסיף `recurring_series_id` גם ל-deposits
- להוסיף `recurring_series_id` גם ל-repayments (או לקשור דרך loan_id)

### 5.2 🔴 P1 - recurring_repayment_count לא מוגדר

בפירעונות אוטומטיים, אין הגדרה ברורה של "כמה פירעונות צפויים בסה"כ".

**בעיה**:
```typescript
// ב-repayment:
recurring_repayment_number: 1, 2, 3...
recurring_repayment_count: ???  // לא מחושב
```

**פתרון מוצע**:
```typescript
// אם יודעים:
recurring_repayment_count = ceil(loan.amount / loan.repayment_amount)
```

### 5.3 🟡 P2 - אין validations על כפילויות

הקוד **בודק** אם קיימת כבר הפקדה/הלוואה עם המספר הבא, אבל אין validation מרכזי.

**בעיה**: אם יש bug בלוגיקה, עלולות להיווצר כפילויות.

**פתרון מוצע**: validator נפרד `validateNoDuplicateInSeries()`

### 5.4 🟡 P2 - status transitions לא מוגדרים

בהלוואות/הפקדות מחזוריות, אין הגדרה ברורה של:
- האם הלוואה ישנה בסדרה יכולה לעבור ל-'closed' אם יש עוד הלוואות אחריה?
- מה קורה אם משנים סכום באמצע סדרה?

---

## 6. Invariants נדרשים - רשימה מלאה

### 6.1 Recurring Loans

```typescript
// בסיסי
✅ is_recurring ∈ {0, 1}
✅ if is_recurring=1: recurring_day ∈ [1,31]
✅ if is_recurring=1: recurring_months >= 0
✅ if is_recurring=1: recurring_loan_number >= 1
✅ if is_recurring=1: recurring_loan_count >= recurring_loan_number

// סדרה
✅ if recurring_series_id: כל ההלוואות בסדרה אותו borrower_id
✅ if recurring_series_id: כל ההלוואות בסדרה אותו amount
✅ if recurring_series_id: כל ההלוואות בסדרה אותו recurring_day
✅ if recurring_series_id: recurring_loan_number ייחודי בסדרה
❌ if recurring_series_id: loan_date עולה עם recurring_loan_number (לא נבדק!)
❌ if recurring_series_id: אין gaps במספור 1,2,3,4... (לא נבדק!)
```

### 6.2 Auto Repayments

```typescript
✅ auto_repayment ∈ {0, 1}
✅ if auto_repayment=1: repayment_amount > 0
✅ if auto_repayment=1: repayment_day ∈ [1,31]
✅ if auto_repayment=1: repayment_frequency ∈ {monthly, biweekly, weekly}
❌ sum(repayments) <= loan.amount (נבדק במקומות אבל לא מרוכז)
❌ repayment.amount <= loan.remaining בזמן היצירה (נבדק inline)
```

### 6.3 Recurring Deposits

```typescript
✅ is_recurring ∈ {0, 1}
✅ if is_recurring=1: recurring_day ∈ [1,31]
✅ if is_recurring=1: recurring_months >= 0
✅ if is_recurring=1: recurring_deposit_number >= 1
✅ if is_recurring=1: recurring_deposit_count >= recurring_deposit_number
❌ recurring_deposit_number ייחודי ל-depositor (נבדק inline, לא validator)
❌ אין gaps במספור (לא נבדק)
```

---

## 7. תוכנית פעולה

### שלב 1: יצירת Recurring Validators (P1)
```typescript
// src/services/validators/recurringValidators.ts

export function validateRecurringLoan(loan: Loan): ValidationResult
export function validateRecurringDeposit(deposit: Deposit): ValidationResult
export function validateAutoRepayment(loan: Loan): ValidationResult

// סדרות
export function validateLoanSeries(loans: Loan[]): ValidationResult
export function validateDepositSeries(deposits: Deposit[]): ValidationResult

// כפילויות
export function validateNoDuplicateLoanNumber(loan: Loan, series: Loan[]): ValidationResult
export function validateNoDuplicateDepositNumber(deposit: Deposit, series: Deposit[]): ValidationResult
```

### שלב 2: שילוב ב-scheduler.ts (P1)
- הוספת validations לפני כל יצירה של recurring item
- ווידוא שאין כפילויות
- logging ברור של failures

### שלב 3: שיפורים ארכיטקטוניים (P2)
- הוספת `recurring_series_id` ל-deposits
- חישוב `recurring_repayment_count` אוטומטי
- הגדרת status transitions ברורים

---

## סיכום

**State machine קיים**: עובד ברוב המקרים, יש תיקונים רבים לבאגים  
**Invariants**: רוב הבדיקות קיימות אבל מפוזרות  
**בעיה עיקרית**: חוסר ריכוז, קשה לתחזק ולהוסיף פיצ'רים  
**פתרון**: validators מרכזיים + תיעוד ברור של state machine
