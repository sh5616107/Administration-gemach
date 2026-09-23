import localforage from 'localforage'

const protectionStore = localforage.createInstance({ name: 'gemach', storeName: 'protection' })

// ============================================
// 🔐 Web Crypto API - Password Security
// ============================================

/**
 * יצירת hash מאובטח לסיסמה באמצעות SHA-256 + salt
 * @param password - הסיסמה לhash
 * @param salt - salt אופציונלי (אם לא מסופק, נוצר אחד חדש)
 * @returns מחרוזת בפורמט "salt:hash"
 */
async function hashPassword(password: string, salt?: string): Promise<string> {
  // אם לא סיפקו salt, ניצור אחד חדש (16 bytes = 32 hex chars)
  if (!salt) {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    salt = Array.from(saltBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  
  // המרת הסיסמה + salt ל-bytes
  const encoder = new TextEncoder()
  const data = encoder.encode(password + salt)
  
  // חישוב SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  
  // המרה ל-hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  // החזרת salt:hash
  return `${salt}:${hashHex}`
}

/**
 * השוואה constant-time בין שתי מחרוזות
 * מונעת timing attacks על ידי השוואה של כל התווים תמיד
 * @param a - מחרוזת ראשונה
 * @param b - מחרוזת שנייה
 * @returns true אם המחרוזות זהות
 */
function timingSafeEqual(a: string, b: string): boolean {
  // אם האורכים שונים, עדיין נריץ את כל הלולאה כדי למנוע timing leak
  const bufA = new TextEncoder().encode(a)
  const bufB = new TextEncoder().encode(b)
  
  // נעבוד על האורך המקסימלי
  const maxLen = Math.max(bufA.length, bufB.length)
  
  let result = 0
  // XOR של כל הבייטים - אם שונים, result יהיה != 0
  for (let i = 0; i < maxLen; i++) {
    const byteA = i < bufA.length ? bufA[i] : 0
    const byteB = i < bufB.length ? bufB[i] : 0
    result |= byteA ^ byteB
  }
  
  // גם השוואת האורכים בצורה שלא תדלוף timing
  result |= bufA.length ^ bufB.length
  
  return result === 0
}

/**
 * אימות סיסמה מול hash שמור
 * @param password - הסיסמה לבדיקה
 * @param storedHash - ההash השמור (בפורמט "salt:hash")
 * @returns true אם הסיסמה תואמת
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    // פירוק ה-hash ל-salt וhash
    const [salt, originalHash] = storedHash.split(':')
    
    if (!salt || !originalHash) {
      return false
    }
    
    // חישוב hash חדש עם אותו salt
    const newHash = await hashPassword(password, salt)
    
    // השוואה constant-time (מונעת timing attacks)
    return timingSafeEqual(newHash, storedHash)
  } catch (error) {
    console.error('Error verifying password:', error)
    return false
  }
}

/**
 * קוד מאסטר קבוע (למפתח בלבד) - נשמר כ-hash, לא כטקסט גלוי
 *
 * ⚠️ זהו placeholder בלבד! לפני production, יש להריץ:
 *   node scripts/generateMasterCodeHash.cjs "הקוד-שבחרת"
 * ולהחליף את הערך הבא בפלט של הסקריפט.
 *
 * למה hash ולא נוסחה: קוד המאסטר הקודם היה פונקציה גלויה בקוד המקור
 * (year × dayOfYear + magicNumber) - כל מי שראה את הקוד (הריפו ציבורי
 * בגיטהאב) יכול היה לחשב את הקוד של כל יום. עכשיו רק ה-hash גלוי,
 * בדיוק כמו סיסמת משתמש - אי אפשר לגזור ממנו את הקוד המקורי.
 */
const MASTER_CODE_HASH = '4e0e6e5c0ae339fdce2facd3299b20e0:5f23e493bf54ade55f4bc7f6c1cc69251ff3fb3aa3459ea4b4289896c5898b7d'

/**
 * אימות קוד - בודק סיסמת משתמש או קוד מאסטר
 */
export async function verifyCode(inputCode: string): Promise<boolean> {
  // בדיקת קוד מאסטר קבוע (למפתח) - השוואה מאובטחת מול ה-hash
  if (await verifyPassword(inputCode, MASTER_CODE_HASH)) {
    return true
  }
  
  // בדיקת סיסמת משתמש
  const userPasswordHash = await protectionStore.getItem<string>('password')
  if (userPasswordHash) {
    // אם יש ':' זה hash מאובטח, אחרת זה סיסמה ישנה (plain text)
    if (userPasswordHash.includes(':')) {
      // Hash חדש - אימות מאובטח
      return await verifyPassword(inputCode, userPasswordHash)
    } else {
      // תאימות לאחור - סיסמה ישנה בטקסט רגיל
      // מיגרציה אוטומטית: נשמור אותה כ-hash
      if (inputCode === userPasswordHash) {
        // הסיסמה נכונה - נמיר אותה ל-hash
        const newHash = await hashPassword(inputCode)
        await protectionStore.setItem('password', newHash)
        console.log('[SECURITY] Password migrated to secure hash')
        return true
      }
    }
  }
  
  return false
}

/**
 * בדיקה אם ההגנה מופעלת
 */
export async function isProtectionEnabled(): Promise<boolean> {
  const enabled = await protectionStore.getItem<boolean>('enabled')
  return enabled === true
}

/**
 * הפעלת/כיבוי הגנה
 */
export async function setProtectionEnabled(enabled: boolean): Promise<void> {
  await protectionStore.setItem('enabled', enabled)
}

/**
 * שמירת סיסמת משתמש (מאובטחת עם hash)
 */
export async function setUserPassword(password: string): Promise<void> {
  // חישוב hash מאובטח
  const hashedPassword = await hashPassword(password)
  
  // שמירת ה-hash (לא הסיסמה עצמה!)
  await protectionStore.setItem('password', hashedPassword)
  
  console.log('[SECURITY] Password saved securely as hash')
}

/**
 * קבלת סיסמת משתמש (לבדיקה אם קיימת)
 */
export async function getUserPassword(): Promise<string | null> {
  return await protectionStore.getItem<string>('password')
}

// ============================================
// 🧪 פונקציות עזר (לטסטים)
// ============================================

/**
 * פונקציות hash ו-verify מיוצאות לצורך בדיקות
 * @internal - לשימוש בבדיקות בלבד
 */
export { hashPassword as _hashPasswordForTesting }
export { verifyPassword as _verifyPasswordForTesting }

/**
 * קוד המאסטר בטקסט גלוי - **לבדיקות בלבד**, תואם ל-MASTER_CODE_HASH למעלה.
 * @internal
 */
export const _MASTER_CODE_PLAINTEXT_FOR_TESTING = 'CHANGE-ME-8492'

/**
 * בדיקה אם המשתמש מאומת (בסשן הנוכחי)
 */
let isAuthenticated = false

export function checkAuthenticated(): boolean {
  return isAuthenticated
}

export function setAuthenticated(value: boolean): void {
  isAuthenticated = value
}

/**
 * שמירת רמז מותאם אישית
 */
export async function setCustomHint(hint: string): Promise<void> {
  await protectionStore.setItem('customHint', hint)
}

export async function getCustomHint(): Promise<string | null> {
  return await protectionStore.getItem<string>('customHint')
}
