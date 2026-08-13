# שיפורים לסדרות מחזוריות - סיכום

תאריך: 11 אוגוסט 2026

## סקירה
בוצעו 4 שיפורים עיקריים למערכת הסדרות המחזוריות, כאשר תיקון #1 הוא קריטי למניעת באגים במספור.

---

## ✅ תיקון 1: פירעון מרובה מודע לפירעון מחזורי (CRITICAL)

### הבעיה
`handleMultiRepayment` ב-`UnifiedLoansPage.tsx` יצר פירעונות **בלי** `is_recurring`, `recurring_repayment_number`, `recurring_repayment_count`.

כשמשתמשים ב"פירעון מרובה" על הלוואה עם `auto_repayment=1`, הרשומה נכנסת ל-`repayments` בלי דגלים מחזוריים, אבל עדיין נספרת כשקוראים ל-`getByLoan`/`getAllFamilyRepayments` — **מזיז את המספור של הפירעונות הבאים בלי שנדע למה**.

### הפתרון
```typescript
// src/pages/UnifiedLoansPage.tsx
import { calculateNextRepaymentNumber } from '../services/recurringRepaymentsService';

const handleMultiRepayment = async () => {
  // ...
  for (const loan of activeLoans) {
    // ...
    const numberInfo = await calculateNextRepaymentNumber(loan.id);
    
    await repaymentsService.create({
      loan_id: loan.id,
      amount: paymentAmount,
      payment_date: today,
      payment_method: multiRepaymentPaymentMethod.payment_method,
      payment_details: JSON.stringify(multiRepaymentPaymentMethod),
      is_recurring: numberInfo.recurringRepaymentNumber > 1 || numberInfo.recurringRepaymentCount ? 1 : 0,
      recurring_repayment_number: numberInfo.recurringRepaymentNumber,
      recurring_repayment_count: numberInfo.recurringRepaymentCount,
    });
  }
};
```

### טסט
`src/__tests__/multiRepaymentRecurringAwareness.test.ts` - 2 טסטים עוברים ✅
- פירעון מרובה + פירעון רגיל + התראה - מספור רצוף ללא דילוגים
- פירעון מרובה על מספר הלוואות - כולן עם מספור נכון

---

## ✅ תיקון 2: כפתור ייעודי לרישום פירעון חריג

### הבעיה
אין דרך למנהל לרשום תשלום מוקדם/מאוחר/חלקי להלוואה ספציפית עם מספור נכון — רק "פירעון מרובה" או המתנה להתראה.

### הפתרון

#### 2.1 פונקציה משותפת
```typescript
// src/services/repaymentHelpers.ts (קובץ חדש)
export async function createRepaymentWithNumbering(params: CreateRepaymentParams): Promise<void> {
  const loan = await loansService.getById(loanId);
  
  if (loan.auto_repayment === 1 && loan.repayment_amount > 0) {
    const result = await calculateNextRepaymentNumber(loanId);
    // ... יצירת פירעון עם מספור נכון
  }
}
```

#### 2.2 עדכון AlertsDialog
```typescript
// src/components/AlertsDialog.tsx
import { createRepaymentWithNumbering } from '../services/repaymentHelpers';

const handleConfirmRepayment = async (alert: Alert) => {
  await createRepaymentWithNumbering({
    loanId: alert.loanId,
    amount: alert.amount,
    notes: 'פירעון מחזורי אוטומטי',
  });
};
```

#### 2.3 דיאלוג חדש ב-UnifiedLoansPage
```typescript
// src/pages/UnifiedLoansPage.tsx
- state חדש: manualRepaymentDialogOpen, manualRepaymentLoanId, וכו'
- כפתור חדש בכרטיס הלוואה: "רשום פירעון חריג" (ליד "נהל פירעון אוטומטי")
- Dialog עם שדות: סכום, תאריך, אמצעי תשלום
- handleManualRepayment: קורא ל-createRepaymentWithNumbering
```

---

## ✅ תיקון 3+4: מספור ויזואלי על כרטיסי הלוואות

### הבעיה
`LoanCard` לא הציג מספור פירעונות (`3/12`) ולא הצביע חזותית על תשלומים באיחור/בקרוב.

### הפתרון

#### 3.1 עדכון LoanCard
```typescript
// src/components/loans/LoanCard.tsx
interface LoanCardProps {
  loan: Loan;
  onClick: () => void;
  recurringRepaymentInfo?: {
    number: number;
    count: number;
    nextDueDate?: string; // ISO date string
  };
}

function getDueStatus(nextDueDate?: string): DueStatus {
  // מחשב overdue / due-soon / ok
}

// הצגת:
// - מסגרת אדומה/כתומה לפי סטטוס
// - Chip עם מספור: "3/12" בצבעים מותאמים
```

