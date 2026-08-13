# תיקון בעיית הלוואות יתומות

## תיאור הבעיה המקורית
הסכום בכרטיס "הלוואות פעילות" בדף הבית לא תאם לסכום בשורת הסיכום של טבלת "לווים פעילים".

## שורש הבעיה
- **borrowersService.delete()** מחק לווים ללא בדיקה אם יש להם הלוואות פעילות
- התוצאה: הלוואות "יתומות" - הלוואות עם borrower_id שמצביע ללווה שכבר לא קיים
- **statsService.getDashboardStats()** סכם את כל ההלוואות הפעילות (כולל יתומות)
- **statsService.getActiveBorrowers()** סינן רק לווים קיימים (בלי יתומות)
- **fetchActiveLoans()** ב-Dashboard לא סינן לפי תאריך ולא לפי לווים קיימים
- לכן נוצר הפרש בין החישובים השונים

## התיקון - שני שלבים

### שלב 1: מניעת הבעיה בעתיד

#### תיקון 1: חסימת מחיקת לווה עם הלוואה פעילה
**קובץ**: `src/services/database.ts`
**פונקציה**: `borrowersService.delete()`

```typescript
async delete(id: string): Promise<void> { 
  // בדיקה: האם ללווה יש הלוואה פעילה עם יתרה?
  const loans = getAllItems<Loan>('loans').filter(l => !l.is_deleted && l.borrower_id === id)
  const hasActiveLoan = loans.some(l => {
    if (l.status !== 'active') return false
    // חישוב remaining ישירות מהפירעונות
    const repayments = getAllItems<Repayment>('repayments').filter(r => r.loan_id === l.id && !r.is_deleted)
    const totalRepaid = repayments.reduce((s, r) => s + r.amount, 0)
    const remaining = l.amount - totalRepaid
    return remaining > 0
  })
  
  if (hasActiveLoan) {
    throw new Error('לא ניתן למחוק לווה עם הלוואה פעילה. יש לסגור או להעביר את ההלוואה תחילה.')
  }
  
  // ... שאר הקוד
}
```

#### תיקון 2: טיפול בשגיאה ב-UI
**קבצים**: 
- `src/components/loans/BorrowersTab.tsx`
- `src/components/loans/BorrowerForm.tsx`

```typescript
try {
  await borrowersService.delete(borrower.id)
  setSnackbar({ open: true, message: 'הלווה נמחק', severity: 'success' })
  // ...
} catch (error) {
  console.error('Error deleting borrower:', error)
  const errorMessage = error instanceof Error ? error.message : 'שגיאה במחיקה'
  setSnackbar({ open: true, message: errorMessage, severity: 'error' })
}
```

### שלב 2: תיקון החישוב הקיים

#### תיקון 3: סינון הלוואות יתומות בחישוב הדשבורד
**קובץ**: `src/services/database.ts`
**פונקציה**: `statsService.getDashboardStats()`

```typescript
async getDashboardStats() {
  const loans = await loansService.getAll()
  const t = new Date().toISOString().split('T')[0]
  
  // רשימת מזהי לווים קיימים בפועל - כדי לסנן הלוואות "יתומות"
  const borrowers = await borrowersService.getAll()
  const existingBorrowerIds = new Set(borrowers.map(b => b.id))
  
  // הלוואות פעילות - רק ללווים קיימים
  const activeWithBalance = loans.filter(l => 
    l.status === 'active' && 
    l.loan_date <= t &&
    (l.remaining || 0) > 0 &&
    existingBorrowerIds.has(l.borrower_id)  // <-- השורה החדשה
  )
  
  // ... שאר הקוד
}
```

#### תיקון 4: סינון באותו אופן ב-Dashboard.tsx
**קובץ**: `src/pages/Dashboard.tsx`
**פונקציות**: `fetchActiveLoans()` ו-`fetchScheduledLoans()`

```typescript
const fetchActiveLoans = async () => {
  setDialogLoading(true)
  try {
    const allLoans = await loansService.getAll() as any[]
    const borrowers = await borrowersService.getAll()
    const existingBorrowerIds = new Set(borrowers.map(b => b.id))
    const t = new Date().toISOString().split('T')[0]
    
    const active = allLoans
      .filter(l => 
        l.status === 'active' && 
        l.loan_date <= t &&
        (l.remaining || 0) > 0 &&
        existingBorrowerIds.has(l.borrower_id)  // <-- השורה החדשה
      )
      .sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
    
    setActiveLoans(active)
  } finally {
    setDialogLoading(false)
  }
}

const fetchScheduledLoans = async () => {
  setDialogLoading(true)
  try {
    const allLoans = await loansService.getAll() as any[]
    const borrowers = await borrowersService.getAll()
    const existingBorrowerIds = new Set(borrowers.map(b => b.id))
    
    const scheduled = allLoans
      .filter(l => 
        l.status === 'planned' &&
        existingBorrowerIds.has(l.borrower_id)  // <-- השורה החדשה
      )
      .sort((a, b) => new Date(a.loan_date).getTime() - new Date(b.loan_date).getTime())
    setScheduledLoans(scheduled)
  } finally {
    setDialogLoading(false)
  }
}
```

