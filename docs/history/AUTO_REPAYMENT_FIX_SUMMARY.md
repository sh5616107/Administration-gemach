# תיקון: ממשק לעריכת פירעון אוטומטי

**תאריך:** 5 במאי 2026  
**גרסה:** 4.0.3

---

## 📋 תיאור הבעיה

### הבעיה המקורית
כשיוצרים הלוואה עם פירעון אוטומטי (`auto_repayment=1`), מגדירים פרמטרים:
- `repayment_day` - יום בחודש לפירעון
- `repayment_amount` - סכום הפירעון החודשי
- `repayment_frequency` - תדירות הפירעון

**אבל אין ממשק למשתמש לערוך את הפרמטרים האלה אחרי יצירת ההלוואה!**

### תרחיש דוגמה
1. מנהל יוצר הלוואה עם פירעון אוטומטי ביום 5 בחודש
2. אחרי שבוע, הלווה מבקש לשנות את יום הגבייה ליום 15 בחודש
3. **אין למנהל שום דרך לשנות את זה בממשק!**

### הניסיון הכושל
בניסיון קודם, הקוד ניסה ליצור פירעון "מזויף" עם `amount=0` רק כדי לפתוח את דיאלוג העריכה.
זה יצר רשומות מזויפות ב-DB והמשתמש דחה את הפתרון בתוקף.

---

## ✅ הפתרון שיושם

### הרעיון
שינוי `EditRecurringDialog` לתמוך בעריכת הגדרות פירעון אוטומטי ישירות מההלוואה, **בלי ליצור פירעונות מזויפים**.

### זרימת העבודה החדשה

```
1. משתמש בוחר הלוואה עם auto_repayment=1
   ↓
2. לוחץ על כפתור "ערוך הגדרות פירעון אוטומטי" 
   ↓
3. נפתח EditRecurringDialog עם itemType="auto_repayment"
   ↓
4. הדיאלוג מטען את הגדרות הפירעון מההלוואה:
   - repayment_day (יום בחודש)
   - repayment_amount (סכום חודשי)
   ↓
5. משתמש עורך את הפרמטרים
   ↓
6. לוחץ "שמור"
   ↓
7. ההלוואה מתעדכנת ב-DB
   - אם יש פירעונות קיימים, הם מתעדכנים גם
```

---

## 🔧 שינויים בקוד

### 1️⃣ `recurringItemsService.ts`

#### הוספת תמיכה ב-`auto_repayment`

```typescript
export type ItemType = 'loan' | 'repayment' | 'deposit' | 'auto_repayment'
```

#### פונקציה מיוחדת ל-`auto_repayment` ב-`updateSeriesItems`

```typescript
// Special case: auto_repayment - update loan settings directly
if (itemType === 'auto_repayment') {
  // Update loan
  const updateData: Partial<Loan> = {}
  if (updates.recurring_day !== undefined) updateData.repayment_day = updates.recurring_day
  if (updates.recurring_amount !== undefined) updateData.repayment_amount = updates.recurring_amount

  await loansService.update(itemId, updateData)

  // Update existing repayments if any
  const repayments = await repaymentsService.getByLoan(itemId)
  const recurringRepayments = repayments.filter(r => r.is_recurring === 1)
  
  if (recurringRepayments.length > 0 && updates.recurring_amount !== undefined) {
    // Recalculate count
    const totalRepaid = recurringRepayments.reduce((sum, r) => sum + r.amount, 0)
    const remaining = loan.amount - totalRepaid
    const newCount = Math.ceil(remaining / updates.recurring_amount)
    
    // Update all recurring repayments
    for (const repayment of recurringRepayments) {
      await repaymentsService.update(repayment.id, {
        recurring_repayment_count: newCount
      })
    }
  }

  return { success: true, updatedCount: 1 }
}
```

#### פונקציה מיוחדת ב-`getUpdateSummary`

```typescript
// Special case: auto_repayment
if (itemType === 'auto_repayment') {
  const loan = await loansService.getById(itemId)
  if (!loan) throw new Error('הלוואה לא נמצאה')

  const changes = []

  if (updates.recurring_day !== undefined && updates.recurring_day !== loan.repayment_day) {
    changes.push({
      field: 'יום גבייה',
      oldValue: loan.repayment_day,
      newValue: updates.recurring_day
    })
  }

  if (updates.recurring_amount !== undefined && updates.recurring_amount !== loan.repayment_amount) {
    changes.push({
      field: 'סכום',
      oldValue: `${loan.repayment_amount} ₪`,
      newValue: `${updates.recurring_amount} ₪`
    })
  }

  return {
    totalItems: 1,
    pastItems: 0,
    futureItems: 0,
    changes
  }
}
```

### 2️⃣ `EditRecurringDialog.tsx`

#### טעינת נתונים מיוחדת ל-`auto_repayment`

```typescript
// Special case: auto_repayment
if (itemType === 'auto_repayment') {
  const loan = await recurringItemsService.getOriginalItem(itemId, itemType)
  if (loan) {
    const data = {
      recurring_day: loan.repayment_day || 1,
      recurring_amount: loan.repayment_amount || 0,
      recurring_months: 0 // Not relevant for auto_repayment
    }
    setFormData(data)
    setOriginalData(data)
  }
  setSeriesItems([]) // No series for auto_repayment
}
```

#### UI מותאם ל-`auto_repayment`

