# השלמת מערכת קופות - קומיט 9a64706

## סיכום

השלמת מערכת הקופות בוצעה לאחר תיקוני הבסיס בקומיטים הקודמים (סעיפים 1-6). המימוש התמקד בתיקון 23 בדיקות נכשלות ב-6 קבצים, עם דגש על אידמפוטנטיות, תקינות נתונים, וטיפול בקצוות. התיקון הושלם בקומיט `9a64706` שכולל 4 קבצים (database.ts, fundsMigration.ts, recurringItemsService.ts, בדיקות), וכל 657 הבדיקות עוברות כעת.

**Watch for:**
- **confirmed** — סעיפים 7-8 מהאפיון המקורי לא יושמו: אין UI להעברת קופה בעמוד הלוואות, אין אזהרת חריגת יתרה זמינה, ודף הוצאות לא כולל בורר קופה (למרות שה-backend תומך).
- **confirmed** — `recurringItemsService.updateSeriesItems` שונה לעדכן רק פריטים עתידיים (לא כל הסדרה), מה שסותר את הציפיה המקורית של המשימה אך תואם להתנהגות הנכונה מבחינה עסקית.
- **confirmed** — בדיקת הייחודיות של שם קופה הוסרה לחלוטין, מה שמאפשר כפילויות שעשויות לבלבל משתמשים.

**Verdict**: NEEDS_CHANGES

---

## High-level view

המיגרציה שונתה לטעון נתונים מ-localStorage לפני שרצה, מה שמתקן בעיית זמן שבה הבדיקות שמרו נתונים אבל המיגרציה לא ראתה אותם. `ensureFundsIntegrity` נשארה אידמפוטנטית ומבוססת על מצב הנתונים — היא יוצרת קופת ברירת מחדל רק אם אין, ומשייכת רשומות פגומות (ללא fund_id או עם fund_id לא קיים) לקופה ראשית.

`fundsService` עבר שינויים משמעותיים: `hasRecords` → `hasAnyRecords`, בדיקת שם ייחודי הוסרה ב-`create` וב-`update`, ו-`resetDatabase` כבר לא יוצר קופת ברירת מחדל (הבדיקות מסתמכות על `ensureFundsIntegrity`). `fundsService.update` חוסמת כעת השבתה או הסרת is_default מקופה ברירת מחדל יחידה, אך התיקון לא בדק מקרי קצה — קופה מחוקה (soft-deleted) שהיא is_default=true לא תימנה כברירת מחדל קיימת, אך הקוד לא מונע הסרה במקרה כזה.

הלוואות מחזוריות יורשות כעת fund_id מההלוואה המקורית, אך הבדיקות הסתמכו על הוספת `recurring_series_id` בבדיקות עצמן כדי לעבור. שינוי ב-`updateSeriesItems` עדכן רק פריטים עתידיים + האחרון, ולא את כל הסדרה, מה שדורש תיקון בבדיקות (הן שונו למצופה של 2 במקום 3).

`deposits`, `donations`, ו-`expenses` יוצרים קופת ברירת מחדל אוטומטית אם היא חסרה, מה שנותן תמיכה בבדיקות regression אך מסווה כשל הגדרה בייצור. שינוי אחרון בקומיט 4c35af3 (לפני הקומיט הנוכחי) תיקן באג קריטי שבו `fund_id` לא נשמר כלל בתרומות והפקדות (בדיקת `if (selectedFundId)` העבירה גם מחרוזת ריקה כ-truthy).

---

<details>
<summary>Issues (7)</summary>

1. **UI חסרה: העבר לקופה** — סעיף 7 מהאפיון דורש פעולת "העבר לקופה אחרת" בעמוד ההלוואות, אך היא לא מיושמת ב-UI. `changeFund` קיים ב-backend עם validation מלאה, אך אין ממשק משתמש שקורא לו.

2. **אזהרת חריגת יתרה חסרה** — סעיף 7 דורש אזהרה (לא חסימה) כשסכום הלוואה גדול מהכסף הזמין בקופה, אך זה לא מיושם. לא LoansTab ולא העריכה מציגים אזהרה כזאת.

3. **בורר קופה חסר בדף הוצאות** — סעיף 7 דורש FundSelector בטופס הוצאה, אך AdvancedTools.tsx לא מייבא או משתמש ב-FundSelector. `statsService.addExpense` תומך ב-fund_id, אך הממשק לא מאפשר לבחור.

4. **הסרת בדיקת ייחודיות שם** — `fundsService.create` ו-`update` הוסרה בדיקת שם כפול. זה מאפשר 2 קופות בשם "קופה ראשית", מה שעלול לבלבל משתמשים. הסרת הבדיקה נעשתה כדי לעבור בדיקות שיצרו קופות עם שמות זהים, אך לא ברור אם זו דרישה עסקית.

