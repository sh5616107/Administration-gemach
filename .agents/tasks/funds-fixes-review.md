# סקירת תיקוני מערכת הקופות

**תאריך:** 2026-01-11  
**Verdict**: CHANGES_REQUESTED

## סיכום

תיקון מערכת הקופות יושם ב-4 commits עם 8 בדיקות vitest חדשות. התיקון כולל מיגרציה, ensureFundsIntegrity אידמפוטנטית, ווולידציות ב-changeFund, חסימת fund_id:undefined, ותיקונים בדשבורד ובסטטיסטיקות. רוב הדרישות יושמו, אך יש פערים קריטיים: **לא הוסרה הפעולה "העבר לקופה אחרת" בממשק הלוואות**, **חסרות אזהרות על חריגה מיתרה זמינה**, **חסר בורר קופה בטופס הוצאות**, ו**חסר FundSelector.includeInactive באתרי עריכה**. 31 בדיקות קיימות נכשלות כי לא עודכנו לטפל במערכת קופות.

**Watch for:**  
- **HIGH (confirmed)**: סעיף 7 מהאפיון (פעולת "העבר לקופה אחרת" בעמוד הלוואות) **לא יושם כלל** — אין UI ל-changeFund  
- **HIGH (confirmed)**: סעיף 7 (אזהרה כשסכום הלוואה גדול מהכסף הזמין) **לא יושם**  
- **HIGH (confirmed)**: סעיף 7 (בורר קופה בטופס הוצאה) **לא יושם** — Expenses.tsx חסר FundSelector  
- **HIGH (confirmed)**: 31 בדיקות vitest נכשלות כי לא עודכנו לטפל ב-fundsService.getDefault()  
- **MEDIUM (confirmed)**: לולאה ב-fundsService.create תוקנה ל-`Object.entries` במקום `for (const f of allFunds)` — עובד אבל לא תואם לדרישה המדויקת  
- **MEDIUM (confirmed)**: FundSelector.includeInactive לא מופעל בעריכת רשומה קיימת (סעיף 7)

## מבט כללי

**ensureFundsIntegrity** מיושמת בצורה אידמפוטנטית ומבוססת מצב — יוצרת קופת ברירת מחדל אם אין, ומשייכת כל רשומה ללא fund_id או עם fund_id לא קיים. הפונקציה רצה באתחול, בסוף ייבוא JSON, ובסוף ייבוא ZIP. parseBackupJson מטפל ב-funds דרך convertToObject.

**changeFund** בודק קופת יעד קיימת, פעילה, שונה מהנוכחית, וסיבה חובה — רושם audit log עם before/after/reason ומחשב מחדש יתרות. loansService.update חוסם `fund_id: undefined` מלדרוס ערך קיים. הלוואה מחזורית יורשת fund_id מההלוואה המקורית (scheduler.ts).

**הדשבורד** מציג קופות מושבתות אם יש להן הלוואות פעילות, ומוסיף שורת סיכום כוללת. getStatsByFund מסנן לווים קיימים (existingBorrowerIds), עקבי עם getDashboardStats. byFund משתמש ב-fund_id (לא fundId) בכל מקום. getDashboardStats מסנן קופות פעילות + מושבתות עם הלוואות פעילות.

**המיגרציה** כבר לא שומרת עותק מלא של המסד ב-localStorage (רק דגל timestamp), ולא קוראת ל-importAllData בתוך runMigration כי הנתונים כבר ב-data store. fundsService.update חוסם השבתת קופת ברירת מחדל יחידה והסרת is_default ממנה. fundsService.create מסיר is_default מכל הקופות הקיימות באמצעות לולאה על Object.entries.

**חסר מהאפיון:** פעולת "העבר לקופה" בממשק הלוואות (סעיף 7), בורר קופה בטופס הוצאה, אזהרת חריגה מיתרה זמינה, includeInactive=true בעריכת רשומות קיימות.

<details>
<summary>בעיות (8)</summary>

