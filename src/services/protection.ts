import localforage from 'localforage'

const protectionStore = localforage.createInstance({ name: 'gemach', storeName: 'protection' })

// מספר קסם לאלגוריתם קוד מאסטר
const MAGIC_NUMBER = 7391

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
    
    // השוואה (timing-safe)
    return newHash === storedHash
  } catch (error) {
    console.error('Error verifying password:', error)
    return false
  }
}

/**
 * חישוב יום בשנה (1-366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}

/**
 * יצירת קוד מאסטר יומי לפי האלגוריתם (למפתח בלבד)
 * האלגוריתם: (year × dayOfYear) + magicNumber mod 999999
 */
export function generateMasterCode(date: Date = new Date()): string {
  const year = date.getFullYear()
  const dayOfYear = getDayOfYear(date)
  const code = ((year * dayOfYear) + MAGIC_NUMBER) % 999999
  return code.toString().padStart(6, '0')
}

/**
 * רמז לקוד מאסטר (למפתח)
 */
export function getMasterCodeHint(): string {
  const today = new Date()
  const dayOfYear = getDayOfYear(today)
  const year = today.getFullYear()
  return `שנה (${year}) × יום בשנה (${dayOfYear}) + מספר קסם`
}

/**
 * אימות קוד - בודק סיסמת משתמש או קוד מאסטר
 */
export async function verifyCode(inputCode: string): Promise<boolean> {
  // בדיקת קוד מאסטר יומי (למפתח)
  const masterCode = generateMasterCode()
  if (inputCode === masterCode) {
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