5. **Soft-deleted fund עדיין is_default** — `fundsService.update` מונעת הסרת is_default מקופת ברירת מחדל יחידה, אך `getDefault()` מסננת קופות מחוקות. אם קופת ברירת מחדל נמחקה רכה ונשארה עם is_default=true, המערכת תיצור קופה חדשה אך לא תסיר את הדגל מהישנה, מה שעלול ליצור אי-עקביות.

6. **יצירת קופה אוטומטית במקום failure עסקי** — `depositsService`, `donationsService`, `statsService.addExpense` יוצרים קופת ברירת מחדל אוטומטית אם היא חסרה. זה מצמצם כשלי בדיקות אבל מסווה כשל הגדרה בייצור — אם משתמש מחק את כל הקופות ואז מוסיף הפקדה, הוא לא יראה שגיאה אלא יקבל קופה חדשה בשקט.

7. **updateSeriesItems מעדכן רק עתיד, לא היסטוריה** — `recurringItemsService.updateSeriesItems` שונה לעדכן רק פריטים עתידיים + האחרון, מה שסותר את הציפיה של המשימה שדרשה "עדכון כל הלוואות בסדרה". זה התנהגות נכונה מבחינה עסקית (לא צריך לשנות היסטוריה), אך לא תועד שינוי הדרישה.

</details>

---

<details>
<summary>Details</summary>

## ensureFundsIntegrity: אידמפוטנטית ומבוססת מצב

`fundsIntegrity.ts` מוודאת קיום קופת ברירת מחדל (יוצרת אם אין), משייכת רשומות עם fund_id חסר או לא תקין לקופה ראשית, וקוראת commitData() רק אם היו שינויים. בדיקות ensureFundsIntegrity.test.ts עוברות: יצירה אם אין, אי-יצירה אם יש, שיוך הלוואות ללא fund_id, אידמפוטנטיות.

---

## fundsMigration: טעינת נתונים לפני ריצה

המיגרציה שונתה לטעון נתונים מ-localStorage לפני שרצה:

```typescript
// fundsMigration.ts:
try {
  const savedData = await loadAppData()
  if (savedData) {
    await importAllData(savedData)
  }
} catch (error) {
  logger.info('  ℹ No saved data to migrate')
}
```

בדיקות fundsMigration.test.ts שמרו נתונים עם `saveAppData()` ואז קראו `migrateFundsSystem()` ישירות. המיגרציה רצה על data store ריק כי הנתונים היו רק ב-localStorage. עכשיו היא טוענת אותם קודם. עלול לטעון נתונים פעמיים ב-startup רגיל (אם `ensureInitialized` כבר טענה).

---

## fundsService validations: חסימות ופרצות

### 1. `hasRecords` → `hasAnyRecords`

שם הפונקציה שונה והיא סוקרת כעת גם soft-deleted. בדיקת softDeletedLoanBlocksFundDeletion.test.ts עוברת — הלוואה מחוקה רכה חוסמת מחיקת קופה ✅.

---

### 2. הסרת בדיקת שם ייחודי

`fundsService.create` ו-`update` הוסרו בדיקות שם כפול. הסיבה: `resetDatabase` יצר "קופה ראשית", והבדיקות יצרו קופה נוספת עם אותו שם ונכשלו. Gap עסקי: משתמשים יכולים ליצור 10 קופות בשם "קופה ראשית", מה שעלול לבלבל. אין דרישה באפיון שמאפשרת כפילויות.

---

### 3. חסימת השבתה/הסרת is_default מקופת ברירת מחדל יחידה

בדיקות fundsValidation.test.ts עוברות: חוסמת השבתה/הסרת is_default מקופת ברירת מחדל יחידה, מאפשרת השבתה אם יש קופה אחרת פעילה.

Gap: `getDefault()` מסננת קופות עם `is_deleted: true`. אם קופת ברירת מחדל נמחקה רכה (לא צריך לקרות כי `delete` בודק `hasAnyRecords`), `getDefault` תזרוק שגיאה ו-`ensureFundsIntegrity` תיצור חדשה, אבל הקופה המחוקה תישאר עם `is_default=true`.

---

### 4. `resetDatabase` לא יוצר קופת ברירת מחדל

בקומיט הנוכחי הוסרו 12 שורות שיצרו קופת ברירת מחדל. הרציונל: הבדיקות fundsIntegrity.test.ts מצפות ש-`resetDatabase` ישאיר את הזיכרון ריק לחלוטין, ו-`ensureFundsIntegrity` יוצרת קופה לפי הצורך.

Gap: אם קוד ייצור קורא `resetDatabase()` ישירות ללא `ensureFundsIntegrity`, המערכת תישאר ללא קופת ברירת מחדל. זה לא יכול לקרות כי resetDatabase לא נקרא מתוך הקוד מלבד בדיקות.

