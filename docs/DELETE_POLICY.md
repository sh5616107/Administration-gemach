# מדיניות מחיקה במערכת הגמ"ח

## רקע
במערכת קיימת אי-אחידות בין soft delete (מחיקה לוגית) ל-hard delete (מחיקה פיזית).
מסמך זה מגדיר את המדיניות האחידה.

## עקרונות מנחים

### 1. נתונים פיננסיים - Soft Delete בלבד
**ישויות**: הלוואות, פירעונות, הפקדות, תרומות
**סיבה**: audit trail, שחזור, חישובים היסטוריים

**מימוש**:
- שדה `is_deleted: boolean` (false כברירת מחדל)
- שדה `deleted_at: string` (ISO timestamp)
- שאילתות מסננות `WHERE is_deleted = 0` או `!item.is_deleted`
- מסמכים מצורפים: soft delete גם כן

**ישויות שכבר ממומשות נכון**:
- ✅ loans
- ✅ deposits

**ישויות שצריכות תיקון**:
- ❌ donations - כרגע hard delete
- ❌ repayments - לא ברור

### 2. ישויות אדם - Soft Delete + הגנות
**ישויות**: לווים, ערבים, תורמים, מפקידים
**סיבה**: מניעת מחיקה בטעות, קשרים לנתונים פיננסיים

**מימוש**:
- שדה `is_deleted: boolean`
- בדיקה לפני מחיקה: האם יש רשומות פיננסיות פעילות?
- אם יש - חסימת המחיקה + הודעת שגיאה
- אם אין - soft delete
- מסמכים מצורפים: soft delete

**ישויות שצריכות תיקון**:
- ❌ borrowers - כרגע hard delete (אבל יש בדיקת הגנה)
- ❌ guarantors - כרגע hard delete
- ❌ donors - כרגע hard delete
- ❌ depositors - כרגע hard delete

### 3. ישויות מטא-נתונים - Hard Delete מותר
**ישויות**: רשימה שחורה, תור המתנה, הוצאות, אנשי קשר
**סיבה**: לא פיננסיים, פחות קריטיים לאודיט

**מימוש**:
- מחיקה פיזית עם `removeItem()`
- מסמכים מצורפים: hard delete

**ישויות שממומשות נכון**:
- ✅ blacklist
- ✅ waitlist
- ✅ expenses
- ✅ contacts

### 4. מסמכים מצורפים - עוקבים אחרי הישות ההורה
- אם הישות ההורה soft delete → attachments גם soft delete
- אם הישות ההורה hard delete → attachments גם hard delete
- **קבצים פיזיים**: נשארים על הדיסק (לא נמחקים) גם ב-hard delete

## טבלת סיכום

| ישות | מדיניות נכונה | מצב נוכחי | נדרש תיקון? |
|------|---------------|-----------|-------------|
| loans | Soft Delete | ✅ Soft Delete | **לא - הושלם** |
| repayments | Soft Delete | ✅ Soft Delete | **לא - הושלם** |
| deposits | Soft Delete | ✅ Soft Delete | **לא - הושלם** |
| donations | Soft Delete | ❌ Hard Delete | **כן - נשאר** |
| borrowers | Soft Delete + הגנה | ✅ Soft Delete | **לא - הושלם** ✨ |
| guarantors | Soft Delete + הגנה | ✅ Soft Delete | **לא - הושלם** ✨ |
| donors | Soft Delete + הגנה | ❌ Hard Delete | **כן - נשאר** |
| depositors | Soft Delete + הגנה | ❌ Hard Delete | **כן - נשאר** |
| blacklist | Hard Delete | ✅ Hard Delete | לא |
| waitlist | Hard Delete | ✅ Hard Delete | לא |
| expenses | Hard Delete | ✅ Hard Delete | לא |
| contacts | Hard Delete | ✅ Hard Delete | לא |

✨ = תוקן ב-commit 02b5181

## תוכנית תיקון

### ✅ שלב 1: תיקון borrowers/guarantors (P1) - הושלם!
**Commit**: 02b5181
1. ✅ הוספת `is_deleted`, `deleted_at` לכל interface
2. ✅ שינוי `removeItem()` ל-soft delete
3. ✅ שמירת בדיקות הגנה (borrowers)
4. ✅ עדכון attachments ל-soft delete
5. ✅ עדכון טסטים

### שלב 2: תיקון donations (P1 - נותר)
1. הוספת `is_deleted`, `deleted_at` ל-donation interface
2. שינוי `DELETE FROM donations` ל-soft delete
3. סינון `!d.is_deleted` בכל שאילתות donations
4. עדכון attachments ל-soft delete

### שלב 3: תיקון donors/depositors (P1 - נותר)
1. הוספת `is_deleted`, `deleted_at` לכל interface
2. שינוי `removeItem()` ל-soft delete
3. הוספת בדיקות הגנה לכל מחיקה
4. עדכון attachments ל-soft delete

### שלב 4: בדיקות (P1)
1. טסט לכל ישות: מחיקה → בדיקת is_deleted
2. טסט attachments: בדיקת soft delete
3. טסט הגנות: ניסיון מחיקה עם נתונים פעילים

## הערות למימוש

### Schema Migration
כאשר מוסיפים `is_deleted` לישות קיימת:
```typescript
// ב-migrations.ts
for (const item of items) {
  if (item.is_deleted === undefined) {
    item.is_deleted = false
  }
}
```

### פונקציית עזר לשאילתות
```typescript
function filterNotDeleted<T extends { is_deleted?: boolean }>(items: T[]): T[] {
  return items.filter(item => !item.is_deleted)
}
```

### בדיקת הגנה לפני מחיקה
```typescript
async function canDeleteBorrower(id: string): Promise<{ allowed: boolean; reason?: string }> {
  const loans = await loansService.getAll()
  const activeLoans = loans.filter(l => 
    !l.is_deleted && 
    l.borrower_id === id && 
    l.status === 'active'
  )
  
  if (activeLoans.length > 0) {
    return { 
      allowed: false, 
      reason: `ללווה יש ${activeLoans.length} הלוואות פעילות` 
    }
  }
  
  return { allowed: true }
}
```

## תועלת מהתיקון
1. ✅ **Audit trail מלא** - כל פעולה ניתנת למעקב
2. ✅ **שחזור נתונים** - אפשר לבטל מחיקות
3. ✅ **דוחות מדויקים** - חישובים היסטוריים נכונים
4. ✅ **בטיחות** - מניעת מחיקות בטעות
5. ✅ **עקביות** - מדיניות אחידה בכל המערכת
