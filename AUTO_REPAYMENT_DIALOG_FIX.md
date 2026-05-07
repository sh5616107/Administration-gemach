# תיקון דיאלוג פירעון אוטומטי - הצגת פירעונות קיימים

## הבעיה
כשלוחצים על כפתור עריכה של פירעון אוטומטי או הלוואה מחזורית, הדיאלוג מציג "נוצרו עד כה: 0" למרות שבטבלה מופיע "6/22" (6 פריטים מתוך 22).

## הסיבות
### בעיה 1: סינון פירעונות לפי `is_recurring=1`
הקוד ב-`recurringItemsService.ts` סינן רק פירעונות עם `is_recurring=1`:
```typescript
const recurringRepayments = allRepayments.filter(r => r.is_recurring === 1)
```

אבל פירעונות שנוצרו **לפני** התיקון האחרון לא קיבלו את הדגל `is_recurring=1`, למרות שיש להם `recurring_repayment_number`.

### בעיה 2: זיהוי הלוואות בסדרה לפי סכום
הקוד זיהה הלוואות בסדרה לפי:
```typescript
l.borrower_id === originalItem.borrower_id &&
l.amount === originalItem.amount &&  // ❌ בעיה!
l.recurring_day === originalItem.recurring_day
```

אבל אם המשתמש שינה את הסכום באמצע הסדרה, הקוד לא מצא את ההלוואות האחרות!

### בעיה 3: בלבול בין הלוואה מחזורית לפירעון אוטומטי
היה בלבול בין שני מושגים שונים:
1. **הלוואה מחזורית** (`itemType='loan'`) - הלוואה שחוזרת כל חודש
2. **פירעון אוטומטי** (`itemType='auto_repayment'`) - פירעונות מחזוריים לאותה הלוואה

שני כפתורי עריכה שונים קראו לאותו דיאלוג עם אותו `itemType`!

## הפתרונות
### פתרון 1: סינון פירעונות גם לפי `recurring_repayment_number`
```typescript
// Filter: either is_recurring=1 OR has recurring_repayment_number
const recurringRepayments = allRepayments.filter(r => 
  r.is_recurring === 1 || r.recurring_repayment_number
)
```

### פתרון 2: זיהוי הלוואות בסדרה לפי `recurring_loan_number`
```typescript
items = allLoans.filter(l =>
  l.borrower_id === originalItem.borrower_id &&
  l.recurring_day === originalItem.recurring_day &&
  l.is_recurring === 1 &&
  l.recurring_loan_number && // ✅ לא לפי סכום!
  !l.is_deleted
)
```

זה מבטיח שהדיאלוג ימצא את **כל** ההלוואות בסדרה, גם אם הסכום שונה.

### פתרון 3: הפרדה בין שני סוגי הדיאלוגים
שינויים ב-`LoansTab.tsx`:
- **לפני**: משתנה אחד `editRecurringDialogOpen` ו-`selectedRecurringLoanId`
- **אחרי**: שני משתנים נפרדים:
  - `editRecurringLoanDialogOpen` + `selectedRecurringLoanId` - להלוואה מחזורית
  - `editAutoRepaymentDialogOpen` + `selectedAutoRepaymentLoanId` - לפירעון אוטומטי

שני דיאלוגים נפרדים:
```tsx
{/* Edit Recurring Loan Dialog */}
<EditRecurringDialog
  itemType="loan"
  itemId={selectedRecurringLoanId}
  ...
/>

{/* Edit Auto Repayment Dialog */}
<EditRecurringDialog
  itemType="auto_repayment"
  itemId={selectedAutoRepaymentLoanId}
  ...
/>
```

## קבצים ששונו
1. `src/services/recurringItemsService.ts` - תיקון הסינון וזיהוי הסדרות
2. `src/components/loans/LoansTab.tsx` - הפרדה בין שני סוגי הדיאלוגים

## טסטים
- נוצר טסט חדש: `src/__tests__/recurringSeriesIdentification.test.ts`
- 4 טסטים חדשים עוברים ✅
- כל 353 הטסטים הקיימים עוברים ✅

## תאריך
7 במאי 2026
