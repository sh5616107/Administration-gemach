# מיפוי צבעים למיגרציה ל-theme מרוכז

## סיכום בסיס (שלב 0)

- **שגיאות TypeScript בבסיס:** 0
- **תוצאות Vitest:** 94 קבצים, 707 בדיקות עוברות, 2 מדולגות
- **git status:** על HEAD מקומי (קומיט אחד לפני origin/main)
- **תאריך מיפוי:** 2026-10-31

## רשימת היתר (לא נוגעים)

### מסמכים מופקים
- `src/services/documents.ts` - 357 קודי צבע (מסמכי PDF/HTML)
- `src/services/documentConstants.ts` - קבועים למסמכים
- `src/pages/Contacts.tsx` - שורות 440-690 (תבנית HTML לדוח מודפס)
- `src/pages/AdvancedTools.tsx` - שורות 786-1288 (תבניות HTML לדוחות מודפסים)
- `src/pages/DocumentDesignerPanel.tsx` - שורה 210 (body background/color במסמך)

### קבועי ברנדינג חיצוני
- צבע Ko-fi (`#72a4f2`, `#5b8ee0`) ב-Settings.tsx - יוגדר כקבוע `KOFI_COLOR` ב-`src/theme/constants.ts`

## באגים פוטנציאליים שזוהו

### 1. שימוש ב-palette.X.50 (לא קיים ב-MUI)

השימושים הבאים מנסים לגשת למפתחות שלא קיימים בפלטת MUI ברירת מחדל. **ככל הנראה לא מציגים רקע כרגע** (נכשלים בשקט):

| קובץ | שורה | שימוש | הקשר |
|------|------|-------|------|
| ExcelImportDialog.tsx | 246 | `bgcolor: 'primary.50'` | רקע תיבת ייבוא מלא |
| DepositSidePanel.tsx | 261 | `bgcolor: 'primary.50'` | רקע פרטי מפקיד |
| Settings.tsx | 377 | `bgcolor: 'primary.50'` | רקע כרטיס עדכונים |
| Donations.tsx | 1030 | `bgcolor: 'success.50'` | רקע סטטיסטיקות |
| Donations.tsx | 1099 | `bgcolor: 'success.50'` | רקע פרטי תורם |
| Deposits.tsx | 1238 | `bgcolor: 'success.50'` | רקע מספר הפקדות פעילות |
| Deposits.tsx | 1258 | `bgcolor: 'info.50'` | רקע סה"כ הופקד |
| Deposits.tsx | 1268 | `bgcolor: 'error.50'` | רקע סכום נמשך |
| Deposits.tsx | 1278 | `bgcolor: 'primary.50'` | רקע יתרה פעילה |
| BankMatchingPage.tsx | 638 | `bgcolor: 'primary.50'` | רקע סיכום התאמות |
| BankMatchingPage.tsx | 712 | `bgcolor: 'success.50'` | רקע סטטיסטיקות |
| BankSyncPage.tsx | 331 | `bgcolor: 'error.50/success.50'` | רקע סיכום סנכרון |
| ExpectedFundsDialog.tsx | 135 | `bgcolor: 'success.50'` | רקע כותרת טבלה - הלוואות |
| ExpectedFundsDialog.tsx | 176 | `bgcolor: 'info.50'` | רקע כותרת טבלה - הפקדות מחזוריות |
| ExpectedFundsDialog.tsx | 221 | `bgcolor: 'primary.50'` | רקע כותרת טבלה - הפקדות אחרות |
| ExpectedFundsDialog.tsx | 264 | `bgcolor: 'error.50'` | רקע כותרת טבלה - תשלומים מתוכננים |
| GuarantorsTab.tsx | 871 | `bgcolor: 'warning.50'` | רקע סה"כ ערבויות |

**סה"כ:** 17 מופעים

**הפתרון:** 
- יצירת helper function `getLightBg(color: string)` שמחזיר `alpha(theme.palette[color].main, 0.08)`
- **שינוי נראה:** אחרי התיקון התיבות האלה **יקבלו רקע צבעוני עמום** (היום הן ללא רקע)

