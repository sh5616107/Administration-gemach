/**
 * Excel Import Service - שירות ייבוא מאקסל
 * תמיכה בייבוא לווים, ערבים, הלוואות, תרומות והפקדות
 */

import * as XLSX from 'xlsx'
import { borrowersService, guarantorsService, loansService, donorsService, depositorsService, repaymentsService, db } from './database'

// סוגי נתונים לייבוא
export type ImportType = 'borrowers' | 'guarantors' | 'loans' | 'repayments' | 'donations' | 'deposits' | 'waitlist'

// תוצאת ולידציה לשורה
export interface ValidationResult {
  row: number
  status: 'valid' | 'error'
  message?: string
  data: Record<string, any>
}

// תוצאת ייבוא
export interface ImportResult {
  success: number
  errors: number
  details: ValidationResult[]
}

// מיפוי עמודות לפי סוג
const COLUMN_MAPPINGS: Record<ImportType, Record<string, string>> = {
  borrowers: {
    'שם פרטי': 'first_name',
    'שם משפחה': 'last_name',
    'ת.ז.': 'id_number',
    'תעודת זהות': 'id_number',
    'מספר זהות': 'id_number',
    'טלפון': 'phone',
    'עיר': 'city',
    'כתובת': 'address',
    'טלפון נוסף': 'phone2',
    'אימייל': 'email',
    'מייל': 'email',
    'הערות': 'notes'
  },
  guarantors: {
    'שם פרטי': 'first_name',
    'שם משפחה': 'last_name',
    'ת.ז.': 'id_number',
    'תעודת זהות': 'id_number',
    'מספר זהות': 'id_number',
    'טלפון': 'phone',
    'כתובת': 'address',
    'אימייל': 'email',
    'מייל': 'email',
    'הערות': 'notes'
  },
  loans: {
    'שורת לווה': 'borrower_row',
    'ת.ז. לווה': 'borrower_id_number',
    'תעודת זהות לווה': 'borrower_id_number',
    'סכום': 'amount',
    'תאריך מתן': 'loan_date',
    'תאריך הלוואה': 'loan_date',
    'תאריך החזרה': 'due_date',
    'תאריך פירעון': 'due_date',
    'סוג': 'loan_type',
    'סוג הלוואה': 'loan_type',
    'מחזורית': 'is_recurring',
    'יום בחודש': 'recurring_day',
    'שורת ערב 1': 'guarantor1_row',
    'שורת ערב 2': 'guarantor2_row',
    'ת.ז. ערב 1': 'guarantor1_id',
    'ת.ז. ערב 2': 'guarantor2_id',
    'הערות': 'notes'
  },
  repayments: {
    'שורת הלוואה': 'loan_row',
    'סכום': 'amount',
    'תאריך': 'payment_date',
    'תאריך פירעון': 'payment_date',
    'הערות': 'notes'
  },
  donations: {
    'שם': 'donor_name',
    'שם תורם': 'donor_name',
    'טלפון': 'phone',
    'כתובת': 'address',
    'סכום': 'amount',
    'סכום תרומה': 'amount',
    'תאריך': 'donation_date',
    'תאריך תרומה': 'donation_date',
    'הערות': 'notes'
  },
  deposits: {
    'שם': 'depositor_name',
    'שם מפקיד': 'depositor_name',
    'ת.ז.': 'id_number',
    'תעודת זהות': 'id_number',
    'טלפון': 'phone',
    'כתובת': 'address',
    'סכום': 'amount',
    'סכום הפקדה': 'amount',
    'תאריך': 'deposit_date',
    'תאריך הפקדה': 'deposit_date',
    'תאריך סיום': 'due_date',
    'תקופה': 'period_type',
    'מחזורית': 'is_recurring',
    'יום בחודש': 'recurring_day',
    'הערות': 'notes'
  },
  waitlist: {
    'מיקום': 'position',
    'שם לווה': 'borrower_name',
    'שורת לווה': 'borrower_row',
    'ת.ז. לווה': 'borrower_id_number',
    'סכום מבוקש': 'requested_amount',
    'תאריך בקשה': 'request_date',
    'סוג הלוואה': 'loan_type',
    'סוג': 'loan_type',
    'תקופה מבוקשת (חודשים)': 'requested_months',
    'תקופה מבוקשת': 'requested_months',
    'עדיפות': 'priority',
    'סטטוס': 'status',
    'הערות': 'notes'
  }
}

// שדות חובה לפי סוג - עם תרגום לעברית (מותאם לטפסים במערכת)
const REQUIRED_FIELDS: Record<ImportType, { field: string; label: string }[]> = {
  borrowers: [
    { field: 'first_name', label: 'שם פרטי' },
    { field: 'last_name', label: 'שם משפחה' },
    { field: 'phone', label: 'טלפון' }
  ],
  guarantors: [
    { field: 'first_name', label: 'שם פרטי' },
    { field: 'last_name', label: 'שם משפחה' },
    { field: 'phone', label: 'טלפון' }
  ],
  loans: [
    { field: 'amount', label: 'סכום' },
    { field: 'loan_date', label: 'תאריך מתן' }
  ],
  repayments: [
    { field: 'loan_row', label: 'שורת הלוואה' },
    { field: 'amount', label: 'סכום' },
    { field: 'payment_date', label: 'תאריך פירעון' }
  ],
  donations: [
    { field: 'donor_name', label: 'שם תורם' },
    { field: 'amount', label: 'סכום' },
    { field: 'donation_date', label: 'תאריך תרומה' }
  ],
  deposits: [
    { field: 'depositor_name', label: 'שם מפקיד' },
    { field: 'phone', label: 'טלפון' },
    { field: 'amount', label: 'סכום' },
    { field: 'deposit_date', label: 'תאריך הפקדה' }
  ],
  waitlist: [
    { field: 'requested_amount', label: 'סכום מבוקש' },
    { field: 'request_date', label: 'תאריך בקשה' }
  ]
}

/**
 * קריאת קובץ Excel והמרה למערך אובייקטים
 * תומך בקריאת גליון ספציפי לפי שם
 */
export function readExcelFile(file: File, sheetName?: string): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        
        // בחירת גליון - לפי שם או הראשון
        let targetSheet: string
        if (sheetName && workbook.SheetNames.includes(sheetName)) {
          targetSheet = sheetName
        } else {
          targetSheet = workbook.SheetNames[0]
        }
        
        const sheet = workbook.Sheets[targetSheet]
        
        // המרה למערך אובייקטים
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows as Record<string, any>[])
      } catch (err) {
        reject(new Error('שגיאה בקריאת קובץ Excel'))
      }
    }
    
    reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * מיפוי סוג ייבוא לשם גליון בעברית
 */
const SHEET_NAMES: Record<ImportType, string> = {
  borrowers: 'לווים',
  guarantors: 'ערבים',
  loans: 'הלוואות',
  repayments: 'פירעונות',
  donations: 'תרומות',
  deposits: 'הפקדות',
  waitlist: 'תור הלוואות'
}

/**
 * קבלת שם הגליון לפי סוג הייבוא
 */
export function getSheetName(importType: ImportType): string {
  return SHEET_NAMES[importType]
}

/**
 * מיפוי עמודות מעברית לאנגלית
 */