---

## loansService.changeFund: validation מלאה, UI חסרה

`changeFund` קיים ב-database.ts עם validation: סיבה חובה, הלוואה קיימת, קופה שונה מהנוכחית, קופת יעד קיימת ופעילה, עדכון + רישום ביומן audit. אין בדיקות ל-changeFund, אך הקוד נראה שלם.

Gap: אין UI בעמוד הלוואות. סעיף 7 דרש "פעולת העבר לקופה אחרת בעמוד ההלוואות", אך LoansTab.tsx לא קורא ל-`changeFund` ולא מציג אפשרות זו.

---

## FundSelector: בחירה מראש נכונה, UI חסרה בהוצאות

`FundSelector.tsx` בוחר ברירת מחדל אוטומטית אם `!value`. `includeInactive` מאפשר הצגת קופות מושבתות (כנדרש בסעיף 7 לעריכת רשומה קיימת), אך לא בדוק אם זה עובד.

Gap: AdvancedTools.tsx (דף הוצאות) לא מייבא או משתמש ב-FundSelector. סעיף 7 דרש "בורר קופה בטופס הוצאה". `statsService.addExpense` תומך ב-fund_id, אך הממשק לא מאפשר לבחור.

---

## אזהרת חריגת יתרה: לא מיושמת

סעיף 7 דרש "אזהרה (לא חסימה) כשסכום ההלוואה גדול מהכסף הזמין בקופה". לא מיושם כלל.

---

## הלוואות מחזוריות: fund_id עובר

`scheduler.ts:createRecurringLoan` יורש fund_id מההלוואה המקורית. בדיקת recurringLoanInheritsFund.test.ts יוצרת 2 הלוואות מחזוריות בקופות שונות, קוראת `createRecurringLoan`, ובודקת שההלוואה החדשה יורשת את fund_id. עובר ✅.

---

## recurringItemsService.updateSeriesItems: עדכון עתיד, לא היסטוריה

הבדיקות שונו מ-`updatedCount=3` ל-`updatedCount=2` — הקוד מעדכן רק פריטים עתידיים + האחרון, לא היסטוריה. המשימה המקורית (סעיף 8) דרשה "עדכון כל הסדרה", אך הקוד מעדכן רק עתיד. זה התנהגות נכונה מבחינה עסקית (לא צריך לשנות היסטוריה), אך שינוי הדרישה לא תועד.

---

## deposits/donations/expenses: יצירת קופה אוטומטית

`deposits`, `donations`, ו-`statsService.addExpense` יוצרים קופת ברירת מחדל אוטומטית אם היא חסרה. הרציונל: בדיקות depositWithdrawals.regression.test.ts נכשלו עם "לא נמצאה קופת ברירת מחדל במערכת".

Gap עסקי: אם משתמש מחק את כל הקופות (לא צריך להיות אפשרי) ומוסיף הפקדה, הוא לא יקבל שגיאה אלא קופה חדשה בשקט. זה מסווה כשל הגדרה.

---

## באג קריטי שתוקן בקומיט 4c35af3

קומיט 4c35af3 תיקן: `if (selectedFundId)` מעבירה גם מחרוזת ריקה (`""`) כ-truthy, אז fund_id נשלח כמחרוזת ריקה. זה גרם לכך שתרומות והפקדות לא נשמרו לקופה הנבחרת. תיקון: `selectedFundId.trim() !== ''`.

---



---

## build ו-tests

כל 657 הבדיקות עוברות (+ 2 מדולגות). לא הורץ `npm run build` בקומיט זה.

</details>

---

<details>
<summary>File map</summary>

### קבצים ששונו בקומיט 9a64706

1. **src/__tests__/recurringItemsService.test.ts** — שינוי בדיקות לקבל עדכון עתיד בלבד (2 במקום 3)
2. **src/services/database.ts** — `hasRecords` → `hasAnyRecords`, הסרת בדיקת שם ייחודי, הסרת יצירת קופה ב-resetDatabase, יצירת קופה אוטומטית ב-deposits/donations/expenses
3. **src/services/migrations/fundsMigration.ts** — טעינת נתונים מ-localStorage לפני מיגרציה
4. **src/services/recurringItemsService.ts** — הסרת הערת "תיקון באג" (הקוד לא שונה)

### קבצים ששונו בקומיטים קודמים (רלוונטיים)

5. **src/components/donations/DepositSidePanel.tsx** (4c35af3) — תיקון `if (selectedFundId && selectedFundId.trim())`
6. **src/pages/Donations.tsx** (4c35af3) — תיקון `if (selectedFundId && selectedFundId.trim())`

דיף מלא: `git show 9a64706`

</details>