---

## מיפוי צבעים ישירים לפי קובץ

### Layout.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 181 | `#fafafa` | רקע drawer | `sidebar.bg` (`#0F4A4A`) |
| 182 | `#eee` | גבול תחתון drawer header | `divider` |
| 190 | `#1976d2` | רקע Avatar לוגו | `accent` (זהב `#B8892D`) |
| 217 | `#e3f2fd` | רקע פריט נבחר | `sidebar.selected` (`rgba(255,255,255,0.14)`) |
| 218 | `#1976d2` | צבע טקסט פריט נבחר | `sidebar.textActive` (`#FFFFFF`) |
| 219 | `#1976d2` | צבע אייקון פריט נבחר | `sidebar.textActive` |
| 220 | `#bbdefb` | hover פריט נבחר | `alpha(sidebar.selected, 0.7)` |
| 222 | `#f5f5f5` | hover פריט רגיל | `alpha(sidebar.text, 0.08)` |
| 225 (×2) | `#1976d2`, `#666` | צבע אייקון (נבחר/רגיל) | `sidebar.textActive` / `sidebar.text` |
| 257 | `#eee` | גבול ימין drawer (desktop) | `divider` |
| 272 | `#eee` | גבול ימין drawer (mobile) | `divider` |
| 290 | `#fff` | רקע תוכן ראשי | `background.paper` |
| 298 | `#fff` | רקע AppBar | `background.paper` |
| 300 | `#eee` | גבול תחתון AppBar | `divider` |

**הערות:**
- ה-drawer צריך להפוך כהה (`#0F4A4A`) עם טקסט בהיר
- פריט נבחר: רקע `rgba(255,255,255,0.14)` + `sidebar.textActive` + `fontWeight: 600`
- הלוגו צריך להשתמש ב-`accent` (זהב)
- **לא לכתוב `#FFFFFF` ישירות**, אלא `sidebar.textActive`

---

### Contacts.tsx (דוח HTML מודפס - רשימת היתר)
**שורות 440-690** - תבנית HTML לדוח מודפס. לא נוגעים (מסמך מופק).

---

### EventIndicator.tsx (צבעי אירועי קלנדר)
| שורה | צבע | סוג אירוע | טוקן חדש |
|------|------|----------|-----------|
| 17 | `#d32f2f` | loan_due (פירעון הלוואה) | `calendar.loanDue` (אדום) |
| 18 | `#795548` | repayment (פירעון שבוצע) | `calendar.repayment` (חום) |
| 19 | `#2e7d32` | recurring_deposit | `calendar.recurringDeposit` (ירוק) |
| 20 | `#0288d1` | planned_loan | `calendar.plannedLoan` (כחול) |
| 21 | `#ed6c02` | deposit_due | `calendar.depositDue` (ענבר) |
| 22 | `#9c27b0` | regular_loan | `calendar.regularLoan` (שזיף) |
| 29 | `#757575` | ברירת מחדל | `text.disabled` |

**הערה:** הצבעים מוגדרים ב-`theme.palette.calendar.*` כטוקנים ייעודיים. כל צבע שונה גם בבהירות (נגישות).

---

### Deposits.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 929 (×2) | `#9e9e9e`, `#2196f3` | גבול שמאלי שורה (יתרה 0 / פעילה) | `grey.500` / `primary.main` |
| 1047 | `rgba(255,255,255,0.95)` | רקע כפתורי פעולה ב-hover | `alpha(background.paper, 0.95)` |

---

### Dashboard.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 963 | `#e0e0e0` | גבול כרטיס | `divider` |

---

### ConfirmUpdateDialog.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 89 | `#999` | צבע ערך ישן (מחוק) | `text.disabled` |
| 93 | `#2e7d32` | צבע ערך חדש | `success.dark` |

---

### BankDebugPage.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 495 | `#f5f5f5` | רקע פרטי תוצאה | `grey.100` |

---