export function mapColumns(rows: Record<string, any>[], importType: ImportType): Record<string, any>[] {
  const mapping = COLUMN_MAPPINGS[importType]
  
  return rows.map(row => {
    const mapped: Record<string, any> = {}
    
    for (const [hebrewKey, value] of Object.entries(row)) {
      const englishKey = mapping[hebrewKey] || hebrewKey.toLowerCase().replace(/\s+/g, '_')
      mapped[englishKey] = value
    }
    
    return mapped
  })
}

/**
 * ולידציה של מספר זהות ישראלי
 */
function validateIdNumber(id: string): boolean {
  if (!id) return false
  const cleaned = id.toString().replace(/\D/g, '').padStart(9, '0')
  if (cleaned.length !== 9) return false
  
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(cleaned[i]) * ((i % 2) + 1)
    if (digit > 9) digit -= 9
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * ולידציה של טלפון
 */
function validatePhone(phone: string): boolean {
  if (!phone) return false
  const cleaned = phone.toString().replace(/\D/g, '')
  return cleaned.length >= 9 && cleaned.length <= 10
}

/**
 * המרת תאריך מפורמטים שונים
 */
function parseDate(value: any): string | null {
  if (!value) return null
  
  // אם זה כבר Date object
  if (value instanceof Date) {
    return value.toISOString().split('T')[0]
  }
  
  const str = value.toString().trim()
  
  // פורמט DD/MM/YYYY או DD.MM.YYYY
  const match = str.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // פורמט YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }
  
  return null
}

/**
 * בדיקה אם ערך הוא "כן"
 */
function isYes(value: any): boolean {
  if (!value) return false
  const str = value.toString().toLowerCase().trim()
  return str === 'כן' || str === 'yes' || str === '1' || str === 'true'
}

/**
 * ולידציה של שורה בודדת
 */
async function validateRow(
  row: Record<string, any>,
  rowIndex: number,
  importType: ImportType
): Promise<ValidationResult> {
  const required = REQUIRED_FIELDS[importType]
  const errors: string[] = []
  
  // בדיקת שדות חובה
  for (const { field, label } of required) {
    if (!row[field] || row[field].toString().trim() === '') {
      errors.push(`חסר שדה חובה: ${label}`)
    }
  }
  
  // ולידציות ספציפיות לפי סוג
  if (importType === 'borrowers' || importType === 'guarantors') {
    if (row.id_number && !validateIdNumber(row.id_number)) {
      errors.push('מספר זהות לא תקין')
    }
    if (row.phone && !validatePhone(row.phone)) {
      errors.push('מספר טלפון לא תקין')
    }
    
    // בדיקת כפילות לפי ת.ז. או שם
    const existing = importType === 'borrowers'
      ? await borrowersService.getAll()
      : await guarantorsService.getAll()
    
    // בדיקה לפי ת.ז.
    if (row.id_number) {
      const duplicateById = existing.find((e: any) => e.id_number === row.id_number.toString())
      if (duplicateById) {
        errors.push(`ת.ז. ${row.id_number} כבר קיימת במערכת`)
      }
    }
    
    // בדיקה לפי שם פרטי + שם משפחה
    if (row.first_name && row.last_name) {
      const duplicateByName = existing.find((e: any) => 
        e.first_name === row.first_name?.toString() && 
        e.last_name === row.last_name?.toString()
      )
      if (duplicateByName) {
        errors.push(`${row.first_name} ${row.last_name} כבר קיים/ת במערכת`)
      }
    }
  }
  
  if (importType === 'loans') {
    // בדיקה שיש זיהוי לווה - או שורה או ת.ז.
    const hasBorrowerRow = row.borrower_row && !isNaN(parseInt(row.borrower_row))
    const hasBorrowerId = row.borrower_id_number && row.borrower_id_number.toString().trim() !== ''
    
    if (!hasBorrowerRow && !hasBorrowerId) {
      errors.push('חסר זיהוי לווה (שורת לווה או ת.ז.)')
    }
    
    // בדיקת תאריך
    if (row.loan_date && !parseDate(row.loan_date)) {
      errors.push('תאריך הלוואה לא תקין')
    }
    
    // בדיקת סכום
    const amount = parseFloat(row.amount)
    if (isNaN(amount) || amount <= 0) {
      errors.push('סכום לא תקין')
    }
    
    // בדיקת הלוואה מחזורית
    if (isYes(row.is_recurring)) {
      const recurringDay = parseInt(row.recurring_day)
      if (isNaN(recurringDay) || recurringDay < 1 || recurringDay > 28) {
        errors.push('יום בחודש להלוואה מחזורית חייב להיות 1-28')
      }
    }
  }
  
  if (importType === 'repayments') {
    // בדיקה שיש שורת הלוואה
    if (!row.loan_row || isNaN(parseInt(row.loan_row))) {
      errors.push('חסר שורת הלוואה')
    }
    
    // בדיקת תאריך
    if (row.payment_date && !parseDate(row.payment_date)) {
      errors.push('תאריך פירעון לא תקין')
    }
    
    // בדיקת סכום
    const amount = parseFloat(row.amount)
    if (isNaN(amount) || amount <= 0) {
      errors.push('סכום לא תקין')
    }
  }
  
  if (importType === 'donations') {
    if (row.donation_date && !parseDate(row.donation_date)) {
      errors.push('תאריך תרומה לא תקין')
    }
    const amount = parseFloat(row.amount)
    if (isNaN(amount) || amount <= 0) {
      errors.push('סכום לא תקין')
    }
  }
  
  if (importType === 'deposits') {
    if (row.deposit_date && !parseDate(row.deposit_date)) {
      errors.push('תאריך הפקדה לא תקין')
    }
    const amount = parseFloat(row.amount)
    if (isNaN(amount) || amount <= 0) {
      errors.push('סכום לא תקין')
    }
  }
  
  if (importType === 'waitlist') {
    // בדיקה שיש זיהוי לווה - או שורה או ת.ז.
    const hasBorrowerRow = row.borrower_row && !isNaN(parseInt(row.borrower_row))
    const hasBorrowerId = row.borrower_id_number && row.borrower_id_number.toString().trim() !== ''
    
    if (!hasBorrowerRow && !hasBorrowerId) {
      errors.push('חסר זיהוי לווה (שורת לווה או ת.ז.)')
    }
    
    // בדיקת תאריך
    if (row.request_date && !parseDate(row.request_date)) {
      errors.push('תאריך בקשה לא תקין')
    }
    
    // בדיקת סכום
    const amount = parseFloat(row.requested_amount)
    if (isNaN(amount) || amount <= 0) {
      errors.push('סכום מבוקש לא תקין')
    }
  }
  
  // קביעת סטטוס
  let status: 'valid' | 'error' = 'valid'
  let message = ''
  
  if (errors.length > 0) {
    status = 'error'
    message = errors.join(', ')
  }
  
  return { row: rowIndex + 1, status, message, data: row }
}


/**
 * ולידציה של כל הנתונים
 */
export async function validateData(
  rows: Record<string, any>[],
  importType: ImportType
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = []
  
  for (let i = 0; i < rows.length; i++) {
    const result = await validateRow(rows[i], i, importType)
    results.push(result)
  }
  
  return results
}

/**
 * ייבוא לווים
 */
async function importBorrowers(rows: ValidationResult[]): Promise<number> {
  let count = 0
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    await borrowersService.create({
      first_name: data.first_name?.toString() || '',
      last_name: data.last_name?.toString() || '',
      id_number: data.id_number?.toString() || '',
      phone: data.phone?.toString() || '',
      city: data.city?.toString() || '',
      address: data.address?.toString() || '',
      phone2: data.phone2?.toString() || '',
      email: data.email?.toString() || '',
      notes: data.notes?.toString() || ''
    })
    count++
  }
  
  return count
}