#### תיקון 5: פונקציה לאיתור הלוואות יתומות
**קובץ**: `src/services/database.ts`
**פונקציה חדשה**: `statsService.findOrphanedLoans()`

```typescript
async findOrphanedLoans() {
  const loans = await loansService.getAll()
  const borrowers = await borrowersService.getAll()
  const existingIds = new Set(borrowers.map(b => b.id))
  
  const orphaned = loans.filter(l =>
    l.status === 'active' &&
    (l.remaining || 0) > 0 &&
    !existingIds.has(l.borrower_id)
  )
  
  const totalAmount = orphaned.reduce((s, l) => s + (l.remaining || 0), 0)
  
  console.log('🔍 הלוואות יתומות נמצאו:', orphaned.length)
  console.log('💰 סכום כולל:', totalAmount)
  
  return {
    count: orphaned.length,
    totalAmount,
    loans: orphaned
  }
}
```

#### תיקון 5: כפתור ודיאלוג לאיתור הלוואות יתומות
**קובץ**: `src/pages/AdvancedTools.tsx`

**הוספת state**:
```typescript
const [orphanedLoansDialogOpen, setOrphanedLoansDialogOpen] = useState(false)
const [orphanedLoansData, setOrphanedLoansData] = useState<{ count: number; totalAmount: number; loans: any[] } | null>(null)
```

**הוספת פונקציה**:
```typescript
const handleShowOrphanedLoans = async () => {
  try {
    const result = await statsService.findOrphanedLoans()
    setOrphanedLoansData(result)
    setOrphanedLoansDialogOpen(true)
    
    if (result.count > 0) {
      setSnackbar({ 
        open: true, 
        message: `נמצאו ${result.count} הלוואות יתומות בסך ${formatCurrency(result.totalAmount)}`, 
        severity: 'warning' 
      })
    }
  } catch (error) {
    console.error('Error finding orphaned loans:', error)
    setSnackbar({ open: true, message: 'שגיאה באיתור הלוואות יתומות', severity: 'error' })
  }
}
```

**הוספת כפתור בחלק הדוחות**:
```tsx
<Button variant="outlined" startIcon={<WarningIcon />} onClick={handleShowOrphanedLoans} color="warning">
  איתור הלוואות יתומות
</Button>
```

**הוספת דיאלוג** שמציג:
- מספר הלוואות יתומות
- סכום כולל
- טבלה עם פרטי כל הלוואה יתומה
- אפשרויות טיפול מומלצות

## תוצאה

### עכשיו:
1. ✅ **לא ניתן למחוק לווה עם הלוואה פעילה** - המערכת חוסמת ומציגה הודעת שגיאה ברורה
2. ✅ **החישובים תואמים** - גם הכרטיס וגם הטבלה משתמשים באותה לוגיקה (רק לווים קיימים)
3. ✅ **ניתן לזהות הלוואות יתומות קיימות** - דרך כפתור בדף "כלים מתקדמים"
4. ✅ **הנתונים שמורים** - לא מחקנו שום הלוואה יתומה, רק זיהינו אותן לטיפול ידני

## איך להשתמש בתיקון

### בדיקת מצב נוכחי
1. עבור לדף "כלים מתקדמים"
2. לחץ על "איתור הלוואות יתומות"
3. תראה אם קיימות הלוואות כאלו במערכת

### אם נמצאו הלוואות יתומות
אפשרויות טיפול:
- **שחזור מגיבוי**: אם יש גיבוי, שחזר את רשומת הלווה
- **שיוך מחדש**: אם אתה יודע מי הלווה, שייך את ההלוואה למזהה החדש שלו
- **יצירת רשומה חדשה**: צור לווה חדש עם הפרטים הנכונים ושייך אליו את ההלוואה
- **סגירת הלוואה**: אם ההלוואה שולמה בפועל, סמן אותה כנפרעה

⚠️ **חשוב**: אל תמחק הלוואות יתומות מבלי לתעד - הן מייצגות כסף אמיתי שיצא מהגמ"ח!

## קבצים שהשתנו
1. ✅ `src/services/database.ts` - 3 שינויים
   - חסימה ב-borrowersService.delete()
   - סינון ב-getDashboardStats()
   - פונקציה חדשה findOrphanedLoans()

2. ✅ `src/components/loans/BorrowersTab.tsx` - טיפול בשגיאה
3. ✅ `src/components/loans/BorrowerForm.tsx` - טיפול בשגיאה
4. ✅ `src/pages/AdvancedTools.tsx` - כפתור ודיאלוג חדשים

## בדיקות שכדאי לעשות
1. ✅ בנייה עברה בהצלחה
2. 🔄 נסה למחוק לווה עם הלוואה פעילה - צריך להיחסם
3. 🔄 בדוק שהסכומים בדף הבית תואמים
4. 🔄 הרץ "איתור הלוואות יתומות" וראה אם יש בעיות קיימות
