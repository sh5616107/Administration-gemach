# פער בין Validators לקוד קיים

## סטטוס: ✅ נפתר (16.09.2026) — מחובר

`validateLoan()` מחובר ל-`loansService.create()`. השורש נמצא ותוקן —
ראו "פתרון סופי" בסוף המסמך. שאר המסמך נשמר כהיסטוריה של החקירה.

---

## מצב היסטורי (עד 16.09.2026)

התשתית של validators מוכנה (`src/services/validators/loanValidators.ts`), אך **לא מחוברת** ל-`loansService.create()`.

---

## ניסיון חיבור #1 (15.09.2026)

**מה עשינו:**
- הוספנו `validateLoan()` ל-`loansService.create()`
- יצרנו טסט integration ש**עבר** (`loanValidationIntegration.test.ts`)

**מה נכשל:**
- 41 טסטים קיימים נכשלו עם שגיאה: `"תדירות לא תקינה"`
- הסיבה: טסטים קיימים מעבירים `auto_repayment: 1` **בלי** `repayment_frequency`
- ה-validator מחמיר יותר מהקוד הקיים

---

## הפער המדויק

**בקוד הנוכחי**: אפשר ליצור הלוואה עם `auto_repayment: 1` בלי `repayment_frequency`.

**ב-validator**: אם `auto_repayment: 1`, חובה:
- `repayment_amount > 0`
- `repayment_day` (1-31)
- `repayment_frequency` (monthly/biweekly/weekly)

---

## דוגמה לטסט כושל

```typescript
// זה עובד בקוד הנוכחי, אבל נכשל בvalidation
await loansService.create({
  borrower_id: '...',
  amount: 1000,
  loan_date: '2026-01-01',
  balance: 1000,
  auto_repayment: 1,        // ✅ קיים
  repayment_amount: 200,    // ✅ קיים
  repayment_day: 15,        // ✅ קיים
  // ❌ חסר: repayment_frequency
})
```

---

## תכנית תיקון

### אופציה A: תקן את כל הטסטים (41 קבצים)
- **יתרון**: ה-validator מתחבר מיד
- **חיסרון**: עבודה גדולה, סיכון regression

### אופציה B: הפוך את validation לאופציונלי
- **יתרון**: לא שובר כלום
- **חיסרון**: לא מקבל את היתרונות של validation

### אופציה C: ✅ **המלצה - גישה הדרגתית**
1. **עכשיו**: השאר ללא validation ב-`loansService.create()`
2. **בהדרגה**: כל פעם שנוגעים בטסט/קוד, מוסיפים את השדות החסרים
3. **בעתיד**: אחרי שרוב הטסטים מתוקנים, מחברים את ה-validation

---

## המצב הנוכחי (אחרי rollback)

- ✅ `validateLoan()` קיים ועובד
- ✅ טסט integration עובד (`loanValidationIntegration.test.ts`)
- ❌ לא מחובר ל-`loansService.create()`
- ✅ כל 564 הטסטים עוברים

---

## הצעד הבא

כשנחליט לחבר - צריך לעדכן **41 טסטים** להוסיף `repayment_frequency`.

קבצי טסט שנכשלו:
- autoRepaymentConflict.test.ts (9 טסטים)
- recurringLoansIntegration.test.ts
- recurringLoanWithAutoRepayment.test.ts
- scheduler.test.ts
- ועוד...

---

## לקחים

1. **Validators צריכים להיות מחוברים בהדרגה**, לא בבת אחת
2. **תמיד לבדוק backward compatibility** לפני rollout גדול
3. **Integration tests חשובים**, אבל לא מספיק - צריך גם regression suite מלא
4. **41 טסטים כושלים הם לפעמים תסמין, לא הבעיה עצמה** — כאן הבעיה האמיתית
   לא הייתה "הטסטים מפגרים אחרי validator טוב", אלא ש-`repayment_frequency`
   היה שדה מת (mandatory ב-validator, לא נצרך בשום מקום אחר בקוד — לא
   ב-scheduler, לא בשום טופס UI). לפני שמתקנים 41 טסטים, שווה לבדוק אם
   הדרישה שגורמת להם להיכשל בכלל נכונה.

---

## פתרון סופי (16.09.2026)

**החלטה עסקית:** אין כוונה לתמוך בהלוואה מחזורית דו-שבועית/שבועית —
הלוואה מחזורית במערכת היא **תמיד חודשית**.

**המשמעות:** `repayment_frequency` לא היה "עוד לא מומש", הוא היה שדה
מיותר לגמרי. לכן הפתרון לא היה אופציה A (לתקן 41 טסטים) אלא **הסרת
הדרישה מהשורש**:

1. הוסרה הבדיקה של `repayment_frequency` מ-`validateAutoRepaymentSettings`
   ב-`loanValidators.ts` (השדה `validFrequencies` הוסר לגמרי).
2. הוסר השדה `repayment_frequency` מטיפוס `Loan` ב-`database.ts`
   (עם הערה שמסבירה למה אין תמיכה בתדירויות אחרות).
3. הוסרו 10 שורות `repayment_frequency: 'monthly'` מ-3 קבצי טסט
   שהעבירו אותו כערך מת (לא נבדק באף assertion).
4. `validateLoan()` חובר ל-`loansService.create()` — כל הלוואה חדשה
   עוברת validation (סכום, תאריכים, סטטוס, הגדרות פירעון מחזורי) לפני
   שמירה, וזורקת `Error` עם הודעה ברורה אם לא תקינה.
5. הודעת השגיאה שנזרקת מוצגת בפועל למשתמש ב-`LoansTab.tsx` (הוחלף
   snackbar גנרי "שגיאה בשמירה" בהודעת השגיאה האמיתית).
6. נוצר מחדש `loanValidationIntegration.test.ts` עם 4 טסטים: הלוואה
   תקינה נוצרת, הלוואה מחזורית תקינה נוצרת **בלי** `repayment_frequency`,
   הלוואה עם סכום שלילי נדחית, הלוואה מחזורית בלי `repayment_day` נדחית.

**תוצאה:** 41 הטסטים שנכשלו בניסיון #1 עוברים **בלי לגעת בהם** — כי
הבעיה שגרמה להם להיכשל הוסרה מהשורש. 568/570 טסטים עוברים (564 baseline
+ 4 חדשים), `tsc --noEmit` נקי.
