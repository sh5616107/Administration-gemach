# ניתוח בעיית חישוב הסכומים בדף הבית

## תיאור הבעיה
קיימת אי-התאמה בין הסכומים המוצגים בדף הבית - הסכום הכללי אינו מתאים לחישוב של כל חלק וחלק בנפרד.

## קבצים מעורבים בחישובים

### 1. Dashboard.tsx
**נתיב**: `src/pages/Dashboard.tsx`
**תפקיד**: תצוגה ראשית של כל הסכומים והסטטיסטיקות

**חישובים עיקריים**:
```typescript
const availableCash = stats
  ? (stats.donations.total + stats.deposits.total) - stats.activeLoans.total - (stats.gemachExpenses || 0)
  : 0
```

**מקורות נתונים**:
- `stats.activeLoans.total` - סך כל יתרות הלוואות פעילות
- `stats.deposits.total` - סך כל הפקדות פעילות (אחרי הפחתת משיכות)
- `stats.donations.total` - סך כל תרומות
- `stats.gemachExpenses` - סך כל הוצאות הגמ"ח

### 2. database.ts - statsService.getDashboardStats()
**נתיב**: `src/services/database.ts` (שורות 698-760)
**תפקיד**: חישוב כל הסטטיסטיקות עבור דף הבית

#### א. חישוב הלוואות פעילות
```typescript
const activeWithBalance = loans.filter(l => 
  l.status === 'active' && 
  l.loan_date <= t &&
  (l.remaining || 0) > 0
)

activeLoans: { 
  count: activeWithBalance.length,
  total: activeWithBalance.reduce((s, l) => s + (l.remaining || 0), 0)
}
```
**שים לב**: 
- `l.remaining` מחושב בפונקציה `loansService.getAll()` (שורות 620-638)
- `remaining = loan.amount - loan.total_repaid`
- `total_repaid` מחושב מסכום כל הפירעונות של ההלוואה

#### ב. חישוב הפקדות
```typescript
let totalDeposits = 0
for (const d of deps) {
  let depositAmount = d.amount
  if (d.is_recurring === 1 && d.recurring_deposit_number) {
    depositAmount = d.amount * d.recurring_deposit_number
  }
  
  // הפחתת משיכות
  const withdrawals = await depositWithdrawalsService.getByDeposit(d.id)
  const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
  totalDeposits += (depositAmount - totalWithdrawn)
}
```
**שים לב**: 
- מטפלים בהפקדות מחזוריות (מכפילים את הסכום במספר חזרות)
- מפחיתים משיכות מכל הפקדה
- רק הפקדות עם `status === 'active'`

#### ג. חישוב תרומות
```typescript
donations: { 
  count: dons.length, 
  total: dons.reduce((s, d) => s + d.amount, 0) 
}
```
**שים לב**: סכום פשוט של כל התרומות

#### ד. חישוב הוצאות הגמ"ח
```typescript
const gemachExpenses = expenses
  .filter(e => e.paid_by === 'gemach')
  .reduce((s, e) => s + e.amount, 0)
```
**שים לב**: רק הוצאות ששולמו על ידי הגמ"ח (לא על ידי לווה)

### 3. loansService.getAll()
**נתיב**: `src/services/database.ts` (שורות 620-638)
**תפקיד**: טעינת כל ההלוואות וחישוב היתרה שלהן

```typescript
const loans = getAllItems<Loan>('loans').filter(l => !l.is_deleted)

for (const loan of loans) {
  const repayments = await repaymentsService.getByLoan(loan.id)
  loan.total_repaid = repayments.reduce((s, r) => s + r.amount, 0)
  loan.remaining = loan.amount - loan.total_repaid
  loan.borrower_name = b ? `${b.first_name} ${b.last_name}` : ''
}
```

### 4. contacts.ts
**נתיב**: `src/services/contacts.ts`
**תפקיד**: חישוב חוב כולל ללווה/ערב בנפרד

**חישובי חוב ללווה**:
```typescript
stats.total_debt = loans
  .filter(l => l.status === 'active')
  .reduce((sum, l) => sum + (l.remaining || 0), 0)
```

**חישובי חוב לערב**:
```typescript
stats.total_guaranteed = guaranteedLoans
  .filter(l => l.status === 'active')
  .reduce((sum, l) => sum + (l.remaining || 0), 0)
```

