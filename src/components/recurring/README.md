# Recurring Items Management Components

רכיבי UI לניהול פריטים מחזוריים (הלוואות, פירעונות והפקדות).

## רכיבים

### EditRecurringDialog

חלון עריכה לפרמטרים מחזוריים.

**Props:**
- `open: boolean` - האם החלון פתוח
- `onClose: () => void` - פונקציה לסגירת החלון
- `itemType: 'loan' | 'repayment' | 'deposit'` - סוג הפריט
- `itemId: number` - מזהה הפריט
- `onSuccess: () => void` - פונקציה שתקרא אחרי עדכון מוצלח

**שימוש:**
```tsx
<EditRecurringDialog
  open={editDialogOpen}
  onClose={() => setEditDialogOpen(false)}
  itemType="loan"
  itemId={loanId}
  onSuccess={() => {
    console.log('Updated successfully')
    loadLoans()
  }}
/>
```

**תכונות:**
- עריכת יום גבייה (1-31)
- עריכת סכום
- עריכת מספר חודשים נותרים (הלוואות/הפקדות)
- ולידציה בזמן אמת
- הצגת חלון אישור לפני עדכון
- תמיכה ב-RTL

### ConfirmUpdateDialog

חלון אישור המציג סיכום של השינויים שיבוצעו.

**Props:**
- `open: boolean` - האם החלון פתוח
- `onClose: () => void` - פונקציה לסגירת החלון
- `onConfirm: () => void` - פונקציה לאישור העדכון
- `changes: UpdateSummary` - סיכום השינויים
- `loading?: boolean` - האם בתהליך עדכון

**תכונות:**
- הצגת מספר הפריטים שיעודכנו (קיימים + עתידיים)
- הצגת השינויים המדויקים (שדה, ערך ישן, ערך חדש)
- אזהרה ויזואלית
- כפתורי אישור וביטול

### RecurringHistoryDialog

חלון המציג את ההיסטוריה המלאה של כל הפריטים בסדרה.

**Props:**
- `open: boolean` - האם החלון פתוח
- `onClose: () => void` - פונקציה לסגירת החלון
- `itemType: 'loan' | 'repayment' | 'deposit'` - סוג הפריט
- `itemId: number` - מזהה הפריט

**תכונות:**
- טבלה ממוינת לפי מספר בסדרה
- הצגת מספר, תאריך, סכום, מצב לכל פריט
- סימון ויזואלי של פריטים עבר/עתיד
- הצגת סה"כ פריטים בסדרה
- תמיכה בגלילה

## אינטגרציה

### הוספה לטבלאות קיימות

#### LoansTab
```tsx
// הוסף imports
import { EditRecurringDialog } from '../recurring/EditRecurringDialog'
import { RecurringHistoryDialog } from '../recurring/RecurringHistoryDialog'
import { EditNote as EditNoteIcon, History as HistoryIcon } from '@mui/icons-material'

// הוסף state
const [editRecurringDialogOpen, setEditRecurringDialogOpen] = useState(false)
const [recurringHistoryDialogOpen, setRecurringHistoryDialogOpen] = useState(false)
const [selectedRecurringLoanId, setSelectedRecurringLoanId] = useState<number | null>(null)

// הוסף כפתורים בטבלה (רק להלוואה מקורית - recurring_loan_number === 1)
{loan.is_recurring === 1 && loan.recurring_loan_number === 1 && (
  <>
    <IconButton 
      size="small" 
      color="primary" 
      onClick={(e) => { 
        e.stopPropagation(); 
        setSelectedRecurringLoanId(loan.id!);
        setEditRecurringDialogOpen(true);
      }} 
      title="ערוך הלוואה מחזורית"
    >
      <EditNoteIcon fontSize="small" />
    </IconButton>
    <IconButton 
      size="small" 
      color="info" 
      onClick={(e) => { 
        e.stopPropagation(); 
        setSelectedRecurringLoanId(loan.id!);
        setRecurringHistoryDialogOpen(true);
      }} 
      title="היסטוריית הלוואות מחזוריות"
    >
      <HistoryIcon fontSize="small" />
    </IconButton>
  </>
)}

// הוסף דיאלוגים בסוף הקומפוננטה
{selectedRecurringLoanId && (
  <EditRecurringDialog
    open={editRecurringDialogOpen}
    onClose={() => setEditRecurringDialogOpen(false)}
    itemType="loan"
    itemId={selectedRecurringLoanId}
    onSuccess={() => {
      setSnackbar({ open: true, message: 'הלוואה מחזורית עודכנה בהצלחה', severity: 'success' })
      loadBorrowerLoans()
    }}
  />
)}

{selectedRecurringLoanId && (
  <RecurringHistoryDialog
    open={recurringHistoryDialogOpen}
    onClose={() => setRecurringHistoryDialogOpen(false)}
    itemType="loan"
    itemId={selectedRecurringLoanId}
  />
)}
```

#### DepositsTab
אותו תהליך, רק עם `itemType="deposit"` ו-`selectedRecurringDepositId`.

## תרגומים

כל הטקסטים מתורגמים דרך `i18n`. המפתחות נמצאים ב-`src/i18n/locales/he.json` תחת `recurring`:

```json
{
  "recurring": {
    "editTitle": "עריכת פריט מחזורי",
    "historyTitle": "היסטוריית {{type}}",
    "confirmTitle": "אישור עדכון",
    "dayOfMonth": "יום בחודש",
    "amount": "סכום",
    "monthsRemaining": "חודשים נותרים",
    ...
  }
}
```

## שירות Backend

הרכיבים משתמשים ב-`recurringItemsService` מ-`src/services/recurringItemsService.ts`:

- `getSeriesItems()` - קבלת כל הפריטים בסדרה
- `updateSeriesItems()` - עדכון כל הפריטים בסדרה
- `validateRecurringUpdate()` - ולידציה של שינויים
- `canEditRecurringItem()` - בדיקת הרשאות
- `getUpdateSummary()` - קבלת סיכום שינויים

## הערות חשובות

1. **רק הפריט המקורי ניתן לעריכה** - רק פריטים עם `recurring_loan_number === 1` (או `recurring_deposit_number === 1`) מציגים את כפתורי העריכה וההיסטוריה.

2. **עדכון כל הסדרה** - כאשר משנים פרמטרים, השינויים חלים על **כל הפריטים בסדרה** - גם אלו שכבר נוצרו וגם אלו שעתידים להיווצר.

3. **שמירת invariants** - תאריכים ומספרים סידוריים לא משתנים, רק `amount`, `recurring_day` ו-`recurring_months`.

4. **אינטגרציה עם Scheduler** - ה-Scheduler קורא את הפרמטרים המעודכנים מהפריט האחרון בסדרה ליצירת פריטים עתידיים.

## בדיקות

הרכיבים נבדקו עם:
- Unit tests ב-`src/__tests__/recurringItemsService.test.ts`
- 20 טסטים כולל Property-Based Tests
- כל הטסטים עוברים בהצלחה ✅