1. **העבר לקופה אחרת — חסר UI** — סעיף 7 מהאפיון מבקש פעולת "העבר לקופה אחרת" בעמוד ההלוואות. changeFund מיושם ב-backend אבל אין כפתור או דיאלוג ב-LoansTab או UnifiedLoansPage. יש להוסיף Dialog עם FundSelector + שדה סיבה.
2. **אזהרת חריגה מיתרה זמינה — לא יושמה** — סעיף 7 מבקש אזהרה (לא חסימה) כשסכום הלוואה גדול מהכסף הזמין בקופה. לא מופיע בממשק. יש להוסיף בדיקה ב-LoansTab לפני save.
3. **בורר קופה חסר בטופס הוצאה** — סעיף 7 מבקש FundSelector בטופס הוצאה. Expenses.tsx כרגע לא מכיל אותו. יש להוסיף.
4. **FundSelector.includeInactive לא מופעל בעריכה** — סעיף 7 מבקש הצגת קופה מושבתת בבורר בעריכת רשומה קיימת. FundSelector תומך ב-includeInactive אבל לא מועבר כ-true בטפסי עריכה. יש להעביר includeInactive={!!selectedLoan/deposit/donation/expense}.
5. **לולאה ב-fundsService.create לא תואמת דרישה מדויקת** — הדרישה בסעיף 6: "תקן את הלולאה ל-for (const f of allFunds) עם f.id". המימוש: `for (const [id, existingFund] of Object.entries(allFunds))`. עובד אבל לא תואם את הסינטקס המבוקש. יש לשנות ל-`for (const f of Object.values(allFunds))` עם `f.id`.
6. **31 בדיקות נכשלות** — בדיקות ישנות לא עודכנו לטפל בקופות. כולן נכשלות עם "לא נמצאה קופת ברירת מחדל" כי resetDatabase לא יוצר קופה. יש להוסיף `await fundsService.create({name:'קופה',is_default:true,is_active:true})` ב-beforeEach של כל בדיקה מושפעת.
7. **אינווריאנט בדשבורד לא מורחב** — סעיף 4 מבקש "הרחב את בדיקת האינווריאנט כך שתכלול הלוואות והפקדות, לא רק תרומות". אינווריאנט נוכחי (אם קיים) לא מצוין בקוד שנסקר. יש לבדוק ולהרחיב.
8. **npm run build timeout** — הרצת build נתקעה אחרי 3 דקות. tsc --noEmit עובר בלי שגיאות, אז הבעיה כנראה ב-Vite. יש לנסות npm run build שוב, או להריץ עם --debug.

</details>

## פירוט

<details>
<summary>Details</summary>

### ייבוא וגיבוי — parseBackupJson ו-ensureFundsIntegrity

parseBackupJson (fullBackupService.ts) מוסיף `funds: {}` ל-importData ומטפל ב-data.funds דרך convertToObject, זהה לטיפול בשאר הטבלאות. אם אין funds בגיבוי ישן, מחזיר `{}`.

ensureFundsIntegrity (fundsIntegrity.ts) אידמפוטנטית: בודקת אם יש קופת ברירת מחדל (fundsService.getDefault), ואם אין — יוצרת "קופה ראשית". אחר כך עוברת על loans/donations/deposits/expenses, ומשייכת כל רשומה ללא fund_id או עם fund_id לא קיים לקופת ברירת המחדל. הפונקציה רצה:

- בסוף importFullBackupZip (fullBackupService.ts:267)
- בסוף ייבוא JSON ב-AdvancedTools.tsx (שורה 385)
- באתחול database.ts (אחרי migrateFundsSystem, שורה 147)

הבדיקות fundsIntegrity.test.ts מכסות: יצירת קופת ברירת מחדל, אידמפוטנטיות, תיקון הלוואות ללא fund_id, תיקון הלוואות עם fund_id לא קיים. fundsImportIntegration.test.ts מכסה ייבוא גיבוי ישן ללא קופות (מצפה ליצירה אוטומטית של קופת ברירת מחדל ושיוך ההלוואות אליה), וייבוא גיבוי חדש עם קופות (מצפה ששיוכים נשמרים).

### בנייה ו-byFund type fix

database.ts שורות 1310-1330: getDashboardStats מחזיר byFund עם fund_id (לא fundId). Dashboard.tsx שורות 743-832: קורא stats.byFund ומצפה ל-fund_id. העקביות תוקנה. הדשבורד מוסיף שורת סיכום כוללת אם יש יותר מקופה אחת (שורות 787-832), מציג גם קופות מושבתות אם יש להן הלוואות פעילות (שורות 1318-1323 ב-database.ts), ומוסיף תג "(מושבת)" בכרטיס הקופה (שורות 745-747).

getStatsByFund (שורות 1468-1499) מחשב activeLoans ו-plannedLoans לפי fund_id, מסנן לווים קיימים (existingBorrowerIds) כמו getDashboardStats. זה תואם לדרישה "יישר את סינון 'לווים קיימים' בין הסכום הכולל לבין getStatsByFund".

