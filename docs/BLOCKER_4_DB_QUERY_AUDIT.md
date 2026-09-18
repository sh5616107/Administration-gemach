# BLOCKER 4: db.query() + db.run() Audit Report

## סיכום מהיר
- **סטטוס:** 🚨 BLOCKER קריטי
- **סיכון:** 🔴 גבוה - **HARD DELETE שעוקף soft-delete policy**
- **המלצה:** **חובה לתקן לפני Production**

## ממצאים

### 1. 🚨 HARD DELETE בUI Components (קריטי!)

**המדיניות:** deposits, donations, donors, depositors אמורים להיות soft-delete (לפי DELETE_POLICY.md)

**המציאות:** 5 מקומות בUI שעושים HARD DELETE:

1. **`DepositorsTab.tsx:207`** ❌
   ```typescript
   const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id])
   for (const dep of deposits) {
     await db.run('DELETE FROM deposits WHERE id = ?', [dep.id])
   }
   await db.run('DELETE FROM depositors WHERE id = ?', [depositor.id])
   ```

2. **`DepositorForm.tsx:266`** ❌
   ```typescript
   const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id])
   for (const dep of deposits) {
     await db.run('DELETE FROM deposits WHERE id = ?', [dep.id])
   }
   await db.run('DELETE FROM depositors WHERE id = ?', [depositor.id])
   ```

3. **`Deposits.tsx:406`** ❌
   ```typescript
   await db.run('DELETE FROM deposits WHERE id = ?', [deposit.id]);
   ```

4. **`Donations.tsx:360`** ❌
   ```typescript
   await db.run('DELETE FROM donations WHERE id = ?', [donation.id]);
   ```

5. **`DonorsTab.tsx:176`** ❌
   ```typescript
   await db.run('DELETE FROM donors WHERE id = ?', [donor.id])
   ```

**השפעה:**
- ❌ עוקף את ה-soft delete policy
- ❌ מוחק נתונים לצמיתות
- ❌ אין audit trail
- ❌ אין אפשרות לשחזור
- ❌ חישובים היסטוריים עלולים להיפגע

### 2. פעולות כתיבה לגיטימיות

#### A. Delete All Data (מותר)
```typescript
// Dashboard.tsx:138-150 - "מחק את כל הנתונים"
await db.run('DELETE FROM repayments')
await db.run('DELETE FROM loans')
// ... כל הטבלאות
```
✅ זה מותר - זו פעולת ניקוי מכוונת של כל המערכת.

#### B. Tests (מותר)
```typescript
// __tests__/*.test.ts - beforeEach cleanup
await db.run('DELETE FROM repayments')
await db.run('DELETE FROM loans')
```
✅ זה מותר - tests צריכים לנקות את הDB.

#### C. Blacklist (מותר)
```typescript
// AdvancedTools.tsx:456
await db.run('DELETE FROM blacklist WHERE id = ?', [item.id])
```
✅ זה מותר - blacklist מוגדרת כ-hard delete לפי המדיניות.

#### D. Scheduler (לבדוק)
```typescript
// scheduler.ts:817
await db.run('UPDATE deposits SET status = ? WHERE id = ?', ['active', deposit.id])
```
⚠️ זה UPDATE ישיר - צריך לבדוק אם יש service method במקום.

### 3. db.query לקריאה בלבד (quality issue, לא blocker)

נמצא ב:
- `Dashboard.tsx` - הצגת רשימות
- `DonorsTab.tsx` - טעינת תורמים וסטטיסטיקות
- `DepositorsTab.tsx` - טעינת מפקידים
- `AdvancedTools.tsx` - דוחות
- `Donations.tsx` - טעינת נתונים
- `WaitlistTab.tsx` - רשימות המתנה
- `AlertsDialog.tsx` - התראות

**דוגמאות:**
```typescript
// Dashboard.tsx:277
const allDeposits = await db.query('SELECT * FROM deposits ORDER BY deposit_date DESC') as any[]

// DonorsTab.tsx:84
const dnrs = await db.query('SELECT * FROM donors') as Donor[]
const donations = await db.query('SELECT * FROM donations') as any[]
```

**בעיות:**
1. ❌ לא מכבד `is_deleted` flag (soft delete)
2. ❌ לא typed - משתמש ב-`as any[]`
3. ❌ אין type safety
4. ⚠️ יכול להציג נתונים "מחוקים" למשתמש

**אבל:**
- ✅ לא משנה data
- ✅ לא יוצר data corruption
- ✅ רק בעיית תצוגה - לא blocker לproduction

## המלצות

### ✅ קריטי - לתקן עכשיו (BLOCKER!)

**תקן את 5 מקומות ה-HARD DELETE:**

1. `DepositorsTab.tsx:207` → החלף ב-`depositorsService.delete()`
2. `DepositorForm.tsx:266` → החלף ב-`depositorsService.delete()`
3. `Deposits.tsx:406` → החלף ב-`depositsService.delete()`
4. `Donations.tsx:360` → החלף ב-`donationsService.delete()`
5. `DonorsTab.tsx:176` → החלף ב-`donorsService.delete()`

**הבעיה:** לא קיימים services אלה ב-database.ts!

**הפתרון:**
1. ליצור `depositsService.delete()` - soft delete
2. ליצור `donationsService.delete()` - soft delete
3. ליצור `depositorsService.delete()` - soft delete + בדיקת הגנה
4. ליצור `donorsService.delete()` - soft delete + בדיקת הגנה
5. להחליף את כל ה-`db.run('DELETE...')` בUI בשימוש ב-services

### חשוב (אחרי Production)
1. להחליף את כל ה-`db.query('SELECT * FROM X')` ב-typed services
2. לבדוק את `scheduler.ts:817` - האם יש service method במקום UPDATE ישיר
3. להוסיף lint rule שמונע שימוש ישיר ב-`db.run()` מחוץ ל-tests ו-services
