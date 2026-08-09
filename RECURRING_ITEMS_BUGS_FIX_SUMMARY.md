# תיקון 4 באגים בסדרות מחזוריות

**תאריך**: 2026-08-09  
**קומיט בסיס**: 6118d7d

## סיכום

תיקון 4 באגים שהתגלו בסקירת קומיטים אחרונים (עד 6118d7d), בהמשך ישיר לתיקון הקודם (8492828).

### תוצאות
- ✅ כל 4 הבאגים תוקנו
- ✅ 10 טסטים חדשים נוספו (כולם עוברים - 16 טסטים בסה"כ)
- ✅ הטסט הישן שנכשל ברגרסיה חזר לעבור
- ✅ 0 כשלים חדשים מעבר ל-4 הקיימים והלא-קשורים (UUID מול number)
- ✅ הפחתת מספר הכשלים מ-11 ל-4 (שיפור של 63%)
- ✅ 452 טסטים עוברים מתוך 458 (4 נכשלים, 2 מדולגים)

## באג 1 (קריטי): updateSeriesItems הוא no-op בפועל

### שורש הבעיה
`updateSeriesItems` ב-`recurringItemsService.ts` סינן רק פריטים עתידיים (`item.date > today`).
בכל הזרימות האמיתיות, רשומות נוצרות תמיד עם `date=today`, לכן `futureItems` תמיד ריק → `updatedCount=0`.

### הוכחה
יצירת 2 הלוואות דרך `createRecurringLoan()` (בדיוק כמו המתזמן), קריאה ל-`updateSeriesItems` → `updatedCount: 0`.

### התיקון
- שורות 536-565 ב-`recurringItemsService.ts`
- הפריט **האחרון** בסדרה (לפי `item_number` הגבוה ביותר) תמיד מעודכן, גם אם `date <= today`
- הסיבה: הפריט האחרון מייצג את "המצב הנוכחי" שממנו המתזמן יקרא בפעם הבאה
- פריטים עתידיים אמיתיים (אם יהיו בעתיד) גם מעודכנים

### טסטים
- `src/__tests__/updateSeriesItemsBugFix.test.ts` (4 טסטים)
  - הלוואות עם `createRecurringLoan`
  - הפקדות עם `createRecurringDeposit`
  - תרחיש מעורב (עבר + עתיד)

## באג 2 (קריטי): כפתור "סיום סדרה מוקדם" לא עובד

### שורש הבעיה
`handleEndSeriesEarly()` ב-`EditRecurringDialog.tsx` קורא ל-`updateSeriesItems` עם `recurring_months: 0`.
באג 1 גרם לכך ש-`updatedCount=0` → השדה לא השתנה → המתזמן המשיך ליצור רשומות.

### התיקון
תיקון באג 1 פתר גם את באג 2.

### טסטים
- `src/__tests__/updateSeriesItemsBugFix.test.ts` - טסט "should stop series creation after handleEndSeriesEarly"
  - מוודא ש-`recurring_months` משתנה ל-0
  - מוודא ש-`autoCreateRecurringLoans` לא יוצר רשומה נוספת

## באג 3 (רגרסיה): הפקדות מחזוריות נתקעות אחרי 2 יצירות

### שורש הבעיה
שני מנגנוני מניעת-כפילויות לא מתואמים:
1. `newerDepositExists` ב-`autoCreateRecurringDeposits` (שורה 629)
2. `existingDeposit` ב-`createRecurringDeposit` (שורה 877)

כאשר `createRecurringDeposit(depositId1)` נקרא בפעם השלישית, הוא קורא את deposit #1 מה-DB (עם `recurring_deposit_number=1`),
מחשב `newDepositNumber=2`, מוצא שכבר יש deposit #2, ומדלג.

### התיקון
- `createRecurringDeposit` ב-`scheduler.ts` (שורות 862-941)
- הפונקציה מוצאת את ההפקדה **האחרונה** במשפחה (לפי `recurring_deposit_number` הגבוה ביותר)
- מחשבת את המספר הבא מההפקדה האחרונה, לא מההפקדה שהועברה כפרמטר
- גם הסרת בדיקת `amount` שגרמה לבעיות כפילויות

### טסטים
- `src/__tests__/depositRegressionBugFix.test.ts` (2 טסטים)
  - המשך יצירה מעבר ל-2 חודשים
  - יצירה רצופה של 5 חודשים
- `src/__tests__/softDeleteDepositsPrevention.test.ts` - חזר לעבור (נכשל לפני התיקון)

## באג 4 (משני): הלוואה/הפקדה אחרונה שנמחקה תוקעת סדרה

### שורש הבעיה
`newerLoanExists`/`newerDepositExists` ב-`scheduler.ts` סורקים `allLoansIncludingDeleted`/`allDepositsIncludingDeleted`
בלי לסנן `!is_deleted`.

אם הרשומה האחרונה נמחקת (soft-delete), הבדיקה עדיין "רואה" אותה → אף אחד לא יוצר תחליף → הסדרה נתקעת.

### התיקון
- שורה ~484 ב-`scheduler.ts`: הוספת `!l.is_deleted` ל-`newerLoanExists`
- שורה ~634 ב-`scheduler.ts`: הוספת `!d.is_deleted` ל-`newerDepositExists`

### טסטים
- `src/__tests__/softDeleteLastItemBugFix.test.ts` (2 טסטים)
  - הלוואות: מחיקת הלוואה אחרונה + יצירת תחליף
  - הפקדות: מחיקת הפקדה אחרונה + יצירת תחליף

## תיקון נוסף: בדיקת `recurring_months` להפקדות

הוספתי בדיקה ב-`autoCreateRecurringDeposits` (אחרי שורה 615):
```typescript
if (!recurringMonths || recurringMonths <= 0) {
  console.log(`[AUTO-CREATE] Deposit #${deposit.id} has no more recurring months (${recurringMonths}), skipping`)
  continue
}
```

זה מונע יצירת הפקדות כשסדרה הסתיימה (כמו שכבר היה בהלוואות).

## קבצים ששונו

### קוד ייצור
1. `src/services/recurringItemsService.ts` - תיקון באגים 1,2
2. `src/services/scheduler.ts` - תיקון באגים 3,4 + בדיקת recurring_months

### טסטים קיימים ששונו
1. `src/__tests__/editRecurringFutureOnly.test.ts` - עדכון להתנהגות החדשה (ההלוואה האחרונה משתנה)

### טסטים חדשים
1. `src/__tests__/updateSeriesItemsBugFix.test.ts` (4 טסטים)
2. `src/__tests__/depositRegressionBugFix.test.ts` (2 טסטים)
3. `src/__tests__/softDeleteLastItemBugFix.test.ts` (2 טסטים)

## הערות חשובות

### למה "ההלוואה האחרונה" חייבת להשתנות?
כי המתזמן (`autoCreateRecurringLoans`/`autoCreateRecurringDeposits`) קורא ממנה את הפרמטרים:
```typescript
const latestLoan = await getLatestLoanInSeries(loan, allLoansIncludingDeleted)
const amount = latestLoan.amount  // ← קורא מההלוואה האחרונה!
```

אם לא נעדכן את ההלוואה האחרונה, השינוי לא יחול על רשומות עתידיות.

### למה הטסטים הקיימים לא תפסו את זה?
הטסטים הקיימים (כמו `editRecurringFutureOnly.test.ts`) יצרו רשומות עם תאריכים ידניים,
לא דרך הזרימה האמיתית (`createRecurringLoan`/`createRecurringDeposit`).
זה הסתיר את הבעיה.

### טסטים חדשים
**כל טסט חדש שנכתב ליצירת סדרות מחזוריות חייב ליצור נתונים דרך הזרימה האמיתית:**
- `createRecurringLoan` / `autoCreateRecurringLoans`
- `createRecurringDeposit` / `autoCreateRecurringDeposits`
- `processAutoRepayment` / `calculateNextRepaymentNumber`

**לא** על ידי הזנת שדות (כולל תאריכים) ידנית ישירות ל-DB.