tsc --noEmit עובר ללא שגיאות. npm run build תקוע (timeout אחרי 3 דקות) — לא ברור למה, אבל סוגיית טיפוסים פתורה.

### שינוי קופה של הלוואה — changeFund ו-update

loansService.changeFund (database.ts:1172-1217) בודק:

1. סיבה לא ריקה (שורה 1175)
2. הלוואה קיימת (1179)
3. קופת יעד שונה מנוכחית (1183)
4. קופת יעד קיימת (1188)
5. קופת יעד פעילה (1192)

רושם audit log עם before_data (fund_id ישן), after_data (fund_id חדש), metadata.reason (שורות 1208-1216), וקורא ל-commitData.

loansService.update (שורות 1096-1157) חוסם fund_id:undefined מלדרוס ערך קיים (שורות 1099-1101):

```typescript
if ('fund_id' in d && d.fund_id === undefined) {
  delete d.fund_id
}
```

הבדיקות loanFundChangeValidation.test.ts מכסות: שגיאה אם קופת יעד לא קיימת, אם לא פעילה, אם זהה לנוכחית, אם סיבה ריקה, וכן עדכון fund_id והרשמה ביומן. הבדיקה האחרונה (loansService.update: fund_id undefined לא צריך לדרוס ערך קיים) מוודאת שהקופה לא השתנתה אחרי update עם fund_id:undefined.

changeFundAuditAndBalances.test.ts מכסה רישום audit log עם before_data/after_data/reason, ועדכון יתרות שתי הקופות (מצפה ש-activeLoans.count משתנה מ-1/0 ל-0/1).

**אבל:** אין ממשק ב-LoansTab או UnifiedLoansPage לקריאה ל-changeFund. הדרישה בסעיף 7: "פעולת 'העבר לקופה אחרת' בעמוד ההלוואות". לא יושם. חסר Dialog עם FundSelector ושדה סיבה.

LoansTab.tsx לא קורא ל-loansService.changeFund בשום מקום (אין changeFund ב-grep). loansService.update לא מעביר fund_id אלא אם המשתמש שינה אותו בטופס — זה בסדר, אבל לא מכסה את הדרישה של שינוי קופה ע"י changeFund עם סיבה חובה.

### דשבורד וסטטיסטיקות — קופות מושבתות, סינון לווים קיימים, שורת סיכום

getDashboardStats (database.ts:1310-1333) מסנן קופות לתצוגה: קופות פעילות + קופות מושבתות שיש להן הלוואות פעילות (שורות 1318-1323):

```typescript
const funds = allFunds.filter(f => {
  if (f.is_active) return true
  const loansInFund = activeWithBalance.filter(l => l.fund_id === f.id)
  return loansInFund.length > 0
})
```

מוסיף שורת סיכום כוללת ב-Dashboard.tsx (שורות 787-832) אם `byFund.length > 1`.

getStatsByFund (שורות 1468-1499) מסנן activeLoans לפי existingBorrowerIds (שורות 1470-1476), זהה ל-getDashboardStats (שורות 1283-1287). זה תואם לדרישה "יישר את סינון 'לווים קיימים' בין הסכום הכולל לבין getStatsByFund".

**אבל:** הדרישה בסעיף 4 "הרחב את בדיקת האינווריאנט כך שתכלול הלוואות והפקדות, לא רק תרומות" — לא ברור איפה האינווריאנט הקיים. אם הכוונה ל-data integrity check כלשהו (לא הוזכר בקוד שנסקר), הוא לא הורחב.

### מיגרציה — הסרת localStorage snapshot, הסרת importAllData

fundsMigration.ts:

createBackupBeforeMigration (שורות 51-61) שומר רק timestamp ב-localStorage (`localStorage.setItem(backupKey, new Date().toISOString())`), לא עותק מלא של המסד. זה תואם לדרישה "הפסק לשמור עותק מלא של המסד ב-localStorage".

runMigration (שורות 63-89) לא קורא ל-importAllData. ההערה "הנתונים כבר בזיכרון (data store) - לא צריך importAllData" (שורה 65) תואמת לדרישה "הסר את importAllData מתוך המיגרציה, כי הנתונים כבר בזיכרון".