#### 3.2 עדכון UnifiedLoansPage
```typescript
// src/pages/UnifiedLoansPage.tsx

// helper חדש
function calculateNextDueDate(repaymentDay?: number): string | undefined {
  // מחשב תאריך פירעון הבא מיום בחודש, מטפל בחודשים קצרים
}

// בשני המקומות (שורות 747 ו-799):
<LoanCard 
  loan={loan} 
  onClick={() => handleOpenLoan(loan)}
  recurringRepaymentInfo={
    loan.auto_repayment === 1 && loanRecurringRepayments.has(loan.id!)
      ? {
          number: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_number!,
          count: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_count!,
          nextDueDate: calculateNextDueDate(loan.repayment_day),
        }
      : undefined
  }
/>
```

### תוצאה
- כרטיסים עם מסגרת אדומה (overdue) או כתומה (due-soon)
- Chip מספור: `3/12` בצבע מתאים
- חישוב אוטומטי של התאריך הבא (עם טיפול בחודשים קצרים)

---

## סעיפים שלא יושמו (לבקשת המשתמש)

### 5. טיפול בחודשים קצרים
כבר קיים במערכת - `calculateNextDueDate` מטפל בזה.

---

## קבצים שונו

### קבצים חדשים
- `src/services/repaymentHelpers.ts` - פונקציות עזר משותפות לפירעונות
- `src/__tests__/multiRepaymentRecurringAwareness.test.ts` - טסטים לתיקון 1

### קבצים ששונו
- `src/pages/UnifiedLoansPage.tsx`
  - import של calculateNextRepaymentNumber
  - handleMultiRepayment עם מספור
  - handleManualRepayment חדש
  - דיאלוג פירעון חריג חדש
  - calculateNextDueDate helper
  - LoanCard props עם recurringRepaymentInfo
  
- `src/components/loans/LoanCard.tsx`
  - interface חדש עם recurringRepaymentInfo
  - getDueStatus helper
  - הצגת מסגרות צבעוניות
  - Chip מספור דינמי
  
- `src/components/AlertsDialog.tsx`
  - שימוש ב-createRepaymentWithNumbering במקום לוגיקה כפולה

---

## בדיקות ידניות נדרשות

### תיקון 1
✅ **טסט אוטומטי עובר** - `multiRepaymentRecurringAwareness.test.ts`

### תיקון 2
❗ **בדיקה ידנית**:
1. פתח הלוואה עם auto_repayment
2. לחץ "רשום פירעון חריג"
3. הזן סכום וודא שהמספור נכון

### תיקונים 3+4
❗ **בדיקה ידנית חזותית**:
1. הלוואה עם תשלום שעבר → מסגרת אדומה
2. תשלום בעוד יומיים → מסגרת כתומה
3. תשלום בעוד שבועיים → מסגרת רגילה
4. וידוא Chip מספור מוצג רק על הלוואות עם auto_repayment

---

## השפעה

### תיקון 1 (קריטי)
- **מונע באג חמור** במספור פירעונות מחזוריים
- פירעון מרובה כעת **בטוח לשימוש** עם הלוואות מחזוריות

### תיקון 2
- **שיפור UX** - מנהל יכול לרשום פירעונות חריגים בקלות
- **קוד נקי יותר** - לוגיקה משותפת אחת לכל סוגי הפירעונות

### תיקונים 3+4
- **שיפור ויזואלי** - מנהל רואה מיד מצב תשלומים
- **מידע ברור** - מספור פירעונות גלוי על הכרטיס
- **התראות מוקדמות** - מסגרות צבעוניות למניעת איחורים

---

## הערות לפיתוח עתידי

1. **אין לשכפל לוגיקה** - השתמש תמיד ב-`createRepaymentWithNumbering` ליצירת פירעונות
2. **אין לשכפל חישוב מספור** - השתמש תמיד ב-`calculateNextRepaymentNumber`
3. כל טסט חדש למערכת מחזורית צריך לבדוק גם את הזרימה של פירעון מרובה

---

## תיעוד נוסף

ראה גם:
- `src/services/recurringRepaymentsService.ts` - לוגיקת מספור מרכזית
- `RECURRING_LOAN_AUTO_REPAYMENT_FIX.md` - תיקונים קודמים במערכת
