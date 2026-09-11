# סיכום: תכונת שוליים הניתנים להגדרה למסגרת מסמכים

## מטרה
הוספת אפשרות למשתמשים לכייל את השוליים של המסגרת המותאמת אישית במסמכים, עם תצוגה מקדימה חיה.

## שינויים שבוצעו

### 1. מודל נתונים (src/hooks/useSettings.ts)
✅ הוספו 4 שדות חדשים ל-interface Settings:
- `gemach_frame_margin_top: number` (ברירת מחדל: 35)
- `gemach_frame_margin_bottom: number` (ברירת מחדל: 48)
- `gemach_frame_margin_right: number` (ברירת מחדל: 20)
- `gemach_frame_margin_left: number` (ברירת מחדל: 20)

✅ עודכן defaultSettings עם ערכי ברירת המחדל

### 2. שירות מסמכים (src/services/documents.ts)
✅ עודכן DocumentBrandingOptions interface עם 4 שדות השוליים החדשים

✅ עודכנה הפונקציה applyDocumentBranding:
- מקבלת את 4 השוליים כפרמטרים
- משתמשת בערכים דינמיים עם נפילה לברירות מחדל
- חישוב: `padding: ${top}mm ${right}mm ${bottom}mm ${left}mm`

✅ עודכנו כל ה-interfaces והפונקציות הבאות כדי לתמוך ב-4 השדות החדשים:
- LoanDocumentData interface
- generateLoanDocument()
- generateEmptyLoanDocument()
- generateDonationReceipt() + data interface
- generateDepositDocument() + data interface
- generateBorrowerReport() + data interface
- generateDepositorReport() + data interface
- GuarantorStatementData interface
- generateGuarantorStatement()
- createLoanEmailData() + params interface
- createDepositEmailData() + params interface
- createGuarantorDebtEmailData() + params interface

### 3. ממשק משתמש (src/pages/Settings.tsx)
✅ הוספו 4 השדות ל-localSettings state

✅ עודכן useEffect לסנכרון עם settings

✅ עודכן handleSave לשמירת 4 השדות החדשים (המרה ל-String)

✅ נוסף UI חדש עם:
- 4 שדות TextField (number type) בפריסת גריד 2×2
- מוצג רק כאשר יש מסגרת מועלית
- תיוג ברור: שולי עליון/תחתון/ימין/שמאל
- inputProps עם min/max (0-100)

✅ נוספה תצוגה מקדימה חיה:
- div ביחס A4 (300px × 424px)
- רקע: תמונת המסגרת (background-image, background-size: 100% 100%)
- שכבת תוכן פנימית עם padding מחושב יחסית:
  * top: `frameMarginTop * (424/297)` px
  * right: `frameMarginRight * (300/210)` px
  * bottom: `frameMarginBottom * (424/297)` px
  * left: `frameMarginLeft * (300/210)` px
- תוכן placeholder (טקסט + מלבן המדמה טבלה)
- מסגרת מקווקוות (dashed border) המציגה את אזור התוכן
- מתעדכנת מיידית עם שינוי הערכים (ללא צורך בשמירה)

### 4. עדכון קריאות בקבצי הרכיבים
✅ עודכנו כל הקריאות לפונקציות יצירת המסמכים בקבצים הבאים:

**Dashboard.tsx:**
- generateBorrowerReport() - 1 קריאה

**UnifiedLoansPage.tsx:**
- generateLoanDocument() - 1 קריאה
- createLoanEmailData() - 1 קריאה

**LoansTab.tsx:**
- generateLoanDocument() - 2 קריאות
- createLoanEmailData() - 2 קריאות

**Donations.tsx:**
- generateDonationReceipt() - 1 קריאה

**Deposits.tsx:**
- generateDepositorReport() - 1 קריאה

**DepositorsTab.tsx:**
- generateDepositorReport() - 1 קריאה

**DepositorForm.tsx:**
- generateDepositorReport() - 1 קריאה

**GuarantorsTab.tsx:**
- generateGuarantorStatement() - 1 קריאה
- createGuarantorDebtEmailData() - 1 קריאה

**סה"כ: 13 קריאות עודכנו**

כל קריאה מעבירה כעת את 4 השדות:
```typescript
frameMarginTop: settings.gemach_frame_margin_top,
frameMarginBottom: settings.gemach_frame_margin_bottom,
frameMarginRight: settings.gemach_frame_margin_right,
frameMarginLeft: settings.gemach_frame_margin_left,
```

## תאימות לאחור (Backward Compatibility)
✅ ערכי ברירת המחדל (35/48/20/20mm) זהים לערכים הקבועים הקודמים
✅ משתמשים קיימים עם מסגרת לא יראו שינוי פתאומי
✅ הפונקציה applyDocumentBranding משתמשת ב-fallback (`??`) לערכי ברירת מחדל

## בדיקות נדרשות
1. ✅ בדיקת TypeScript - אין שגיאות קומפילציה
2. ⏳ משתמש קיים עם מסגרת + ללא ערכי שוליים → צריך לראות את אותה פריסה כמו קודם
3. ⏳ שינוי ערכי שוליים בתצוגה המקדימה → הפריסה משתנה מיידית
4. ⏳ שמירת הגדרות + הפקת PDF בפועל → הפער בפועל תואם לתצוגה המקדימה
5. ⏳ בדיקת כל 13 נקודות הקריאה - וודא שהמרווחים עובדים נכון

## הערות טכניות
- יחידות מידה: מילימטרים (mm)
- יחס המרה לתצוגה מקדימה: 
  * רוחב: 300px / 210mm ≈ 1.43px/mm
  * גובה: 424px / 297mm ≈ 1.43px/mm
- סדר padding ב-CSS: top, right, bottom, left
- התצוגה המקדימה מתעדכנת בזמן אמת (reactive state)

## קבצים ששונו
1. `src/hooks/useSettings.ts` - הגדרת שדות חדשים
2. `src/services/documents.ts` - לוגיקת מסמכים מעודכנת
3. `src/pages/Settings.tsx` - UI חדש עם תצוגה מקדימה
4. `src/pages/Dashboard.tsx` - עדכון קריאות
5. `src/pages/UnifiedLoansPage.tsx` - עדכון קריאות
6. `src/pages/Donations.tsx` - עדכון קריאות
7. `src/pages/Deposits.tsx` - עדכון קריאות
8. `src/components/loans/LoansTab.tsx` - עדכון קריאות
9. `src/components/loans/GuarantorsTab.tsx` - עדכון קריאות
10. `src/components/donations/DepositorsTab.tsx` - עדכון קריאות
11. `src/components/donations/DepositorForm.tsx` - עדכון קריאות

---
תאריך: 13 אוגוסט 2026
סטטוס: ✅ השלמת קוד הושלמה, נדרשות בדיקות ידניות