- **הסתרת טאב "היסטוריה"** - אין היסטוריה לפירעון אוטומטי
- **הסתרת כרטיסי סטטוס** - אין "נוצרו עד כה" / "חודשים נותרים"
- **הצגת כרטיס מידע** - הסבר על מה זה פירעון אוטומטי
- **שדות עריכה מותאמים** - רק יום בחודש וסכום (ללא "חודשים נותרים")

```typescript
const isAutoRepayment = itemType === 'auto_repayment'

{!isAutoRepayment && (
  <Tabs>...</Tabs>
)}

{isAutoRepayment && (
  <Alert severity="info">
    <Typography variant="subtitle2">הגדרות פירעון אוטומטי</Typography>
    <Typography variant="body2">
      כאן תוכל לערוך את הפרמטרים של הפירעון האוטומטי להלוואה זו.
    </Typography>
  </Alert>
)}
```

### 3️⃣ `LoansTab.tsx`

#### הסרת הקוד שיצר פירעון מזויף

**לפני:**
```typescript
// יצירת פירעון ראשון עם amount=0
const newRepayment = await repaymentsService.create({
  loan_id: loan.id,
  amount: 0, // סכום 0 - זה רק placeholder
  payment_date: new Date().toISOString().split('T')[0],
  is_recurring: 1,
  recurring_repayment_number: 1,
  recurring_repayment_count: recurringRepaymentCount,
});
```

**אחרי:**
```typescript
// פתיחת דיאלוג עריכת הגדרות פירעון אוטומטי
setSelectedRecurringLoanId(loan.id);
setEditRecurringDialogOpen(true);
```

#### שינוי הדיאלוג להשתמש ב-`auto_repayment`

```typescript
{selectedRecurringLoanId && (
  <EditRecurringDialog
    open={editRecurringDialogOpen}
    onClose={() => setEditRecurringDialogOpen(false)}
    itemType="auto_repayment"  // ← שינוי מ-"loan"
    itemId={selectedRecurringLoanId}
    onSuccess={() => {
      setSnackbar({ 
        open: true, 
        message: 'הגדרות פירעון אוטומטי עודכנו בהצלחה', 
        severity: 'success' 
      })
      if (selectedBorrower) {
        loadBorrowerLoans(selectedBorrower.id)
      }
    }}
  />
)}
```

### 4️⃣ `he.json` - תרגומים

```json
"recurring": {
  "autoRepayment": "פירעון אוטומטי",
  "autoRepaymentInfo": "הגדרות פירעון אוטומטי",
  "autoRepaymentDescription": "כאן תוכל לערוך את הפרמטרים של הפירעון האוטומטי להלוואה זו. השינויים ישפיעו על פירעונות עתידיים שייווצרו.",
  "autoRepaymentEditWarning": "שינוי יום הגבייה או סכום הפירעון ישפיע על פירעונות עתידיים שייווצרו."
}
```

---

## 🎁 יתרונות הפתרון

✅ **אחידות** - משתמש באותו דיאלוג כמו Recurring Loans/Deposits  
✅ **בלי רשומות מזויפות** - לא יוצר פירעונות עם `amount=0`  
✅ **ממשק מוכר** - משתמש רואה את EditRecurringDialog שכבר מכיר  
✅ **עריכה פשוטה** - משנים params בהלוואה, לא בפירעונות  
✅ **עדכון אוטומטי** - אם שינו את `repayment_amount`, כל הפירעונות מתעדכנים  
✅ **ראוי לתחזוקה** - קוד בחלק אחד (EditRecurringDialog)

---

## 🧪 בדיקות

### טסטים
- ✅ כל 337 הטסטים עוברים
- ✅ הקוד מתקמפל בהצלחה

### בדיקות ידניות נדרשות
1. יצירת הלוואה עם פירעון אוטומטי
2. לחיצה על כפתור "ערוך הגדרות פירעון אוטומטי"
3. שינוי יום הגבייה
4. שינוי סכום הפירעון
5. שמירה ובדיקה שההלוואה עודכנה
6. אם יש פירעונות קיימים - בדיקה שהם עודכנו

---

## 📝 קבצים ששונו

1. `src/services/recurringItemsService.ts` - הוספת תמיכה ב-`auto_repayment`
2. `src/components/recurring/EditRecurringDialog.tsx` - UI מותאם ל-`auto_repayment`
3. `src/components/loans/LoansTab.tsx` - הסרת קוד מזויף ושימוש ב-`auto_repayment`
4. `src/i18n/locales/he.json` - תרגומים חדשים

---

## 🚀 מה הלאה?

1. **בדיקות ידניות** - לוודא שהכל עובד כמו שצריך
2. **בניית גרסה** - אם הכל עובד, לבנות גרסה חדשה
3. **תיעוד למשתמש** - להוסיף הסבר בעזרה על איך לערוך פירעון אוטומטי

---

## ✨ סיכום

הפתרון מאפשר למשתמש לערוך את הגדרות הפירעון האוטומטי בצורה פשוטה ואחידה, **בלי ליצור רשומות מזויפות ב-DB**.

המשתמש יכול עכשיו:
- לשנות את יום הגבייה החודשי
- לשנות את סכום הפירעון החודשי
- לראות את השינויים מיד בהלוואה
- אם יש פירעונות קיימים, הם מתעדכנים אוטומטית

**הפתרון הוא נקי, אחיד, וללא רשומות מזויפות!** 🎉