### EditRecurringDialog.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 349 | `#f5f5f5` | רקע progress card | `grey.100` |
| 379 | `#e3f2fd` | רקע כרטיס סטט' כחול | `primary.light` |
| 396 | `#fff3e0` | רקע כרטיס סטט' כתום | `warning.light` |
| 411 | `#f3e5f5` | רקע כרטיס סטט' סגול | `alpha(accent, 0.12)` |
| 449 | `#fff9c4` | רקע מצב עריכה | `warning.light` |
| 586 (×2) | `#f5f5f5`, `#e3f2fd` | רקע פריט עבר/עתיד | `grey.100` / `primary.light` |
| 588 (×2) | `#eeeeee`, `#bbdefb` | hover פריט עבר/עתיד | `grey.200` / `primary.light` |

**הערה:** הסגול ב-411 הופך ל-`alpha(theme.palette.accent, 0.12)` במקום טוקן נפרד.

---

### Donations.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 867 | `rgba(255,255,255,0.95)` | רקע כפתורי פעולה ב-hover | `alpha(background.paper, 0.95)` |

---

### UnifiedLoansPage.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 1079 | `rgba(255,255,255,0.95)` | רקע כפתורי פעולה ב-hover | `alpha(background.paper, 0.95)` |
| 1165 | `rgba(255,255,255,0.95)` | רקע כפתורי פעולה ב-hover | `alpha(background.paper, 0.95)` |

---

### Settings.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 840 | `#72a4f2` | borderColor כפתור Ko-fi | `KOFI_COLOR` (קבוע) |
| 841 (×2) | `#72a4f2`, `#5b8ee0` | צבע כפתור Ko-fi + hover | `KOFI_COLOR`, `KOFI_COLOR_HOVER` |
| 841 | `rgba(114,164,242,0.08)` | רקע hover Ko-fi | `alpha(KOFI_COLOR, 0.08)` |

**הערה:** צבעי Ko-fi יוגדרו כקבועים ב-`src/theme/constants.ts` ולא כחלק מהפלטה.

---

### DocumentDesignerPanel.tsx

#### UI (נוגעים)
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 285 | `#ddd` | גבול block | `divider` |
| 302 (×2) | `#fff3e0`, `#f7f7f7` | רקע עריכה/רגיל | `warning.light` / `grey.100` |
| 304 | `#ffb74d` | outline עריכה | `warning.main` |
| 318 (×2) | `#e0e0e0`, `#fafafa` | גבול ורקע טופס | `divider` / `grey.50` |
| 325 | `#e0e0e0` | גבול תחתון סרגל כלים | `divider` |
| 330 | `#e0e0e0` | גבול ימין קבוצת כפתורים | `divider` |
| 382 | `#e0e0e0` | גבול ימין קבוצת כפתורים | `divider` |
| 687 | `#ddd` | גבול תמונה | `divider` |
| 689 | `#f5f5f5` | רקע תמונה | `grey.100` |
| 874 (×3) | `#ccc`, `#fff` (×2) | גבול ורקע iframe preview | `divider` / `background.paper` |

#### מסמך (רשימת היתר)
| שורה 210 | `#e0e0e0`, `#000000` | body background/color במסמך - לא נוגעים |

---

### AdvancedTools.tsx

#### UI (נוגעים)
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 2302 | `#1976d2` | גבול תחתון כותרת סיכום כספי | `primary.main` |
| 2343 | `#1976d2` | גבול תחתון כותרת אמצעי תשלום | `primary.main` |
| 2383 | `#1976d2` | גבול תחתון כותרת פירוט | `primary.main` |
| 2518 | `#1976d2` | גבול תחתון כותרת ערבים | `primary.main` |
| 2733 | `#f5f5f5` | רקע paper סיכום | `grey.100` |
| 2886 | `#f5f5f5` | רקע paper סיכום עמלות | `grey.100` |

#### תבניות הדפסה (רשימת היתר, שורות 786-1288)
לא נוגעים - מסמכים מודפסים.

---

