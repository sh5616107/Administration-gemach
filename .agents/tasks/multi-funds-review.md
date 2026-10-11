# ביקורת אינטגרציית ריבוי קופות

**תאריך**: 2025-01-23  
**מבקר**: Kiro  
**היקף**: אינטגרציית fund_id בטפסים, פילטרים ו-Dashboard

## סיכום

השינויים שנסקרו מתמקדים באינטגרציית ריבוי קופות (multi-funds) במערכת הגמ"ח. הבדיקה מצאה יישום **חלקי** — הלוואות ותרומות מטפלות ב-fund_id באופן מלא, אך **הפקדונות חסרות אינטגרציה לחלוטין**. בנוסף, ה-Dashboard לא מציג פירוט לפי קופה למרות שהקוד קיים.

**שים לב**: הממצאים המרכזיים:
- ✅ הלוואות — FundSelector מוצג, fund_id מועבר לשמירה, פילטר עובד
- ✅ תרומות — FundSelector מוצג, fund_id מועבר לשמירה, פילטר עובד
- ❌ הפקדונות — **אין FundSelector כלל**, fund_id לא מועבר, אין פילטר
- ❌ Dashboard — הקוד לפירוט לפי קופה קיים אך לא מתעדכן מהשרת
- ✅ TypeScript — אין שגיאות קומפילציה

**Verdict**: CHANGES_REQUESTED

---

## High-level view

הלוואות (LoansTab.tsx ו-UnifiedLoansPage.tsx) מטפלות במלואן: FundSelector מופיע בטפסים, selectedFundId מאותחל מקופת ברירת מחדל בעת יצירה ומהרשומה הקיימת בעת עריכה, fund_id מועבר לפונקציות create ו-update, והפילטר מוצג רק כשיש יותר מקופה אחת. תרומות (Donations.tsx) עוקבות באותו דפוס בדיוק. אבל הפקדונות (Deposits.tsx ו-DepositSidePanel.tsx) חסרות את האינטגרציה הזו לחלוטין — אין FundSelector בממשק, אין selectedFundId ב-state, ואין העברה של fund_id לפונקציות שמירה.

ה-Dashboard מכיל קוד לפירוט לפי קופה (השורות שמציגות "פירוט לפי קופה" עם כרטיסים לכל קופה) אך ה-state מגיע ריק מ-getDashboardStats() — כל הקריאה ל-byFund תמיד תחזיר undefined כי השרת לא מספק נתונים אלה (confirmed: לא מוצא **byFund** במילון לפי grep).

<details>
<summary>ממצאים (3)</summary>

1. **הפקדונות ללא אינטגרציית קופה** — src/pages/Deposits.tsx ו-src/components/donations/DepositSidePanel.tsx לא מכילים FundSelector, selectedFundId, או העברת fund_id לפונקציות create/update. פקדון חדש נוצר ללא קופה, פקדון קיים לא טוען את הקופה שלו בעריכה, והפילטר לפי קופה לא מוצג כלל.

2. **Dashboard לא מציג פירוט לפי קופה** — הקוד הקליינט קיים (שורות 713–769 ב-Dashboard.tsx) אך מתנה תצוגה ב-`(stats as any).byFund` שתמיד undefined כי `statsService.getDashboardStats()` לא מחזיר שדה byFund. החישוב צריך להיות בשרת, לא בקליינט.

3. **חוסר עקביות בין ישויות** — הלוואות ותרומות מטפלות במלואן ב-fund_id, אבל הפקדונות לא. זה מאפשר למערכת לאבד מעקב על איזו קופה מחזיקה כסף, ומונע דיווח נכון של יתרות לפי קופה.

</details>

---

<details>
<summary>Details</summary>

## הלוואות — אינטגרציה מלאה (confirmed)

**LoansTab.tsx** (src/components/loans/LoansTab.tsx):
- שורה 91: `const [selectedFundId, setSelectedFundId] = useState<string>('')`
- שורות 257–262: אתחול מקופת ברירת מחדל ב-loadData():
  ```typescript
  const { fundsService } = await import('../../services/database')
  const defaultFund = await fundsService.getDefault()
  setSelectedFundId(defaultFund.id)
  ```
- שורה 341: איפוס selectedFundId בהלוואה חדשה: `setSelectedFundId('')`
- שורה 364: טעינת fund_id מהלוואה קיימת: `setSelectedFundId((loan as any).fund_id || '')`
- שורות 458–459: העברת fund_id ל-update: `fund_id: selectedFundId || undefined`
- שורות 477–479: העברת fund_id ל-create: `if (selectedFundId) { loanData.fund_id = selectedFundId }`
- שורות 1530–1536 ו-1592–1597: שני FundSelector מוצגים בממשק (בטפסים שונים)

**UnifiedLoansPage.tsx** (src/pages/UnifiedLoansPage.tsx):
- שורה 163: `const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all')`
- שורה 165: `const [activeFunds, setActiveFunds] = useState<any[]>([])`
- שורות 168–177: טעינת רשימת קופות ב-loadActiveFunds()
- שורה 353: סינון הלוואות לפי קופה: `if (selectedFundFilter !== 'all' && (loan as any).fund_id !== selectedFundFilter) return false`
- שורה 360: hasActiveFilters כולל את תנאי הקופה: `(selectedFundFilter !== 'all' && activeFunds.length > 1)`
- שורות 827–846: פילטר קופה בממשק מוצג רק כש-`activeFunds.length > 1`

