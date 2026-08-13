# עדכון תצוגת עסקאות בנק - סיכום שינויים

## תאריך: 2026-07-02

## תיאור השינוי

עודכנה לוגיקת התצוגה של עסקאות בנק במערכת, כך ששדה `memo` יוצג בעדיפות על פני שדה `description`. 

### הסיבה לשינוי

שדה `description` מכיל מידע טכני ולא אינפורמטיבי (לדוגמה: "העברה/הפקדה-טל"), בעוד ששדה `memo` מכיל את שם המבצע האמיתי שהוא המידע הרלוונטי לזיהוי הלווה/תורם/מפקיד.

### לוגיקת התצוגה החדשה

1. **אם קיים שדה `memo` בפורמט "המבצע: <שם>."** → הצג את השם שחולץ (ללא "המבצע:" וללא נקודה)
2. **אם קיים `memo` בפורמט אחר** → הצג את תוכן ה-`memo` כפי שהוא
3. **רק אם `memo` ריק או לא קיים** → הצג את ה-`description`

### דוגמה

**קלט:**
```json
{
  "description": "העברה/הפקדה-טל",
  "memo": "המבצע: בן ציון ופעשא רבקה וורמס."
}
```

**תצוגה קודמת (שגויה):** העברה/הפקדה-טל

**תצוגה חדשה (נכונה):** בן ציון ופעשא רבקה וורמס

---

## שינויים טכניים

### 1. קובץ: `src/services/bankService.ts`

**נוסף:**
- פונקציה חדשה: `getTransactionDisplayName(transaction: BankTransaction): string`
- הפונקציה מיוצאת לשימוש חוזר במספר מקומות

**קוד:**
```typescript
/**
 * Extract the display name from a bank transaction.
 * Priority: memo with "המבצע:" format > any memo > description
 */
export function getTransactionDisplayName(transaction: BankTransaction): string {
  // If memo exists and contains "המבצע:" format, extract the name
  if (transaction.memo) {
    const memoMatch = transaction.memo.match(/המבצע:\s*([^.]+)\./);
    if (memoMatch) {
      return memoMatch[1].trim();
    }
    // If memo exists in any other format, use it
    return transaction.memo;
  }
  
  // Fallback to description
  return transaction.description;
}
```

---

### 2. קובץ: `src/pages/bank/BankMatchingPage.tsx`

**שינויים:**

#### א. יבוא הפונקציה החדשה
```typescript
import { bankService, BankTransaction, MatchSuggestion, getTransactionDisplayName } from '../../services/bankService';
```

#### ב. עדכון תצוגה ב-`TransactionMatchCard`
**קודם:**
```typescript
<Typography variant="body2" sx={{ mt: 1, wordBreak: 'break-word', color: 'text.secondary', fontSize: '0.85rem' }}>
  {transaction.description}
</Typography>
{transaction.memo && (
  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
    {transaction.memo}
  </Typography>
)}
```

**אחרי:**
```typescript
{/* Show extracted name prominently */}
<Typography 
  variant="body1" 
  sx={{ 
    mt: 1.5, 
    mb: 1,
    fontWeight: 'bold',
    wordBreak: 'break-word',
    fontSize: '1rem'
  }}
>
  {getTransactionDisplayName(transaction)}
</Typography>

{/* Show original description as secondary info if memo was used */}
{transaction.memo && (
  <Typography 
    variant="caption" 
    color="text.secondary" 
    sx={{ 
      display: 'block', 
      mt: 0.5,
      fontSize: '0.75rem',
      opacity: 0.7
    }}
  >
    מקור: {transaction.description}
  </Typography>
)}
```

#### ג. עדכון תצוגה ב-`UnmatchedTransactionRow`
**קודם:**
```typescript
<Typography variant="caption" color="text.secondary">
  {transaction.description}
</Typography>
```

**אחרי:**
```typescript
<Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
  {getTransactionDisplayName(transaction)}
</Typography>
{transaction.memo && (
  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
    מקור: {transaction.description}
  </Typography>
)}
```

#### ד. עדכון תצוגה ב-`ManualMatchDialog`
**קודם:**
```typescript
<Typography variant="body2" color="text.secondary">
  {transaction.description}
</Typography>
```

