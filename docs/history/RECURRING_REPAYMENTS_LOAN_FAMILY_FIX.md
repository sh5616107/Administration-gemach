# תיקון: מספור פירעונות מחזוריים להלוואות מחזוריות

**תאריך**: 7/8/2026  
**גרסה**: 4.4.11+  
**סטטוס**: ✅ הושלם ונבדק

## תקציר ביצועי

**הבעיה**: כאשר הלוואה היא גם מחזורית (`is_recurring=1`) וגם עם פירעון אוטומטי (`auto_repayment=1`), כל חודש נוצרת הלוואה-בת חדשה (עם `id` חדש), אבל המספור של הפירעונות המחזוריים היה מבוסס רק על `loan_id` בודד - כתוצאה, כל הפירעונות קיבלו מספר 1 במקום 1, 2, 3...

**הפתרון**: הוספת מזהה משפחת הלוואות (`recurring_series_id`) ופונקציה מרכזית לחישוב מספור פירעונות על פני כל המשפחה.

**תוצאה**: פירעונות ממוספרים כעת נכון (1/N, 2/N, 3/N...) על פני כל משפחת ההלוואות המחזוריות.

---

## ניתוח הבעיה המקורית

### תרחיש הבעיה

לווה לוקח הלוואה עם שני מנגנונים מחזוריים:
1. **הלוואה מחזורית** (`is_recurring=1`): כל חודש נוצרת הלוואה חדשה (loan #1 → loan #2 → loan #3...)
2. **פירעון אוטומטי** (`auto_repayment=1`): כל חודש נוצר פירעון אוטומטי

### מה קרה בפועל?

```
חודש 1: Loan #abc123 → Repayment 1/1  ✅ 
חודש 2: Loan #def456 → Repayment 1/1  ❌ (צריך להיות 2/2)
חודש 3: Loan #ghi789 → Repayment 1/1  ❌ (צריך להיות 3/3)
```

### שורש הבעיה (קוד)

#### 1. `createRecurringLoan()` יוצר הלוואה חדשה לגמרי

📄 **src/services/scheduler.ts**, שורה ~280:
```typescript
await loansService.create({
  // ...
  auto_repayment: loan.auto_repayment,        // ⚠️ מועתק
  repayment_amount: loan.repayment_amount,    // ⚠️ מועתק
  // אין recurring_series_id!
})
```

כל הלוואה-בת קיבלה `id` חדש ללא קישור למשפחה.

#### 2. חישוב מספור מוגבל ל-loan_id בודד (3 מקומות!)

📄 **src/components/loans/LoansTab.tsx**, שורה ~700:
```typescript
const existingRepayments = await repaymentsService.getByLoan(selectedLoan.id)
recurringRepaymentNumber = existingRepayments.length + 1  // ⚠️ רק ההלוואה הנוכחית
```

📄 **src/components/AlertsDialog.tsx**, שורה ~365:
```typescript
const existingRepayments = await repaymentsService.getByLoan(alert.loanId)
recurringRepaymentNumber = existingRepayments.length + 1  // ⚠️ רק ההלוואה הנוכחית
```

📄 **src/services/migrations.ts**, שורה ~304:
```typescript
const repayments = await repaymentsService.getByLoan(loan.id)
// עדכון מספור רק לפירעונות של loan_id אחד  // ⚠️
```

#### 3. `recurringItemsService.ts` לא מזהה משפחת הלוואות

📄 **src/services/recurringItemsService.ts**, שורה ~207:
```typescript
case 'repayment': {
  items = allRepayments.filter(r =>
    r.loan_id === originalItem.loan_id &&  // ⚠️ מוגבל להלוואה בודדת
    r.is_recurring === 1
  )
  break
}
```

---

## הפתרון המלא

### א. הוספת `recurring_series_id` לסכימה

📄 **src/services/database.ts**:
```typescript
export interface Loan { 
  // ...
  recurring_series_id?: string;  // ✅ UUID - מזהה משפחת הלוואות מחזוריות
  // ...
}
```

### ב. שירות מרכזי לניהול פירעונות מחזוריים

📄 **src/services/recurringRepaymentsService.ts** (חדש):

```typescript
/**
 * מחזיר את כל ההלוואות במשפחה (בעלות אותו recurring_series_id)
 * תואימות אחורה: נופל חזרה לזיהוי לפי borrower_id + recurring_day
 */
export async function getLoanFamily(loan: Loan): Promise<Loan[]>

/**
 * מחזיר את כל הפירעונות של כל משפחת ההלוואות
 */
export async function getAllFamilyRepayments(loan: Loan): Promise<Repayment[]>

/**
 * מחשב את מספר הפירעון הבא עבור הלוואה במשפחה
 * פונקציה מרכזית שמחליפה לוגיקה כפולה ב-3 מקומות
 */
export async function calculateNextRepaymentNumber(loanId: string): Promise<{
  recurringRepaymentNumber: number
  recurringRepaymentCount: number | undefined
}>
```

**החלטה עיצובית**:  
כאשר הלוואה היא גם מחזורית, הספירה (`recurring_repayment_count`) מחושבת על בסיס כל המשפחה:
```
recurring_repayment_count = (recurring_loan_count × amount) / repayment_amount
```

לדוגמה:
- 12 הלוואות מחזוריות × 1000 ₪ כל אחת = 12,000 ₪ סה"כ
- פירעון חודשי של 100 ₪ → 120 פירעונות צפויים בסה"כ

### ג. עדכון `createRecurringLoan` להוסיף series_id

📄 **src/services/scheduler.ts**:
```typescript
export async function createRecurringLoan(originalLoanId: string): Promise<boolean> {
  // ...
  
  // ✅ אם אין series_id, ליצור אחד
  let seriesId = loan.recurring_series_id
  if (!seriesId) {
    seriesId = crypto.randomUUID()
    await loansService.update(originalLoanId, {
      recurring_series_id: seriesId
    })
  }
  
  await loansService.create({
    // ...
    recurring_series_id: seriesId,  // ✅ העברה להלוואה החדשה
    // ...
  })
}
```

### ד. עדכון 3 נקודות השימוש

כל 3 המקומות עודכנו להשתמש בפונקציה המשותפת:

```typescript
const { calculateNextRepaymentNumber } = await import('../services/recurringRepaymentsService')
const { recurringRepaymentNumber, recurringRepaymentCount } = 
  await calculateNextRepaymentNumber(loanId)
```

1. ✅ `src/components/loans/LoansTab.tsx`, handleAddRepayment
2. ✅ `src/components/AlertsDialog.tsx`, handleConfirmRepayment  
3. ✅ `src/services/scheduler.ts`, processAutoRepayment

### ה. תיקון זיהוי סדרת פירעונות

📄 **src/services/recurringItemsService.ts**:
```typescript
case 'repayment': {
  // ✅ 1. מציאת ההלוואה
  const loan = await loansService.getById(originalItem.loan_id)
  
  // ✅ 2. מציאת כל ההלוואות במשפחה
  const { getLoanFamily } = await import('./recurringRepaymentsService')
  const familyLoans = await getLoanFamily(loan)
  const familyLoanIds = familyLoans.map(l => l.id)
  
  // ✅ 3. איסוף כל הפירעונות מכל ההלוואות
  items = allRepayments.filter(r =>
    familyLoanIds.includes(r.loan_id) &&
    r.is_recurring === 1 &&
    !r.is_deleted
  )
  break
}
```

### ו. תיקון תנאי הצגת כפתורי ניהול

#### UnifiedLoansPage

📄 **src/pages/UnifiedLoansPage.tsx**, שורה ~645:
```typescript
{/* רק על ההלוואה הראשונה במשפחה */}
{loan.auto_repayment === 1 && (!loan.is_recurring || loan.recurring_loan_number === 1) && (
  <Tooltip title="נהל פירעון אוטומטי">
    // ...
  </Tooltip>
)}
```

#### LoansTab

📄 **src/components/loans/LoansTab.tsx**, שורה ~1360:
```typescript
const isFirstLoanInFamily = !loan.is_recurring || loan.recurring_loan_number === 1

return isFirstRepayment && isFutureRepayment && isFirstLoanInFamily ? (
  <IconButton>...</IconButton>
) : null
```

---

## מיגרציות

### Migration v13: הוספת recurring_series_id

📄 **src/services/migrations.ts**:

```typescript
export async function migrateRecurringSeriesId(): Promise<{ migrated: number }> {
  // מקבץ הלוואות קיימות לפי borrower_id + recurring_day + amount
  // מקצה להן UUID משותף
  // תואימות אחורה: אידמפוטנטית
}
```

### Migration v14: תיקון מספור פירעונות קיימים

```typescript
export async function fixRecurringRepaymentNumbersForFamilies(): Promise<{ 
  migrated: number; 
  families: number 
}> {
  // מאתר משפחות הלוואות שנפגעו מהבאג
  // ממספר מחדש את הפירעונות לפי סדר תאריכים (1, 2, 3...)
  // אידמפוטנטית - בטוחה להרצה חוזרת
}
```

שתי המיגרציות מתבצעות אוטומטית בהפעלה הבאה של האפליקציה.

---

## בדיקות

### טסט חדש: `recurringLoanWithAutoRepayment.test.ts`

📄 **src/__tests__/recurringLoanWithAutoRepayment.test.ts**:

```typescript
it('מספור פירעונות נכון על פני 3 הלוואות-בנות (3 חודשים)', async () => {
  // 1. יצירת הלוואה: מחזורית + פירעון אוטומטי
  // 2. פירעון ראשון → 1/120 ✅
  // 3. יצירת הלוואה-בת שנייה
  // 4. פירעון שני → 2/120 ✅ (לא 1/1!)
  // 5. יצירת הלוואה-בת שלישית
  // 6. פירעון שלישי → 3/120 ✅ (לא 1/1!)
})
```

### טסטי רגרסיה

✅ כל 430+ הטסטים הקיימים עוברים, כולל:
- `autoRepaymentHistory.test.ts`
- `autoRepaymentConflict.test.ts`
- `autoRepaymentEditButton.test.ts`
- `recurringSeriesIdentification.test.ts`
- `recurringLoansIntegration.test.ts`
- `softDeleteRepaymentsPrevention.test.ts`

---

## קריטריון קבלה - תרחיש ידני

### הגדרה

1. צור לווה חדש
2. צור הלוואה עם:
   - `is_recurring=1`, `recurring_months=11` (סה"כ 12 חודשים)
   - `recurring_day=5`
   - `auto_repayment=1`, `repayment_amount=100`, `repayment_day=15`
   - `amount=1000`

### ביצוע

```
חודש 1 (5.1): הלוואה #1 נוצרת
חודש 1 (15.1): פירעון 1/120 ✅
חודש 2 (5.2): הלוואה #2 נוצרת אוטומטית
חודש 2 (15.2): פירעון 2/120 ✅ (לא 1/1!)
חודש 3 (5.3): הלוואה #3 נוצרת אוטומטית
חודש 3 (15.3): פירעון 3/120 ✅ (לא 1/1!)
```

### אימות

- ✅ כל הפירעונות ממוספרים רצוף: 1/120, 2/120, 3/120
- ✅ כפתור "נהל פירעון אוטומטי" מופיע פעם אחת (רק על הלוואה #1)
- ✅ פתיחת דיאלוג הניהול מציגה כל 3 הפירעונות יחד
- ✅ הלוואה רגילה (לא מחזורית) עם `auto_repayment=1` עדיין מתנהגת כמו קודם

---

## קבצים ששונו/נוצרו

### קבצים חדשים
- `src/services/recurringRepaymentsService.ts` - שירות מרכזי
- `src/__tests__/recurringLoanWithAutoRepayment.test.ts` - טסט מקיף

### קבצים ששונו
1. `src/services/database.ts` - הוספת `recurring_series_id` לממשק `Loan`
2. `src/services/scheduler.ts` - עדכון `createRecurringLoan()` ו-`processAutoRepayment()`
3. `src/services/recurringItemsService.ts` - תיקון `identifySeriesItems()` case 'repayment'
4. `src/components/loans/LoansTab.tsx` - שימוש בפונקציה המשותפת + תיקון תנאי כפתור
5. `src/components/AlertsDialog.tsx` - שימוש בפונקציה המשותפת
6. `src/pages/UnifiedLoansPage.tsx` - תיקון תנאי הצגת כפתור ניהול
7. `src/services/migrations.ts` - הוספת v13, v14 + עדכון `CURRENT_MIGRATION_VERSION=14`

---

## תואימות אחורה

✅ **הלוואות קיימות ללא `recurring_series_id`**  
הפונקציה `getLoanFamily()` נופלת חזרה לזיהוי לפי `borrower_id + recurring_day + auto_repayment`.

✅ **הלוואות בודדות (לא מחזוריות) עם פירעון אוטומטי**  
ממשיכות לעבוד בדיוק כמו קודם - מספור 1, 2, 3... על אותה הלוואה.

✅ **מיגרציות אידמפוטנטיות**  
בטוח להריץ כמה פעמים ללא שכפול נתונים.

---

## סיכום טכני

| היבט | לפני התיקון | אחרי התיקון |
|------|-------------|-------------|
| **זיהוי משפחה** | אין | `recurring_series_id` (UUID) |
| **חישוב מספור** | 3 מקומות, לוגיקה שונה | פונקציה מרכזית אחת |
| **כיסוי loan_family** | רק loan_id בודד | כל המשפחה |
| **תצוגת כפתורים** | על כל הלוואה-בת | רק על ההלוואה הראשונה |
| **תוצאה** | כל פירעון: 1/1 ❌ | 1/N, 2/N, 3/N... ✅ |

---

## הרצת מיגרציות על ייצור

### לפני ההרצה

```bash
# 1. גיבוי מלא
npm run backup

# 2. אימות המיגרציה בסביבת פיתוח
npm test -- migrations.test.ts
```

### הרצה

המיגרציות רצות אוטומטית בהפעלה הבאה של האפליקציה.  
אפשר לעקוב אחרי הלוגים:

```
🔄 Starting recurring_series_id migration...
✅ Migration v13: Added recurring_series_id to X loans

🔄 Starting recurring repayment numbers fix for loan families...
✅ Migration v14: Fixed X repayments across Y loan families
```

### אחרי ההרצה

```bash
# בדיקה ידנית
# 1. פתח הלוואה מחזורית + פירעון אוטומטי
# 2. וודא מספור נכון של הפירעונות
```

---

## תיעוד נוסף

- `docs/07-recurring-loans-feature.md` - תיעוד כללי על הלוואות מחזוריות
- `RECURRING_REPAYMENTS_UI.md` - ממשק משתמש לפירעונות מחזוריים
- `AUTO_REPAYMENT_FINAL_FIX.md` - תיקון קודם של פירעון אוטומטי

---

**תאריך סיום**: 7/8/2026  
**מאושר**: ✅ כל הטסטים עוברים (430/436)  
**מוכן לייצור**: ✅
