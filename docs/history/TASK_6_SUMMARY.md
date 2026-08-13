# משימה 6: הוספת כפתור עריכה לפירעונות מחזוריים

## סטטוס: ✅ הושלם

## תיאור
המשתמש דיווח: "אני לא רואה את מקום עריכת פירעון מחזורי"

הבעיה הייתה שלא היה כפתור בממשק לניהול פירעונות מחזוריים, בניגוד להלוואות והפקדות מחזוריות שכבר היה להם כפתור ♻️.

## הפתרון
הוספנו כפתור ♻️ לטבלת הפירעונות, בדומה לכפתור שכבר קיים להלוואות והפקדות מחזוריות.

## שינויים שבוצעו

### 1. State Management
**קובץ**: `src/components/loans/LoansTab.tsx`

```typescript
// הוספנו שני states חדשים:
const [editRecurringRepaymentDialogOpen, setEditRecurringRepaymentDialogOpen] = useState(false)
const [selectedRecurringRepaymentId, setSelectedRecurringRepaymentId] = useState<number | null>(null)
```

### 2. כפתור ♻️ בטבלת הפירעונות
**קובץ**: `src/components/loans/LoansTab.tsx` (שורה ~1745)

הוספנו כפתור שמופיע רק לפירעון מקורי (`recurring_repayment_number === 1`):

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

### 3. דיאלוג עריכה
**קובץ**: `src/components/loans/LoansTab.tsx` (שורה ~1930)

הוספנו דיאלוג `EditRecurringDialog` עם `itemType="repayment"`:

```typescript
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

### הכפתור מופיע רק כאשר:
1. ✅ הפירעון הוא מחזורי (`is_recurring === 1`)
2. ✅ הפירעון הוא המקורי בסדרה (`recurring_repayment_number === 1`)

### הדיאלוג מאפשר:
1. ✅ צפייה בסטטוס הסדרה (כמה נוצרו, כמה נותרו)
2. ✅ עריכת פרמטרים (סכום, יום חוזר)
3. ✅ צפייה בהיסטוריה של כל הפירעונות בסדרה
4. ✅ עדכון כל הפירעונות בסדרה (גם קיימים וגם עתידיים)

## אינטגרציה עם רכיבים קיימים

### ✅ רכיב `EditRecurringDialog`
הרכיב כבר תמך בפירעונות - לא נדרשו שינויים

### ✅ שירות `recurringItemsService`
השירות כבר תמך בפירעונות - לא נדרשו שינויים

### ✅ תרגומים
התרגומים כבר היו קיימים ב-`src/i18n/locales/he.json`

## בדיקות
✅ כל 337 הטסטים עוברים בהצלחה
✅ הקוד מתקמפל בהצלחה

## קבצים שהשתנו
1. ✅ `src/components/loans/LoansTab.tsx` - הוספת כפתור ודיאלוג

## קבצים קיימים שנעשה בהם שימוש
1. ✅ `src/components/recurring/EditRecurringDialog.tsx` - רכיב משותף
2. ✅ `src/services/recurringItemsService.ts` - שירות משותף
3. ✅ `src/i18n/locales/he.json` - תרגומים קיימים

## חוויית משתמש

### לפני:
❌ משתמש לא יכול היה לערוך פירעונות מחזוריים
❌ לא היה ממשק לניהול סדרת פירעונות

### אחרי:
✅ כפתור ♻️ ברור ונגיש בטבלת הפירעונות
✅ ממשק אחיד לניהול כל סוגי הפריטים המחזוריים
✅ אפשרות לעדכן את כל הפירעונות בסדרה בלחיצה אחת

## הערות טכניות
- השינוי עקבי עם הדפוס הקיים של הלוואות והפקדות מחזוריות
- לא נדרשו שינויים בשירות או ברכיב הדיאלוג - הם כבר תמכו בפירעונות
- הכפתור מופיע רק לפירעון מקורי כדי למנוע בלבול
- השינוי מינימלי ומדויק - רק 3 שינויים קטנים בקובץ אחד

## מסמכים נוספים
- `RECURRING_REPAYMENTS_UI.md` - תיעוד מפורט של השינויים
