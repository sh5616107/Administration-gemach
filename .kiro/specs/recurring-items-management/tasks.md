# תכנית יישום: עריכת פריטים מחזוריים

## סקירה כללית

תכנית זו מפרטת את השלבים ליישום תכונת עריכת פריטים מחזוריים (הלוואות, פירעונות והפקדות). התכונה מאפשרת עריכה של פרמטרים מחזוריים (סכום, יום גבייה, משך) תוך עדכון **כל הפריטים בסדרה** - גם קיימים וגם עתידיים. היישום יבוצע ב-TypeScript עם React ו-Material-UI, תוך שמירה על עקביות עם המבנה הקיים של המערכת.

## משימות

- [ ] 1. הקמת מבנה בסיסי ושירות ניהול פריטים מחזוריים
  - צור קובץ `src/services/recurringItemsService.ts` עם ממשקים בסיסיים
  - הגדר ממשקים: `SeriesItem`, `UpdateResult`, `ValidationResult`, `UpdateSummary`, `EditRecurringFormData`
  - יישם פונקציה `getOriginalItem()` לזיהוי הפריט המקורי בסדרה
  - יישם פונקציה `getTableName()` להחזרת שם הטבלה לפי סוג הפריט
  - יישם פונקציה `getItemNumber()` להחזרת מספר הפריט בסדרה
  - _Requirements: 7.1, 7.2, 7.3, 9.4_

- [ ] 2. יישום זיהוי פריטים בסדרה
  - [ ] 2.1 יישם פונקציה `identifySeriesItems()` לזיהוי פריטים בסדרה
    - זיהוי הלוואות לפי: `borrower_id`, `amount`, `recurring_day`, `is_recurring`
    - זיהוי פירעונות לפי: `loan_id`, `is_recurring`
    - זיהוי הפקדות לפי: `depositor_id`, `amount`, `recurring_day`, `is_recurring`
    - החזרת רשימה ממוינת לפי `item_number`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [ ] 2.2 יישם פונקציה `getSeriesItems()` להחזרת כל הפריטים בסדרה
    - קבלת הפריט המקורי
    - קריאה ל-`identifySeriesItems()`
    - מיון לפי מספר בסדרה
    - סימון Past/Future לפי תאריך
    - _Requirements: 2.2, 4.2, 6.2, 7.4_
  
  - [ ]* 2.3 כתוב property test לזיהוי פריטים בסדרה
    - **Property 5: זיהוי נכון של פריטים בסדרה**
    - **Validates: Requirements 7.1, 7.2, 7.3, 12.3**

- [ ] 3. יישום ולידציה
  - [ ] 3.1 יישם פונקציה `validateRecurringUpdate()` לולידציה של שינויים
    - בדיקת `recurring_day` בטווח 1-31
    - בדיקת `amount` גדול מ-0
    - בדיקת `recurring_months` גדול או שווה ל-0
    - החזרת `ValidationResult` עם רשימת שגיאות
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ] 3.2 יישם פונקציה `canEditRecurringItem()` לבדיקת הרשאות
    - בדיקה שהפריט הוא הפריט המקורי (`item_number = 1`)
    - בדיקה שהפריט מחזורי (`is_recurring = 1`)
    - החזרת שגיאה אם התנאים לא מתקיימים
    - _Requirements: 9.4_
  
  - [ ]* 3.3 כתוב property tests לולידציה
    - **Property 8: ולידציה של recurring_day**
    - **Validates: Requirements 9.1**
  
  - [ ]* 3.4 כתוב property tests לולידציה
    - **Property 9: ולידציה של amount**
    - **Validates: Requirements 9.2**
  
  - [ ]* 3.5 כתוב property tests לולידציה
    - **Property 10: ולידציה של recurring_months**
    - **Validates: Requirements 9.3**
  
  - [ ]* 3.6 כתוב property test להרשאות
    - **Property 11: הרשאת עריכה רק לפריט מקורי**
    - **Validates: Requirements 9.4**

