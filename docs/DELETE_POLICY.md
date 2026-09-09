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

## טבלת סיכום - סטטוס סופי ✅

| ישות | מדיניות | סטטוס | Commit |
|------|----------|-------|--------|
| loans | Soft Delete | ✅ הושלם | (כבר היה) |
| repayments | Soft Delete | ✅ הושלם | (כבר היה) |
| deposits | Soft Delete | ✅ הושלם | (כבר היה) |
| donations | Soft Delete | ✅ הושלם | 0b35c79 |
| borrowers | Soft Delete + הגנה | ✅ הושלם | 02b5181 |
| guarantors | Soft Delete + הגנה | ✅ הושלם | 02b5181 |
| donors | Soft Delete + הגנה | ✅ הושלם | 8509ae0 |
| depositors | Soft Delete + הגנה | ✅ הושלם | 8509ae0 |
| blacklist | Hard Delete | ✅ נכון | לא נדרש |
| waitlist | Hard Delete | ✅ נכון | לא נדרש |
| expenses | Hard Delete | ✅ נכון | לא נדרש |
| contacts | Hard Delete | ✅ נכון | לא נדרש |

## 🎉 כל הישויות הפיננסיות עם Soft Delete!

**100% השלמה** - 8/8 ישויות פיננסיות מוגנות עם soft delete

## תוכנית תיקון - הושלם! ✅

### ✅ שלב 1: borrowers/guarantors - הושלם!
**Commit**: 02b5181

### ✅ שלב 2: donations - הושלם!
**Commit**: 0b35c79

### ✅ שלב 3: donors/depositors - הושלם!
**Commit**: 8509ae0

### ✅ שלב 4: בדיקות
**Commit**: 46f2888 (עדכון טסט attachmentCascadeDelete)
- ✅ כל 540 הטסטים עוברים
- ✅ soft delete מאומת לכל הישויות

## 🎉 הושלם במלואו!

כל הישויות הפיננסיות מוגנות עם soft delete, audit trail, ו-attachments מסונכרנים.

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
