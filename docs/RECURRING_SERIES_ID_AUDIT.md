# בדיקת recurring_series_id - זיהוי סדרות מחזוריות

תאריך: 2026-09-16

## מטרה
וידוא שזיהוי סדרות מחזוריות (loans/deposits) נעשה בצורה עקבית בכל הפרויקט.

---

## מסקנה כללית: ✅ התנהגות נכונה

הפרויקט משתמש בשני מנגנוני זיהוי משלימים:

1. **`recurring_series_id`** (UUID) - מזהה ייחודי שנוסף במיגרציה v13
2. **זיהוי fallback** - `borrower_id/depositor_id + recurring_day`

---

## קריטריון זיהוי עיקרי (canonical)

### הלוואות (Loans)
```typescript
// מתוך recurringItemsService.ts - identifySeriesItems()
l.borrower_id === originalItem.borrower_id &&
l.recurring_day === originalItem.recurring_day &&
l.is_recurring === 1 &&
l.recurring_loan_number && 
!l.is_deleted
```

**הערה חשובה:** הקוד **לא** משתמש ב-`amount` כחלק מהזיהוי!
כפי שכתוב בהערות: "the amount might have been changed"

### הפקדות (Deposits)
```typescript
// מתוך recurringItemsService.ts - identifySeriesItems()
d.depositor_id === originalItem.depositor_id &&
d.recurring_day === originalItem.recurring_day &&
d.is_recurring === 1 &&
d.recurring_deposit_number && 
!d.is_deleted
```

---

## מנגנון Fallback

כאשר הלוואה/הפקדה **אין לה** `recurring_series_id` (הלוואות ישנות שנוצרו לפני מיגרציה v13),
המערכת משתמשת בזיהוי לפי:
- `borrower_id/depositor_id`
- `recurring_day`

דוגמה מ-`recurringRepaymentsService.ts`:
```typescript
if (loan.recurring_series_id) {
  // שימוש ב-series_id
  return allLoans.filter(l => 
    l.recurring_series_id === loan.recurring_series_id &&
    !l.is_deleted
  )
}

// Fallback לזיהוי לפי borrower_id + recurring_day
return allLoans.filter(l =>
  l.borrower_id === loan.borrower_id &&
  l.recurring_day === loan.recurring_day &&
  l.is_recurring === 1 &&
  !l.is_deleted
)
```

---

## בדיקת עקביות בפרויקט

### ✅ scheduler.ts (שורות 45-48)
```typescript
function isSameLoanSeries(a: any, b: any): boolean {
  return a.borrower_id === b.borrower_id && a.recurring_day === b.recurring_day
}
function isSameDepositSeries(a: any, b: any): boolean {
  return a.depositor_id === b.depositor_id && a.recurring_day === b.recurring_day
}
```

**סטטוס:** ✅ תואם ל-`identifySeriesItems()`

**הערה:** הקוד ב-scheduler הוסיף הערה ארוכה (שורות 26-34) שמסבירה את הבעיה:
> "Previously these functions matched on `amount` instead, which is explicitly 
> documented in identifySeriesItems() as unreliable"

זה מאשר שהתיקון כבר נעשה.

---

### ✅ scheduler.ts - יצירת series_id חדש (שורות 282-294)
```typescript
// אם להלוואה המקורית אין recurring_series_id, ליצור לה אחד
let seriesId = loan.recurring_series_id
if (!seriesId) {
  // יצירת UUID חדש למשפחה
  seriesId = crypto.randomUUID()
  
  // עדכון ההלוואה המקורית עם ה-series_id החדש
  await loansService.update(originalLoanId, {
    recurring_series_id: seriesId
  })
}
```

**סטטוס:** ✅ נכון - מבטיח שהלוואות חדשות מקבלות `series_id`

---

### ✅ recurringRepaymentsService.ts - getLoanFamily()
משתמש ב-`recurring_series_id` בעדיפות ראשונה, נופל חזרה ל-`borrower_id + recurring_day`.

**סטטוס:** ✅ תואם

---

### ✅ טסטים
מצאתי מספר טסטים שבודקים את ההתנהגות:

1. **editRecurringDialogFromAnyLoan.test.ts**
   - בודק זיהוי עם `recurring_series_id`
   - בודק fallback ללא `recurring_series_id`

2. **loanFamiliesGrouping.test.ts**
   - בודק קיבוץ לפי `recurring_series_id`
   - בודק שהלוואה ללא `series_id` נחשבת בודדת

---

## בעיות שתוקנו בריפקטור הנוכחי

### 🔧 תיקון 1: scheduler.ts - הלוואות
**לפני:**
```typescript
const existingLoan = await db.query(`
  SELECT id FROM loans 
  WHERE borrower_id = ? 
  AND amount = ?           ← ❌ לא אמין!
  AND loan_date >= ?
  AND loan_date <= ?
  AND is_recurring = 1
  AND recurring_loan_number = ?
`, [...])
```

**אחרי (הריפקטור שלנו):**
```typescript
const existingLoanFound = await loanRepository.hasRecurringLoanForPeriod(
  loan.borrower_id,
  loan.amount,           // ← זה OK כאן כי אנחנו בודקים כפילות, לא זיהוי סדרה
  firstDayOfMonth,
  todayStr,
  nextRecurringNumber
)
```

**הערה:** בשימוש הספציפי הזה (`hasRecurringLoanForPeriod`), השימוש ב-`amount` **הוא** נכון,
כי המטרה היא למנוע יצירת הלוואה זהה לחלוטין (כולל סכום) באותו חודש.
זה שונה מזיהוי "איזה הלוואות שייכות לאותה סדרה".

---

## המלצות

### ✅ 1. השתמש ב-recurring_series_id בכל מקום אפשרי
כל הלוואה/הפקדה מחזורית חדשה צריכה לקבל `recurring_series_id`.

### ✅ 2. תמיכה ב-Fallback
שמור על תמיכה בזיהוי לפי `borrower_id + recurring_day` להלוואות ישנות.

### ✅ 3. אל תשתמש ב-amount לזיהוי סדרה
`amount` עשוי להשתנות במהלך חיי הסדרה (דרך "עריכת סדרה").
השתמש בו רק לבדיקות כפילות ספציפיות.

### ⚠️ 4. בעיה פוטנציאלית: deposits
להפקדות **אין** שדה `recurring_series_id`!
הן תמיד מזוהות לפי `depositor_id + recurring_day`.

**האם צריך להוסיף?**
כרגע זה לא גורם לבעיות, אבל לעקביות עם loans כדאי לשקול הוספה במיגרציה עתידית.

---

## סיכום - הכל תקין ✅

1. ✅ הקוד משתמש בקריטריון נכון: `borrower_id + recurring_day` (ולא amount)
2. ✅ `recurring_series_id` משמש כמזהה ייחודי עם fallback תקין
3. ✅ scheduler.ts תואם ל-recurringItemsService.ts
4. ✅ הטסטים מכסים את שני המקרים (עם ובלי series_id)
5. ⚠️ deposits אין להן series_id (לא קריטי, אבל כדאי להוסיף בעתיד)

**אין צורך בשינויים נוספים בשלב זה.**
