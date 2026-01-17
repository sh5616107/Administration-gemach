import { HDate, gematriya, Locale, months } from '@hebcal/core'

/**
 * מיפוי שמות חודשים עבריים לקבועי months מ-@hebcal/core
 * הספרייה מטפלת נכון בשנים מעוברות
 */
const hebrewMonthNameToConst: Record<string, number> = {
  'תשרי': months.TISHREI,
  'חשון': months.CHESHVAN,
  'חשוון': months.CHESHVAN,
  'כסלו': months.KISLEV,
  'טבת': months.TEVET,
  'שבט': months.SHVAT,
  'אדר': months.ADAR_I, // בשנה רגילה זה אדר, בשנה מעוברת זה אדר א'
  'אדר א': months.ADAR_I,
  "אדר א'": months.ADAR_I,
  "אדר א׳": months.ADAR_I, // עם גרש עברי
  'אדר ב': months.ADAR_II,
  "אדר ב'": months.ADAR_II,
  "אדר ב׳": months.ADAR_II, // עם גרש עברי
  'ניסן': months.NISAN,
  'אייר': months.IYYAR,
  'סיון': months.SIVAN,
  'סיוון': months.SIVAN,
  'תמוז': months.TAMUZ,
  'אב': months.AV,
  'אלול': months.ELUL,
}

// מיפוי גימטריה לערכים מספריים
const gematriyaValues: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
  'ש': 300, 'ת': 400,
}

/**
 * הסרת ניקוד מטקסט עברי
 */
function removeNikkud(text: string): string {
  // טווח הניקוד בעברית: U+0591 עד U+05C7
  return text.replace(/[\u0591-\u05C7]/g, '')
}

/**
 * המרת תאריך לועזי לתאריך עברי
 */
export function toHebrewDate(dateStr: string): string {
  if (!dateStr) return ''
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return ''
    
    const hdate = new HDate(date)
    const day = gematriya(hdate.getDate())
    const monthName = removeNikkud(Locale.gettext(hdate.getMonthName(), 'he') || hdate.getMonthName())
    const year = gematriya(hdate.getFullYear())
    
    return `${day} ${monthName} ${year}`
  } catch (error) {
    console.error('Error converting to Hebrew date:', error)
    return ''
  }
}

/**
 * פורמט תאריך לפי הגדרת המשתמש
 * @param dateStr - תאריך בפורמט ISO (YYYY-MM-DD)
 * @param dateFormat - 'gregorian' | 'combined'
 * @returns תאריך מפורמט
 */
export function formatDisplayDate(dateStr: string, dateFormat: string = 'gregorian'): string {
  if (!dateStr) return '-'
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    
    // פורמט לועזי
    const gregorian = date.toLocaleDateString('he-IL')
    
    if (dateFormat === 'gregorian') {
      return gregorian
    }
    
    // פורמט משולב
    const hebrew = toHebrewDate(dateStr)
    if (hebrew) {
      return `${gregorian} (${hebrew})`
    }
    
    return gregorian
  } catch (error) {
    return dateStr
  }
}

/**
 * קומפוננטת תצוגת תאריך - מחזירה JSX-like object
 */
export function getDateDisplay(dateStr: string, dateFormat: string = 'gregorian'): { 
  primary: string
  secondary?: string 
} {
  if (!dateStr) return { primary: '-' }
  
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return { primary: dateStr }
    
    const gregorian = date.toLocaleDateString('he-IL')
    
    if (dateFormat === 'gregorian') {
      return { primary: gregorian }
    }
    
    // משולב - לועזי ראשי, עברי משני
    const hebrew = toHebrewDate(dateStr)
    return { 
      primary: gregorian,
      secondary: hebrew || undefined
    }
  } catch (error) {
    return { primary: dateStr }
  }
}


/**
 * המרת מספר גימטריה לערך מספרי
 * @param gematriyaStr - מחרוזת גימטריה (למשל: ט"ו, כ"ה, תשפ"ו)
 * @returns ערך מספרי
 */