- [ ] 4. Checkpoint - בדיקת תשתית בסיסית
  - ודא שכל הבדיקות עוברות בהצלחה
  - בדוק שהשירות מזהה נכון פריטים בסדרה
  - בדוק שהולידציה עובדת כראוי
  - שאל את המשתמש אם יש שאלות או בעיות

- [ ] 5. יישום עדכון פריטים בסדרה
  - [ ] 5.1 יישם פונקציה `updateSingleItem()` לעדכון פריט בודד
    - עדכון `amount` ו-`recurring_day` לפי סוג הפריט
    - שימוש ב-parameterized queries למניעת SQL injection
    - _Requirements: 11.1, 11.6, 12.1, 12.2_
  
  - [ ] 5.2 יישם פונקציה `updateSeriesItems()` לעדכון כל הפריטים בסדרה
    - קריאה ל-`canEditRecurringItem()` לבדיקת הרשאות
    - קריאה ל-`validateRecurringUpdate()` לולידציה
    - קבלת כל הפריטים בסדרה
    - עדכון כל פריט בלולאה (עם try-catch לכל פריט)
    - rollback במקרה של כשלון
    - ניקוי cache אחרי עדכון מוצלח
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 3.3, 3.4, 3.6, 3.7, 5.3, 5.4, 5.5, 5.6, 5.7, 11.1, 11.6, 12.1, 12.2, 12.4, 12.5_
  
  - [ ]* 5.3 כתוב property test לעדכון recurring_day
    - **Property 1: עדכון recurring_day בכל הסדרה**
    - **Validates: Requirements 1.3, 1.6, 1.7, 3.3, 3.6, 3.7, 5.3, 5.6, 5.7, 11.1, 11.6, 12.2**
  
  - [ ]* 5.4 כתוב property test לעדכון amount
    - **Property 2: עדכון amount בכל הסדרה**
    - **Validates: Requirements 1.4, 1.6, 1.7, 3.4, 3.6, 3.7, 5.4, 5.6, 5.7, 11.1, 11.6, 12.1**
  
  - [ ]* 5.5 כתוב property test לשמירת invariants
    - **Property 3: שמירת invariants אחרי עדכון**
    - **Validates: Requirements 1.8, 3.8, 5.8, 11.2, 11.3, 11.4, 11.5**
  
  - [ ]* 5.6 כתוב property test ל-atomicity
    - **Property 12: Atomicity של עדכון**
    - **Validates: Requirements 9.5, 12.4, 12.5**

- [ ] 6. יישום פונקציות עזר נוספות
  - [ ] 6.1 יישם פונקציה `getUpdateSummary()` לקבלת סיכום שינויים
    - קבלת כל הפריטים בסדרה
    - חישוב מספר Past_Items ו-Future_Items
    - זיהוי השינויים (amount, recurring_day, recurring_months)
    - החזרת `UpdateSummary`
    - _Requirements: 13.2, 13.3_
  
  - [ ] 6.2 יישם פונקציה `logSeriesUpdate()` לרישום שינויים
    - יצירת `AuditLogEntry` עם פרטי העדכון
    - שמירה ב-localStorage
    - _Requirements: 12.7_
  
  - [ ] 6.3 יישם פונקציה `invalidateSeriesCache()` לניקוי cache
    - מחיקת cache לסדרה ספציפית
    - _Requirements: Performance Optimization_

