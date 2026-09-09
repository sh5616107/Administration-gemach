# סקירת Validation - מערכת הגמ"ח

**תאריך**: 09/09/2026  
**מטרה**: מיפוי מצב validation קיים והגדרת תוכנית לריכוז

---

## 1. ממצאים - מצב נוכחי

### ✅ Validation קיים

#### 1.1 קבצים מרכזיים
- **`src/utils/validation.ts`** - תשתית בסיסית:
  - `validateIsraeliId()` - מספר זהות (אלגוריתם Luhn)
  - `validateIsraeliPhone()` - מספר טלפון
  - `validateEmail()` - כתובת אימייל
  - פונקציות format

- **`src/utils/phoneValidation.ts`** - וידוא ייחודיות טלפון:
  - בדיקת כפילויות במספרי טלפון
  - `isValidPhoneFormat()` - פורמט בסיסי

- **`src/services/excelImport.ts`** - validation לייבוא:
  - `validateRow()` - בדיקת שורה בודדת
  - `validateData()` - בדיקת מסד נתונים מלא
  - `validateIdNumber()`, `validatePhone()` - פונקציות עזר

- **`src/services/recurringItemsService.ts`**:
  - `validateRecurringUpdate()` - וידוא עדכוני recurring
  - בדיקת: recurring_day (1-31), recurring_amount (>0), recurring_months (>=0)

- **`src/services/transactional.ts`** (חדש):
  - validation בסיסי ב-`addRepaymentAtomic()`
  - בדיקת amount > 0, loan exists

#### 1.2 Validation מפוזר בקומפוננטות

נמצאו **59+ מקומות** עם validations inline:

**סכומים (amount validations):**
```typescript
// דפוס נפוץ מאוד
if (amount <= 0) { alert('סכום לא תקין'); return }
if (isNaN(amount) || amount <= 0) { /* error */ }
```

**מיקומים עיקריים:**
- `LoansTab.tsx` - פירעונות, multi-repayment
- `Deposits.tsx` - הפקדות, משיכות
- `Donations.tsx` - תרומות
- `GuarantorRefundDialog.tsx` - החזרי ערבים
- `DepositSidePanel.tsx` - הפקדות חדשות
- `UnifiedLoansPage.tsx` - פירעונות מרובים
- `WaitlistTab.tsx` - סכומי תור

**בעיות:**
1. אותה לוגיקה חוזרת (copy-paste)
2. הודעות שגיאה לא אחידות
3. אין invariants מרכזיים
4. validation logic מעורבב עם UI logic

---

## 2. ניתוח סיכונים

### 🔴 P1 - חוסר ריכוז Invariants

| תחום | בעיה | סיכון |
|------|------|--------|
| **יתרת הלוואה** | אין validation מרכזי ש-`remaining >= 0` | חריגה מיתרה |
| **פירעון** | בדיקת `amount > 0` מפוזרת ב-6+ מקומות | סכומים שליליים |
| **הפקדה/משיכה** | לוגיקת `available = amount - withdrawn` חוזרת | חישוב שגוי |
| **Recurring** | state machine לא מוגדר | כפילויות, מצבים לא תקינים |
| **מחיקה** | בדיקות active loans/deposits מפוזרות | מחיקה לא תקינה |

### ⚠️ Invariants חסרים

```typescript
// אין validation מרכזי על:
- loan.remaining === loan.amount - sum(repayments.amount)
- repayment.amount > 0 && repayment.amount <= loan.remaining
- deposit.withdrawn_amount <= deposit.amount
- withdrawal.amount > 0 && withdrawal.amount <= available
- recurring: no duplicates in same period
- loan.status transitions (active → closed, not closed → active)
```

---

## 3. תוכנית - Validation מרוכזת

### שלב 1: יצירת Domain Validators (P1)

#### 3.1 `src/services/validators/loanValidators.ts`
```typescript
export interface LoanValidationResult {
  valid: boolean
  errors: string[]
}

// Invariants:
export function validateLoanAmount(amount: number): LoanValidationResult
export function validateRepaymentAmount(repayment: number, loanRemaining: number): LoanValidationResult
export function validateLoanStatus(loan: Loan): LoanValidationResult
export function validateLoanBalance(loan: Loan, repayments: Repayment[]): LoanValidationResult
```