/**
 * ייבוא ערבים
 */
async function importGuarantors(rows: ValidationResult[]): Promise<number> {
  let count = 0
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    await guarantorsService.create({
      first_name: data.first_name?.toString() || '',
      last_name: data.last_name?.toString() || '',
      id_number: data.id_number?.toString() || '',
      phone: data.phone?.toString() || '',
      address: data.address?.toString() || '',
      email: data.email?.toString() || '',
      notes: data.notes?.toString() || ''
    })
    count++
  }
  
  return count
}

/**
 * ייבוא הלוואות
 * תומך בזיהוי לווה לפי:
 * 1. שורת לווה - מספר השורה בגליון הלווים (מומלץ לייבוא מאוחד)
 * 2. ת.ז. לווה - לחיבור ללווים קיימים במערכת
 * תומך בהלוואות מחזוריות
 */
async function importLoans(
  rows: ValidationResult[], 
  newBorrowers?: Map<number, number>, // מיפוי שורה -> ID של לווה חדש
  newGuarantors?: Map<number, number> // מיפוי שורה -> ID של ערב חדש
): Promise<{ count: number; loanIds: Map<number, number> }> {
  let count = 0
  const loanIds = new Map<number, number>() // מיפוי שורה -> ID של הלוואה חדשה
  const borrowers = await borrowersService.getAll()
  const guarantors = await guarantorsService.getAll()
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    let borrowerId: number | undefined
    
    // מציאת הלווה - קודם לפי שורה, אחר כך לפי ת.ז.
    if (data.borrower_row && newBorrowers) {
      const rowNum = parseInt(data.borrower_row)
      borrowerId = newBorrowers.get(rowNum)
    }
    
    if (!borrowerId && data.borrower_id_number) {
      const borrower = borrowers.find((b: any) => b.id_number === data.borrower_id_number?.toString())
      if (borrower) borrowerId = borrower.id
    }
    
    if (!borrowerId) continue
    
    // מציאת ערבים - לפי שורה או ת.ז.
    let guarantor1Id: number | undefined
    let guarantor2Id: number | undefined
    
    // ערב 1 - לפי שורה
    if (data.guarantor1_row && newGuarantors) {
      const rowNum = parseInt(data.guarantor1_row)
      guarantor1Id = newGuarantors.get(rowNum)
    }
    // ערב 1 - לפי ת.ז.
    if (!guarantor1Id && data.guarantor1_id) {
      const g1 = guarantors.find((g: any) => g.id_number === data.guarantor1_id?.toString())
      if (g1) guarantor1Id = g1.id
    }
    
    // ערב 2 - לפי שורה
    if (data.guarantor2_row && newGuarantors) {
      const rowNum = parseInt(data.guarantor2_row)
      guarantor2Id = newGuarantors.get(rowNum)
    }
    // ערב 2 - לפי ת.ז.
    if (!guarantor2Id && data.guarantor2_id) {
      const g2 = guarantors.find((g: any) => g.id_number === data.guarantor2_id?.toString())
      if (g2) guarantor2Id = g2.id
    }
    
    // קביעת סוג הלוואה
    let loanType = 'flexible'
    if (data.loan_type) {
      const type = data.loan_type.toString().toLowerCase()
      if (type.includes('קבוע') || type === 'fixed') {
        loanType = 'fixed'
      }
    }
    
    // בדיקת מחזוריות
    const isRecurring = isYes(data.is_recurring) ? 1 : 0
    const recurringDay = isRecurring ? (parseInt(data.recurring_day) || 1) : undefined
    
    const result = await loansService.create({
      borrower_id: borrowerId,
      amount: parseFloat(data.amount) || 0,
      loan_date: parseDate(data.loan_date) || new Date().toISOString().split('T')[0],
      due_date: parseDate(data.due_date) || undefined,
      loan_type: loanType,
      guarantor1_id: guarantor1Id,
      guarantor2_id: guarantor2Id,
      notes: data.notes?.toString() || '',
      is_recurring: isRecurring,
      recurring_day: recurringDay,
      auto_repayment: 0
    })
    
    // שמירת מיפוי שורה -> ID
    loanIds.set(row.row, result.lastInsertRowid)
    count++
  }
  
  return { count, loanIds }
}

/**
 * ייבוא פירעונות
 * מקושר להלוואות לפי שורת הלוואה
 */
async function importRepayments(
  rows: ValidationResult[],
  loanIds: Map<number, number> // מיפוי שורה -> ID של הלוואה
): Promise<number> {
  let count = 0
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    const loanRow = parseInt(data.loan_row)
    const loanId = loanIds.get(loanRow)
    
    if (!loanId) continue
    
    await db.run(
      'INSERT INTO repayments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
      [loanId, parseFloat(data.amount) || 0, parseDate(data.payment_date) || new Date().toISOString().split('T')[0], data.notes?.toString() || '']
    )
    count++
  }
  
  return count
}

/**
 * ייבוא תרומות
 */
async function importDonations(rows: ValidationResult[]): Promise<number> {
  let count = 0
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    
    // פיצול שם לשם פרטי ושם משפחה
    const nameParts = (data.donor_name?.toString() || '').split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    // יצירת תורם חדש או מציאת קיים
    let donorId: number
    const existingDonors = await donorsService.getAll()
    const existingDonor = existingDonors.find((d: any) => 
      d.first_name === firstName && 
      d.last_name === lastName &&
      d.phone === data.phone?.toString()
    )
    
    if (existingDonor) {
      donorId = existingDonor.id
    } else {
      // יצירת תורם חדש דרך db.run
      const result = await db.run(
        'INSERT INTO donors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [firstName, lastName, data.phone?.toString() || '', '', data.address?.toString() || '', '', '']
      )
      donorId = result.lastInsertRowid
    }
    
    // יצירת תרומה
    await db.run(
      'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method) VALUES (?, ?, ?, ?, ?)',
      [donorId, parseFloat(data.amount) || 0, parseDate(data.donation_date) || new Date().toISOString().split('T')[0], data.notes?.toString() || '', '']
    )
    count++
  }
  
  return count
}

/**
 * ייבוא הפקדות
 * תומך בהפקדות מחזוריות
 */
