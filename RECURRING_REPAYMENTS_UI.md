# הוספת כפתור עריכה לפירעונות מחזוריים

## תיאור השינוי
הוספנו כפתור ♻️ לניהול פירעונות מחזוריים בטבלת הפירעונות, בדומה לכפתור שכבר קיים להלוואות והפקדות מחזוריות.

## תאריך
5 במאי 2026

## שינויים שבוצעו

### 1. הוספת State Management
**קובץ**: `src/components/loans/LoansTab.tsx`

הוספנו שני states חדשים לניהול דיאלוג עריכת פירעונות מחזוריים:

```typescript
const [editRecurringRepaymentDialogOpen, setEditRecurringRepaymentDialogOpen] = useState(false)
const [selectedRecurringRepaymentId, setSelectedRecurringRepaymentId] = useState<number | null>(null)
```

### 2. הוספת כפתור ♻️ בטבלת הפירעונות
**קובץ**: `src/components/loans/LoansTab.tsx` (שורה ~1745)

הוספנו כפתור ניהול פירעון מחזורי שמופיע רק לפירעון מקורי:

```typescript
{repayment.is_recurring === 1 && repayment.recurring_repayment_number === 1 && (
  <IconButton 
    size="small" 
    color="primary" 
    onClick={() => { 
      setSelectedRecurringRepaymentId(repayment.id);
      setEditRecurringRepaymentDialogOpen(true);
    }} 
    title="נהל פירעון מחזורי"
  >
    <AutorenewIcon fontSize="small" />
  </IconButton>
)}
```

### 3. הוספת דיאלוג עריכה
**קובץ**: `src/components/loans/LoansTab.tsx` (שורה ~1930)

הוספנו דיאלוג `EditRecurringDialog` לפירעונות מחזוריים:

```typescript
{/* Edit Recurring Repayment Dialog */}
{selectedRecurringRepaymentId && (
  <EditRecurringDialog
    open={editRecurringRepaymentDialogOpen}
    onClose={() => setEditRecurringRepaymentDialogOpen(false)}
    itemType="repayment"
    itemId={selectedRecurringRepaymentId}
    onSuccess={() => {
      setSnackbar({ open: true, message: 'פירעון מחזורי עודכן בהצלחה', severity: 'success' })
      if (selectedLoan) {
        loadRepayments(selectedLoan.id!)
      }
    }}
  />
)}
```

## תכונות

### כפתור ♻️ מופיע רק כאשר:
1. הפירעון הוא מחזורי (`is_recurring === 1`)
2. הפירעון הוא המקורי בסדרה (`recurring_repayment_number === 1`)

### הדיאלוג מאפשר:
1. צפייה בסטטוס הסדרה (כמה נוצרו, כמה נותרו)
2. עריכת פרמטרים:
   - סכום הפירעון (`amount`)
   - יום חוזר (`recurring_day`) - אם רלוונטי
3. צפייה בהיסטוריה של כל הפירעונות בסדרה
4. עדכון כל הפירעונות בסדרה (גם קיימים וגם עתידיים)

## אינטגרציה עם רכיבים קיימים

### רכיב `EditRecurringDialog`
הרכיב כבר תומך בשלושה סוגי פריטים:
- `loan` - הלוואות
- `deposit` - הפקדות
- `repayment` - פירעונות ✅

### שירות `recurringItemsService`
השירות כבר תומך בפירעונות מחזוריים:
- `getSeriesItems()` - זיהוי כל הפירעונות בסדרה
- `updateSeriesItems()` - עדכון כל הפירעונות בסדרה
- `canEditRecurringItem()` - בדיקת הרשאות (רק פירעון מקורי)
- `getUpdateSummary()` - סיכום שינויים

## בדיקות
✅ כל 337 הטסטים עוברים בהצלחה

## חוויית משתמש

### לפני השינוי:
- משתמש לא יכול היה לערוך פירעונות מחזוריים
- לא היה ממשק לניהול סדרת פירעונות

### אחרי השינוי:
- כפתור ♻️ ברור ונגיש בטבלת הפירעונות
- ממשק אחיד לניהול כל סוגי הפריטים המחזוריים
- אפשרות לעדכן את כל הפירעונות בסדרה בלחיצה אחת

## קבצים שהשתנו
1. `src/components/loans/LoansTab.tsx` - הוספת כפתור ודיאלוג

## קבצים קיימים שנעשה בהם שימוש
1. `src/components/recurring/EditRecurringDialog.tsx` - רכיב משותף
2. `src/services/recurringItemsService.ts` - שירות משותף
3. `src/i18n/locales/he.json` - תרגומים קיימים

## הערות
- השינוי עקבי עם הדפוס הקיים של הלוואות והפקדות מחזוריות
- לא נדרשו שינויים בשירות או ברכיב הדיאלוג - הם כבר תמכו בפירעונות
- הכפתור מופיע רק לפירעון מקורי כדי למנוע בלבול