export function gematriyaToNumber(gematriyaStr: string): number {
  if (!gematriyaStr) return 0
  
  // הסרת גרשיים וסימני פיסוק
  const cleaned = gematriyaStr.replace(/['"״׳]/g, '').trim()
  
  let total = 0
  for (const char of cleaned) {
    total += gematriyaValues[char] || 0
  }
  
  return total
}

/**
 * המרת תאריך עברי לתאריך לועזי
 * @param input - תאריך עברי (למשל: ט"ו שבט תשפ"ו או 15 שבט 5786)
 * @returns תאריך לועזי או null אם לא תקין
 */
export function parseHebrewDate(input: string): Date | null {
  if (!input || typeof input !== 'string') return null
  
  try {
    const trimmed = input.trim()
    
    // הסרת ניקוד לפני עיבוד
    const cleanedInput = removeNikkud(trimmed)
    
    // פיצול לחלקים
    const parts = cleanedInput.split(/\s+/)
    if (parts.length < 2) return null
    
    // ניסיון לפענח יום
    let day: number
    const dayPart = parts[0]
    
    // בדיקה אם זה מספר רגיל או גימטריה
    if (/^\d+$/.test(dayPart)) {
      day = parseInt(dayPart, 10)
    } else {
      day = gematriyaToNumber(dayPart)
    }
    
    if (day < 1 || day > 30) return null
    
    // ניסיון לפענח חודש - צריך לטפל בחודשים עם שני חלקים (אדר א', אדר ב')
    let monthParts: string[] = []
    let yearStartIndex = 2
    
    // בדיקה אם החודש הוא אדר א' או אדר ב'
    if (parts.length >= 3 && parts[1].includes('אדר')) {
      const secondPart = parts[2]
      // בדיקה לכל סוגי הגרשיים (רגיל, עברי, ללא)
      if (secondPart === "א'" || secondPart === "א" || secondPart === "א׳" ||
          secondPart === "ב'" || secondPart === "ב" || secondPart === "ב׳") {
        monthParts = [parts[1], secondPart]
        yearStartIndex = 3
      } else {
        monthParts = [parts[1]]
      }
    } else {
      monthParts = [parts[1]]
    }
    
    const monthName = monthParts.join(' ')
    
    // ניסיון לפענח שנה
    let year: number
    if (parts.length > yearStartIndex) {
      const yearPart = parts.slice(yearStartIndex).join(' ')
      if (/^\d+$/.test(yearPart)) {
        year = parseInt(yearPart, 10)
      } else {
        year = gematriyaToNumber(yearPart)
        // אם השנה קטנה מ-1000, כנראה חסר האלף (5000)
        if (year < 1000) {
          year += 5000
        }
      }
    } else {
      // אם אין שנה, משתמשים בשנה הנוכחית
      const now = new HDate(new Date())
      year = now.getFullYear()
    }
    
    // חיפוש החודש במיפוי - עם התחשבות בשנה מעוברת
    let hebrewMonth: number | undefined
    const isLeapYear = HDate.isLeapYear(year)
    
    // נרמול שם החודש - הסרת גרשיים
    const normalizedMonthName = monthName.replace(/['"״׳]/g, '').trim()
    
    // מיפוי דינמי לפי שנה מעוברת
    if (normalizedMonthName === 'אדר' || normalizedMonthName === 'אדר א') {
      // בשנה מעוברת: אדר א' = 12, בשנה רגילה: אדר = 6 (שזה ADAR_II = 13 בספרייה)
      hebrewMonth = isLeapYear ? months.ADAR_I : months.ADAR_II
    } else if (normalizedMonthName === 'אדר ב') {
      hebrewMonth = months.ADAR_II
    } else {
      // חיפוש רגיל במיפוי
      for (const [name, monthConst] of Object.entries(hebrewMonthNameToConst)) {
        const normalizedName = name.replace(/['"״׳]/g, '').trim()
        if (normalizedMonthName === normalizedName) {
          hebrewMonth = monthConst
          break
        }
      }
    }
    
    if (!hebrewMonth) return null
    
    // יצירת תאריך עברי והמרה ללועזי
    const hdate = new HDate(day, hebrewMonth, year)
    return hdate.greg()
    
  } catch (error) {
    console.error('Error parsing Hebrew date:', error)
    return null
  }
}

/**
 * פענוח תאריך מפורמטים שונים
 * @param input - תאריך בפורמט DD/MM/YYYY, DD.MM.YYYY, או תאריך עברי
 * @returns תאריך לועזי או null אם לא תקין
 */
export function parseSearchDate(input: string): Date | null {
  if (!input || typeof input !== 'string') return null
  
  const trimmed = input.trim()
  if (!trimmed) return null
  
  // ניסיון 1: פורמט DD/MM/YYYY או DD.MM.YYYY
  const gregorianMatch = trimmed.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/)
  if (gregorianMatch) {
    const day = parseInt(gregorianMatch[1], 10)
    const month = parseInt(gregorianMatch[2], 10) - 1 // חודשים ב-JS מתחילים מ-0
    const year = parseInt(gregorianMatch[3], 10)
    
    const date = new Date(year, month, day)
    
    // וידוא שהתאריך תקין
    if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
      return date
    }
    return null
  }
  
  // ניסיון 2: פורמט ISO (YYYY-MM-DD)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    
    const date = new Date(year, month, day)
    if (date.getDate() === day && date.getMonth() === month && date.getFullYear() === year) {
      return date
    }
    return null
  }
  
  // ניסיון 3: תאריך עברי
  const hebrewDate = parseHebrewDate(trimmed)
  if (hebrewDate) {
    return hebrewDate
  }
  
  return null
}

/**
 * קבלת שם החודש העברי לתאריך נתון
 * @param date - תאריך לועזי
 * @returns שם החודש העברי
 */
export function getHebrewMonthName(date: Date): string {
  if (!date || isNaN(date.getTime())) return ''
  
  try {
    const hdate = new HDate(date)
    const monthName = removeNikkud(Locale.gettext(hdate.getMonthName(), 'he') || hdate.getMonthName())
    return monthName
  } catch (error) {
    console.error('Error getting Hebrew month name:', error)
    return ''
  }
}

/**
 * קבלת התאריך העברי המלא לתאריך נתון (יום, חודש, שנה)
 * @param date - תאריך לועזי
 * @returns אובייקט עם יום, חודש ושנה עבריים
 */
export function getHebrewDateParts(date: Date): { day: string; month: string; year: string } | null {
  if (!date || isNaN(date.getTime())) return null
  
  try {
    const hdate = new HDate(date)
    return {
      day: gematriya(hdate.getDate()),
      month: removeNikkud(Locale.gettext(hdate.getMonthName(), 'he') || hdate.getMonthName()),
      year: gematriya(hdate.getFullYear())
    }
  } catch (error) {
    console.error('Error getting Hebrew date parts:', error)
    return null
  }
}
