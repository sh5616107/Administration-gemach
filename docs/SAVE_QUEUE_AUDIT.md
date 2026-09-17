# בדיקת Save Queue - מנגנון שמירת נתונים

תאריך: 2026-09-17

## מטרה
בדיקת מנגנון ה-Save Queue ב-`database.ts` לוידוא שהוא מבטיח:
- שמירות מתבצעות בסדר הנכון
- אין race conditions
- אין overwrites לא מכוונים
- error propagation תקין
- read-after-write תקין

---

## ✅ המנגנון הקיים - תקין

### 1. Save Queue (שורות 67-84)

```typescript
let saveQueue: Promise<void> = Promise.resolve()

function saveData(): void {
  // הכנס לתור: כל save ממתין לסיום הקודם
  const currentSave = saveQueue
    .then(() => saveAppData(data))
    .then(() => { 
      logger.info('💾 Data saved') 
    })
    .catch(e => { 
      logger.error('❌ Error saving:', e)
      throw e  // זרוק שגיאה כדי ש-commitData יוכל לזהות כישלון
    })
  
  // המשך את התור גם במקרה של שגיאה - catch נוסף רק לתור
  saveQueue = currentSave.catch(() => {})
  
  // שמור reference ל-save הנוכחי בשביל flushPendingSave ו-commitData
  pendingSave = currentSave
}
```

**✅ מה שהמנגנון מבטיח:**

1. **סדר שמירות נכון:**
   ```
   save A → saveQueue waits → save B → saveQueue waits → save C
   ```
   כל save נכנס לתור ומחכה לקודם.

2. **אין overwrites:**
   `saveQueue` מחזיק Promise שמחכה לקודם → גם אם נקראו 2 saves במקביל, הם יתבצעו בזה אחר זה.

3. **Error propagation:**
   ```typescript
   .catch(e => { 
     logger.error('❌ Error saving:', e)
     throw e  // ← זורק שגיאה ל-commitData
   })
   ```
   שגיאה לא נבלעת - `commitData()` יכול לתפוס אותה.

4. **התור ממשיך גם אחרי שגיאה:**
   ```typescript
   saveQueue = currentSave.catch(() => {})
   ```
   אם save נכשל, התור עצמו לא נתקע - ה-save הבא עדיין יתבצע.

---

### 2. Flush Pending Save (שורות 101-105)

```typescript
export async function flushPendingSave(): Promise<void> {
  if (pendingSave) {
    await pendingSave
  }
}
```

**✅ תפקיד:**
מחכה עד שהשמירה האחרונה תסתיים (להצלחה או לכישלון).

**שימוש:**
- scheduler.ts קורא ל-`flushPendingSave()` אחרי יצירת recurring items כדי למנוע duplicates
- מבטיח read-after-write במקומות קריטיים

---

### 3. Commit Data (שורות 111-114)

```typescript
export async function commitData(): Promise<void> {
  saveData()
  await flushPendingSave()
}
```

**✅ תפקיד:**
שמירה **מובטחת** - מחכה עד שהשמירה הסתיימה בהצלחה לפני שמחזיר.

**שימוש:**
- פעולות קריטיות שדורשות אישור ששינוי נשמר
- לדוגמה: migrations, יבוא נתונים, גיבויים

---

## ✅ בדיקת Scenarios קריטיים

### Scenario 1: Concurrent Writes
```typescript
// קוד:
setItem('loans', '1', loan1)  // save A
setItem('loans', '2', loan2)  // save B
```

**תוצאה:**
```
save A → enters queue → completes
save B → waits for A → enters queue → completes
```

✅ **תקין** - אין race condition

---

### Scenario 2: Read-After-Write
```typescript
// קוד:
await commitData()  // מחכה לשמירה
const loans = getAllItems('loans')  // קורא מייד
```

**תוצאה:**
```
commitData() → saveData() → flushPendingSave() → מחכה
getAllItems() → קורא מה-memory (data object) שכבר עודכן
```

✅ **תקין** - הקריאה תמיד רואה את הנתונים המעודכנים כי data object עודכן לפני saveData()

---

### Scenario 3: Error Propagation
```typescript
// קוד:
try {
  await commitData()  // נכשל
} catch (e) {
  console.error('Save failed:', e)
}
```

**תוצאה:**
```
commitData() → saveData() → saveAppData() נכשל
  → throw e → commitData catches → caller catches
```

✅ **תקין** - שגיאה מועברת ל-caller

---

### Scenario 4: Multiple Updates to Same Item
```typescript
// קוד:
updateSeriesItems(seriesId, { amount: 100 })  // save 1
updateSeriesItems(seriesId, { amount: 200 })  // save 2
```