async function importDeposits(rows: ValidationResult[]): Promise<number> {
  let count = 0
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    
    // פיצול שם לשם פרטי ושם משפחה
    const nameParts = (data.depositor_name?.toString() || '').split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''
    
    // יצירת מפקיד חדש או מציאת קיים
    let depositorId: number
    const existingDepositors = await depositorsService.getAll()
    const existingDepositor = existingDepositors.find((d: any) => 
      d.first_name === firstName && 
      d.last_name === lastName &&
      d.phone === data.phone?.toString()
    )
    
    if (existingDepositor) {
      depositorId = existingDepositor.id
    } else {
      // יצירת מפקיד חדש דרך db.run
      const result = await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [firstName, lastName, data.phone?.toString() || '', data.id_number?.toString() || '', data.address?.toString() || '', '', '']
      )
      depositorId = result.lastInsertRowid
    }
    
    // קביעת סוג תקופה
    let periodType = 'flexible'
    if (data.period_type) {
      const type = data.period_type.toString().toLowerCase()
      if (type.includes('קבוע') || type === 'fixed') {
        periodType = 'fixed'
      }
    }
    
    // בדיקת מחזוריות
    const isRecurring = isYes(data.is_recurring) ? 1 : 0
    const recurringDay = isRecurring ? (parseInt(data.recurring_day) || 1) : null
    
    // יצירת הפקדה
    await db.run(
      'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [depositorId, parseFloat(data.amount) || 0, parseDate(data.deposit_date) || new Date().toISOString().split('T')[0], periodType, parseDate(data.due_date) || null, isRecurring, recurringDay, data.notes?.toString() || '', 'active', '', '']
    )
    count++
  }
  
  return count
}

/**
 * ייבוא תור הלוואות
 * מקושר ללווים לפי שורת לווה או ת.ז.
 */
async function importWaitlist(
  rows: ValidationResult[],
  borrowerIds?: Map<number, number> // מיפוי שורה -> ID של לווה (אופציונלי - רק בייבוא מלא)
): Promise<number> {
  let count = 0
  const { waitlistService } = await import('./database')
  const borrowers = await borrowersService.getAll()
  
  // אם אין מיפוי (ייבוא בודד), ננסה למצוא לווים לפי ת.ז. או שם
  // אם יש מיפוי (ייבוא מלא), נשתמש בו
  
  for (const row of rows) {
    if (row.status === 'error') continue
    
    const data = row.data
    let borrowerId: number | undefined
    
    // מציאת הלווה - קודם לפי שורה (אם יש מיפוי), אחר כך לפי ת.ז.
    if (data.borrower_row && borrowerIds) {
      const rowNum = parseInt(data.borrower_row)
      borrowerId = borrowerIds.get(rowNum)
    }
    
    // אם לא מצאנו לפי שורה, ננסה לפי ת.ז.
    if (!borrowerId && data.borrower_id_number) {
      const borrower = borrowers.find((b: any) => b.id_number === data.borrower_id_number?.toString())
      if (borrower) borrowerId = borrower.id
    }
    
    // אם עדיין לא מצאנו, ננסה לפי שם (אם יש שם לווה בנתונים)
    if (!borrowerId && data.borrower_name) {
      const nameParts = data.borrower_name.toString().split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''
      const borrower = borrowers.find((b: any) => 
        b.first_name === firstName && b.last_name === lastName
      )
      if (borrower) borrowerId = borrower.id
    }
    
    if (!borrowerId) {
      console.warn(`לא נמצא לווה לשורה ${row.row}`)
      continue
    }
    
    // קביעת סוג הלוואה
    let loanType: 'fixed' | 'flexible' = 'flexible'
    if (data.loan_type) {
      const type = data.loan_type.toString().toLowerCase()
      if (type.includes('קבוע') || type === 'fixed') {
        loanType = 'fixed'
      }
    }
    
    // קביעת עדיפות
    let priority: 'normal' | 'urgent' = 'normal'
    if (data.priority) {
      const p = data.priority.toString().toLowerCase()
      if (p.includes('דחוף') || p === 'urgent') {
        priority = 'urgent'
      }
    }
    
    // קביעת סטטוס
    let status: 'waiting' | 'processing' | 'approved' | 'rejected' = 'waiting'
    if (data.status) {
      const s = data.status.toString().toLowerCase()
      if (s.includes('ממתין') || s === 'waiting') status = 'waiting'
      else if (s.includes('טיפול') || s === 'processing') status = 'processing'
      else if (s.includes('אושר') || s === 'approved') status = 'approved'
      else if (s.includes('נדחה') || s === 'rejected') status = 'rejected'
    }
    
    await waitlistService.create({
      borrower_id: borrowerId,
      requested_amount: parseFloat(data.requested_amount) || 0,
      request_date: parseDate(data.request_date) || new Date().toISOString().split('T')[0],
      loan_type: loanType,
      requested_months: data.requested_months ? parseInt(data.requested_months) : undefined,
      notes: data.notes?.toString() || '',
      priority,
      status
    })
    count++
  }
  
  return count
}

/**
 * ביצוע הייבוא
 */
export async function executeImport(
  validationResults: ValidationResult[],
  importType: ImportType,
  skipErrors: boolean = true,
  loanIds?: Map<number, number>, // למיפוי פירעונות להלוואות
  borrowerIds?: Map<number, number> // למיפוי תור הלוואות ללווים
): Promise<ImportResult> {
  const rowsToImport = skipErrors 
    ? validationResults.filter(r => r.status !== 'error')
    : validationResults
  
  let successCount = 0
  
  switch (importType) {
    case 'borrowers':
      successCount = await importBorrowers(rowsToImport)
      break
    case 'guarantors':
      successCount = await importGuarantors(rowsToImport)
      break
    case 'loans':
      const loansResult = await importLoans(rowsToImport)
      successCount = loansResult.count
      break
    case 'repayments':
      if (loanIds) {
        successCount = await importRepayments(rowsToImport, loanIds)
      }
      break
    case 'donations':
      successCount = await importDonations(rowsToImport)
      break
    case 'deposits':
      successCount = await importDeposits(rowsToImport)
      break
    case 'waitlist':
      successCount = await importWaitlist(rowsToImport, borrowerIds)
      break
  }
  
  return {
    success: successCount,
    errors: validationResults.filter(r => r.status === 'error').length,
    details: validationResults
  }
}

/**
 * יצירת קובץ תבנית לדוגמה - קובץ אחד עם כל הגליונות
 */
