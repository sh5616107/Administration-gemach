/**
 * Phone Validation Utilities
 * בדיקת כפילויות של מספרי טלפון במערכת
 */

export interface DuplicatePhoneResult {
  isDuplicate: boolean
  existingContacts: Array<{
    id: string
    name: string
    role: string
    phone: string
  }>
}

/**
 * נרמול מספר טלפון - הסרת מקפים ורווחים
 */
function normalizePhone(phone: string): string {
  return phone.replace(/[-\s]/g, '')
}

/**
 * בדיקה האם מספר טלפון כבר קיים במערכת
 * @param phone - מספר הטלפון לבדיקה
 * @param excludeId - ID לא לכלול בבדיקה (למקרה של עריכה)
 * @returns תוצאת הבדיקה עם רשימת אנשי קשר כפולים
 */
export async function checkDuplicatePhone(
  phone: string,
  excludeId?: string
): Promise<DuplicatePhoneResult> {
  // ייבוא דינמי למניעת circular dependency
  const { borrowersService, guarantorsService } = await import('../services/database')
  
  // בדיקה בסיסית - טלפון חובה
  if (!phone || phone === '0' || phone.trim() === '') {
    return {
      isDuplicate: true,
      existingContacts: [{
        id: '',
        name: '⚠️ שגיאה: חובה להזין מספר טלפון תקין',
        role: 'שגיאה',
        phone: phone || '(ריק)'
      }]
    }
  }
  
  const normalizedPhone = normalizePhone(phone)
  const duplicates: Array<{ id: string; name: string; role: string; phone: string }> = []
  
  // בדיקה בלווים (Borrowers)
  try {
    const borrowers = await borrowersService.getAll()
    for (const borrower of borrowers) {
      if (borrower.id !== excludeId) {
        const borrowerPhone = normalizePhone(borrower.phone || '')
        if (borrowerPhone === normalizedPhone) {
          duplicates.push({
            id: String(borrower.id),
            name: `${borrower.first_name} ${borrower.last_name}`,
            role: 'לווה',
            phone: borrower.phone
          })
        }
      }
    }
  } catch (error) {
    console.error('Error checking borrowers:', error)
  }
  
  // בדיקה בערבים (Guarantors)
  try {
    const guarantors = await guarantorsService.getAll()
    for (const guarantor of guarantors) {
      if (guarantor.id !== excludeId) {
        const guarantorPhone = normalizePhone(guarantor.phone || '')
        if (guarantorPhone === normalizedPhone) {
          duplicates.push({
            id: String(guarantor.id),
            name: `${guarantor.first_name} ${guarantor.last_name}`,
            role: 'ערב',
            phone: guarantor.phone
          })
        }
      }
    }
  } catch (error) {
    console.error('Error checking guarantors:', error)
  }
  
  // TODO: הוסף בדיקה גם ב-donors ו-depositors כשהם יעברו ל-UUID
  
  return {
    isDuplicate: duplicates.length > 0,
    existingContacts: duplicates
  }
}

/**
 * בדיקה האם מספר טלפון תקין (פורמט בסיסי)
 */
export function isValidPhoneFormat(phone: string): boolean {
  if (!phone) return false
  
  const normalized = normalizePhone(phone)
  
  // לפחות 9 ספרות, לא יותר מ-15
  return normalized.length >= 9 && normalized.length <= 15 && /^\d+$/.test(normalized)
}
