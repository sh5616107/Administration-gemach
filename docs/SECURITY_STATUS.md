# מצב אבטחה ו-Authentication - מערכת הגמ"ח

**תאריך תיעוד**: 09/09/2026 (עודכן 23/09/2026 - ראו החלטה #1 בהמשך)
**גרסה**: 4.5.0

---

## סיכום מצב נוכחי

המערכת **כן כוללת** מנגנון authentication פעיל המבוסס על:
1. **סיסמת משתמש** - מאובטחת עם SHA-256 + salt אקראי
2. **קוד מאסטר קבוע** - נשמר כ-hash, לא כנוסחה גלויה (backdoor למפתח).
   **עודכן 23/09/2026** - ראו החלטה #1 להיסטוריה ולפתרון; התיאור
   המקורי של "אלגוריתם דטרמיניסטי" בהמשך המסמך משקף את המצב הישן.

### מיקום הקוד
- **`src/services/protection.ts`** - לוגיקה מלאה
- **`src/components/LockScreen.tsx`** - UI (סביר להניח)
- **`src/App.tsx`** - בדיקה בזמן אתחול

---

## 📊 ניתוח ממצאי אבטחה

### ✅ מה עובד נכון

1. **SHA-256 + Salt**:
   - Salt אקראי (16 bytes) נוצר לכל סיסמה
   - הסיסמה נשמרת בפורמט `salt:hash`
   - Salt שונה למשתמשים שונים

2. **Migration אוטומטי מ-plaintext**:
   - מזהה סיסמאות ישנות (ללא ':')
   - ממיר ל-hash בהצלחת כניסה ראשונה
   - לוג: `[SECURITY] Password migrated to secure hash`

3. **הפרדת concerns**:
   - Hash/verify מופרדים מלוגיקת authentication
   - שימוש ב-Web Crypto API תקני

### ⚠️ P0: בעיות קריטיות שזוהו

#### 1. **קוד מאסטר דטרמיניסטי ונחשף**

**הבעיה**:
```typescript
const MAGIC_NUMBER = 7391
export function generateMasterCode(date: Date = new Date()): string {
  const year = date.getFullYear()
  const dayOfYear = getDayOfYear(date)
  const code = ((year * dayOfYear) + MAGIC_NUMBER) % 999999
  return code.toString().padStart(6, '0')
}
```

**סיכון**:
- כל מי שרואה את קוד המקור (או דקומפילציה של JS bundle) יכול לחשב את הקוד היומי
- ה-`MAGIC_NUMBER` קבוע וידוע
- האלגוריתם פשוט ומתועד בקוד

**חומרה**: P0 - Critical  
**השפעה**: ניתן לעקוף את כל מנגנון ההגנה

**פתרון אפשרי**:
- להסיר את מנגנון הקוד המאסטר לחלוטין
- או להחליף ב-"שאלת אבטחה" + recovery email
- או למעבר ל-TOTP-based recovery (Google Authenticator)

#### 2. **SHA-256 הוא לא KDF יעודי לסיסמאות**

**הבעיה**:
- SHA-256 מהיר מדי - ניתן לבצע מיליוני ניסיונות לשנייה
- לא כולל cost parameter (iterations)
- לא memory-hard (עמיד ל-GPU/ASIC attacks)

**חומרה**: P0 - High  
**השפעה**: חשיפה ל-brute-force אם ה-hash דולף

**פתרון מומלץ**:
```typescript
// אופציה 1: PBKDF2 (נתמך ב-Web Crypto API)
const key = await crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: saltBytes,
    iterations: 600000, // OWASP recommendation
    hash: 'SHA-256'
  },
  // ... material
)

// אופציה 2: Argon2id (דורש ספרייה חיצונית)
import { hash } from '@noble/hashes/argon2'
const hashedPassword = hash(password, { 
  salt,
  m: 65536, // 64 MiB
  t: 3,     // 3 iterations
  p: 4      // 4 parallelism
})
```

#### 3. **השוואה לא constant-time**

**הבעיה**:
```typescript
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // ...
  return newHash === storedHash  // ⚠️ לא timing-safe!
}
```

**סיכון**:
- תוקף יכול לבצע timing attack
- מודד זמני תגובה כדי לנחש תווים בסיסמה

**חומרה**: P0 - Medium  
**השפעה**: תיאורטי (דורש תוקף מתוחכם), אבל חור ידוע

**פתרון**:
```typescript
import { timingSafeEqual } from 'crypto' // Node.js
// או בדפדפן:
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  
  let result = 0
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i]
  }
  
  return result === 0
}
```

---

## 📋 Decision Log

### החלטה #1: קוד מאסטר דטרמיניסטי
**סטטוס**: ✅ **נפתר**  
**תאריך פתיחה**: 09/09/2026
**תאריך פתרון**: 23/09/2026

**מה השתנה**: הוחלט לוותר על מנגנון "recovery מתוחכם" (TOTP/שאלת אבטחה/email)
לטובת פתרון פרופורציונלי לרמת הסיכון בפועל (אפליקציית desktop מקומית,
לא מערכת עם חשיפה לאינטרנט, אין נתונים ברמת "סוד מדינה"). הנוסחה
הדטרמיניסטית (`year × dayOfYear + magicNumber`) הוחלפה בקוד מאסטר
**קבוע**, שיוני בוחר בעצמו, נשמר רק כ-hash (`MASTER_CODE_HASH`)
באמצעות אותו מנגנון `hashPassword`/`verifyPassword` שכבר קיים לסיסמת
המשתמש — אין ספרייה/מנגנון חדש.

**איך זה סוגר את הסיכון**: הריפו ציבורי בגיטהאב, כך שהבעיה המקורית
לא הייתה תיאורטית - מי שרואה את קוד המקור רואה נוסחה גלויה שממנה
אפשר לחשב את הקוד של כל יום, ללא צורך בשום ניחוש. עכשיו רואים רק
hash - לא ניתן לגזור ממנו את הקוד המקורי.

**שימוש**: `node scripts/generateMasterCodeHash.cjs "הקוד-שבחרת"` —
מדביקים את הפלט כ-`MASTER_CODE_HASH` ב-`protection.ts`. הקוד עצמו
(לא ה-hash) נשמר במקום פרטי אצל יוני (password manager וכו'), לא בקוד.

**נשקל ונדחה בכוונה** (לא פרופורציונלי לרמת הסיכון של האפליקציה):
- Rate limiting על ניסיונות קוד מאסטר — אין הגבלה היום; brute-force
  מקומי טכנית אפשרי, אך נשקל כלא רלוונטי לפרופיל הסיכון.
- Challenge-response עם חתימה אסימטרית (Ed25519) — נבדק כאלטרנטיבה
  "יפה יותר" (פותר גם replay), נדחה כ-overkill למקרה הזה. אפשרות
  לעתיד אם יתווספו כמה "בעלי הרשאה" ולא רק יוני.
- הסרת הקוד מהיסטוריית git — נשקל ונדחה: דורש history rewrite מסוכן
  (force-push, שובר forks/clones קיימים), ולא פותר את הבעיה בפועל
  כי זו אפליקציית client-side - האלגוריתם ממילא היה חשוף בכל בינארי
  מותקן, בלי קשר לגיטהאב.

---

### החלטה #2: שדרוג SHA-256 → KDF יעודי
**סטטוס**: 🟡 **מתוכנן לגרסה הבאה**  
**תאריך**: 09/09/2026  

**נימוקים לדחייה**:
1. המערכת כבר משתמשת ב-SHA-256 + salt (טוב יותר מ-plaintext)
2. Migration נדרשת לכל המשתמשים הקיימים
3. דורש בדיקות התאמה לסביבות שונות (desktop vs web)

**תוכנית**:
- **גרסה 4.6.0**: מעבר ל-PBKDF2 (נתמך ב-Web Crypto API מובנה)
- **Migration**: זיהוי hash ישן (SHA-256) ושדרוג ב-login הבא
- **Backward compatibility**: תמיכה זמנית בשני הפורמטים

**יתרונות PBKDF2**:
- ✅ נתמך מובנה ב-Web Crypto API (אין צורך בספריה חיצונית)
- ✅ OWASP-approved עם 600,000 iterations
- ✅ מוכר ונתמך רחב

---

### החלטה #3: Constant-time comparison
**סטטוס**: 🟢 **ניתן לתיקון מיידי**  
**תאריך**: 09/09/2026  

**נימוקים**:
1. תיקון קטן וממוקד (פונקציה אחת)
2. אין השפעה על API או משתמשים
3. סוגר חור אבטחה ידוע

**תוכנית**: ליישם בסשן הנוכחי

---

## 🎯 סדר עדיפות מומלץ

| # | נושא | עדיפות | מורכבות | הערות |
|---|------|---------|----------|-------|
| 1 | Constant-time comparison | P0 | נמוכה | ✅ בוצע |
| 2 | PBKDF2 migration | P0 | בינונית | ⏳ פתוח - מתוכנן |
| 3 | קוד מאסטר חלופי | P0 | נמוכה | ✅ בוצע 23/09/2026 - ראו החלטה #1 |

---

## 📝 הערות נוספות

### תאימות לאחור
המערכת כבר כוללת migration path מ-plaintext ל-SHA-256:
```typescript
if (userPasswordHash.includes(':')) {
  // Hash חדש
} else {
  // תאימות לאחור - plaintext
  if (inputCode === userPasswordHash) {
    const newHash = await hashPassword(inputCode)
    await protectionStore.setItem('password', newHash)
  }
}
```

אפשר להשתמש באותו דפוס ל-migration מ-SHA-256 ל-PBKDF2:
```typescript
if (userPasswordHash.startsWith('pbkdf2:')) {
  // PBKDF2 hash
} else if (userPasswordHash.includes(':')) {
  // SHA-256 hash - migrate
  if (await verifyPasswordSHA256(inputCode, userPasswordHash)) {
    const newHash = await hashPasswordPBKDF2(inputCode)
    await protectionStore.setItem('password', newHash)
  }
}
```

### בדיקות נדרשות
- ✅ טסטים קיימים ל-hashPassword/verifyPassword
- ❌ טסט ל-timing attack (קשה לבדיקה אוטומטית)
- ❌ טסט למעבר SHA-256 → PBKDF2

---

## סיכום

**המערכת כוללת authentication פעיל** עם (עדכון 23/09/2026):
- ✅ הגנת סיסמה (SHA-256 + salt)
- ✅ קוד מאסטר קבוע, נשמר כ-hash (לא נוסחה גלויה) - נפתר, ראו החלטה #1
- ✅ constant-time comparison - בוצע
- ⚠️ לא KDF יעודי (SHA-256, לא PBKDF2/Argon2) - עדיין פתוח, מתוכנן

**הצעד הבא**: PBKDF2 migration (הפריט הפתוח היחיד מבין ה-P0 שתועדו כאן).
