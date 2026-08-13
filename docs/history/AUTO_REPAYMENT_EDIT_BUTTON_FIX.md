# תיקון: כפתור עריכת פירעון אוטומטי - הצגה רק כשרלוונטי

## תאריך: 6 במאי 2026

## הבעיה המקורית

כפתור העריכה של פירעון אוטומטי היה מופיע בכל הלוואה שיש לה פירעון אוטומטי, גם אם הפירעון כבר עבר ואין טעם לערוך אותו.

### דוגמה לבעיה:
- הלוואה עם פירעון אוטומטי כל 17 לחודש
- היום 20 לחודש
- הפירעון כבר עבר (או לא התבצע)
- **אין טעם להציג כפתור עריכה** כי שינוי ההגדרות לא ישפיע על העבר

## הפתרון

שינינו את הלוגיקה כך שכפתור העריכה מופיע רק במקרים הבאים:

### 1. כשאין עדיין פירעונות
- ההלוואה מוגדרת עם `auto_repayment=1`
- אבל עדיין לא נוצר אף פירעון
- **כפתור העריכה מופיע** ✅

### 2. כשיש פירעון ראשון והוא עתידי
- יש פירעון ראשון (`recurring_repayment_number=1`)
- תאריך הפירעון הוא היום או בעתיד (`payment_date >= today`)
- **כפתור העריכה מופיע** ✅

### 3. כשיש פירעון ראשון והוא עבר
- יש פירעון ראשון (`recurring_repayment_number=1`)
- תאריך הפירעון עבר (`payment_date < today`)
- **כפתור העריכה לא מופיע** ❌

### 4. כשיש פירעון שני או יותר
- יש פירעון שני או יותר (`recurring_repayment_number > 1`)
- הפירעון הראשון כבר עבר
- **כפתור העריכה לא מופיע** ❌

## השינויים שבוצעו

### 1. `src/components/loans/LoansTab.tsx`

שינינו את הלוגיקה של הצגת כפתור העריכה:

```typescript
{/* כפתור עריכה רק אם זה הפירעון הראשון והוא עדיין לא עבר */}
{(() => {
  const firstRepayment = loanRecurringRepayments.get(loan.id)!
  const isFirstRepayment = firstRepayment.recurring_repayment_number === 1
  const repaymentDate = new Date(firstRepayment.payment_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isFutureRepayment = repaymentDate >= today
  
  return isFirstRepayment && isFutureRepayment ? (
    <IconButton 
      size="small" 
      color="primary" 
      onClick={(e) => { 
        e.stopPropagation();
        setSelectedRecurringRepaymentId(firstRepayment.id);
        setEditRecurringRepaymentDialogOpen(true);
      }} 
      title="נהל פירעון מחזורי"
    >
      <EditNoteIcon fontSize="small" />
    </IconButton>
  ) : null
})()}
```

**הלוגיקה:**
1. בודקים אם זה הפירעון הראשון (`recurring_repayment_number === 1`)
2. בודקים אם תאריך הפירעון הוא היום או בעתיד (`payment_date >= today`)
3. רק אם שני התנאים מתקיימים - מציגים את הכפתור

### 2. `src/__tests__/autoRepaymentEditButton.test.ts`

יצרנו 5 טסטים חדשים שבודקים את הלוגיקה:

1. **should show edit button when no repayments exist yet** - כפתור מופיע כשאין פירעונות
2. **should show edit button when first repayment is in the future** - כפתור מופיע כשהפירעון הראשון עתידי
3. **should NOT show edit button when first repayment is in the past** - כפתור לא מופיע כשהפירעון הראשון עבר
4. **should NOT show edit button when second or later repayment exists** - כפתור לא מופיע כשיש פירעון שני
5. **should handle edge case: repayment date is today** - כפתור מופיע כשהפירעון היום (edge case)

## תוצאות הטסטים

✅ **כל 349 הטסטים עוברים** (+ 2 skipped)

כולל 5 הטסטים החדשים:
```
✓ src/__tests__/autoRepaymentEditButton.test.ts (5)
  ✓ Auto Repayment Edit Button Logic (5)
    ✓ should show edit button when no repayments exist yet
    ✓ should show edit button when first repayment is in the future
    ✓ should NOT show edit button when first repayment is in the past
    ✓ should NOT show edit button when second or later repayment exists
    ✓ should handle edge case: repayment date is today
```

## הבהרה: הלוואה מחזורית vs פירעון אוטומטי

### הלוואה מחזורית (Recurring Loan)
- כל חודש נוצרת **הלוואה נפרדת וחדשה**
- אם הגדרת הלוואה מחזורית כל 5 לחודש:
  - ב-5 לינואר: הלוואה 1/27
  - ב-5 לפברואר: הלוואה 2/27
  - וכן הלאה...
- **כל הלוואה היא ישות נפרדת** עם ID משלה

### פירעון אוטומטי (Auto Repayment)
- זה **לא הלוואה נפרדת** - זה רק פירעון מחזורי
- כל חודש נוצר פירעון חדש **לאותה הלוואה**
- אם הלוואה אחת עם פירעון אוטומטי כל 17 לחודש:
  - ב-17 לינואר: פירעון 1/10
  - ב-17 לפברואר: פירעון 2/10
  - וכן הלאה...
- **כל הפירעונות שייכים לאותה הלוואה**

### למה כפתור העריכה מופיע רק בפירעון הראשון?
- אם הפירעון הראשון כבר עבר, אין טעם לערוך את ההגדרות
- שינוי ההגדרות משפיע רק על פירעונות **עתידיים**
- אם הפירעון הראשון עבר, כל הפירעונות הבאים כבר נוצרו עם ההגדרות הישנות

## סיכום

התיקון מבטיח שכפתור העריכה של פירעון אוטומטי יופיע רק כשהוא רלוונטי:
- ✅ כשאין עדיין פירעונות
- ✅ כשהפירעון הראשון עתידי (ניתן לשנות הגדרות)
- ❌ כשהפירעון הראשון עבר (אין טעם לשנות הגדרות)

זה משפר את חוויית המשתמש ומונע בלבול.