**תוצאה:**
```
update 1 → modifies data object → save A enters queue
update 2 → modifies data object (overwrites) → save B waits for A
```

✅ **תקין אבל חשוב להבין:**
- ה-data object **עצמו** מעודכן מיד במקביל (synchronous)
- רק הכתיבה לקובץ היא sequential
- לכן העדכון השני "מנצח" בזיכרון לפני שהראשון נשמר
- זה OK כי אנחנו רוצים את המצב הסופי

---

## ✅ בדיקת updateSeriesItems

### הקוד (מתוך recurringItemsService.ts)
```typescript
export async function updateSeriesItems(
  originalItemId: string,
  updates: Partial<Loan | Deposit>
): Promise<void> {
  // ... זיהוי סדרה
  for (const item of seriesItems) {
    await service.update(item.id, updates)  // ← כל update קורא ל-setItem → saveData
  }
  
  await db.commitData()  // ← מחכה לשמירה סופית
}
```

**מה קורה:**
```
update item 1 → setItem → saveData → save enters queue (A)
update item 2 → setItem → saveData → save enters queue (B, waits for A)
update item 3 → setItem → saveData → save enters queue (C, waits for B)
...
commitData() → מחכה ל-C (האחרון)
```

✅ **תקין** - כל העדכונים בסדר, commitData מבטיח שהכל נשמר

---

## ✅ בדיקת scheduler.ts

### הקוד (שורות 181-186)
```typescript
export async function runStartupChecks(): Promise<void> {
  try {
    await autoCreateRecurringItems()
    await db.flushPendingSave()  // ← מחכה לשמירה
    // ...
```

**למה זה חשוב:**
- לפני התיקון: התהליך יכול היה להיהרג לפני שהשמירה הסתיימה
- אחרי התיקון: `flushPendingSave()` מבטיח שהשמירה הושלמה לפני שממשיכים

✅ **תקין** - מונע duplicates ב-recurring items

---

## 📋 סיכום - המנגנון תקין ✅

| נקודה | סטטוס | הערות |
|-------|--------|-------|
| **Concurrent writes** | ✅ תקין | saveQueue מבטיח sequential |
| **Error propagation** | ✅ תקין | שגיאות מועברות ל-caller |
| **Read-after-write** | ✅ תקין | data object עודכן synchronous |
| **Queue continuation** | ✅ תקין | התור ממשיך גם אחרי שגיאה |
| **commitData()** | ✅ תקין | מחכה לשמירה מובטחת |
| **flushPendingSave()** | ✅ תקין | מבטיח read-after-write |
| **updateSeriesItems** | ✅ תקין | כל העדכונים נשמרים בסדר |
| **scheduler** | ✅ תקין | מונע duplicates עם flushPendingSave |

---

## ⚠️ הערות חשובות

### 1. Fire-and-Forget vs Guaranteed Save

רוב הקריאות ל-`setItem` / `removeItem` הן **fire-and-forget**:
```typescript
setItem('loans', id, loan)  // ← לא מחכה, תור מטפל
```

זה **בסדר** כי:
- המידע כבר עודכן ב-`data` object (synchronous)
- הקריאה הבאה תראה את העדכון
- התור מבטיח שהשמירה תתבצע בסופו של דבר

### 2. מתי להשתמש ב-commitData()

רק בפעולות **קריטיות** שבהן חייבים אישור שהשמירה הצליחה:
- migrations
- import/export
- recurring items creation (scheduler)
- backup/restore

**אל תשתמש** ב-commitData() בכל מקום - זה יהיה **איטי מדי**.

### 3. המנגנון לא מגן מפני:

- **App crash לפני save:** אם האפליקציה קורסת בין `setItem` ל-`saveData`, העדכון אבוד.
  - **פתרון:** `flushPendingSave()` במקומות קריטיים
  
- **Concurrent reads/writes למידע ה-same בזיכרון:**
  - לדוגמה: thread A קורא loan.amount = 100, thread B מעדכן ל-200, thread A כותב 150
  - **זה לא בעיה ב-JavaScript** כי הכל single-threaded
  - אבל **כן בעיה** אם יש web workers או Tauri background threads
  - **במצב הנוכחי:** אין שימוש ב-workers/threads שמשנים נתונים → בסדר

---

## 🎯 המלצות

1. ✅ **השאר את המנגנון כמו שהוא** - הוא עובד טוב
2. ✅ **המשך להשתמש ב-flushPendingSave()** במקומות קריטיים
3. ✅ **אל תהפוך כל setItem ל-await commitData()** - זה יהיה איטי מדי
4. ⚠️ **אם מוסיפים web workers בעתיד** - צריך לשקול message passing או locks

---

## ✅ סטטוס: מנגנון Save Queue תקין ואין צורך בשינויים