export function generateFullTemplate(): Blob {
  const wb = XLSX.utils.book_new()
  
  // גליון לווים
  const borrowersData = [
    { 'שורה': 2, 'שם פרטי': 'ישראל', 'שם משפחה': 'כהן', 'ת.ז.': '123456789', 'טלפון': '0501234567', 'עיר': 'ירושלים', 'כתובת': 'רחוב הרצל 1', 'טלפון נוסף': '', 'אימייל': '', 'הערות': '' },
    { 'שורה': 3, 'שם פרטי': 'דוד', 'שם משפחה': 'לוי', 'ת.ז.': '234567890', 'טלפון': '0521234567', 'עיר': 'תל אביב', 'כתובת': 'רחוב דיזנגוף 5', 'טלפון נוסף': '', 'אימייל': '', 'הערות': '' }
  ]
  const wsBorrowers = XLSX.utils.json_to_sheet(borrowersData)
  XLSX.utils.book_append_sheet(wb, wsBorrowers, 'לווים')
  
  // גליון ערבים
  const guarantorsData = [
    { 'שורה': 2, 'שם פרטי': 'משה', 'שם משפחה': 'אברהם', 'ת.ז.': '345678901', 'טלפון': '0531234567', 'כתובת': 'רחוב יפו 10', 'אימייל': '', 'הערות': '' },
    { 'שורה': 3, 'שם פרטי': 'יעקב', 'שם משפחה': 'שמעון', 'ת.ז.': '456789012', 'טלפון': '0541234567', 'כתובת': 'רחוב בן גוריון 15', 'אימייל': '', 'הערות': '' }
  ]
  const wsGuarantors = XLSX.utils.json_to_sheet(guarantorsData)
  XLSX.utils.book_append_sheet(wb, wsGuarantors, 'ערבים')
  
  // גליון הלוואות - עם תמיכה במחזוריות
  const loansData = [
    { 'שורה': 2, 'שורת לווה': 2, 'סכום': 10000, 'תאריך מתן': '01/01/2026', 'תאריך החזרה': '01/07/2026', 'סוג': 'גמישה', 'מחזורית': 'לא', 'יום בחודש': '', 'שורת ערב 1': 2, 'שורת ערב 2': '', 'הערות': 'הלוואה רגילה' },
    { 'שורה': 3, 'שורת לווה': 3, 'סכום': 5000, 'תאריך מתן': '15/01/2026', 'תאריך החזרה': '', 'סוג': 'גמישה', 'מחזורית': 'כן', 'יום בחודש': 15, 'שורת ערב 1': 3, 'שורת ערב 2': '', 'הערות': 'הלוואה מחזורית - נוצרת ב-15 לכל חודש' }
  ]
  const wsLoans = XLSX.utils.json_to_sheet(loansData)
  XLSX.utils.book_append_sheet(wb, wsLoans, 'הלוואות')
  
  // גליון פירעונות
  const repaymentsData = [
    { 'שורת הלוואה': 2, 'סכום': 2000, 'תאריך': '01/02/2026', 'הערות': 'פירעון ראשון' },
    { 'שורת הלוואה': 2, 'סכום': 2000, 'תאריך': '01/03/2026', 'הערות': 'פירעון שני' }
  ]
  const wsRepayments = XLSX.utils.json_to_sheet(repaymentsData)
  XLSX.utils.book_append_sheet(wb, wsRepayments, 'פירעונות')
  
  // גליון תרומות
  const donationsData = [
    { 'שם תורם': 'אברהם יצחק', 'טלפון': '0551234567', 'כתובת': 'רחוב הנביאים 20', 'סכום': 1000, 'תאריך': '01/01/2026', 'הערות': '' }
  ]
  const wsDonations = XLSX.utils.json_to_sheet(donationsData)
  XLSX.utils.book_append_sheet(wb, wsDonations, 'תרומות')
  
  // גליון הפקדות - עם תמיכה במחזוריות
  const depositsData = [
    { 'שם מפקיד': 'שרה רבקה', 'ת.ז.': '567890123', 'טלפון': '0561234567', 'כתובת': 'רחוב האלון 8', 'סכום': 50000, 'תאריך': '01/01/2026', 'תאריך סיום': '01/01/2027', 'תקופה': 'קבועה', 'מחזורית': 'לא', 'יום בחודש': '', 'הערות': 'הפקדה רגילה' },
    { 'שם מפקיד': 'לאה רחל', 'ת.ז.': '678901234', 'טלפון': '0571234567', 'כתובת': 'רחוב התמר 12', 'סכום': 1000, 'תאריך': '01/01/2026', 'תאריך סיום': '', 'תקופה': 'גמישה', 'מחזורית': 'כן', 'יום בחודש': 1, 'הערות': 'הפקדה מחזורית - נוצרת ב-1 לכל חודש' }
  ]
  const wsDeposits = XLSX.utils.json_to_sheet(depositsData)
  XLSX.utils.book_append_sheet(wb, wsDeposits, 'הפקדות')
  
  // גליון תור הלוואות
  const waitlistData = [
    { 'שורה': 2, 'שורת לווה': 2, 'סכום מבוקש': 5000, 'תאריך בקשה': '01/01/2026', 'סוג הלוואה': 'גמישה', 'תקופה מבוקשת (חודשים)': 12, 'עדיפות': 'רגילה', 'סטטוס': 'ממתין', 'הערות': 'בקשה לדוגמה' },
    { 'שורה': 3, 'שורת לווה': 3, 'סכום מבוקש': 8000, 'תאריך בקשה': '02/01/2026', 'סוג הלוואה': 'קבועה', 'תקופה מבוקשת (חודשים)': 6, 'עדיפות': 'דחופה', 'סטטוס': 'ממתין', 'הערות': 'דחוף - מצב קשה' }
  ]
  const wsWaitlist = XLSX.utils.json_to_sheet(waitlistData)
  XLSX.utils.book_append_sheet(wb, wsWaitlist, 'תור הלוואות')
  
  // גליון הוראות
  const instructionsData = [
    { 'הוראות שימוש': '📋 הוראות לייבוא נתונים מאקסל' },
    { 'הוראות שימוש': '' },
    { 'הוראות שימוש': '🔗 קישור בין גליונות:' },
    { 'הוראות שימוש': '• עמודת "שורה" בגליון לווים/ערבים - מספר השורה לשימוש בגליונות אחרים' },
    { 'הוראות שימוש': '• עמודת "שורת לווה" בהלוואות/תור - מפנה לשורה בגליון לווים' },
    { 'הוראות שימוש': '• עמודת "שורת הלוואה" בפירעונות - מפנה לשורה בגליון הלוואות' },
    { 'הוראות שימוש': '' },
    { 'הוראות שימוש': '🔄 הלוואות/הפקדות מחזוריות:' },
    { 'הוראות שימוש': '• עמודת "מחזורית" - כן/לא' },
    { 'הוראות שימוש': '• עמודת "יום בחודש" - היום בחודש שבו תיווצר הלוואה/הפקדה חדשה (1-28)' },
    { 'הוראות שימוש': '' },
    { 'הוראות שימוש': '📝 הוראות כלליות:' },
    { 'הוראות שימוש': '1. גליון "לווים" - מלא את פרטי הלווים' },
    { 'הוראות שימוש': '2. גליון "ערבים" - מלא את פרטי הערבים' },
    { 'הוראות שימוש': '3. גליון "הלוואות" - הלוואות עם קישור ללווים וערבים' },
    { 'הוראות שימוש': '4. גליון "פירעונות" - פירעונות עם קישור להלוואות' },
    { 'הוראות שימוש': '5. גליון "תרומות" - שם תורם מלא, טלפון וסכום' },
    { 'הוראות שימוש': '6. גליון "הפקדות" - שם מפקיד מלא, טלפון, סכום ותאריכים' },
    { 'הוראות שימוש': '7. גליון "תור הלוואות" - בקשות להלוואות עם קישור ללווים' },
    { 'הוראות שימוש': '' },
    { 'הוראות שימוש': '⚠️ חשוב:' },
    { 'הוראות שימוש': '• הייבוא מוסיף נתונים חדשים ולא דורס נתונים קיימים' },
    { 'הוראות שימוש': '• תאריכים בפורמט DD/MM/YYYY (למשל: 01/01/2026)' },
    { 'הוראות שימוש': '• ת.ז. אינה חובה אך מומלצת לזיהוי כפילויות' },
    { 'הוראות שימוש': '• ניתן לייבא כל גליון בנפרד או את כולם יחד' },
    { 'הוראות שימוש': '• יש לייבא לפי הסדר: לווים → ערבים → הלוואות → פירעונות → תור' }
  ]
  const wsInstructions = XLSX.utils.json_to_sheet(instructionsData)
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'הוראות')
  
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * יצירת קובץ תבנית לסוג בודד (לתאימות אחורה)
 */