ensureFundsIntegrity רצה באתחול database.ts (שורה 147, אחרי migrateFundsSystem), כך שהמיגרציה לא תלויה בדגל localStorage — זה תואם לדרישה "החלף את הדגל בבדיקת מצב".

### fundsService — לולאה, חסימות, וולידציות

fundsService.create (שורות 2848-2884): הלולאה שמסירה is_default מכל הקופות הקיימות (שורות 2861-2867):

```typescript
const allFunds = getAllItems<Fund>('funds')
for (const [id, existingFund] of Object.entries(allFunds)) {
  if (existingFund.is_default && !existingFund.is_deleted) {
    setItem('funds', id, { ...existingFund, is_default: false })
  }
}
```

הדרישה בסעיף 6: "תקן את הלולאה ל-for (const f of allFunds) עם f.id". המימוש הנוכחי עובד, אבל משתמש ב-Object.entries ולא ב-for...of עם f.id. זה לא תואם את הדרישה **המדויקת**. התיקון הנכון היה:

```typescript
for (const f of Object.values(allFunds)) {
  if (f.is_default && !f.is_deleted) {
    setItem('funds', f.id, { ...f, is_default: false })
  }
}
```

fundsService.update (שורות 2887-2933) חוסם השבתת קופת ברירת מחדל יחידה (שורות 2897-2907) והסרת is_default ממנה (שורות 2888-2896). הבדיקות fundsValidation.test.ts מכסות את שתי החסימות, ומוודאות שניתן להשבית/להסיר is_default אם יש קופה אחרת פעילה.

**ולידציה ב-create:** loansService.create (שורות 1062-1095) מקבל fund_id אופציונלי, ואם לא סופק — מקבל את קופת ברירת המחדל (שורות 1064-1077). הקוד יוצר קופה אם אין (שורות 1070-1077), אבל זה רק fallback — ensureFundsIntegrity מבטיחה שתמיד יש קופת ברירת מחדל, אז הקוד הזה לא אמור להתבצע בייצור. הדרישה בסעיף 6: "הסר את החלופה של יצירת קופה ראשית בקוד הייצור" — לא הוסר, אבל גם לא מזיק (dead code).

depositsService.create, donationsService.create, expensesService.create (שורות 2098-2127, 2170-2200, 2244-2274) כולם מקבלים fund_id אופציונלי ומשתמשים בקופת ברירת מחדל אם לא סופק. אף אחד מהם לא בודק אם הקופה קיימת ופעילה לפני create — זה תואם חלקית לדרישה "הוסף בדיקה שקופה קיימת ופעילה ב-loansService.create וב-depositsService/donationsService/expensesService.create", אבל הבדיקה לא קיימת. loansService.create אפילו יוצר קופה אם אין (שורות 1070-1077), אז הוא לא זורק שגיאה. שאר ה-services יכשלו אם אין קופת ברירת מחדל (fundsService.getDefault יזרוק), אבל זה לא ווולידציה מפורשת שהקופה המבוקשת קיימת ופעילה.

### השלמות מהאפיון

**בורר קופה בטופס הוצאה:** Expenses.tsx (שורה 79) מכיל fund_id בממשק Expense, אבל אין FundSelector בטופס. חסר.

**אזהרת חריגה מיתרה זמינה:** לא מיושם בשום מקום. הדרישה: "אזהרת חריגה (לא חסימה) כשסכום ההלוואה גדול מהכסף הזמין בקופה". חסר.

**פעולת "העבר לקופה אחרת":** changeFund מיושם ב-backend, אבל אין כפתור או דיאלוג ב-LoansTab או UnifiedLoansPage. חסר.

**בחירה מראש של קופת ברירת המחדל:** FundSelector (שורות 35-41) מבצע בחירה אוטומטית אם אין ערך ויש קופות:

```typescript
if (!value && allFunds.length > 0) {
  const defaultFund = allFunds.find(f => f.is_default)
  if (defaultFund) {
    onChange(defaultFund.id)
  }
}
```

זה תואם לדרישה.

**הצגת קופה מושבתת בבורר בעריכת רשומה קיימת:** FundSelector תומך ב-includeInactive (שורות 17, 26, 35-39, 59), אבל הוא לא מועבר כ-true באתרי השימוש. ב-LoansTab (שורות 85, 300) אין includeInactive כלל. בעריכת הלוואה קיימת, אם הקופה מושבתת, היא לא תופיע בבורר. חסר.

### בדיקות חסרות ונכשלות

הבדיקות החדשות עוברות:

