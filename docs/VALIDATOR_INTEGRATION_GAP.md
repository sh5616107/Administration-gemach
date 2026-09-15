# פער בין Validators לקוד קיים

## סטטוס: P1 - לא מחובר עדיין

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