export function generateTemplate(importType: ImportType): Blob {
  const templates: Record<ImportType, any[]> = {
    borrowers: [
      { 'שם פרטי': 'ישראל', 'שם משפחה': 'כהן', 'ת.ז.': '123456789', 'טלפון': '0501234567', 'עיר': 'ירושלים', 'כתובת': 'רחוב הרצל 1', 'טלפון נוסף': '', 'אימייל': '', 'הערות': '' }
    ],
    guarantors: [
      { 'שם פרטי': 'משה', 'שם משפחה': 'לוי', 'ת.ז.': '987654321', 'טלפון': '0521234567', 'כתובת': 'רחוב יפו 10', 'אימייל': '', 'הערות': '' }
    ],
    loans: [
      { 'שורת לווה': '2 (מספר השורה בגליון לווים)', 'סכום': '10000', 'תאריך מתן': '01/01/2026', 'תאריך החזרה': '01/07/2026', 'סוג': 'גמישה', 'מחזורית': 'לא', 'יום בחודש': '', 'שורת ערב 1': '', 'שורת ערב 2': '', 'הערות': '' }
    ],
    repayments: [
      { 'שורת הלוואה': '2 (מספר השורה בגליון הלוואות)', 'סכום': '1000', 'תאריך': '01/02/2026', 'הערות': '' }
    ],
    donations: [
      { 'שם תורם': 'דוד אברהם', 'טלפון': '0531234567', 'כתובת': 'רחוב בן יהודה 5', 'סכום': '1000', 'תאריך': '15/01/2026', 'הערות': '' }
    ],
    deposits: [
      { 'שם מפקיד': 'שרה כהן', 'ת.ז.': '111222333', 'טלפון': '0541234567', 'כתובת': 'רחוב דיזנגוף 20', 'סכום': '50000', 'תאריך': '01/01/2026', 'תאריך סיום': '01/01/2027', 'תקופה': 'קבועה', 'מחזורית': 'לא', 'יום בחודש': '', 'הערות': '' }
    ],
    waitlist: [
      { 'שורת לווה': '2 (מספר השורה בגליון לווים)', 'סכום מבוקש': '5000', 'תאריך בקשה': '01/01/2026', 'סוג הלוואה': 'גמישה', 'תקופה מבוקשת (חודשים)': '12', 'עדיפות': 'רגילה', 'סטטוס': 'ממתין', 'הערות': '' }
    ]
  }
  
  const ws = XLSX.utils.json_to_sheet(templates[importType])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'נתונים')
  
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * פרטי שגיאה בייבוא
 */
export interface ImportError {
  sheet: string
  row: number
  message: string
}

/**
 * תוצאת ייבוא מלא
 */
export interface FullImportResult {
  borrowers: { success: number; errors: number }
  guarantors: { success: number; errors: number }
  loans: { success: number; errors: number }
  repayments: { success: number; errors: number }
  donations: { success: number; errors: number }
  deposits: { success: number; errors: number }
  waitlist?: { success: number; errors: number }
  total: { success: number; errors: number }
  errorDetails: ImportError[]
}

/**
 * ייבוא מלא של כל הגליונות בקובץ
 * מייבא בסדר הנכון: לווים → ערבים → הלוואות → פירעונות → תרומות → הפקדות
 */