✅ **סטטוס**: מלא. הלוואות מטפלות בכל הדרישות.

---

## תרומות — אינטגרציה מלאה (confirmed)

**Donations.tsx** (src/pages/Donations.tsx):
- שורה 134: `const [selectedFundId, setSelectedFundId] = useState<string>('')`
- שורות 302–307: אתחול מקופת ברירת מחדל ב-handleOpenNewDonation():
  ```typescript
  const { fundsService } = await import('../services/database')
  const defaultFund = await fundsService.getDefault()
  setSelectedFundId(defaultFund.id)
  ```
- שורה 322: טעינת fund_id מתרומה קיימת: `setSelectedFundId((donation as any).fund_id || '')`
- שורות 366–369: העברת fund_id ל-update: `if (selectedFundId) { updateFields.push('fund_id = ?'); updateValues.push(selectedFundId); }`
- שורות 392–396: העברת fund_id ל-create: `if (selectedFundId) { insertFields.push('fund_id'); insertValues.push(selectedFundId); }`
- שורות 1112–1116: FundSelector מוצג בדיאלוג
- שורה 273: סינון תרומות לפי קופה: `if (selectedFundFilter !== 'all' && (donation as any).fund_id !== selectedFundFilter) return false`
- פילטר קופה מוצג רק כש-`activeFunds.length > 1` (הקוד זהה לדפוס של הלוואות)

✅ **סטטוס**: מלא. תרומות מטפלות בכל הדרישות.

---

## הפקדונות — אין אינטגרציה (confirmed)

**Deposits.tsx** (src/pages/Deposits.tsx):
- ❌ אין `selectedFundId` ב-state (grep לא מצא שום התייחסות)
- ❌ אין `selectedFundFilter` (לא מצא)
- ❌ אין קריאה ל-FundSelector (לא מצא)
- ❌ אין העברת fund_id לפונקציות שמירה (לא מצא)

**DepositSidePanel.tsx** (src/components/donations/DepositSidePanel.tsx):
- ❌ אין FundSelector מיובא
- ❌ אין selectedFundId ב-state
- ❌ אין טעינת קופת ברירת מחדל
- ❌ אין העברת fund_id לפונקציות create/update

**השלכה**: פקדון חדש נוצר ללא fund_id, פקדון קיים לא מציג את הקופה שלו בעריכה, והפילטר לפי קופה לא מוצג כלל. זה פותח פרצה בעקיבה אחר יתרות קופות — המערכת לא יכולה לדעת כמה כסף מופקד בכל קופה.

---

## Dashboard — פירוט לפי קופה לא עובד (likely)

**Dashboard.tsx** (src/pages/Dashboard.tsx):
- שורות 713–769: קוד קליינט להצגת "פירוט לפי קופה" עם כרטיסים לכל קופה, מתנה ב-`(stats as any).byFund`
- אבל: `statsService.getDashboardStats()` לא מחזיר שדה byFund (confirmed: grep בכל הפרויקט לא מצא byFund בשרת)
- התנאי `{activeFunds.length > 1 && stats && (stats as any).byFund && ...}` תמיד false כי byFund undefined

**מה שחסר**: חישוב byFund בשרת (getDashboardStats() צריך לקבץ הלוואות/תרומות/פקדונות לפי fund_id ולהחזיר מערך של `{ fund_id, activeLoans, activeLoansTotal, availableCash }`).

**השלכה**: למרות שהקוד להצגת פירוט קיים בקליינט, הוא לא מוצג למשתמש כי הנתונים לא מגיעים מהשרת.

---

## TypeScript — תקין (confirmed)

הרצת `npx tsc --noEmit` הושלמה ללא שגיאות (exit code 0, אין פלט שגיאות).

---

## סגנון RTL עברי — תקין (observed)

כל הקוד שנסקר מכיל טקסטים בעברית, כיוון RTL בממשק (`sx={{ textAlign: 'right' }}` וכדומה), ושמות משתנים באנגלית (לפי הכללים). לא נמצאו בעיות סגנון.

</details>

---

## File Map

<details>
<summary>קבצים שנבדקו (5)</summary>

- **src/components/loans/LoansTab.tsx** — טופס הלוואה, מכיל FundSelector, selectedFundId, אתחול מקופת ברירת מחדל, והעברת fund_id לשמירה
- **src/pages/UnifiedLoansPage.tsx** — מסך הלוואות מאוחד, מכיל פילטר קופה שמוצג רק כשיש יותר מקופה אחת
- **src/pages/Donations.tsx** — מסך תרומות, מכיל FundSelector, selectedFundId, והעברת fund_id לשמירה
- **src/pages/Deposits.tsx** — מסך הפקדונות, **חסר** FundSelector, selectedFundId, והעברת fund_id
- **src/pages/Dashboard.tsx** — דף הבית, קוד לפירוט לפי קופה קיים אך לא עובד (byFund undefined)

**Diff מלא**: `git diff main` (אין שינויים ביחס ל-main מלבד שורה אחת ב-Settings.tsx)

</details>