- fundsIntegrity.test.ts (5 בדיקות) ✓
- recurringLoanInheritsFund.test.ts (2 בדיקות) ✓
- changeFundAuditAndBalances.test.ts (2 בדיקות) ✓
- loanFundChangeValidation.test.ts (5 בדיקות) ✓
- fundsValidation.test.ts (4 בדיקות) ✓
- fullBackupImport.test.ts (2 בדיקות) ✓
- fundsImportIntegration.test.ts (2 בדיקות) ✓
- softDeletedLoanBlocksFundDeletion.test.ts (2 בדיקות) ✓

31 בדיקות ישנות נכשלות עם "לא נמצאה קופת ברירת מחדל במערכת" (fundsService.getDefault זורק). זה כי resetDatabase לא יוצר קופת ברירת מחדל אוטומטית — הבדיקות הישנות לא עודכנו. צריך להוסיף `await fundsService.create({name:'קופה',is_default:true,is_active:true})` ב-beforeEach של כל בדיקה מושפעת.

הבדיקה recurringLoanInheritsFund מכסה ירושת fund_id מהלוואה מחזורית ל-next (מצפה שההלוואה השנייה תקבל אותו fund_id), ואי-יצירת כפילויות (ריצה שנייה של createRecurringLoan מחזירה false).

הבדיקה softDeletedLoanBlocksFundDeletion מכסה שלא ניתן למחוק קופה עם הלוואה soft-deleted (fundsService.delete צריך לזרוק).

changeFundAuditAndBalances מכסה רישום audit log ועדכון יתרות (מצפה ש-activeLoans.count משתנה בשתי הקופות).

**אבל:** אין בדיקה לאזהרת חריגה מיתרה זמינה, אין בדיקה ל-FundSelector.includeInactive בעריכה, ואין בדיקה ל-UI של "העבר לקופה אחרת".

</details>

## מפת קבצים

<details>
<summary>קבצים ששונו (18)</summary>

- `src/__tests__/changeFundAuditAndBalances.test.ts` — בדיקות ל-changeFund: audit log ועדכון יתרות
- `src/__tests__/fullBackupImport.test.ts` — בדיקות לייבוא גיבוי עם/בלי funds
- `src/__tests__/fundsImportIntegration.test.ts` — בדיקות לאינטגרציה בין ייבוא ל-ensureFundsIntegrity
- `src/__tests__/fundsIntegrity.test.ts` — בדיקות ל-ensureFundsIntegrity (אידמפוטנטיות, תיקון הלוואות)
- `src/__tests__/fundsValidation.test.ts` — בדיקות ווולידציה: חסימת השבתה/הסרת is_default
- `src/__tests__/loanFundChangeValidation.test.ts` — בדיקות ל-changeFund ווולידציות
- `src/__tests__/recurringLoanInheritsFund.test.ts` — בדיקות לירושת fund_id בהלוואה מחזורית
- `src/__tests__/softDeletedLoanBlocksFundDeletion.test.ts` — בדיקה שלא ניתן למחוק קופה עם הלוואה soft-deleted
- `src/components/funds/FundSelector.tsx` — תוספת includeInactive, בחירה אוטומטית של ברירת מחדל, תג "(מושבת)"
- `src/pages/AdvancedTools.tsx` — הוספת ensureFundsIntegrity אחרי ייבוא JSON
- `src/pages/Dashboard.tsx` — הוספת שורת סיכום כוללת, תג "(מושבת)", סינון קופות מושבתות עם הלוואות פעילות
- `src/pages/Deposits.tsx` — הוספת fund_id לממשק Deposit
- `src/pages/Donations.tsx` — הוספת fund_id לממשק Donation
- `src/services/database.ts` — changeFund, חסימת fund_id:undefined, תיקון byFund, סינון לווים קיימים ב-getStatsByFund, חסימות ב-fundsService.update, הוספת ensureFundsIntegrity באתחול
- `src/services/fullBackupService.ts` — הוספת funds ל-parseBackupJson, הרצת ensureFundsIntegrity ב-importFullBackupZip
- `src/services/fundsIntegrity.ts` — פונקציה אידמפוטנטית חדשה
- `src/services/migrations/fundsMigration.ts` — הסרת שמירת עותק מלא, הסרת importAllData, שמירת timestamp בלבד
- `src/services/repositories/donationRepository.ts` — הוספת fund_id לממשק Donation

[Full diff: `git diff origin/main..HEAD`]

</details>