#### 3.2 `src/services/validators/depositValidators.ts`
```typescript
// Invariants:
export function validateDepositAmount(amount: number): LoanValidationResult
export function validateWithdrawal(withdrawal: number, available: number): LoanValidationResult
export function validateDepositBalance(deposit: Deposit, withdrawals: Withdrawal[]): LoanValidationResult
```

#### 3.3 `src/services/validators/recurringValidators.ts`
```typescript
// State machine:
export function validateRecurringCreation(item: RecurringItem): LoanValidationResult
export function validateRecurringUpdate(item: RecurringItem, updates: Partial<RecurringItem>): LoanValidationResult
export function validateNoDuplicates(item: RecurringItem, existingItems: RecurringItem[]): LoanValidationResult
```

### שלב 2: Integration (P1)

1. **עדכון transactional.ts** - שימוש ב-validators החדשים
2. **עדכון database.ts** - הוספת validation לפני כל write
3. **עדכון UI components** - החלפת inline validations בקריאות למרכז

### שלב 3: Tests (P1)

- property-based tests עם fast-check
- regression tests לכל invariant
- edge cases: boundary values, null/undefined

---

## 4. Error Handling Policy

### 🎯 החלטה: אסטרטגיה כפולה

```typescript
// Services/Domain: throw errors (critical invariants)
export function addRepayment(loan: Loan, amount: number): Repayment {
  const validation = validateRepaymentAmount(amount, loan.remaining)
  if (!validation.valid) {
    throw new ValidationError(validation.errors.join(', '))
  }
  // ...
}

// UI: Result<T, E> (user input errors)
export async function handleAddRepayment(): Promise<Result<void, string>> {
  try {
    // ... validation
    await addRepayment(loan, amount)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

**עקרון**:
- **throw**: invariant violation (באג בקוד, לא אמור לקרות)
- **Result**: input validation (משתמש הזין ערך לא תקין)

---

## 5. סדר יישום מומלץ

### גל 1 - Loans & Repayments (הקריטי ביותר)
1. ✅ יצירת `loanValidators.ts`
2. ✅ שילוב ב-`transactional.ts`
3. ✅ עדכון `LoansTab.tsx` + `UnifiedLoansPage.tsx`
4. ✅ טסטים

### גל 2 - Deposits & Withdrawals
1. יצירת `depositValidators.ts`
2. שילוב ב-`database.ts`
3. עדכון `Deposits.tsx` + `DepositSidePanel.tsx`
4. טסטים

### גל 3 - Recurring (הכי מורכב)
1. יצירת `recurringValidators.ts`
2. הגדרת state machine מלא
3. שילוב ב-`recurringItemsService.ts`
4. טסטים extensive עם fast-check

### גל 4 - Donations & Guarantors
1. יצירת `donationValidators.ts`, `guarantorValidators.ts`
2. עדכון קומפוננטות
3. טסטים

---

## 6. מדדי הצלחה

✅ Definition of Done:
- [ ] כל validation logic של domains קריטיים במקום אחד
- [ ] אין בדיקות `amount <= 0` ידניות ב-UI (מלבד מקרים ייחודיים)
- [ ] כל invariant מכוסה בטסט
- [ ] הודעות שגיאה אחידות ומתורגמות
- [ ] 100% test coverage על validators
- [ ] תיעוד מלא של state machine (recurring)

---

## 7. הערות

### תאימות לאחור
- לא לשבור validations קיימות שעובדות
- להוסיף validators בהדרגה, לא refactor גורף
- כל שינוי עם regression test

### Performance
- Validators צריכים להיות מהירים (pure functions)
- אין side effects
- אין קריאות async (מלבד במקרים נדירים)

---

## סיכום

**מצב נוכחי**: validations מפוזרות, אין invariants מרכזיים  
**יעד**: validation מרוכזת עם invariants ברורים  
**גישה**: הדרגתי, domain-by-domain  
**עדיפות**: Loans → Deposits → Recurring → אחרים
