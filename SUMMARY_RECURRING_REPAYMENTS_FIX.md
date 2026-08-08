# סיכום תיקון: פירעונות מחזוריים על משפחת הלוואות

**תאריך**: 7 אוגוסט 2026  
**סטטוס**: ✅ הושלם ונבדק

## הבעיה

הלוואה שהיא **גם** מחזורית **וגם** עם פירעון אוטומטי:
- כל חודש: הלוואה חדשה (id חדש)
- כל חודש: פירעון אוטומטי
- **באג**: כל הפירעונות ממוספרו 1/1 במקום 1/120, 2/120, 3/120...

## הפתרון

### 1. שדה חדש
✅ `recurring_series_id` (UUID) - מזהה משפחת הלוואות

### 2. שירות מרכזי
✅ `src/services/recurringRepaymentsService.ts`
- `getLoanFamily()` - מזהה משפחה
- `getAllFamilyRepayments()` - כל הפירעונות של המשפחה
- `calculateNextRepaymentNumber()` - **פונקציה אחת מרכזית**

### 3. איחוד לוגיקה
✅ שלושה מקומות עודכנו להשתמש בפונקציה המרכזית:
- `LoansTab.tsx`
- `AlertsDialog.tsx`
- `scheduler.ts`

### 4. תיקון UI
✅ כפתור "נהל פירעון אוטומטי" מופיע **פעם אחת** (רק על ההלוואה הראשונה)

### 5. מיגרציות
✅ v13: הוספת `recurring_series_id` להלוואות קיימות  
✅ v14: תיקון מספור פירעונות שנפגעו מהבאג

## תוצאות

| לפני | אחרי |
|------|------|
| Repayment 1/1 ❌ | Repayment 1/120 ✅ |
| Repayment 1/1 ❌ | Repayment 2/120 ✅ |
| Repayment 1/1 ❌ | Repayment 3/120 ✅ |

## בדיקות

- ✅ 430+ טסטים עוברים
- ✅ טסט חדש: `recurringLoanWithAutoRepayment.test.ts` (4 תרחישים)
- ✅ טסטי רגרסיה: כל הטסטים הקיימים עוברים

## קבצים ששונו

### חדשים (2)
1. `src/services/recurringRepaymentsService.ts`
2. `src/__tests__/recurringLoanWithAutoRepayment.test.ts`

### עודכנו (7)
1. `src/services/database.ts` - הוספת `recurring_series_id`
2. `src/services/scheduler.ts` - יצירת series_id + שימוש בפונקציה משותפת
3. `src/services/recurringItemsService.ts` - זיהוי פירעונות על משפחה
4. `src/components/loans/LoansTab.tsx` - שימוש בפונקציה משותפת
5. `src/components/AlertsDialog.tsx` - שימוש בפונקציה משותפת
6. `src/pages/UnifiedLoansPage.tsx` - תנאי הצגת כפתור
7. `src/services/migrations.ts` - מיגרציות v13, v14

## תואימות אחורה

✅ הלוואות קיימות ללא `recurring_series_id` - זיהוי fallback  
✅ הלוואות בודדות עם פירעון אוטומטי - לא השתנו  
✅ מיגרציות אידמפוטנטיות - בטוח להריץ כמה פעמים

## תיעוד מלא

📄 `RECURRING_REPAYMENTS_LOAN_FAMILY_FIX.md` - תיעוד מקיף מלא
