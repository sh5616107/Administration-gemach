# מצב אבטחה ו-Authentication - מערכת הגמ"ח

**תאריך תיעוד**: 09/09/2026  
**גרסה**: 4.5.0

---

## סיכום מצב נוכחי

המערכת **כן כוללת** מנגנון authentication פעיל המבוסס על:
1. **סיסמת משתמש** - מאובטחת עם SHA-256 + salt אקראי
2. **קוד מאסטר יומי** - מחושב לפי אלגוריתם דטרמיניסטי (backdoor למפתח)

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
**סטטוס**: 🔴 **סיכון פתוח**  
**תאריך**: 09/09/2026  
**החלטה**: לא מטפלים בשלב זה  

**נימוקים**:
1. פתרון מלא דורש תכנון של מנגנון recovery חלופי
2. השפעה על UX (משתמשים צריכים דרך לשחזור גישה)
3. דורש בדיקות עם משתמשי קצה

**סיכון נשאר**:
- כל מי שיש לו גישה לקוד המקור יכול לחשב קוד מאסטר
- מומלץ לתעדף פתרון בגרסאות הבאות

**אפשרויות לעתיד**:
1. מעבר ל-TOTP (Google Authenticator)
2. שאלת אבטחה + recovery email
3. הסרה מלאה של קוד מאסטר + מנגנון reset מתוחכם יותר

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
| 1 | Constant-time comparison | P0 | נמוכה | תיקון מיידי אפשרי |
| 2 | PBKDF2 migration | P0 | בינונית | גרסה 4.6.0 |
| 3 | קוד מאסטר חלופי | P0 | גבוהה | דורש תכנון UX |

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

**המערכת כוללת authentication פעיל** עם:
- ✅ הגנת סיסמה (SHA-256 + salt)
- ⚠️ קוד מאסטר דטרמיניסטי (סיכון ידוע)
- ⚠️ לא KDF יעודי (סיכון בינוני)
- ⚠️ לא constant-time comparison (סיכון תיאורטי)

**ההחלטה**: לא לסגור את כל הבעיות עכשיו, אלא לתעד ולתכנן.

**הצעד הבא**: תיקון constant-time comparison (קל ומהיר).