export async function executeFullImport(file: File): Promise<FullImportResult> {
  const errorDetails: ImportError[] = []
  const result: FullImportResult = {
    borrowers: { success: 0, errors: 0 },
    guarantors: { success: 0, errors: 0 },
    loans: { success: 0, errors: 0 },
    repayments: { success: 0, errors: 0 },
    donations: { success: 0, errors: 0 },
    deposits: { success: 0, errors: 0 },
    total: { success: 0, errors: 0 },
    errorDetails: []
  }
  
  // מיפויים לקישור בין גליונות
  const borrowerIds = new Map<number, number>() // שורה -> ID
  const guarantorIds = new Map<number, number>()
  const loanIds = new Map<number, number>()
  
  // 1. ייבוא לווים
  try {
    const borrowersRows = await readExcelFile(file, 'לווים')
    if (borrowersRows.length > 0) {
      const mapped = mapColumns(borrowersRows, 'borrowers')
      const validated = await validateData(mapped, 'borrowers')
      
      for (const row of validated) {
        if (row.status === 'error') {
          result.borrowers.errors++
          errorDetails.push({ sheet: 'לווים', row: row.row, message: row.message || 'שגיאה לא ידועה' })
          continue
        }
        const data = row.data
        const res = await borrowersService.create({
          first_name: data.first_name?.toString() || '',
          last_name: data.last_name?.toString() || '',
          id_number: data.id_number?.toString() || '',
          phone: data.phone?.toString() || '',
          city: data.city?.toString() || '',
          address: data.address?.toString() || '',
          phone2: data.phone2?.toString() || '',
          email: data.email?.toString() || '',
          notes: data.notes?.toString() || ''
        })
        // שמירת מיפוי שורה -> ID
        const rowNum = data['שורה'] || row.row
        borrowerIds.set(parseInt(rowNum), res.lastInsertRowid)
        result.borrowers.success++
      }
    }
  } catch (e) { console.log('No borrowers sheet or error:', e) }
  
  // 2. ייבוא ערבים
  try {
    const guarantorsRows = await readExcelFile(file, 'ערבים')
    if (guarantorsRows.length > 0) {
      const mapped = mapColumns(guarantorsRows, 'guarantors')
      const validated = await validateData(mapped, 'guarantors')
      
      for (const row of validated) {
        if (row.status === 'error') {
          result.guarantors.errors++
          errorDetails.push({ sheet: 'ערבים', row: row.row, message: row.message || 'שגיאה לא ידועה' })
          continue
        }
        const data = row.data
        const res = await guarantorsService.create({
          first_name: data.first_name?.toString() || '',
          last_name: data.last_name?.toString() || '',
          id_number: data.id_number?.toString() || '',
          phone: data.phone?.toString() || '',
          address: data.address?.toString() || '',
          email: data.email?.toString() || '',
          notes: data.notes?.toString() || ''
        })
        const rowNum = data['שורה'] || row.row
        guarantorIds.set(parseInt(rowNum), res.lastInsertRowid)
        result.guarantors.success++
      }
    }
  } catch (e) { console.log('No guarantors sheet or error:', e) }
  
  // 3. ייבוא הלוואות
  try {
    const loansRows = await readExcelFile(file, 'הלוואות')
    if (loansRows.length > 0) {
      const mapped = mapColumns(loansRows, 'loans')
      const validated = await validateData(mapped, 'loans')
      const borrowers = await borrowersService.getAll()
      const guarantors = await guarantorsService.getAll()
      
      for (const row of validated) {
        if (row.status === 'error') {
          result.loans.errors++
          errorDetails.push({ sheet: 'הלוואות', row: row.row, message: row.message || 'שגיאה לא ידועה' })
          continue
        }
        const data = row.data
        let borrowerId: number | undefined
        
        // מציאת לווה לפי שורה או ת.ז.
        if (data.borrower_row) {
          borrowerId = borrowerIds.get(parseInt(data.borrower_row))
        }
        if (!borrowerId && data.borrower_id_number) {
          const b = borrowers.find((b: any) => b.id_number === data.borrower_id_number?.toString())
          if (b) borrowerId = b.id
        }
        
        if (!borrowerId) {
          result.loans.errors++
          const borrowerRef = data.borrower_row ? `שורה ${data.borrower_row} בגליון לווים` : `ת.ז. ${data.borrower_id_number}`
          errorDetails.push({ sheet: 'הלוואות', row: row.row, message: `לא נמצא לווה מתאים (${borrowerRef}) - ייתכן שהלווה לא יובא בגלל שגיאה` })
          continue
        }
        
        // מציאת ערבים
        let g1Id: number | undefined, g2Id: number | undefined
        if (data.guarantor1_row) g1Id = guarantorIds.get(parseInt(data.guarantor1_row))
        if (!g1Id && data.guarantor1_id) {
          const g = guarantors.find((g: any) => g.id_number === data.guarantor1_id?.toString())
          if (g) g1Id = g.id
        }
        if (data.guarantor2_row) g2Id = guarantorIds.get(parseInt(data.guarantor2_row))
        if (!g2Id && data.guarantor2_id) {
          const g = guarantors.find((g: any) => g.id_number === data.guarantor2_id?.toString())
          if (g) g2Id = g.id
        }
        
        const isRecurring = isYes(data.is_recurring) ? 1 : 0
        const res = await loansService.create({
          borrower_id: borrowerId,
          amount: parseFloat(data.amount) || 0,
          loan_date: parseDate(data.loan_date) || new Date().toISOString().split('T')[0],
          due_date: parseDate(data.due_date) || undefined,
          loan_type: data.loan_type?.toString().includes('קבוע') ? 'fixed' : 'flexible',
          guarantor1_id: g1Id,
          guarantor2_id: g2Id,
          notes: data.notes?.toString() || '',
          is_recurring: isRecurring,
          recurring_day: isRecurring ? (parseInt(data.recurring_day) || 1) : undefined,
          auto_repayment: 0
        })
        const rowNum = data['שורה'] || row.row
        loanIds.set(parseInt(rowNum), res.lastInsertRowid)
        result.loans.success++
      }
    }
  } catch (e) { console.log('No loans sheet or error:', e) }
  
  // 4. ייבוא פירעונות
  try {
    const repaymentsRows = await readExcelFile(file, 'פירעונות')
    if (repaymentsRows.length > 0) {
      const mapped = mapColumns(repaymentsRows, 'repayments')
      const validated = await validateData(mapped, 'repayments')
      
      for (const row of validated) {
        if (row.status === 'error') {
          result.repayments.errors++
          errorDetails.push({ sheet: 'פירעונות', row: row.row, message: row.message || 'שגיאה לא ידועה' })
          continue
        }
        const data = row.data
        const loanId = loanIds.get(parseInt(data.loan_row))
        if (!loanId) {
          result.repayments.errors++
          errorDetails.push({ sheet: 'פירעונות', row: row.row, message: `לא נמצאה הלוואה בשורה ${data.loan_row} - ייתכן שההלוואה לא יובאה בגלל שגיאה` })
          continue
        }
        
        await db.run(
          'INSERT INTO repayments (loan_id, amount, payment_date, notes) VALUES (?, ?, ?, ?)',
          [loanId, parseFloat(data.amount) || 0, parseDate(data.payment_date) || new Date().toISOString().split('T')[0], data.notes?.toString() || '']
        )
        result.repayments.success++
      }
    }
  } catch (e) { console.log('No repayments sheet or error:', e) }
  
  // 5. ייבוא תרומות
  try {
    const donationsRows = await readExcelFile(file, 'תרומות')
    if (donationsRows.length > 0) {
      const mapped = mapColumns(donationsRows, 'donations')
      const validated = await validateData(mapped, 'donations')
      for (const row of validated) {
        if (row.status === 'error') {
          errorDetails.push({ sheet: 'תרומות', row: row.row, message: row.message || 'שגיאה לא ידועה' })
        }
      }
      const importRes = await executeImport(validated, 'donations', true)
      result.donations.success = importRes.success
      result.donations.errors = importRes.errors
    }
  } catch (e) { console.log('No donations sheet or error:', e) }
  
  // 6. ייבוא הפקדות
  try {
    const depositsRows = await readExcelFile(file, 'הפקדות')
    if (depositsRows.length > 0) {
      const mapped = mapColumns(depositsRows, 'deposits')
      const validated = await validateData(mapped, 'deposits')
      for (const row of validated) {
        if (row.status === 'error') {
          errorDetails.push({ sheet: 'הפקדות', row: row.row, message: row.message || 'שגיאה לא ידועה' })
        }
      }
      const importRes = await executeImport(validated, 'deposits', true)
      result.deposits.success = importRes.success
      result.deposits.errors = importRes.errors
    }
  } catch (e) { console.log('No deposits sheet or error:', e) }
  
  // 7. ייבוא תור הלוואות
  try {
    const waitlistRows = await readExcelFile(file, 'תור הלוואות')
    if (waitlistRows.length > 0) {
      const mapped = mapColumns(waitlistRows, 'waitlist')
      const validated = await validateData(mapped, 'waitlist')
      for (const row of validated) {
        if (row.status === 'error') {
          errorDetails.push({ sheet: 'תור הלוואות', row: row.row, message: row.message || 'שגיאה לא ידועה' })
        }
      }
      const importRes = await executeImport(validated, 'waitlist', true, undefined, borrowerIds)
      if (!result.waitlist) result.waitlist = { success: 0, errors: 0 }
      result.waitlist.success = importRes.success
      result.waitlist.errors = importRes.errors
    }
  } catch (e) { console.log('No waitlist sheet or error:', e) }
  
  // סיכום
  result.total.success = result.borrowers.success + result.guarantors.success + 
    result.loans.success + result.repayments.success + 
    result.donations.success + result.deposits.success + 
    (result.waitlist?.success || 0)
  result.total.errors = result.borrowers.errors + result.guarantors.errors + 
    result.loans.errors + result.repayments.errors + 
    result.donations.errors + result.deposits.errors + 
    (result.waitlist?.errors || 0)
  result.errorDetails = errorDetails
  
  return result
}

/**
 * יצוא כל הנתונים לקובץ אקסל
 * בפורמט זהה לתבנית הייבוא - ניתן לייבא חזרה
 */