- [ ] 7. יישום רכיב EditRecurringDialog
  - [ ] 7.1 צור קובץ `src/components/recurring/EditRecurringDialog.tsx`
    - הגדר ממשק `EditRecurringDialogProps`
    - יישם state management עם `useState` (formData, loading, error, showConfirm, updateSummary)
    - יישם `useEffect` לטעינת נתונים ראשוניים
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 5.1, 5.2_
  
  - [ ] 7.2 יישם פונקציה `loadInitialData()` לטעינת נתונים
    - קריאה ל-`recurringItemsService.getItem()`
    - עדכון state עם ערכים נוכחיים
    - טיפול בשגיאות
    - _Requirements: 1.1_
  
  - [ ] 7.3 יישם פונקציה `handleSave()` לשמירת שינויים
    - קריאה ל-`getUpdateSummary()`
    - הצגת חלון אישור
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [ ] 7.4 יישם פונקציה `handleConfirm()` לאישור עדכון
    - קריאה ל-`updateSeriesItems()`
    - הצגת הודעת הצלחה/שגיאה
    - סגירת החלון
    - _Requirements: 13.5, 12.6_
  
  - [ ] 7.5 יישם UI עם Material-UI
    - Dialog עם DialogTitle, DialogContent, DialogActions
    - TextField לכל שדה (recurring_day, recurring_amount, recurring_months)
    - כפתורי "שמור" ו-"ביטול"
    - אינדיקטור טעינה (CircularProgress)
    - הצגת שגיאות (Alert)
    - תמיכה ב-RTL
    - _Requirements: 1.2, 10.1, 10.2, 10.4, 10.6, 14.1, 14.2, 14.3_
  
  - [ ]* 7.6 כתוב unit tests לרכיב EditRecurringDialog
    - בדיקת פתיחה וסגירה
    - בדיקת טעינת נתונים
    - בדיקת שינוי ערכים
    - בדיקת שמירה וביטול

- [ ] 8. יישום רכיב ConfirmUpdateDialog
  - [ ] 8.1 צור קובץ `src/components/recurring/ConfirmUpdateDialog.tsx`
    - הגדר ממשק `ConfirmUpdateDialogProps`
    - קבל `UpdateSummary` כ-prop
    - _Requirements: 13.1_
  
  - [ ] 8.2 יישם UI להצגת סיכום שינויים
    - Dialog עם כותרת "אישור עדכון"
    - הצגת מספר הפריטים שיעודכנו (totalItems, pastItems, futureItems)
    - הצגת השינויים המדויקים (field, oldValue, newValue)
    - כפתורי "אישור" ו-"ביטול"
    - אזהרה ויזואלית (Alert severity="warning")
    - _Requirements: 13.2, 13.3, 13.4, 13.5, 13.6_
  
  - [ ]* 8.3 כתוב unit tests לרכיב ConfirmUpdateDialog
    - בדיקת הצגת נתונים נכונה
    - בדיקת לחיצה על "אישור"
    - בדיקת לחיצה על "ביטול"

- [ ] 9. Checkpoint - בדיקת רכיבי עריכה
  - ודא שכל הבדיקות עוברות בהצלחה
  - בדוק את EditRecurringDialog בדפדפן
  - בדוק את ConfirmUpdateDialog בדפדפן
  - ודא שהעדכון עובד נכון
  - שאל את המשתמש אם יש שאלות או בעיות

- [ ] 10. יישום רכיב RecurringHistoryDialog
  - [ ] 10.1 צור קובץ `src/components/recurring/RecurringHistoryDialog.tsx`
    - הגדר ממשק `RecurringHistoryDialogProps`
    - יישם state management עם `useState` (seriesItems, loading, error)
    - יישם `useEffect` לטעינת היסטוריה
    - _Requirements: 2.1, 4.1, 6.1_
  
  - [ ] 10.2 יישם פונקציה `loadHistory()` לטעינת היסטוריה
    - קריאה ל-`recurringItemsService.getSeriesItems()`
    - עדכון state עם רשימת פריטים
    - טיפול בשגיאות
    - _Requirements: 2.2, 4.2, 6.2_
  
  - [ ] 10.3 יישם UI להצגת היסטוריה
    - Dialog עם כותרת המציגה Series_Count
    - רשימה ממוינת של פריטים (Table או List)
    - עמודות: Item_Number, תאריך, amount, status
    - סימון ויזואלי של Past_Items (צבע אחד) ו-Future_Items (צבע אחר)
    - תמיכה בגלילה
    - הודעה כאשר אין פריטים נוספים
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 4.2, 4.3, 4.4, 4.5, 4.6, 6.2, 6.3, 6.4, 6.5, 6.6, 10.3_
  
  - [ ]* 10.4 כתוב property test למיון היסטוריה
    - **Property 4: מיון היסטוריה לפי מספר בסדרה**
    - **Validates: Requirements 2.2, 4.2, 6.2, 7.4**
  
  - [ ]* 10.5 כתוב property test להצגת שדות
    - **Property 13: הצגת כל השדות הנדרשים בהיסטוריה**
    - **Validates: Requirements 2.3, 4.3, 6.3**
  
  - [ ]* 10.6 כתוב unit tests לרכיב RecurringHistoryDialog
    - בדיקת טעינת היסטוריה
    - בדיקת הצגת נתונים
    - בדיקת סימון Past/Future

