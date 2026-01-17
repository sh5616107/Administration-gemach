import localforage from 'localforage'

const protectionStore = localforage.createInstance({ name: 'gemach', storeName: 'protection' })

// מספר קסם לאלגוריתם קוד מאסטר
const MAGIC_NUMBER = 7391

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
  const userPassword = await protectionStore.getItem<string>('password')
  if (userPassword && inputCode === userPassword) {
    return true
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
 * שמירת סיסמת משתמש
 */
export async function setUserPassword(password: string): Promise<void> {
  await protectionStore.setItem('password', password)
}

/**
 * קבלת סיסמת משתמש (לבדיקה אם קיימת)
 */
export async function getUserPassword(): Promise<string | null> {
  return await protectionStore.getItem<string>('password')
}

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
