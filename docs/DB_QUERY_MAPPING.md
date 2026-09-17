# מיפוי שימושים ב-db.query() - ריפקטור שכבת נתונים

תאריך: 2026-09-16

## מטרה
זיהוי כל השימושים ב-`db.query()` בקוד ייצור (לא טסטים) וסיווגם לפי סוג הבעיה והפתרון הנדרש.

---

## 🔴 קריטי - שימושים הדורשים תיקון מיידי

### 1. scheduler.ts - שורה 157-166

**קוד נוכחי:**
```typescript
const existingLoan = await db.query(`
  SELECT id FROM loans 
  WHERE borrower_id = ? 
  AND amount = ? 
  AND loan_date >= ?
  AND loan_date <= ?
  AND is_recurring = 1
  AND recurring_loan_number = ?
`, [loan.borrower_id, loan.amount, firstDayOfMonth, todayStr, nextRecurringNumber])
```

**בעיה:** 
- `db.query()` אינו SQL engine אמיתי ואינו מבצע את כל תנאי WHERE
- הלוגיקה מנסה לסנן לפי 6 תנאים שונים, אך במציאות רק חלקם מתבצעים
- עלול לגרום ליצירת הלוואות כפולות או אי-זיהוי של הלוואות קיימות

**פתרון נדרש:**
```typescript
// הוספה ל-loanRepository.ts
async hasRecurringLoanForPeriod(
  borrowerId: string,
  amount: number,
  fromDate: string,
  toDate: string,
  recurringNumber: number
): Promise<boolean>
```

**השפעה:** 🔥 גבוהה - מערכת recurring loans

---

### 2. scheduler.ts - שורה 890-901

**קוד נוכחי:**
```typescript
const existingDepositThisMonth = await db.query(`
  SELECT id FROM deposits 
  WHERE depositor_id = ? 
  AND amount = ? 
  AND deposit_date >= ?
  AND deposit_date <= ?
  AND id != ?
`, [deposit.depositor_id, deposit.amount, firstDayOfMonth, todayStr, deposit.id])
```

**בעיה:**
- אותה בעיה כמו בהלוואות - pseudo-SQL שאינו מבצע את כל התנאים
- עלול לגרום ליצירת הפקדות כפולות

**פתרון נדרש:**
```typescript
// יצירת depositRepository.ts חדש
async hasRecurringDepositForPeriod(
  depositorId: string,
  amount: number,
  fromDate: string,
  toDate: string,
  excludeId?: string
): Promise<boolean>
```

**השפעה:** 🔥 גבוהה - מערכת recurring deposits

---

## 🟡 בינוני - שימושים שאפשר להשאיר אך עדיף להחליף

### 3. contacts.ts - מספר מקומות

**קוד נוכחי:**
```typescript
const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [contact.donor_id])
const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [contact.depositor_id])
```

**בעיה:**
- שאילתות פשוטות עם תנאי יחיד
- `db.query()` כנראה מטפל בהן נכון, אך זה לא מובטח
- לא ברור אם `is_deleted` מטופל

**פתרון מומלץ:**
```typescript
// שימוש ב-repository או service קיים
const donations = await donationRepository.getByDonor(contact.donor_id)
const deposits = await depositRepository.getByDepositor(contact.depositor_id)
```

**השפעה:** 🟡 בינונית - סטטיסטיקות אנשי קשר

---

### 4. feePaymentsService.ts - 3 מקומות

**קוד נוכחי:**
```typescript
const fees = await db.query('SELECT * FROM fee_payments WHERE id = ?', [id])
const fees = await db.query('SELECT * FROM fee_payments WHERE borrower_id = ?', [borrowerId])
const fees = await db.query('SELECT * FROM fee_payments WHERE loan_id = ?', [loanId])
```

**בעיה:**
- שאילתות פשוטות, אך חסרה בדיקת `is_deleted`
- לא עוקבות אחר דפוס ה-Repository

**פתרון מומלץ:**
```typescript
// יצירת feePaymentRepository.ts
export const feePaymentRepository = {
  async getById(id: string): Promise<FeePayment | null>
  async getByBorrower(borrowerId: string): Promise<FeePayment[]>
  async getByLoan(loanId: string): Promise<FeePayment[]>
  async getAll(): Promise<FeePayment[]>
}
```

**השפעה:** 🟡 בינונית - מערכת עמלות

---

### 5. reportsService.ts - שורה 155

**קוד נוכחי:**
```typescript
const allRepayments = await db.query('SELECT * FROM repayments WHERE is_deleted = 0') as any[]
```

**בעיה:**
- שאילתה פשוטה אך מסתמכת על `db.query()` לטיפול ב-WHERE
- כבר קיים `repaymentRepository`

**פתרון מומלץ:**
```typescript
// הוספה ל-repaymentRepository
async getAll(): Promise<Repayment[]> {
  return getAllItems<Repayment>('repayments')
    .filter(r => !r.is_deleted)
}
```

**השפעה:** 🟡 בינונית - דוחות

---

### 6. calendarService.ts - שורות 129, 275