### BankMatchingPage.tsx
| שורה | צבע | הקשר | תפקיד מוצע |
|------|------|-------|------------|
| 48 | `#2e7d32` | רמת ביטחון excellent | `success.dark` |
| 49 | `#1565c0` | רמת ביטחון high | `info.dark` |
| 50 | `#f57f17` | רמת ביטחון medium | `warning.dark` |
| 51 | `#e65100` | רמת ביטחון low | `warning.dark` (כהה יותר) |
| 52 | `#b71c1c` | רמת ביטחון suspect | `error.dark` |
| 693 | `#666` | ברירת מחדל לצבע | `text.secondary` |
| 700 | `#666` | ברירת מחדל לצבע | `text.secondary` |

**הערה:** אובייקט `confidenceColor` יוגדר ב-theme או כקבועים.

---

## סיכום והמלצות

### החלטות שהתקבלו ✅
1. **Ko-fi (`#72a4f2`)** - יישאר כקבוע `KOFI_COLOR` ב-`src/theme/constants.ts`
2. **סגול (`#f3e5f5`)** ב-EditRecurringDialog - `alpha(accent, 0.12)`
3. **צבעי קלנדר** - טוכנים ייעודיים `calendar.*` (לא מיפוי לסטטוסים):
   - `calendar.loanDue` - אדום `#d32f2f`
   - `calendar.repayment` - חום `#795548`
   - `calendar.recurringDeposit` - ירוק `#2e7d32`
   - `calendar.plannedLoan` - כחול `#0288d1`
   - `calendar.depositDue` - ענבר `#ed6c02`
   - `calendar.regularLoan` - שזיף `#9c27b0`
4. **Layout.tsx** - לא לכתוב `#FFFFFF` ישירות, אלא `sidebar.textActive`

### קטגוריות עיקריות למיפוי
- **רקעים:** `background.default`, `background.paper`, `grey.50/100/200`
- **גבולות:** `divider`
- **טקסט:** `text.primary`, `text.secondary`, `text.disabled`
- **סטטוסים:** `success/warning/error/info` (`main` לאייקונים, `light` לרקעים, `dark` לטקסט)
- **תפריט צד:** `sidebar.bg`, `sidebar.text`, `sidebar.textInactive`, `sidebar.textActive`, `sidebar.selected`
- **קישוטים:** `accent` (זהב, לא לטקסט)
- **קלנדר:** `calendar.loanDue/repayment/recurringDeposit/plannedLoan/depositDue/regularLoan`
- **רמות ביטחון (בנק):** טוכנים או קבועים ב-BankMatchingPage

### מספרים
- **קודי hex ישירים בממשק (ללא מסמכים):** ~80-90 מופעים
- **שימושים ב-`X.50` לא קיימים:** 17 מופעים
- **שימושים ב-rgba():** 9 מופעים
- **מסמכים מופקים (רשימת היתר):**
  - documents.ts: 357 צבעים
  - Contacts.tsx: שורות 440-690
  - AdvancedTools.tsx: שורות 786-1288
  - DocumentDesignerPanel.tsx: שורה 210

---

## שלב הבא
✅ **שלב 1 הושלם**: `src/theme/theme.ts` נוצר עם הפלטה החדשה, טוקנים מותאמים, ובדיקות.

**המשך לשלב 2:** מעטפת - `Layout.tsx` ודשבורד.


---

## הנחיה לשלב 4: בדיקת צבעים

**⚠️ שים לב:**  
בקובץ `utils/formatId.ts` יש תגובה בשורה אחת שמכילה קוד צבע לדוגמה:
```typescript
// דוגמה: → #550E84
```

בעת הרצת בדיקת צבעים ב-grep (למשל `#[0-9a-fA-F]{3,6}`), התגובה תתפס כצבע hardcoded.

**פתרונות אפשריים:**
1. עדכן את בדיקת הצבעים להתעלם מהערות (`//` ו-`/* */`)
2. שנה את הדוגמה ב-formatId.ts למשהו שלא דומה לקוד צבע (למשל `→ ID-ABCD`)
3. סמן את השורה עם `@allow-colors` אם מחליטים לשמור על הדוגמה

**המלצה:** התעלמות מהערות בבדיקה היא הפתרון הנקי ביותר.