export async function exportToExcel(): Promise<Blob> {
  const wb = XLSX.utils.book_new()
  
  // 1. יצוא לווים
  const borrowers = await borrowersService.getAll()
  const borrowersData = borrowers.map((b: any, index: number) => ({
    'שורה': index + 2,
    'שם פרטי': b.first_name,
    'שם משפחה': b.last_name,
    'ת.ז.': b.id_number || '',
    'טלפון': b.phone,
    'עיר': b.city || '',
    'כתובת': b.address || '',
    'טלפון נוסף': b.phone2 || '',
    'אימייל': b.email || '',
    'הערות': b.notes || ''
  }))
  if (borrowersData.length > 0) {
    const wsBorrowers = XLSX.utils.json_to_sheet(borrowersData)
    XLSX.utils.book_append_sheet(wb, wsBorrowers, 'לווים')
  }
  
  // מיפוי ID לווה -> שורה
  const borrowerIdToRow = new Map<number, number>()
  borrowers.forEach((b: any, index: number) => {
    borrowerIdToRow.set(b.id, index + 2)
  })
  
  // 2. יצוא ערבים
  const guarantors = await guarantorsService.getAll()
  const guarantorsData = guarantors.map((g: any, index: number) => ({
    'שורה': index + 2,
    'שם פרטי': g.first_name,
    'שם משפחה': g.last_name,
    'ת.ז.': g.id_number || '',
    'טלפון': g.phone,
    'כתובת': g.address || '',
    'אימייל': g.email || '',
    'הערות': g.notes || ''
  }))
  if (guarantorsData.length > 0) {
    const wsGuarantors = XLSX.utils.json_to_sheet(guarantorsData)
    XLSX.utils.book_append_sheet(wb, wsGuarantors, 'ערבים')
  }
  
  // מיפוי ID ערב -> שורה
  const guarantorIdToRow = new Map<number, number>()
  guarantors.forEach((g: any, index: number) => {
    guarantorIdToRow.set(g.id, index + 2)
  })
  
  // 3. יצוא הלוואות
  const loans = await loansService.getAll()
  const loansData = loans.map((l: any, index: number) => ({
    'שורה': index + 2,
    'שורת לווה': borrowerIdToRow.get(l.borrower_id) || '',
    'סכום': l.amount,
    'תאריך מתן': formatDateForExcel(l.loan_date),
    'תאריך החזרה': l.due_date ? formatDateForExcel(l.due_date) : '',
    'סוג': l.loan_type === 'fixed' ? 'קבועה' : 'גמישה',
    'מחזורית': l.is_recurring ? 'כן' : 'לא',
    'יום בחודש': l.recurring_day || '',
    'שורת ערב 1': l.guarantor1_id ? guarantorIdToRow.get(l.guarantor1_id) || '' : '',
    'שורת ערב 2': l.guarantor2_id ? guarantorIdToRow.get(l.guarantor2_id) || '' : '',
    'הערות': l.notes || ''
  }))
  if (loansData.length > 0) {
    const wsLoans = XLSX.utils.json_to_sheet(loansData)
    XLSX.utils.book_append_sheet(wb, wsLoans, 'הלוואות')
  }
  
  // מיפוי ID הלוואה -> שורה
  const loanIdToRow = new Map<number, number>()
  loans.forEach((l: any, index: number) => {
    loanIdToRow.set(l.id, index + 2)
  })
  
  // 4. יצוא פירעונות
  const repaymentsData: any[] = []
  for (const loan of loans) {
    const repayments = await repaymentsService.getByLoan(loan.id)
    for (const r of repayments) {
      repaymentsData.push({
        'שורת הלוואה': loanIdToRow.get(loan.id) || '',
        'סכום': r.amount,
        'תאריך': formatDateForExcel(r.payment_date),
        'הערות': r.notes || ''
      })
    }
  }
  if (repaymentsData.length > 0) {
    const wsRepayments = XLSX.utils.json_to_sheet(repaymentsData)
    XLSX.utils.book_append_sheet(wb, wsRepayments, 'פירעונות')
  }
  
  // 5. יצוא תרומות
  const donors = await donorsService.getAll()
  const allDonations = await db.query('SELECT * FROM donations') as any[]
  const donationsData: any[] = []
  for (const d of allDonations) {
    const donor = donors.find((don: any) => don.id === d.donor_id)
    if (donor) {
      donationsData.push({
        'שם תורם': `${donor.first_name} ${donor.last_name}`,
        'טלפון': donor.phone || '',
        'כתובת': donor.address || '',
        'סכום': d.amount,
        'תאריך': formatDateForExcel(d.donation_date),
        'הערות': d.notes || ''
      })
    }
  }
  if (donationsData.length > 0) {
    const wsDonations = XLSX.utils.json_to_sheet(donationsData)
    XLSX.utils.book_append_sheet(wb, wsDonations, 'תרומות')
  }
  
  // 6. יצוא הפקדות
  const depositors = await depositorsService.getAll()
  const allDeposits = await db.query('SELECT * FROM deposits') as any[]
  const depositsData: any[] = []
  for (const d of allDeposits) {
    const depositor = depositors.find((dep: any) => dep.id === d.depositor_id)
    if (depositor) {
      depositsData.push({
        'שם מפקיד': `${depositor.first_name} ${depositor.last_name}`,
        'ת.ז.': depositor.id_number || '',
        'טלפון': depositor.phone || '',
        'כתובת': depositor.address || '',
        'סכום': d.amount,
        'תאריך': formatDateForExcel(d.deposit_date),
        'תאריך סיום': d.due_date ? formatDateForExcel(d.due_date) : '',
        'תקופה': d.period_type === 'fixed' ? 'קבועה' : 'גמישה',
        'מחזורית': d.is_recurring ? 'כן' : 'לא',
        'יום בחודש': d.recurring_day || '',
        'הערות': d.notes || ''
      })
    }
  }
  if (depositsData.length > 0) {
    const wsDeposits = XLSX.utils.json_to_sheet(depositsData)
    XLSX.utils.book_append_sheet(wb, wsDeposits, 'הפקדות')
  }
  
  // 7. יצוא תור הלוואות
  const { waitlistService } = await import('./database')
  const waitlist = await waitlistService.getAll()
  const waitlistData = waitlist.map((w: any) => {
    const borrower = borrowers.find((b: any) => b.id === w.borrower_id)
    return {
      'מיקום': w.position,
      'שם לווה': borrower ? `${borrower.first_name} ${borrower.last_name}` : '',
      'שורת לווה': borrowerIdToRow.get(w.borrower_id) || '',
      'סכום מבוקש': w.requested_amount,
      'תאריך בקשה': formatDateForExcel(w.request_date),
      'סוג הלוואה': w.loan_type === 'fixed' ? 'קבועה' : 'גמישה',
      'תקופה מבוקשת (חודשים)': w.requested_months || '',
      'עדיפות': w.priority === 'urgent' ? 'דחופה' : 'רגילה',
      'סטטוס': w.status === 'waiting' ? 'ממתין' : w.status === 'processing' ? 'בטיפול' : w.status === 'approved' ? 'אושר' : 'נדחה',
      'הערות': w.notes || ''
    }
  })
  if (waitlistData.length > 0) {
    const wsWaitlist = XLSX.utils.json_to_sheet(waitlistData)
    XLSX.utils.book_append_sheet(wb, wsWaitlist, 'תור הלוואות')
  }
  
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/**
 * פורמט תאריך ליצוא לאקסל
 */
function formatDateForExcel(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// ייצוא השירות
export const excelImportService = {
  readExcelFile,
  getSheetName,
  mapColumns,
  validateData,
  executeImport,
  executeFullImport,
  generateTemplate,
  generateFullTemplate,
  exportToExcel
}
