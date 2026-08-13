# תיקון: פירעונות והלוואות מחזוריות עתידיות בלוח השנה

## תיאור הבעיה
בלוח השנה לא הופיעו פירעונות מחזוריים עתידיים והלוואות מחזוריות עתידיות.

המערכת הציגה רק:
- ✅ פירעונות שכבר בוצעו
- ✅ הלוואות קיימות
- ❌ פירעונות מחזוריים שאמורים להתבצע בעתיד
- ❌ הלוואות מחזוריות שאמורות להיווצר בעתיד

## הפתרון

### 1. הוספת פירעונות מחזוריים עתידיים
**קובץ:** `src/services/calendarService.ts`

הוספנו קוד שמזהה הלוואות עם פירעון אוטומטי ומציג את הפירעונות העתידיים:

```typescript
// 2.5. טעינת פירעונות מחזוריים עתידיים
const autoRepaymentLoans = loans.filter(l => 
  l.auto_repayment === 1 && 
  l.repayment_amount > 0 && 
  l.status === 'active' &&
  (l.remaining || 0) > 0
)

for (const loan of autoRepaymentLoans) {
  // בדיקה אם תאריך ההתחלה עבר
  const startDateStr = loan.repayment_start_date?.split('T')[0]
  if (startDateStr) {
    const repaymentStartDate = parseLocalDate(startDateStr)
    if (repaymentStartDate > endDate) continue
  }
  
  // חישוב היום בחודש שבו אמור להתבצע הפירעון
  const repaymentDay = loan.repayment_day || 1
  const lastDayOfMonth = endDate.getDate()
  const effectiveDay = Math.min(repaymentDay, lastDayOfMonth)
  const eventDate = new Date(year, month, effectiveDay)
  
  // בדיקה אם כבר בוצע פירעון בחודש הזה
  const existingRepaymentThisMonth = allRepayments.find(r => 
    r.loan_id === loan.id &&
    r.payment_date &&
    parseLocalDate(r.payment_date.split('T')[0]) >= firstDayOfMonth &&
    parseLocalDate(r.payment_date.split('T')[0]) <= endDate
  )
  
  // אם לא בוצע פירעון, מציגים את הפירעון העתידי
  if (!existingRepaymentThisMonth) {
    const remaining = loan.remaining || loan.amount
    const repaymentAmount = Math.min(loan.repayment_amount, remaining)
    
    events.push({
      id: `future_repayment_${loan.id}_${year}_${month}`,
      type: 'repayment',
      date: formatLocalDate(eventDate),
      title: 'פירעון מחזורי מתוכנן',
      description: `פירעון מתוכנן של ${loan.borrower_name || ''}`,
      amount: repaymentAmount,
      relatedId: loan.id,
      relatedName: loan.borrower_name || '',
      metadata: {
        remaining: remaining,
        loanType: loan.loan_type
      }
    })
  }
}
```

### 2. הוספת הלוואות מחזוריות עתידיות
**קובץ:** `src/services/calendarService.ts`

הוספנו קוד שמזהה הלוואות מחזוריות ומציג את ההלוואות העתידיות:

```typescript
// 2.6. טעינת הלוואות מחזוריות עתידיות
const recurringLoans = loans.filter(l => 
  l.is_recurring === 1 && 
  l.recurring_months > 0 && 
  l.status === 'active'
)

for (const loan of recurringLoans) {
  // חישוב היום בחודש שבו אמורה להיווצר ההלוואה
  const recurringDay = loan.recurring_day || 1
  const lastDayOfMonth = endDate.getDate()
  const effectiveDay = Math.min(recurringDay, lastDayOfMonth)
  const eventDate = new Date(year, month, effectiveDay)
  
  // בדיקה אם כבר נוצרה הלוואה בחודש הזה
  const currentRecurringNumber = loan.recurring_loan_number || 1
  const nextRecurringNumber = currentRecurringNumber + 1
  
  const existingLoanThisMonth = loans.find(l => 
    l.borrower_id === loan.borrower_id &&
    l.amount === loan.amount &&
    l.is_recurring === 1 &&
    l.recurring_loan_number === nextRecurringNumber &&
    l.loan_date &&
    parseLocalDate(l.loan_date.split('T')[0]) >= firstDayOfMonth &&
    parseLocalDate(l.loan_date.split('T')[0]) <= endDate
  )
  
  // אם לא נוצרה הלוואה, מציגים את ההלוואה העתידית
  if (!existingLoanThisMonth) {
    events.push({
      id: `future_recurring_loan_${loan.id}_${year}_${month}`,
      type: 'planned_loan',
      date: formatLocalDate(eventDate),
      title: 'הלוואה מחזורית מתוכננת',
      description: `הלוואה מחזורית מתוכננת ל${loan.borrower_name || ''} (${nextRecurringNumber}/${loan.recurring_loan_count || ''})`,
      amount: loan.amount,
      relatedId: loan.id,
      relatedName: loan.borrower_name || '',
      metadata: {
        loanType: loan.loan_type
      }
    })
  }
}
```

## בדיקות
נוספו 4 בדיקות חדשות ב-`src/__tests__/calendarRecurringRepayments.test.ts`:

1. ✅ **should show future recurring repayments in calendar** - מוודא שפירעונות מחזוריים עתידיים מופיעים
2. ✅ **should not show recurring repayment if already paid this month** - מוודא שלא מציגים פירעון עתידי אם כבר בוצע
3. ✅ **should show future recurring loans in calendar** - מוודא שהלוואות מחזוריות עתידיות מופיעות
4. ✅ **should handle repayment day greater than days in month** - מוודא טיפול נכון בימים שלא קיימים בכל החודשים (כמו 31)

## תוצאות
- ✅ כל 359 הבדיקות עוברות בהצלחה
- ✅ פירעונות מחזוריים עתידיים מופיעים בלוח השנה
- ✅ הלוואות מחזוריות עתידיות מופיעות בלוח השנה
- ✅ הקוד מטפל נכון בחודשים עם מספר ימים שונה
- ✅ הקוד לא מציג אירועים כפולים (אם כבר בוצע פירעון או נוצרה הלוואה)

## קבצים ששונו
1. `src/services/calendarService.ts` - הוספת לוגיקה לטעינת אירועים עתידיים
2. `src/__tests__/calendarRecurringRepayments.test.ts` - בדיקות חדשות

## השפעה על המשתמש
המשתמש יכול כעת לראות בלוח השנה:
- 📅 פירעונות מחזוריים שאמורים להתבצע בחודש הנוכחי
- 📅 הלוואות מחזוריות שאמורות להיווצר בחודש הנוכחי
- 📅 תכנון טוב יותר של תזרים המזומנים
- 📅 תזכורות ויזואליות למועדים חשובים

## תאריך
20 במאי 2026
