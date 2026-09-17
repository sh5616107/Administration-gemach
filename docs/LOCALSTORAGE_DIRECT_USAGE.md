# בדיקת localStorage.setItem - שימוש ישיר

תאריך: 2026-09-17

## מטרה
זיהוי כל השימושים הישירים ב-`localStorage.setItem()` כדי לוודא שאין עקיפה של המנגנון המרכזי.

---

## ממצאים

### סה"כ שימושים ישירים: 5

---

## 1. ✅ persistence.ts (שורה 66) - מוצדק

```typescript
localStorage.setItem(STORAGE_KEY, json)
```

**הצדקה:**
- **זהו המנגנון המרכזי עצמו!**
- `persistence.ts` אחראי על שמירת כל הנתונים ל-localStorage
- כל ה-services עוברים דרכו דרך `saveAppData()`
- זה המקום **היחיד** שאמור לכתוב לstorage

**סטטוס:** ✅ נכון וחיוני

---

## 2. ⚠️ AlertsDialog.tsx (שורות 105, 122) - לא חלק מהנתונים העיקריים

### שימוש 1: Read Alerts
```typescript
const saveReadAlerts = (alerts: Set<string>) => {
  try {
    localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...alerts]))
  } catch (e) {
    console.error('Error saving read alerts:', e)
  }
}
```

### שימוש 2: Confirmed Repayments
```typescript
const saveConfirmedRepayments = (repayments: Set<string>) => {
  try {
    localStorage.setItem(CONFIRMED_REPAYMENTS_KEY, JSON.stringify([...repayments]))
  } catch (e) {
    console.error('Error saving confirmed repayments:', e)
  }
}
```

**הצדקה:**
- אלו **UI state** - לא נתונים עסקיים
- מטרה: לזכור אילו התראות המשתמש כבר קרא (per-session/device)
- לא שייך ל-`gemach_data` הראשי
- אם ימחק - אין השפעה על תקינות הנתונים

**האם צריך לשנות?**
- ⚠️ **לא דחוף** - זה UI state נפרד
- אבל: אפשר לשקול שמירה ב-`settings` או ב-key נפרד במנגנון המרכזי
- או: להוסיף הערה שזה בכוונה מחוץ למנגנון

**סטטוס:** ⚠️ מותר אבל כדאי לתעד

---

## 3. ⚠️ scheduler.ts (שורה 110) - Repair Log

```typescript
const log = JSON.parse(localStorage.getItem(MISSED_LOANS_REPAIR_KEY) || '{}')
log[loanId] = new Date().toISOString().split('T')[0]
localStorage.setItem(MISSED_LOANS_REPAIR_KEY, JSON.stringify(log))
```

**הצדקה:**
- זהו **debug/repair log** - לא נתונים עסקיים קריטיים
- מטרה: למנוע ניסיונות תיקון חוזרים של אותה הלוואה
- שומר במפתח נפרד: `MISSED_LOANS_REPAIR_KEY`
- אם ימחק - בסוף לא קורה כלום נורא

**האם צריך לשנות?**
- ⚠️ **לא דחוף** - זה metadata של תהליך תיקון
- אבל: יכול לגרום לבעיות אם שני tabs פתוחים (אין sync)
- עדיף: לשמור ב-`settings` או לשלוח לaudit log

**סטטוס:** ⚠️ עובד אבל לא אידיאלי

---

## 4. ❌ recurringItemsService.ts (שורה 761) - Audit Log

```typescript
const logs = JSON.parse(localStorage.getItem('audit_log') || '[]')
logs.push(logEntry)
localStorage.setItem('audit_log', JSON.stringify(logs))
```

**בעיה:**
- **זה כן נתונים עסקיים!** (audit log)
- עוקף את המנגנון המרכזי לגמרי
- לא מתבצע דרך `saveAppData()` → אין `saveQueue` → **race condition אפשרי**
- לא מסונכרן עם שאר הנתונים

**מה צריך לקרות?**
```typescript
// במקום כתיבה ישירה:
localStorage.setItem('audit_log', ...)

// צריך להשתמש ב:
import { logAuditEntry } from './auditLog'
await logAuditEntry(entityType, entityId, action, details)
```

`auditLog.ts` כבר קיים ומשתמש ב-`database.ts` → `setItem()` → `saveData()`

**סטטוס:** ❌ **צריך לתקן** - עוקף מנגנון, גורם לrace condition

---

## 5. ❌ BankMatchingPage.tsx (שורות 175, 188) - כתיבה ישירה לנתונים!