## נקודות לבדיקה - מקורות אפשריים לאי-התאמה

### 1. הלוואות מחזוריות
- האם ההלוואות המחזוריות נספרות פעם אחת או מספר פעמים?
- בדוק: `l.is_recurring === 1` ו-`l.recurring_loan_number`

### 2. משיכות מהפקדות
- האם המשיכות נספרות נכון?
- בדוק: `depositWithdrawalsService.getByDeposit(d.id)`
- האם יש משיכה כפולה?

### 3. סטטוס הלוואות
- האם כל הסטטוסים מטופלים נכון?
- `active`, `planned`, `completed`, `overdue`, `transferred_to_guarantor`

### 4. הפקדות מחזוריות
- האם הכפל נעשה נכון?
- `depositAmount = d.amount * d.recurring_deposit_number`

### 5. הוצאות של לווה vs הוצאות של הגמ"ח
- האם מפרידים נכון בין `paid_by === 'gemach'` ל-`paid_by === 'borrower'`?

### 6. הלוואות שהועברו לערב
- האם הלוואות עם `status === 'transferred_to_guarantor'` נספרות פעמיים?
- פעם כהלוואת לווה ופעם כהלוואת ערב?

### 7. תאריכים
- האם הלוואות עתידיות (`loan_date > today`) נספרות?
- בדוק את התנאי: `l.loan_date <= t`

## נקודות לבדיקה ב-UI

### בדף הבית:
1. **הלוואות פעילות** - לוודא שכל הלוואה נספרת פעם אחת בלבד
2. **הפקדות** - לוודא שמשיכות מופחתות נכון
3. **תרומות** - לוודא שכל תרומה נספרת
4. **כסף זמין** - לוודא את נוסחת החישוב

### נוסחת כסף זמין:
```
כסף זמין = (תרומות + הפקדות) - הלוואות פעילות - הוצאות הגמ"ח
```

## המלצות לתיקון

### שלב 1: הוספת לוגים
הוסף `console.log` בקבצים הבאים:
1. `statsService.getDashboardStats()` - הדפס כל סכום ביניים
2. `loansService.getAll()` - הדפס כל הלוואה וה-remaining שלה
3. Dashboard.tsx - הדפס את החישוב הסופי

### שלב 2: בדיקת נתונים
1. בדוק בדפדפן Console את כל הלוגים
2. השווה בין:
   - סכום הלוואות בדף הבית
   - סכום הלוואות בדף הלוואות
   - סך הלווים הפעילים בטבלה

### שלב 3: זיהוי האי-התאמה
1. מצא איזה סכום לא מתאים
2. עקוב אחרי הלוגיקה של אותו סכום
3. בדוק אם יש ספירה כפולה או חסרה

### שלב 4: תיקון
לאחר זיהוי הבעיה, תקן את הלוגיקה המתאימה.

## קבצים שיוצאו
1. ✅ Dashboard.tsx - דף הבית עם החישובים הסופיים
2. ✅ database.ts - שירות הדאטה עם כל החישובים המרכזיים
3. ✅ Deposits.tsx - דף הפקדות
4. ✅ Donations.tsx - דף תרומות
5. ✅ DepositsTab.tsx - טאב הפקדות
6. ✅ DonationsTab.tsx - טאב תרומות
7. ✅ contacts.ts - שירות אנשי קשר עם חישובי חוב
8. ✅ documents.ts - שירות מסמכים
9. 📄 CALCULATIONS_ANALYSIS.md - ניתוח זה

## תיקיית היצוא
כל הקבצים יוצאו לתיקייה: `C:\Users\Yoni\Desktop\gemach_calculations_export`

## נקודות נוספות לבדיקה

### בדיקת עקביות
- האם `getActiveBorrowers()` משתמש באותה לוגיקה כמו `getDashboardStats()`?
- שני המקורות צריכים לתת אותו סכום כולל של חוב

### בדיקת סכום בטבלת לווים פעילים
בדף הבית יש שתי תצוגות של אותו מידע:
1. כרטיס "הלוואות פעילות" - `stats.activeLoans.total`
2. שורת סיכום בטבלת "לווים פעילים" - סכום ידני של `total_debt`

**השתיים חייבות להיות זהות!**

אם יש הבדל - כאן הבעיה!