- [ ] 11. אינטגרציה עם טבלאות קיימות
  - [ ] 11.1 הוסף כפתור "ערוך" לטבלת הלוואות (`src/components/loans/LoansTab.tsx`)
    - הוסף עמודה עם כפתור "ערוך" לפריטים מחזוריים
    - הצג את EditRecurringDialog בלחיצה
    - רענן את הטבלה אחרי עדכון מוצלח
    - _Requirements: 1.1_
  
  - [ ] 11.2 הוסף כפתור "היסטוריה" לטבלת הלוואות
    - הוסף עמודה עם כפתור "היסטוריה" לפריטים מחזוריים
    - הצג את RecurringHistoryDialog בלחיצה
    - _Requirements: 2.1_
  
  - [ ] 11.3 הוסף כפתורים לטבלת פירעונות (אם קיימת)
    - הוסף כפתור "ערוך" לפריטים מחזוריים
    - הוסף כפתור "היסטוריה" לפריטים מחזוריים
    - _Requirements: 3.1, 4.1_
  
  - [ ] 11.4 הוסף כפתורים לטבלת הפקדות (`src/components/donations/DepositsTab.tsx`)
    - הוסף כפתור "ערוך" לפריטים מחזוריים
    - הוסף כפתור "היסטוריה" לפריטים מחזוריים
    - _Requirements: 5.1, 6.1_
  
  - [ ]* 11.5 כתוב integration tests לאינטגרציה עם טבלאות
    - בדיקת פתיחת EditRecurringDialog מהטבלה
    - בדיקת פתיחת RecurringHistoryDialog מהטבלה
    - בדיקת רענון הטבלה אחרי עדכון

- [ ] 12. אינטגרציה עם Scheduler
  - [ ] 12.1 עדכן `src/services/scheduler.ts` - פונקציה `autoCreateRecurringLoans()`
    - יישם פונקציה `getLatestLoanInSeries()` לקבלת הפריט האחרון בסדרה
    - קרא `recurring_day`, `amount`, `recurring_months` מהפריט האחרון
    - השתמש בערכים המעודכנים ליצירת הלוואה חדשה
    - _Requirements: 8.1, 8.2, 8.3, 8.6_
  
  - [ ] 12.2 עדכן `src/services/scheduler.ts` - פונקציה `autoCreateRecurringDeposits()`
    - יישם פונקציה `getLatestDepositInSeries()` לקבלת הפריט האחרון בסדרה
    - קרא `recurring_day`, `amount`, `recurring_months` מהפריט האחרון
    - השתמש בערכים המעודכנים ליצירת הפקדה חדשה
    - _Requirements: 8.1, 8.2, 8.3, 8.6_
  
  - [ ] 12.3 עדכן `src/services/scheduler.ts` - פונקציה `processAutoRepayment()`
    - יישם פונקציה `getLatestRepaymentInSeries()` לקבלת הפירעון האחרון בסדרה
    - קרא `recurring_day`, `amount` מהפירעון האחרון
    - השתמש בערכים המעודכנים ליצירת פירעון חדש
    - _Requirements: 8.1, 8.2, 8.6_
  
  - [ ] 12.4 יישם הפחתת recurring_months
    - אחרי יצירת פריט חדש, הפחת את `recurring_months` ב-1
    - הפסק יצירת פריטים כאשר `recurring_months` מגיע ל-0
    - _Requirements: 8.4, 8.5_
  
  - [ ]* 12.5 כתוב property test להפחתת recurring_months
    - **Property 7: הפחתת recurring_months**
    - **Validates: Requirements 8.4**
  
  - [ ]* 12.6 כתוב integration tests לאינטגרציה עם Scheduler
    - בדיקה שה-Scheduler קורא פרמטרים מעודכנים
    - בדיקה שפריטים חדשים נוצרים עם ערכים נכונים
    - בדיקה שהפחתת recurring_months עובדת