### שימוש 1:
```typescript
const data = JSON.parse(localStorage.getItem('gemach_data')!);
if (match_type === 'loan') {
  data.repayments[repayment.id] = {
    ...repayment,
    verified: true,
    verified_at: new Date().toISOString(),
  };
  localStorage.setItem('gemach_data', JSON.stringify(data));  // ❌ עוקף הכל!
}
```

### שימוש 2:
```typescript
} else if (match_type === 'deposit') {
  data.deposits[deposit.id] = {
    ...deposit,
    verified: true,
    verified_at: new Date().toISOString(),
  };
  localStorage.setItem('gemach_data', JSON.stringify(data));  // ❌ עוקף הכל!
}
```

**בעיה חמורה:**
- **עוקף את כל המנגנון!**
- קורא את `gemach_data` ישירות
- משנה אותו
- כותב בחזרה בלי:
  - `saveQueue` → **race condition**
  - `flushPendingSave()` → **אין ערבות שנשמר**
  - `commitData()` → **אין אישור**
  - **אין audit log** על השינוי

**מה צריך לקרות?**
```typescript
// במקום:
const data = JSON.parse(localStorage.getItem('gemach_data')!);
data.repayments[id] = {...}
localStorage.setItem('gemach_data', JSON.stringify(data));

// צריך:
import * as db from '../../services/database'
const repayment = await db.getItem('repayments', repayment.id)
await db.setItem('repayments', repayment.id, {
  ...repayment,
  verified: true,
  verified_at: new Date().toISOString()
})
```

**סטטוס:** ❌ **חובה לתקן** - מערבב את המנגנון, גורם לrace conditions

---

## סיכום

| קובץ | שורה | שימוש | סטטוס | דחיפות |
|------|------|-------|--------|---------|
| persistence.ts | 66 | המנגנון עצמו | ✅ תקין | - |
| AlertsDialog.tsx | 105 | UI state (read alerts) | ⚠️ מותר | נמוכה |
| AlertsDialog.tsx | 122 | UI state (confirmed) | ⚠️ מותר | נמוכה |
| scheduler.ts | 110 | Repair log | ⚠️ עובד | בינונית |
| recurringItemsService.ts | 761 | Audit log | ❌ לתקן | **גבוהה** |
| BankMatchingPage.tsx | 175 | כתיבה ישירה לrepayments | ❌ לתקן | **גבוהה מאוד** |
| BankMatchingPage.tsx | 188 | כתיבה ישירה לdeposits | ❌ לתקן | **גבוהה מאוד** |

---

## המלצות מיידיות

### 🔥 קריטי - לתקן עכשיו:

#### 1. BankMatchingPage.tsx
**החלף:**
```typescript
// import בראש הקובץ:
import * as db from '../../services/database'

// במקום כתיבה ישירה:
const repayment = await repaymentsService.getById(repayment_id)
await repaymentsService.update(repayment_id, {
  verified: true,
  verified_at: new Date().toISOString()
})
```

#### 2. recurringItemsService.ts
**החלף:**
```typescript
// במקום:
const logs = JSON.parse(localStorage.getItem('audit_log') || '[]')
logs.push(logEntry)
localStorage.setItem('audit_log', JSON.stringify(logs))

// השתמש ב:
import { logAuditEntry } from './auditLog'
await logAuditEntry(
  entityType,
  entityId,
  action,
  details
)
```

---

### ⚠️ רצוי - לשפר בהזדמנות:

#### 3. scheduler.ts - Repair Log
שקול להעביר ל-`settings` או ל-mechanism מרכזי:
```typescript
await db.setItem('settings', 'missed_loans_repair_log', log)
```

#### 4. AlertsDialog.tsx
הוסף הערה שמסבירה שזה UI state בכוונה:
```typescript
// Note: UI state stored separately from business data
// This is intentional - these are per-device display preferences
localStorage.setItem(READ_ALERTS_KEY, ...)
```

---

## מסקנות

**✅ המנגנון המרכזי (persistence.ts) עובד נכון**

**❌ 2 מקומות קריטיים עוקפים אותו:**
1. BankMatchingPage.tsx - כתיבה ישירה לנתונים עסקיים
2. recurringItemsService.ts - כתיבה ישירה ל-audit log

**⚠️ 3 מקומות משתמשים ב-localStorage לUI state/metadata:**
- AlertsDialog.tsx (2 שימושים) - UI state
- scheduler.ts - repair log

**המלצה:** לתקן את 2 הקריטיים מיידית, השאר אפשר להשאיר עם תיעוד.
