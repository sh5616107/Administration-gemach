/**
 * Validation utilities
 * פונקציות עזר לאימות נתונים
 */

/**
 * אימות מספר זהות ישראלי באמצעות אלגוריתם Luhn
 * 
 * @param idNumber - מספר זהות (9 ספרות)
 * @returns true אם המספר תקין, false אחרת
 * 
 * אלגוריתם Luhn:
 * 1. מכפילים כל ספרה שנייה (מימין לשמאל) ב-2
 * 2. אם התוצאה גדולה מ-9, מחסרים 9
 * 3. מחברים את כל הספרות
 * 4. אם הסכום מתחלק ב-10, המספר תקין
 */
export function validateIsraeliId(idNumber: string | undefined): boolean {
  if (!idNumber) return false
  
  // הסרת רווחים ומקפים
  const cleanId = idNumber.replace(/[\s-]/g, '')
  
  // בדיקה שהמספר מכיל בדיוק 9 ספרות
  if (!/^\d{9}$/.test(cleanId)) return false
  
  // אלגוריתם Luhn
  let sum = 0
  
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(cleanId[i])
    
    // מכפילים כל ספרה שנייה ב-2 (אינדקסים זוגיים כי מתחילים מ-0)
    if (i % 2 === 0) {
      digit *= 1
    } else {
      digit *= 2
      // אם התוצאה גדולה מ-9, מחסרים 9
      if (digit > 9) {
        digit -= 9
      }
    }
    
    sum += digit
  }
  
  // המספר תקין אם הסכום מתחלק ב-10
  return sum % 10 === 0
}

/**
 * אימות מספר טלפון ישראלי
 * 
 * @param phone - מספר טלפון
 * @returns true אם המספר תקין, false אחרת
 */
export function validateIsraeliPhone(phone: string | undefined): boolean {
  if (!phone) return false
  
  // הסרת רווחים, מקפים וסימנים מיוחדים
  const cleanPhone = phone.replace(/[\s\-()]/g, '')
  
  // בדיקה שהמספר מכיל 9-10 ספרות
  // תומך בפורמטים: 0501234567, 501234567, 02-1234567, וכו'
  if (!/^0?\d{8,9}$/.test(cleanPhone)) return false
  
  // בדיקה שהמספר מתחיל בקידומת תקינה
  const prefix = cleanPhone.startsWith('0') ? cleanPhone.substring(0, 3) : '0' + cleanPhone.substring(0, 2)
  
  const validPrefixes = [
    '050', '051', '052', '053', '054', '055', '056', '057', '058', '059', // סלולר
    '02', '03', '04', '08', '09', '072', '073', '074', '076', '077', '078' // קווי
  ]
  
  return validPrefixes.some(p => prefix.startsWith(p))
}

/**
 * אימות כתובת אימייל
 * 
 * @param email - כתובת אימייל
 * @returns true אם הכתובת תקינה, false אחרת
 */
export function validateEmail(email: string | undefined): boolean {
  if (!email) return false
  
  // ביטוי רגולרי בסיסי לאימות אימייל
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * פורמט מספר זהות ישראלי
 * מוסיף אפסים מובילים אם צריך
 * 
 * @param idNumber - מספר זהות
 * @returns מספר זהות מפורמט (9 ספרות)
 */
export function formatIsraeliId(idNumber: string | undefined): string {
  if (!idNumber) return ''
  
  const cleanId = idNumber.replace(/[\s-]/g, '')
  return cleanId.padStart(9, '0')
}

/**
 * פורמט מספר טלפון ישראלי
 * מוסיף מקפים לקריאות טובה יותר
 * 
 * @param phone - מספר טלפון
 * @returns מספר טלפון מפורמט
 */
export function formatIsraeliPhone(phone: string | undefined): string {
  if (!phone) return ''
  
  const cleanPhone = phone.replace(/[\s\-()]/g, '')
  
  // פורמט לסלולר: 050-1234567
  if (cleanPhone.length === 10 && cleanPhone.startsWith('05')) {
    return `${cleanPhone.substring(0, 3)}-${cleanPhone.substring(3)}`
  }
  
  // פורמט לקווי ירושלים: 02-1234567
  if (cleanPhone.length === 9 && cleanPhone.startsWith('02')) {
    return `${cleanPhone.substring(0, 2)}-${cleanPhone.substring(2)}`
  }
  
  // פורמט לקווי אחרים: 03-1234567
  if (cleanPhone.length === 9) {
    return `${cleanPhone.substring(0, 2)}-${cleanPhone.substring(2)}`
  }
  
  return phone
}