**אחרי:**
```typescript
<Typography variant="body1" fontWeight="medium" sx={{ mt: 1 }}>
  {getTransactionDisplayName(transaction)}
</Typography>
{transaction.memo && (
  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
    מקור: {transaction.description}
  </Typography>
)}
```

---

### 3. קובץ: `src/__tests__/bankService.test.ts` (חדש)

**נוסף:**
- 6 בדיקות יחידה לפונקציה `getTransactionDisplayName()`

**בדיקות:**
1. ✅ חילוץ שם מ-memo בפורמט "המבצע: <שם>."
2. ✅ שימוש ב-memo כפי שהוא אם לא בפורמט "המבצע:"
3. ✅ נפילה ל-description כאשר memo ריק
4. ✅ נפילה ל-description כאשר memo לא מוגדר
5. ✅ טיפול ב-memo ללא נקודה בסוף
6. ✅ ניקוי רווחים מיותרים מהשם החולץ

**כל הבדיקות עברו בהצלחה!**

---

### 4. מסמכי ספקציפיקציה

#### א. `.kiro/specs/bank-integration-israeli-scrapers/requirements.md`
נוסף קריטריון קבלה 11 לדרישה 10:

> **עדיפות תצוגה של memo על פני description**: בכל ממשקי הצגת עסקאות (BankMatchingPage, BankSyncPage וכו'), אם קיים שדה memo המערכת תציג אותו כשורה הראשית במקום description. אם memo בפורמט "המבצע: <שם>." המערכת תציג רק את השם שחולץ. רק אם memo ריק או לא קיים תוצג description. הסיבה: description מכיל מידע טכני (כגון "העברה/הפקדה-טל") ואילו memo מכיל את שם המבצע האמיתי שהוא המידע הרלוונטי לזיהוי.

#### ב. `.kiro/specs/bank-integration-israeli-scrapers/tasks.md`
עודכנה משימה 3.4 להכלל:
- יישום `getTransactionDisplayName()` - פונקציית עזר לעדיפות תצוגה
- עדכון תצוגת עסקאות בכל המקומות
- הוספת תצוגת "מקור: description" כמידע משני

---

## השפעה על חוויית המשתמש

### לפני השינוי
מנהל הגמ"ח ראה בממשק התאמות:
- **עסקת בנק:** "העברה/הפקדה-טל" 
- לא היה ברור מיהו המבצע האמיתי

### אחרי השינוי
מנהל הגמ"ח רואה:
- **עסקת בנק:** "בן ציון ופעשא רבקה וורמס"
- **מקור:** "העברה/הפקדה-טל" (מידע משני, פחות בולט)
- ברור מיד מיהו המבצע, מה שמקל על זיהוי והתאמה

---

## קבצים שהושפעו

1. ✅ `src/services/bankService.ts` - הוספת פונקציה חדשה
2. ✅ `src/pages/bank/BankMatchingPage.tsx` - עדכון 3 מקומות תצוגה
3. ✅ `src/__tests__/bankService.test.ts` - קובץ בדיקות חדש
4. ✅ `.kiro/specs/bank-integration-israeli-scrapers/requirements.md` - עדכון דרישות
5. ✅ `.kiro/specs/bank-integration-israeli-scrapers/tasks.md` - עדכון משימות
6. ✅ `BANK_TRANSACTION_DISPLAY_UPDATE.md` - מסמך סיכום זה

---

## בדיקות שבוצעו

✅ בדיקות יחידה (6/6 עברו)
✅ בדיקת קומפילציה של TypeScript
✅ עדכון תיעוד

---

## הערות נוספות

- השינוי לא משפיע על הלוגיקה העסקית של התאמת עסקאות
- השינוי משפיע רק על שכבת התצוגה (UI)
- אין צורך בשינויי Backend או מסד נתונים
- התאימות לאחור שמורה - כל העסקאות הקיימות יוצגו נכון

---

## צעדים הבאים (אופציונלי)

1. בדיקת אינטגרציה עם נתונים אמיתיים מהבנק
2. בדיקת נגישות (accessibility) של התצוגה החדשה
3. קבלת משוב ממנהלי גמ"ח על התצוגה החדשה

---

**מסמך זה נוצר:** 2026-07-02  
**מפתח:** Kiro AI Assistant  
**מאושר לייצור:** ✅ כן