**קוד נוכחי:**
```typescript
const allRepayments = await db.query('SELECT * FROM repayments') as any[]
const deposits = await db.query(`
  SELECT d.*, (dp.first_name || ' ' || dp.last_name) as depositor_name
  FROM deposits d
  JOIN depositors dp ON d.depositor_id = dp.id
  WHERE ...
`) as any[]
```

**בעיה:**
- שאילתות מורכבות עם JOIN
- `db.query()` לא תומך ב-JOIN אמיתי
- הקוד מסתמך על לוגיקה שאינה קיימת

**פתרון נדרש:**
- בדיקה האם הקוד באמת עובד
- אם לא - החלפה בלוגיקה בקוד שמבצעת את ה-JOIN ידנית

**השפעה:** 🔥 גבוהה אם לא עובד - תצוגת לוח שנה

---

### 7. database.ts - שורה 1093

**קוד נוכחי:**
```typescript
const deposits = (await db.query('SELECT * FROM deposits WHERE is_deleted IS NULL OR is_deleted = 0')) as any[]
```

**בעיה:**
- תנאי OR מורכב
- לא ברור אם `db.query()` מטפל בו נכון

**פתרון מומלץ:**
```typescript
const deposits = getAllItems<any>('deposits')
  .filter(d => !d.is_deleted)
```

**השפעה:** 🟡 בינונית - חישוב expected funds

---

## 🟢 נמוך - שימושים שאפשר להשאיר

### 8. auditLog.ts - 2 מקומות

**קוד נוכחי:**
```typescript
const rows = await db.query(`SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ?`, [type, id])
const rows = await db.query(`SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?`, [limit])
```

**הערה:**
- audit_log הוא טבלה נפרדת, לא חלק מהלוגיקה העסקית הקריטית
- אם `db.query()` עובד עליה - אפשר להשאיר
- בעתיד אפשר ליצור `auditLogRepository`

**השפעה:** 🟢 נמוכה - לוג ביקורת

---

### 9. scheduler.ts - שורות 788, 930

**קוד נוכחי:**
```typescript
const deposits = await db.query('SELECT * FROM deposits WHERE status = ?', ['planned']) as any[]
const deposits = await db.query('SELECT * FROM deposits WHERE id = ?', [originalDepositId]) as any[]
```

**הערה:**
- שאילתות פשוטות מאוד
- תנאי יחיד בלבד
- כנראה עובדות נכון

**פתרון מומלץ:**
- אפשר להשאיר לעת עתה
- בעתיד להחליף ב-`depositRepository.getByStatus('planned')`

**השפעה:** 🟢 נמוכה

---

### 10. contacts.ts - שורות 39, 42, 43

**קוד נוכחי:**
```typescript
const contactsFromDb = await db.query('SELECT * FROM contacts') as any[]
const donors = await db.query('SELECT * FROM donors')
const depositors = await db.query('SELECT * FROM depositors')
```

**הערה:**
- שאילתות ללא WHERE - SELECT * בלבד
- `db.query()` מחזיר הכל ממערך הנתונים
- לא אמור להיות בעיה

**פתרון עתידי:**
```typescript
const contacts = getAllItems<Contact>('contacts')
const donors = getAllItems<Donor>('donors')
const depositors = getAllItems<Depositor>('depositors')
```

**השפעה:** 🟢 נמוכה

---

## סיכום וסדר עדיפויות

### תיקון מיידי (🔴)
1. **scheduler.ts - recurring loans (שורה 157)** - יצירת כפילויות אפשרית
2. **scheduler.ts - recurring deposits (שורה 890)** - יצירת כפילויות אפשרית
3. **calendarService.ts - JOIN queries** - אם לא עובד, התצוגה שבורה

### תיקון בעדיפות בינונית (🟡)
4. **contacts.ts** - סטטיסטיקות אנשי קשר
5. **feePaymentsService.ts** - מערכת עמלות
6. **reportsService.ts** - דוחות
7. **database.ts** - expected funds

### אפשר לדחות (🟢)
8. **auditLog.ts** - לא קריטי
9. **scheduler.ts - planned deposits** - שאילתות פשוטות
10. **contacts.ts - SELECT all** - לא אמור להיות בעיה

---

## הערות נוספות

### בדיקת `db.query()` - מה הוא באמת עושה?

יש לקרוא את `database.ts` ולבדוק:
1. איזה תנאי WHERE הוא באמת מבצע
2. האם הוא תומך ב-AND / OR
3. האם הוא תומך ב-JOIN
4. האם הוא תומך ב-LIMIT / ORDER BY
5. האם יש לו whitelis של שאילתות מותרות

### soft-delete

חשוב לוודא שכל repository מטפל ב-`is_deleted`:
- loans
- repayments
- deposits
- donations
- fee_payments

---

## צעדים הבאים

1. ✅ סיימנו את המיפוי
2. ⏭️ קריאת `database.ts` להבנת `db.query()`
3. ⏭️ תיקון scheduler - recurring loans
4. ⏭️ תיקון scheduler - recurring deposits
5. ⏭️ יצירת repositories חסרים
6. ⏭️ החלפת שימושים
7. ⏭️ טסטים
8. ⏭️ בדיקת regression