- [ ] 13. הוספת תרגומים לעברית
  - [ ] 13.1 עדכן `src/i18n/locales/he.json`
    - הוסף מפתחות לכל הטקסטים ברכיבים החדשים
    - כותרות דיאלוגים: "עריכת פריט מחזורי", "היסטוריית פריטים", "אישור עדכון"
    - תוויות שדות: "יום בחודש", "סכום", "חודשים נותרים"
    - כפתורים: "שמור", "ביטול", "אישור", "ערוך", "היסטוריה"
    - הודעות: הצלחה, שגיאות, אזהרות
    - _Requirements: 10.2_
  
  - [ ] 13.2 עדכן `src/i18n/locales/en.json` (אופציונלי)
    - הוסף תרגומים לאנגלית לכל המפתחות החדשים

- [ ] 14. Checkpoint סופי - בדיקות מקיפות
  - ודא שכל הבדיקות עוברות בהצלחה (unit, property, integration)
  - בדוק את כל התכונה מקצה לקצה בדפדפן:
    - עריכת הלוואה מחזורית
    - עריכת פירעון מחזורי
    - עריכת הפקדה מחזורית
    - הצגת היסטוריה לכל סוג
    - אישור עדכון
    - ביטול עדכון
  - ודא שה-Scheduler משתמש בפרמטרים המעודכנים
  - בדוק שכל הודעות השגיאה מוצגות נכון
  - ודא תמיכה ב-RTL
  - שאל את המשתמש אם יש שאלות או בעיות

- [ ] 15. אופטימיזציה וביצועים
  - [ ] 15.1 הוסף אינדקסים למסד הנתונים
    - צור אינדקס על `loans(borrower_id, amount, recurring_day, is_recurring)`
    - צור אינדקס על `repayments(loan_id, is_recurring)`
    - צור אינדקס על `deposits(depositor_id, amount, recurring_day, is_recurring)`
    - _Requirements: Performance Optimization_
  
  - [ ] 15.2 יישם caching לסדרות
    - יישם `seriesCache` עם Map
    - הגדר TTL של 5 דקות
    - נקה cache אחרי עדכון
    - _Requirements: Performance Optimization_
  
  - [ ] 15.3 אופטימיזציה של שאילתות
    - שימוש ב-batch update במקום עדכון פריט אחד בכל פעם
    - שימוש ב-parameterized queries
    - _Requirements: Performance Optimization_
  
  - [ ]* 15.4 כתוב performance tests
    - בדיקת זמן עדכון לסדרות גדולות (100+ פריטים)
    - בדיקת זמן טעינת היסטוריה
    - בדיקת השפעת cache

- [ ] 16. תיעוד ומסמכים
  - [ ] 16.1 הוסף הערות JSDoc לכל הפונקציות ב-`recurringItemsService.ts`
    - תיאור מטרת הפונקציה
    - תיאור פרמטרים
    - תיאור ערך מוחזר
    - דוגמאות שימוש
  
  - [ ] 16.2 צור קובץ README.md בתיקיית `src/components/recurring/`
    - הסבר על מבנה הרכיבים
    - הסבר על השימוש
    - דוגמאות קוד
  
  - [ ] 16.3 עדכן תיעוד משתמש (אם קיים)
    - הוסף הסבר על עריכת פריטים מחזוריים
    - הוסף צילומי מסך
    - הוסף שאלות נפוצות (FAQ)

## הערות

- משימות המסומנות ב-`*` הן אופציונליות וניתן לדלג עליהן לצורך MVP מהיר
- כל משימה מפנה לדרישות ספציפיות מתוך מסמך הדרישות לצורך מעקב
- נקודות Checkpoint מאפשרות אימות הדרגתי של התקדמות
- Property tests מאמתים תכונות אוניברסליות של המערכת
- Unit tests מאמתים דוגמאות ספציפיות ומקרי קצה
- Integration tests מאמתים אינטגרציה בין רכיבים
