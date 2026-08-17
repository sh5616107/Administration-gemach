// Simple JSON file storage
// Uses localStorage with manual backup/restore to JSON file

interface DataStore {
  settings: Record<string, string>
  borrowers: Record<string, any>
  guarantors: Record<string, any>
  loans: Record<string, any>
  repayments: Record<string, any>
  donors: Record<string, any>
  donations: Record<string, any>
  depositors: Record<string, any>
  deposits: Record<string, any>
  depositWithdrawals: Record<string, any>
  blacklist: Record<string, any>
  expenses: Record<string, any>
  guarantorLoans: Record<string, any>
  guarantorLoanRepayments: Record<string, any>
  guarantorRefunds: Record<string, any>
  waitlist: Record<string, any>
  contacts: Record<string, any>
}

const STORAGE_KEY = 'gemach_data_v1'

const defaultData: DataStore = {
  settings: { gemach_name: 'גמ"ח שלי', gemach_logo: '', risk_threshold: '50000' },
  borrowers: {},
  guarantors: {},
  loans: {},
  repayments: {},
  donors: {},
  donations: {},
  depositors: {},
  deposits: {},
  depositWithdrawals: {},
  blacklist: {},
  expenses: {},
  guarantorLoans: {},
  guarantorLoanRepayments: {},
  guarantorRefunds: {},
  waitlist: {},
  contacts: {},
}

let data: DataStore = JSON.parse(JSON.stringify(defaultData))
let isInitialized = false
let initializationPromise: Promise<void> | null = null

import { saveAppData, loadAppData } from './persistence'

// Save data (async; persistence handles environment detection)
function saveData(): void {
  saveAppData(data).then(() => { console.log('💾 Data saved') }).catch(e => console.error('❌ Error saving:', e))
}

// Load data (async)
function loadData(): Promise<void> {
  if (initializationPromise) {
    console.log('⏳ Database already initializing, returning existing promise');
    return initializationPromise;
  }
  
  if (isInitialized) {
    console.log('✅ Database already initialized');
    return Promise.resolve();
  }
  
  console.log('🔄 Starting database initialization...');
  initializationPromise = loadAppData()
    .then((stored) => {
      if (stored) {
        data = { ...JSON.parse(JSON.stringify(defaultData)), ...stored }
        console.log('✅ Data loaded, borrowers:', Object.keys((data).borrowers).length)
      } else {
        console.log('ℹ️ No existing data, using defaults')
      }
      isInitialized = true
    })
    .catch(e => {
      console.error('❌ Error loading:', e)
      isInitialized = true
    });
  
  return initializationPromise;
}

// Initialize on module load
loadData()

// Export for components that need to wait
export async function ensureInitialized(): Promise<void> {
  if (!isInitialized) {
    console.log('⏳ Waiting for database initialization...');
    await loadData();
  }
}

// Reset function for tests
export function resetDatabase(): void {
  data = JSON.parse(JSON.stringify(defaultData))
  isInitialized = false
  initializationPromise = null
  localStorage.clear()
}

// Helper functions
export function getAllItems<T>(storeName: keyof DataStore): T[] {
  return Object.values(data[storeName] as Record<string, T>)
}

/**
 * Generate a unique ID for new records
 * Uses UUID v4 for guaranteed uniqueness
 * 
 * Browser Support:
 * - Chrome 92+ (July 2021)
 * - Firefox 95+ (December 2021)
 * - Safari 15.4+ (March 2022)
 * - Edge 92+ (September 2021)
 */
function generateId(storeName: keyof DataStore): string {
  // Use native crypto.randomUUID() if available (modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  
  // Fallback for older browsers (RFC4122 v4 UUID)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Legacy function for backward compatibility during migration
 * @deprecated Use generateId() which returns UUID
 */
function generateNumericId(storeName: keyof DataStore): number {
  const counterKey = `_counter_${storeName}`
  const currentCounter = parseInt(data.settings[counterKey] || '0', 10)
  const items = getAllItems<{ id: any }>(storeName)
  const maxExistingId = items.reduce((max, item) => {
    const numId = typeof item.id === 'number' ? item.id : 0
    return Math.max(max, numId)
  }, 0)
  const newId = Math.max(currentCounter, maxExistingId) + 1
  data.settings[counterKey] = String(newId)
  saveData()
  return newId
}

function getItem<T>(storeName: keyof DataStore, id: string): T | null {
  return (data[storeName] as Record<string, T>)[id] || null
}

function setItem<T>(storeName: keyof DataStore, id: string, value: T): void {
  ;(data[storeName] as Record<string, T>)[id] = value
  saveData()
}

function removeItem(storeName: keyof DataStore, id: string): void {
  delete (data[storeName] as Record<string, any>)[id]
  saveData()
}

function clearStore(storeName: keyof DataStore): void {
  if (storeName === 'settings') {
    data.settings = { ...defaultData.settings }
  } else {
    ;(data[storeName] as Record<string, any>) = {}
  }
  saveData()
}


// Database service
export const db = {
  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    // נרמול SQL — מבטל רגישות לרווחים וירידות שורה
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    
    if (normalizedSql.includes('FROM contacts')) {
      const items = getAllItems<any>('contacts')
      if (params && params.length > 0 && normalizedSql.includes('WHERE phone')) {
        return items.filter(c => c.phone === params[0])
      }
      return items
    }
    if (normalizedSql.includes('FROM borrowers')) {
      const items = getAllItems<any>('borrowers')
      // Filter out deleted borrowers if WHERE is_deleted = 0 or similar
      if (normalizedSql.includes('is_deleted')) {
        return items.filter(b => !b.is_deleted)
      }
      // Support search with LIKE
      if (params && params.length >= 3 && normalizedSql.includes('LIKE')) {
        const term = String(params[0]).replace(/%/g, '').toLowerCase()
        return items.filter(b => 
          b.first_name?.toLowerCase().includes(term) || 
          b.last_name?.toLowerCase().includes(term) || 
          b.phone?.includes(term)
        ).slice(0, 10)
      }
      return items
    }
    if (normalizedSql.includes('FROM loans')) {
      const items = getAllItems<any>('loans')
      // Filter out deleted loans if WHERE is_deleted = 0 or similar
      if (normalizedSql.includes('is_deleted')) {
        return items.filter(l => !l.is_deleted)
      }
      return items
    }
    if (normalizedSql.includes('FROM donors')) {
      const items = getAllItems<any>('donors')
      if (params && params.length >= 3) {
        const term = String(params[0]).replace(/%/g, '').toLowerCase()
        return items.filter(d => d.first_name?.toLowerCase().includes(term) || d.last_name?.toLowerCase().includes(term) || d.phone?.includes(term)).slice(0, 5)
      }
      return items
    }
    if (normalizedSql.includes('FROM depositors')) {
      const items = getAllItems<any>('depositors')
      if (params && params.length >= 3) {
        const term = String(params[0]).replace(/%/g, '').toLowerCase()
        return items.filter(d => d.first_name?.toLowerCase().includes(term) || d.last_name?.toLowerCase().includes(term) || d.phone?.includes(term)).slice(0, 5)
      }
      return items
    }
    if (normalizedSql.includes('FROM deposits')) {
      const deposits = getAllItems<any>('deposits').filter(d => !d.is_deleted)
      const depositors = getAllItems<any>('depositors')
      
      let filtered = deposits
      
      // פילטר לפי depositor_id
      if (params && params.length > 0 && normalizedSql.includes('WHERE depositor_id')) {
        filtered = filtered.filter(d => d.depositor_id === params[0])
        return filtered.sort((a: any, b: any) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime())
      }
      
      // פילטר לפי is_recurring
      if (normalizedSql.includes('is_recurring = 1')) {
        filtered = filtered.filter(d => d.is_recurring === 1)
      }
      
      // פילטר לפי status
      if (normalizedSql.includes('status = ?') && params && params.length > 0) {
        const statusParam = params[params.length - 1]
        filtered = filtered.filter(d => d.status === statusParam)
      }
      
      return filtered.map(d => ({ ...d, depositor_name: depositors.find(dep => dep.id === d.depositor_id)?.first_name + ' ' + depositors.find(dep => dep.id === d.depositor_id)?.last_name || '' }))
    }
    if (normalizedSql.includes('FROM donations')) {
      const donations = getAllItems<any>('donations')
      const donors = getAllItems<any>('donors')
      
      let filtered = donations
      
      // פילטר לפי donor_id
      if (normalizedSql.includes('WHERE d.donor_id') || normalizedSql.includes('WHERE donor_id')) {
        // If params provided, use them (supports UUIDs)
        if (params && params.length > 0) {
          const donorId = params[0]
          filtered = filtered.filter(d => d.donor_id === donorId)
        } else {
          // Fallback: חילוץ ה-donor_id מה-SQL (תמיכה במספרים בלבד)
          const match = normalizedSql.match(/donor_id\s*=\s*(\d+)/)
          if (match) {
            const donorId = parseInt(match[1], 10)
            filtered = filtered.filter(d => d.donor_id === donorId)
          }
        }
      }
      
      return filtered.map(d => ({ 
        ...d, 
        donor_name: donors.find(don => don.id === d.donor_id)?.first_name + ' ' + donors.find(don => don.id === d.donor_id)?.last_name || '',
        donor_email: donors.find(don => don.id === d.donor_id)?.email || ''
      })).sort((a: any, b: any) => new Date(b.donation_date).getTime() - new Date(a.donation_date).getTime())
    }
    if (normalizedSql.includes('FROM blacklist')) return getAllItems<any>('blacklist')
    if (normalizedSql.includes('FROM repayments')) return getAllItems<any>('repayments')
    if (normalizedSql.includes('settings')) return Object.entries(data.settings).map(([key, value]) => ({ key, value }))
    return []
  },

  async run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: string | number; changes: number }> {
    // נרמול SQL — מבטל רגישות לרווחים וירידות שורה
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    
    if (normalizedSql.includes('DELETE FROM repayments') && !normalizedSql.includes('WHERE')) { clearStore('repayments'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM loans') && !normalizedSql.includes('WHERE')) { clearStore('loans'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM borrowers') && !normalizedSql.includes('WHERE')) { clearStore('borrowers'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM guarantors') && !normalizedSql.includes('WHERE')) { clearStore('guarantors'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM donations') && !normalizedSql.includes('WHERE')) { clearStore('donations'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM donors') && !normalizedSql.includes('WHERE')) { clearStore('donors'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM donors WHERE id') && params) { removeItem('donors', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM deposits') && !normalizedSql.includes('WHERE')) { clearStore('deposits'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM depositors') && !normalizedSql.includes('WHERE')) { clearStore('depositors'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM depositors WHERE id') && params) { removeItem('depositors', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM contacts') && !normalizedSql.includes('WHERE')) { clearStore('contacts'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM contacts WHERE phone') && params) { removeItem('contacts', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('UPDATE depositors SET') && params) {
      const d = getItem<any>('depositors', String(params[7]));
      if (d) {
        d.first_name = params[0]
        d.last_name = params[1]
        d.phone = params[2]
        d.id_number = params[3]
        d.address = params[4]
        d.email = params[5]
        d.notes = params[6]
        setItem('depositors', String(params[7]), d)
      }
      return { lastInsertRowid: 0, changes: 1 }
    }
    if (normalizedSql.includes('UPDATE donors SET') && params) {
      const d = getItem<any>('donors', String(params[7]));
      if (d) {
        d.first_name = params[0]
        d.last_name = params[1]
        d.phone = params[2]
        d.id_number = params[3]
        d.address = params[4]
        d.email = params[5]
        d.notes = params[6]
        setItem('donors', String(params[7]), d)
      }
      return { lastInsertRowid: 0, changes: 1 }
    }
    if (normalizedSql.includes('DELETE FROM blacklist') && !normalizedSql.includes('WHERE')) { clearStore('blacklist'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM waitlist') && !normalizedSql.includes('WHERE')) { clearStore('waitlist'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM expenses') && !normalizedSql.includes('WHERE')) { clearStore('expenses'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM guarantorLoans') && !normalizedSql.includes('WHERE')) { clearStore('guarantorLoans'); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM depositWithdrawals') && !normalizedSql.includes('WHERE')) { clearStore('depositWithdrawals'); return { lastInsertRowid: 0, changes: 1 } }

    if (normalizedSql.includes('INSERT INTO blacklist') && params) { const id = generateId('blacklist'); setItem('blacklist', String(id), { id, entity_type: params[0], entity_id: params[1], reason: params[2], added_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (normalizedSql.includes('INSERT INTO contacts') && params) { 
      const phone = String(params[0])
      setItem('contacts', phone, { 
        phone: params[0], 
        first_name: params[1], 
        last_name: params[2], 
        id_number: params[3], 
        city: params[4], 
        address: params[5], 
        email: params[6], 
        notes: params[7], 
        tags: params[8] || '[]',
        borrower_id: null,
        guarantor_id: null,
        donor_id: null,
        depositor_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      return { lastInsertRowid: 0, changes: 1 } 
    }
    if (normalizedSql.includes('UPDATE contacts SET') && params) {
      const phone = String(params[params.length - 1])
      const c = getItem<any>('contacts', phone)
      if (c) {
        // עדכון כל השדות שנשלחו
        if (params[0] !== undefined) c.first_name = params[0]
        if (params[1] !== undefined) c.last_name = params[1]
        if (params[2] !== undefined) c.id_number = params[2]
        if (params[3] !== undefined) c.city = params[3]
        if (params[4] !== undefined) c.address = params[4]
        if (params[5] !== undefined) c.email = params[5]
        if (params[6] !== undefined) c.notes = params[6]
        if (params[7] !== undefined) c.tags = params[7]
        if (params[8] !== undefined) c.borrower_id = params[8]
        if (params[9] !== undefined) c.guarantor_id = params[9]
        if (params[10] !== undefined) c.donor_id = params[10]
        if (params[11] !== undefined) c.depositor_id = params[11]
        c.updated_at = new Date().toISOString()
        setItem('contacts', phone, c)
      }
      return { lastInsertRowid: 0, changes: 1 }
    }
    if (normalizedSql.includes('INSERT INTO donors') && params) { const id = generateId('donors'); setItem('donors', String(id), { id, first_name: params[0], last_name: params[1], phone: params[2], id_number: params[3], address: params[4], email: params[5], notes: params[6], created_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (normalizedSql.includes('INSERT INTO donations') && params) { 
      const id = generateId('donations'); 
      // Generate sequential receipt number
      const allDonations = getAllItems<any>('donations');
      
      // Calculate max receipt number - only count valid numeric receipt numbers (6 digits or less)
      const maxReceiptNum: number = allDonations.reduce((max: number, d: any) => {
        // Check if receipt_number is a valid numeric string (not UUID, not empty)
        const receiptStr = d.receipt_number;
        if (!receiptStr) return max;
        
        // Parse as number - if it's a valid number string (like "000001"), parseInt will work
        // If it's a UUID, parseInt will return NaN
        const num = parseInt(receiptStr);
        
        // Only consider valid numbers that are reasonable (not NaN, positive, less than 1 million)
        if (!isNaN(num) && num > 0 && num < 1000000 && num > max) {
          return num;
        }
        return max;
      }, 0);
      
      const receiptNumber = String(maxReceiptNum + 1).padStart(6, '0'); // Format: 000001, 000002, etc.
      
      console.log(`[DONATIONS] Creating donation with receipt #${receiptNumber} (max existing: ${maxReceiptNum})`);
      
      setItem('donations', String(id), { 
        id, 
        donor_id: params[0], 
        amount: params[1], 
        donation_date: params[2], 
        notes: params[3], 
        payment_method: params[4] || '', 
        payment_details: params[5] || '', 
        receipt_number: receiptNumber,
        created_at: new Date().toISOString() 
      }); 
      return { lastInsertRowid: id, changes: 1 } 
    }
    if (normalizedSql.includes('INSERT INTO depositors') && params) { const id = generateId('depositors'); setItem('depositors', String(id), { id, first_name: params[0], last_name: params[1], phone: params[2], id_number: params[3], address: params[4], email: params[5], notes: params[6], created_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (normalizedSql.includes('INSERT INTO deposits') && params) { 
      const id = generateId('deposits'); 
      setItem('deposits', String(id), { 
        id, 
        depositor_id: params[0], 
        amount: params[1], 
        deposit_date: params[2], 
        period_type: params[3], 
        due_date: params[4], 
        is_recurring: params[5], 
        recurring_day: params[6], 
        recurring_months: params[7],
        recurring_deposit_number: params[8],
        recurring_deposit_count: params[9],
        notes: params[10], 
        status: params[11], 
        payment_method: params[12] || '', 
        payment_details: params[13] || '', 
        is_deleted: false,
        created_at: new Date().toISOString() 
      }); 
      return { lastInsertRowid: id, changes: 1 } 
    }

    if (normalizedSql.includes('UPDATE deposits SET status') && params) { 
      const d = getItem<any>('deposits', String(params[params.length - 1])); 
      if (d) { 
        d.status = params[0]; 
        // עדכון עם תאריך משיכה, סכום שנמשך ופרטי תשלום (6 פרמטרים)
        if (params.length === 6) {
          d.withdrawal_date = params[1]
          d.withdrawn_amount = params[2]
          d.withdrawal_payment_method = params[3]
          d.withdrawal_payment_details = params[4]
        }
        // תאימות לאחור - 5 פרמטרים (בלי withdrawn_amount)
        else if (params.length === 5) {
          d.withdrawal_date = params[1]
          d.withdrawal_payment_method = params[2]
          d.withdrawal_payment_details = params[3]
        }
        setItem('deposits', String(params[params.length - 1]), d) 
      } 
      return { lastInsertRowid: 0, changes: 1 } 
    }
    if (normalizedSql.includes('UPDATE deposits SET amount') && params) {
      const d = getItem<any>('deposits', String(params[params.length - 1]));
      if (d) {
        // בדיקה אם זה UPDATE עם שדות מחזוריים (11 פרמטרים)
        if (params.length === 11) {
          d.amount = params[0]
          d.deposit_date = params[1]
          d.period_type = params[2]
          d.due_date = params[3]
          d.is_recurring = params[4]
          d.recurring_day = params[5]
          d.recurring_months = params[6]
          d.recurring_deposit_number = params[7]
          d.recurring_deposit_count = params[8]
          d.notes = params[9]
        }
        // תאימות לאחור - 6 פרמטרים (בלי שדות מחזוריים)
        else if (params.length === 6) {
          d.amount = params[0]
          d.deposit_date = params[1]
          d.period_type = params[2]
          d.due_date = params[3]
          d.notes = params[4]
        }
        setItem('deposits', String(params[params.length - 1]), d)
      }
      return { lastInsertRowid: 0, changes: 1 }
    }
    if (normalizedSql.includes('DELETE FROM deposits WHERE id') && params) { 
      const d = getItem<any>('deposits', String(params[0])); 
      if (d) setItem('deposits', String(params[0]), { ...d, is_deleted: true, deleted_at: new Date().toISOString() }); 
      return { lastInsertRowid: 0, changes: 1 } 
    }
    if (normalizedSql.includes('UPDATE donations SET') && params) {
      const d = getItem<any>('donations', String(params[params.length - 1]));
      if (d) {
        d.amount = params[0]
        d.donation_date = params[1]
        d.notes = params[2]
        d.payment_method = params[3]
        d.payment_details = params[4]
        setItem('donations', String(params[params.length - 1]), d)
      }
      return { lastInsertRowid: 0, changes: 1 }
    }
    if (normalizedSql.includes('DELETE FROM donations WHERE id') && params) { removeItem('donations', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (normalizedSql.includes('DELETE FROM blacklist WHERE id') && params) { removeItem('blacklist', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    
    // ⚠️ אזהרה: SQL לא מזוהה - עלול לגרום לנתונים לא להישמר
    console.warn(`[DB] ⚠️ Unrecognized SQL command (fallback): ${normalizedSql.substring(0, 100)}`)
    return { lastInsertRowid: 1, changes: 1 }
  },

  async get(sql: string, params?: unknown[]): Promise<unknown> {
    // נרמול SQL — מבטל רגישות לרווחים וירידות שורה
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    
    if (normalizedSql.includes('SELECT id FROM depositors') && params) return getAllItems<any>('depositors').find(d => d.first_name === params[0] && d.last_name === params[1] && d.phone === params[2]) || null
    if (normalizedSql.includes('SELECT id FROM donors') && params) return getAllItems<any>('donors').find(d => d.first_name === params[0] && d.last_name === params[1] && d.phone === params[2]) || null
    return null
  },
}

// Borrowers Service
export interface Borrower { 
  id: string;  // UUID
  first_name: string; 
  last_name: string; 
  id_number?: string; 
  city?: string; 
  phone: string; 
  phone2?: string; 
  address?: string; 
  email?: string; 
  notes?: string; 
  created_at: string 
}

export const borrowersService = {
  async getAll(): Promise<Borrower[]> { return getAllItems<Borrower>('borrowers').sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)) },
  async getById(id: string): Promise<Borrower | null> { return getItem<Borrower>('borrowers', id) },
  async search(term: string): Promise<Borrower[]> { const t = term.toLowerCase(); return (await this.getAll()).filter(b => b.first_name?.toLowerCase().includes(t) || b.last_name?.toLowerCase().includes(t) || b.phone?.includes(term) || b.id_number?.includes(term) || b.city?.toLowerCase().includes(t)) },
  async create(b: Omit<Borrower, 'id' | 'created_at'>): Promise<{ lastInsertRowid: string }> { const id = generateId('borrowers'); setItem('borrowers', id, { ...b, id, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: string, d: Partial<Borrower>): Promise<void> { const e = await this.getById(id); if (e) setItem('borrowers', id, { ...e, ...d }) },
  async delete(id: string): Promise<void> { 
    // בדיקה: האם ללווה יש הלוואה פעילה עם יתרה?
    const loans = getAllItems<Loan>('loans').filter(l => !l.is_deleted && l.borrower_id === id)
    const hasActiveLoan = loans.some(l => {
      if (l.status !== 'active') return false
      // total_repaid לא בהכרח מחושב כאן, לכן מחשבים ישירות מהתשלומים
      const repayments = getAllItems<Repayment>('repayments').filter(r => r.loan_id === l.id && !r.is_deleted)
      const totalRepaid = repayments.reduce((s, r) => s + r.amount, 0)
      const remaining = l.amount - totalRepaid
      return remaining > 0
    })
    
    if (hasActiveLoan) {
      throw new Error('לא ניתן למחוק לווה עם הלוואה פעילה. יש לסגור או להעביר את ההלוואה תחילה.')
    }
    
    // מחיקה מהרשימה השחורה אם קיים
    const blacklistItems = getAllItems<{ id: string; entity_type: string; entity_id: string }>('blacklist')
    const blacklistEntry = blacklistItems.find(b => b.entity_type === 'borrower' && b.entity_id === id)
    if (blacklistEntry) removeItem('blacklist', blacklistEntry.id)
    removeItem('borrowers', id) 
  },
}

// Guarantors Service
export interface Guarantor { 
  id: string;  // UUID
  first_name: string; 
  last_name: string; 
  phone: string; 
  id_number?: string; 
  address?: string; 
  email?: string; 
  notes?: string; 
  is_blacklisted: number; 
  created_at: string 
}

export const guarantorsService = {
  async getAll(): Promise<Guarantor[]> { return getAllItems<Guarantor>('guarantors').sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)) },
  async getById(id: string): Promise<Guarantor | null> { return getItem<Guarantor>('guarantors', id) },
  async search(term: string): Promise<Guarantor[]> { const t = term.toLowerCase(); return (await this.getAll()).filter(g => g.first_name?.toLowerCase().includes(t) || g.last_name?.toLowerCase().includes(t) || g.phone?.includes(term) || g.id_number?.includes(term)) },
  async create(g: Omit<Guarantor, 'id' | 'created_at' | 'is_blacklisted'>): Promise<{ lastInsertRowid: string }> { const id = generateId('guarantors'); setItem('guarantors', id, { ...g, id, is_blacklisted: 0, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: string, d: Partial<Guarantor>): Promise<void> { const e = await this.getById(id); if (e) setItem('guarantors', id, { ...e, ...d }) },
  async delete(id: string): Promise<void> { 
    // מחיקה מהרשימה השחורה אם קיים
    const blacklistItems = getAllItems<{ id: string; entity_type: string; entity_id: string }>('blacklist')
    const blacklistEntry = blacklistItems.find(b => b.entity_type === 'guarantor' && b.entity_id === id)
    if (blacklistEntry) removeItem('blacklist', blacklistEntry.id)
    removeItem('guarantors', id) 
  },
  async getTotalGuarantees(id: string): Promise<number> { return (await loansService.getAll()).filter(l => (l.guarantor1_id === id || l.guarantor2_id === id) && l.status === 'active').reduce((s, l) => s + l.amount - (l.total_repaid || 0), 0) },
}


// Loans Service
export interface Loan { 
  id: string;  // UUID (technical primary key)
  loan_number: number;  // Sequential user-facing loan number (e.g., 1, 2, 3...)
  borrower_id: string;  // UUID foreign key
  amount: number; 
  loan_date: string; 
  loan_date_hebrew?: string; 
  loan_type: string; 
  due_date?: string; 
  due_date_hebrew?: string; 
  is_recurring: number; 
  recurring_months?: number; 
  recurring_day?: number; 
  recurring_loan_number?: number; 
  recurring_loan_count?: number; 
  recurring_series_id?: string;  // UUID - מזהה משפחת הלוואות מחזוריות (שדה חדש)
  auto_repayment: number; 
  repayment_amount?: number; 
  repayment_day?: number; 
  repayment_frequency?: string; 
  repayment_start_date?: string; 
  guarantor1_id?: string;  // UUID foreign key
  guarantor2_id?: string;  // UUID foreign key
  notes?: string; 
  status: string; 
  created_at: string; 
  total_repaid?: number; 
  remaining?: number; 
  borrower_name?: string; 
  payment_method?: string; 
  payment_details?: string; 
  is_deleted?: boolean; 
  deleted_at?: string 
}

export const loansService = {
  async getAll(): Promise<Loan[]> {
    const loans = getAllItems<Loan>('loans').filter(l => !l.is_deleted)
    const borrowers = await borrowersService.getAll()
    
    // Migration: Add loan_number to existing loans that don't have it
    let needsSave = false
    for (const loan of loans) {
      if (loan.loan_number === undefined) {
        loan.loan_number = generateNumericId('loans')
        setItem('loans', loan.id, loan)
        needsSave = true
      }
      
      const repayments = await repaymentsService.getByLoan(loan.id)
      loan.total_repaid = repayments.reduce((s, r) => s + r.amount, 0)
      loan.remaining = loan.amount - loan.total_repaid
      const b = borrowers.find(x => x.id === loan.borrower_id)
      loan.borrower_name = b ? `${b.first_name} ${b.last_name}` : ''
    }
    return loans.sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
  },
  async getByBorrower(id: string): Promise<Loan[]> { return (await this.getAll()).filter(l => l.borrower_id === id) },
  async getById(id: string): Promise<Loan | null> { 
    const l = getItem<Loan>('loans', id); 
    if (l && l.is_deleted) return null; 
    if (l) { 
      // Migration: Add loan_number if missing
      if (l.loan_number === undefined) {
        l.loan_number = generateNumericId('loans')
        setItem('loans', id, l)
      }
      
      const r = await repaymentsService.getByLoan(id); 
      l.total_repaid = r.reduce((s, x) => s + x.amount, 0); 
      l.remaining = l.amount - l.total_repaid 
    } 
    return l 
  },
  async create(l: Omit<Loan, 'id' | 'loan_number' | 'created_at' | 'status'>): Promise<{ lastInsertRowid: string }> { 
    const id = generateId('loans'); 
    const loan_number = generateNumericId('loans'); 
    const status = new Date(l.loan_date) > new Date() ? 'planned' : 'active'; 
    setItem('loans', id, { ...l, id, loan_number, status, is_deleted: false, created_at: new Date().toISOString() }); 
    return { lastInsertRowid: id } 
  },
  async update(id: string, d: Partial<Loan>): Promise<void> { const e = await this.getById(id); if (e) setItem('loans', id, { ...e, ...d }) },
  async delete(id: string): Promise<void> { const e = await this.getById(id); if (e) setItem('loans', id, { ...e, is_deleted: true, deleted_at: new Date().toISOString() }) },
  async getOverdue(): Promise<Loan[]> { const t = new Date().toISOString().split('T')[0]; return (await this.getAll()).filter(l => l.loan_type === 'fixed' && l.due_date && l.due_date < t && (l.status === 'active' || l.status === 'overdue') && (l.remaining || 0) > 0 && l.auto_repayment !== 1) },
  
  /**
   * פונקציה מרכזית לקבלת הלוואות פעילות ללווים קיימים בלבד
   * זו הפונקציה היחידה שצריכה להשתמש בה כל מקום שרוצה לספור הלוואות פעילות
   * כדי למנוע אי-עקביות בין תצוגות שונות
   * 
   * @returns רשימת הלוואות פעילות מסוננות ומ sorted
   */
  async getActiveLoansForExistingBorrowers(): Promise<Loan[]> {
    const allLoans = await this.getAll()
    const borrowers = await borrowersService.getAll()
    const existingBorrowerIds = new Set(borrowers.map(b => b.id))
    const today = new Date().toISOString().split('T')[0]
    
    return allLoans
      .filter(l => 
        l.status === 'active' && 
        l.loan_date <= today &&
        (l.remaining || 0) > 0 &&
        existingBorrowerIds.has(l.borrower_id)
      )
      .sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
  },
}

// Repayments Service
export interface Repayment { 
  id: string;  // UUID
  loan_id: string;  // UUID foreign key
  amount: number; 
  payment_date: string; 
  payment_date_hebrew?: string; 
  notes?: string; 
  created_at: string; 
  payment_method?: string; 
  payment_details?: string; 
  is_recurring?: number; 
  recurring_repayment_number?: number; 
  recurring_repayment_count?: number; 
  is_deleted?: boolean; 
  deleted_at?: string;
  bank_verified?: boolean;
  bank_transaction_id?: string;
  verified_at?: string;
}

export const repaymentsService = {
  async getByLoan(loanId: string): Promise<Repayment[]> { return getAllItems<Repayment>('repayments').filter(r => r.loan_id === loanId && !r.is_deleted).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()) },
  async create(r: Omit<Repayment, 'id' | 'created_at'>): Promise<{ lastInsertRowid: string }> { const id = generateId('repayments'); setItem('repayments', id, { ...r, id, is_deleted: false, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: string, data: Partial<Repayment>): Promise<void> { const existing = getItem<Repayment>('repayments', id); if (existing && !existing.is_deleted) setItem('repayments', id, { ...existing, ...data }) },
  async delete(id: string): Promise<void> { const e = getItem<Repayment>('repayments', id); if (e) setItem('repayments', id, { ...e, is_deleted: true, deleted_at: new Date().toISOString() }) },
}

// Stats Service
export const statsService = {
  async getDashboardStats() {
    const today = new Date().toISOString().split('T')[0]
    
    // שימוש בפונקציה המרכזית
    const activeWithBalance = await loansService.getActiveLoansForExistingBorrowers()
    
    // הלוואות מתוכננות
    const allLoans = await loansService.getAll()
    const planned = allLoans.filter(l => 
      (l.status === 'planned' || l.loan_date > today)
    )
    
    const deps = (await db.query('SELECT * FROM deposits', [])) as { id: number; amount: number; status?: string; is_recurring?: number; recurring_deposit_number?: number; is_deleted?: boolean }[]
    
    // חישוב סה"כ הפקדות (כולל מחזוריות, מפחיתים משיכות)
    let totalDeposits = 0
    for (const d of deps) {
      let depositAmount = d.amount
      if (d.is_recurring === 1 && d.recurring_deposit_number) {
        depositAmount = d.amount * d.recurring_deposit_number
      }
      
      // הפחתת משיכות
      const withdrawals = await depositWithdrawalsService.getByDeposit(d.id)
      const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
      totalDeposits += (depositAmount - totalWithdrawn)
    }
    
    const dons = getAllItems<{ amount: number }>('donations')
    const expenses = getAllItems<{ amount: number; paid_by: string }>('expenses')
    const gemachExpenses = expenses.filter(e => e.paid_by === 'gemach').reduce((s, e) => s + e.amount, 0)
    
    const result = {
      activeLoans: { 
        count: activeWithBalance.length,  // כל ההלוואות עם יתרה
        total: activeWithBalance.reduce((s, l) => s + (l.remaining || 0), 0)
      },
      plannedLoans: { count: planned.length, total: planned.reduce((s, l) => s + l.amount, 0) },
      deposits: { count: deps.length, total: totalDeposits },
      donations: { count: dons.length, total: dons.reduce((s, d) => s + d.amount, 0) },
      gemachExpenses,
    }
    
    return result
  },
  async getActiveBorrowers() {
    const loans = await loansService.getAll()
    const borrowers = await borrowersService.getAll()
    const today = new Date().toISOString().split('T')[0]
    const stats = new Map<string, { loan_count: number; total_debt: number }>()
    for (const l of loans) { if (l.status === 'active' && l.loan_date <= today && (l.remaining || 0) > 0) { const s = stats.get(l.borrower_id) || { loan_count: 0, total_debt: 0 }; s.loan_count++; s.total_debt += l.remaining || 0; stats.set(l.borrower_id, s) } }
    return borrowers.filter(b => stats.has(b.id)).map(b => ({ ...b, ...stats.get(b.id) })).sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0))
  },
  async getPaymentMethodStats() {
    const loans = getAllItems<any>('loans')
    const repayments = getAllItems<any>('repayments')
    const donations = getAllItems<any>('donations')
    const deposits = (await db.query('SELECT * FROM deposits WHERE is_deleted IS NULL OR is_deleted = 0')) as any[]
    const expenses = getAllItems<any>('expenses')
    
    const methods = ['cash', 'credit', 'transfer', 'check', 'other']
    const stats: Record<string, { loansOut: number; repaymentsIn: number; donationsIn: number; depositsIn: number; withdrawalsOut: number; expensesOut: number }> = {}
    
    for (const m of methods) {
      stats[m] = { loansOut: 0, repaymentsIn: 0, donationsIn: 0, depositsIn: 0, withdrawalsOut: 0, expensesOut: 0 }
    }
    stats['unknown'] = { loansOut: 0, repaymentsIn: 0, donationsIn: 0, depositsIn: 0, withdrawalsOut: 0, expensesOut: 0 }
    
    // הלוואות (יציאה)
    for (const l of loans) {
      const method = l.payment_method || 'unknown'
      if (stats[method]) stats[method].loansOut += l.amount || 0
      else stats['unknown'].loansOut += l.amount || 0
    }
    
    // פירעונות (כניסה)
    for (const r of repayments) {
      const method = r.payment_method || 'unknown'
      if (stats[method]) stats[method].repaymentsIn += r.amount || 0
      else stats['unknown'].repaymentsIn += r.amount || 0
    }
    
    // תרומות (כניסה)
    for (const d of donations) {
      const method = d.payment_method || 'unknown'
      if (stats[method]) stats[method].donationsIn += d.amount || 0
      else stats['unknown'].donationsIn += d.amount || 0
    }
    
    // הפקדות (כניסה) ומשיכות (יציאה)
    for (const d of deposits) {
      // חישוב סכום בפועל להפקדה מחזורית
      let depositAmount = d.amount || 0
      if (d.is_recurring === 1 && d.recurring_deposit_number) {
        depositAmount = (d.amount || 0) * d.recurring_deposit_number
      }
      
      const method = d.payment_method || 'unknown'
      if (d.status === 'active') {
        if (stats[method]) stats[method].depositsIn += depositAmount
        else stats['unknown'].depositsIn += depositAmount
      } else if (d.status === 'withdrawn') {
        const wMethod = d.withdrawal_payment_method || 'unknown'
        if (stats[wMethod]) stats[wMethod].withdrawalsOut += depositAmount
        else stats['unknown'].withdrawalsOut += depositAmount
      }
    }
    
    // הוצאות של הנהלת הגמ"ח (יציאה)
    for (const e of expenses) {
      if (e.paid_by === 'gemach') {
        const method = e.payment_method || 'unknown'
        if (stats[method]) stats[method].expensesOut += e.amount || 0
        else stats['unknown'].expensesOut += e.amount || 0
      }
    }
    
    return stats
  },
  async getExpenses() {
    const expenses = getAllItems<any>('expenses')
    const borrowers = await borrowersService.getAll()
    return expenses.map(e => ({
      ...e,
      borrower_name: e.borrower_id ? borrowers.find(b => b.id === e.borrower_id)?.first_name + ' ' + borrowers.find(b => b.id === e.borrower_id)?.last_name : undefined
    })).sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
  },
  async getExpensesByBorrower(borrowerId: string) {
    const expenses = getAllItems<any>('expenses')
    return expenses.filter(e => e.paid_by === 'borrower' && e.borrower_id === borrowerId)
      .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
  },
  async addExpense(expense: { description: string; amount: number; expense_date: string; category: string; paid_by: string; borrower_id?: string; payment_method?: string; payment_details?: string; notes?: string }) {
    const id = generateId('expenses')
    setItem('expenses', id, { ...expense, id, created_at: new Date().toISOString() })
    return { id }
  },
  async updateExpense(id: string, expense: { description: string; amount: number; expense_date: string; category: string; paid_by: string; borrower_id?: string; payment_method?: string; payment_details?: string; notes?: string }) {
    const existing = getItem<any>('expenses', id)
    if (existing) {
      setItem('expenses', String(id), { ...existing, ...expense })
    }
  },
  async deleteExpense(id: string) {
    removeItem('expenses', String(id))
  },
  async getTotalGemachExpenses() {
    const expenses = getAllItems<any>('expenses')
    return expenses.filter(e => e.paid_by === 'gemach').reduce((sum, e) => sum + (e.amount || 0), 0)
  },
  /**
   * פונקציה לאיתור הלוואות "יתומות" - הלוואות פעילות ללווים שנמחקו
   * @returns מערך של הלוואות יתומות עם פרטיהן
   */
  async findOrphanedLoans() {
    const loans = await loansService.getAll()
    const borrowers = await borrowersService.getAll()
    const existingIds = new Set(borrowers.map(b => b.id))
    
    const orphaned = loans.filter(l =>
      l.status === 'active' &&
      (l.remaining || 0) > 0 &&
      !existingIds.has(l.borrower_id)
    )
    
    const totalAmount = orphaned.reduce((s, l) => s + (l.remaining || 0), 0)
    
    console.log('🔍 הלוואות יתומות נמצאו:', orphaned.length)
    console.log('💰 סכום כולל:', totalAmount)
    console.log('📋 פרטים:', orphaned.map(l => ({
      id: l.id?.substring(0, 8),
      borrower_id: l.borrower_id?.substring(0, 8),
      amount: l.amount,
      remaining: l.remaining,
      loan_date: l.loan_date
    })))
    
    return {
      count: orphaned.length,
      totalAmount,
      loans: orphaned
    }
  },
}

// Guarantor Loans Service - הלוואות שהועברו לערבים
export interface GuarantorLoan {
  id: string  // UUID
  guarantor_id: string  // UUID foreign key
  original_loan_id: string  // UUID foreign key
  amount: number
  total_repaid: number
  total_refunded: number // סה"כ הוחזר מהלווה לערב
  due_date?: string
  monthly_payments?: number
  start_date?: string
  status: 'active' | 'paid'
  notes?: string
  created_at: string
}

export interface GuarantorLoanRepayment {
  id: string  // UUID
  guarantor_loan_id: string  // UUID foreign key
  amount: number
  payment_date: string
  payment_method?: string
  payment_details?: string
  notes?: string
  created_at: string
}

export const guarantorLoansService = {
  async getAll(): Promise<GuarantorLoan[]> {
    return getAllItems<GuarantorLoan>('guarantorLoans').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },
  async getById(id: string): Promise<GuarantorLoan | null> {
    return getItem<GuarantorLoan>('guarantorLoans', id)
  },
  async getByOriginalLoan(loanId: string): Promise<GuarantorLoan[]> {
    return (await this.getAll()).filter(gl => gl.original_loan_id === loanId)
  },
  async getByGuarantor(guarantorId: string): Promise<GuarantorLoan[]> {
    return (await this.getAll()).filter(gl => gl.guarantor_id === guarantorId)
  },
  async create(gl: Omit<GuarantorLoan, 'id' | 'created_at' | 'total_repaid' | 'total_refunded'>): Promise<{ id: string }> {
    const id = generateId('guarantorLoans')
    setItem('guarantorLoans', id, { ...gl, id, total_repaid: 0, total_refunded: 0, created_at: new Date().toISOString() })
    return { id }
  },
  async update(id: string, data: Partial<GuarantorLoan>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) setItem('guarantorLoans', id, { ...existing, ...data })
  },
  async delete(id: string): Promise<void> {
    removeItem('guarantorLoans', id)
  },
  async addRepayment(guarantorLoanId: string, amount: number, paymentDate: string, paymentMethod?: string, paymentDetails?: string, notes?: string): Promise<void> {
    // שימוש ב-guarantorLoanRepaymentsService במקום עדכון ישיר
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoanId,
      amount,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      payment_details: paymentDetails,
      notes: notes
    })
  },
  async deleteByOriginalLoan(loanId: string): Promise<void> {
    const loans = await this.getByOriginalLoan(loanId)
    for (const loan of loans) {
      removeItem('guarantorLoans', loan.id)
    }
  },
  async getActiveCount(): Promise<number> {
    return (await this.getAll()).filter(gl => gl.status === 'active').length
  },
  async getAllWithDetails(): Promise<(GuarantorLoan & { guarantor_name: string; borrower_name: string; remaining: number })[]> {
    const gLoans = await this.getAll()
    const guarantors = await guarantorsService.getAll()
    const loans = await loansService.getAll()
    const borrowers = await borrowersService.getAll()
    
    return gLoans.map(gl => {
      const guarantor = guarantors.find(g => g.id === gl.guarantor_id)
      const originalLoan = loans.find(l => l.id === gl.original_loan_id)
      const borrower = originalLoan ? borrowers.find(b => b.id === originalLoan.borrower_id) : null
      return {
        ...gl,
        guarantor_name: guarantor ? `${guarantor.first_name} ${guarantor.last_name}` : '',
        borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : '',
        remaining: gl.amount - (gl.total_repaid || 0)
      }
    })
  }
}

// Guarantor Loan Repayments Service
export const guarantorLoanRepaymentsService = {
  async getAll(): Promise<GuarantorLoanRepayment[]> {
    return getAllItems<GuarantorLoanRepayment>('guarantorLoanRepayments').sort((a, b) => 
      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
    )
  },
  async getById(id: string): Promise<GuarantorLoanRepayment | null> {
    return getItem<GuarantorLoanRepayment>('guarantorLoanRepayments', id)
  },
  async getByGuarantorLoan(guarantorLoanId: string): Promise<GuarantorLoanRepayment[]> {
    return (await this.getAll()).filter(r => r.guarantor_loan_id === guarantorLoanId)
  },
  async getTotalRepaid(guarantorLoanId: string): Promise<number> {
    const repayments = await this.getByGuarantorLoan(guarantorLoanId)
    return repayments.reduce((sum, r) => sum + r.amount, 0)
  },
  async create(repayment: Omit<GuarantorLoanRepayment, 'id' | 'created_at'>): Promise<{ id: string; lastInsertRowid: string }> {
    const id = generateId('guarantorLoanRepayments')
    setItem('guarantorLoanRepayments', id, { 
      ...repayment, 
      id, 
      created_at: new Date().toISOString() 
    })
    
    // עדכון total_repaid בהלוואת הערב
    const guarantorLoan = await guarantorLoansService.getById(repayment.guarantor_loan_id)
    if (guarantorLoan) {
      const newTotalRepaid = await this.getTotalRepaid(repayment.guarantor_loan_id)
      await guarantorLoansService.update(repayment.guarantor_loan_id, { 
        total_repaid: newTotalRepaid,
        status: newTotalRepaid >= guarantorLoan.amount ? 'paid' : 'active'
      })
    }
    
    return { id, lastInsertRowid: id }
  },
  async update(id: string, data: Partial<GuarantorLoanRepayment>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      setItem('guarantorLoanRepayments', id, { ...existing, ...data })
      
      // עדכון total_repaid בהלוואת הערב
      const guarantorLoan = await guarantorLoansService.getById(existing.guarantor_loan_id)
      if (guarantorLoan) {
        const newTotalRepaid = await this.getTotalRepaid(existing.guarantor_loan_id)
        await guarantorLoansService.update(existing.guarantor_loan_id, { 
          total_repaid: newTotalRepaid,
          status: newTotalRepaid >= guarantorLoan.amount ? 'paid' : 'active'
        })
      }
    }
  },
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      removeItem('guarantorLoanRepayments', id)
      
      // עדכון total_repaid בהלוואת הערב
      const guarantorLoan = await guarantorLoansService.getById(existing.guarantor_loan_id)
      if (guarantorLoan) {
        const newTotalRepaid = await this.getTotalRepaid(existing.guarantor_loan_id)
        await guarantorLoansService.update(existing.guarantor_loan_id, { 
          total_repaid: newTotalRepaid,
          status: newTotalRepaid >= guarantorLoan.amount ? 'paid' : 'active'
        })
      }
    }
  },
  async deleteByGuarantorLoan(guarantorLoanId: string): Promise<void> {
    const repayments = await this.getByGuarantorLoan(guarantorLoanId)
    for (const repayment of repayments) {
      removeItem('guarantorLoanRepayments', repayment.id)
    }
  }
}

// Guarantor Refunds Service - החזרים מהלווה לערב
export interface GuarantorRefund {
  id: string  // UUID
  guarantor_loan_id: string  // UUID foreign key
  amount: number
  refund_date: string
  payment_method?: string
  payment_details?: string
  notes?: string
  created_at: string
}

export const guarantorRefundsService = {
  async getAll(): Promise<GuarantorRefund[]> {
    return getAllItems<GuarantorRefund>('guarantorRefunds').sort((a, b) => 
      new Date(b.refund_date).getTime() - new Date(a.refund_date).getTime()
    )
  },
  
  async getById(id: string): Promise<GuarantorRefund | null> {
    return getItem<GuarantorRefund>('guarantorRefunds', id)
  },
  
  async getByGuarantorLoan(guarantorLoanId: string): Promise<GuarantorRefund[]> {
    return (await this.getAll()).filter(r => r.guarantor_loan_id === guarantorLoanId)
  },
  
  async getTotalRefunded(guarantorLoanId: string): Promise<number> {
    const refunds = await this.getByGuarantorLoan(guarantorLoanId)
    return refunds.reduce((sum, r) => sum + r.amount, 0)
  },
  
  async create(refund: Omit<GuarantorRefund, 'id' | 'created_at'>): Promise<{ id: string }> {
    const id = generateId('guarantorRefunds')
    setItem('guarantorRefunds', id, { 
      ...refund, 
      id, 
      created_at: new Date().toISOString() 
    })
    
    // עדכון total_refunded בהלוואת הערב
    const guarantorLoan = await guarantorLoansService.getById(refund.guarantor_loan_id)
    if (guarantorLoan) {
      const newTotalRefunded = await this.getTotalRefunded(refund.guarantor_loan_id)
      const updates: Partial<GuarantorLoan> = { 
        total_refunded: newTotalRefunded
      }
      
      // אם הוחזר הכל, נסיר את ההערה "מגיע החזר לערב"
      if (newTotalRefunded >= guarantorLoan.total_repaid) {
        const cleanNotes = (guarantorLoan.notes || '')
          .split('\n')
          .filter(line => !line.includes('מגיע החזר לערב'))
          .join('\n')
          .trim()
        updates.notes = cleanNotes
      }
      
      await guarantorLoansService.update(refund.guarantor_loan_id, updates)
    }
    
    return { id }
  },
  
  async update(id: string, data: Partial<GuarantorRefund>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      setItem('guarantorRefunds', id, { ...existing, ...data })
      
      // עדכון total_refunded בהלוואת הערב
      const guarantorLoan = await guarantorLoansService.getById(existing.guarantor_loan_id)
      if (guarantorLoan) {
        const newTotalRefunded = await this.getTotalRefunded(existing.guarantor_loan_id)
        const updates: Partial<GuarantorLoan> = { 
          total_refunded: newTotalRefunded
        }
        
        // אם הוחזר הכל, נסיר את ההערה "מגיע החזר לערב"
        if (newTotalRefunded >= guarantorLoan.total_repaid) {
          const cleanNotes = (guarantorLoan.notes || '')
            .split('\n')
            .filter(line => !line.includes('מגיע החזר לערב'))
            .join('\n')
            .trim()
          updates.notes = cleanNotes
        }
        
        await guarantorLoansService.update(existing.guarantor_loan_id, updates)
      }
    }
  },
  
  async delete(id: string): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      removeItem('guarantorRefunds', id)
      
      // עדכון total_refunded בהלוואת הערב
      const guarantorLoan = await guarantorLoansService.getById(existing.guarantor_loan_id)
      if (guarantorLoan) {
        const newTotalRefunded = await this.getTotalRefunded(existing.guarantor_loan_id)
        const updates: Partial<GuarantorLoan> = { 
          total_refunded: newTotalRefunded
        }
        
        // אם הוחזר הכל, נסיר את ההערה "מגיע החזר לערב"
        // אם לא הוחזר הכל, נוודא שההערה קיימת
        if (newTotalRefunded >= guarantorLoan.total_repaid) {
          const cleanNotes = (guarantorLoan.notes || '')
            .split('\n')
            .filter(line => !line.includes('מגיע החזר לערב'))
            .join('\n')
            .trim()
          updates.notes = cleanNotes
        }
        
        await guarantorLoansService.update(existing.guarantor_loan_id, updates)
      }
    }
  },
  
  async deleteByGuarantorLoan(guarantorLoanId: string): Promise<void> {
    const refunds = await this.getByGuarantorLoan(guarantorLoanId)
    for (const refund of refunds) {
      removeItem('guarantorRefunds', refund.id)
    }
  }
}

// Other services
export const donorsService = { 
  async getAll(): Promise<any[]> { return getAllItems<any>('donors') }, 
  async search(t: string): Promise<any[]> { 
    const x = t.toLowerCase()
    const allDonors = await this.getAll()
    return allDonors
      .filter(d => d.first_name?.toLowerCase().includes(x) || d.last_name?.toLowerCase().includes(x) || d.phone?.includes(t))
      .slice(0, 5) 
  } 
}
export const depositorsService = { 
  async getAll(): Promise<any[]> { return getAllItems<any>('depositors') }, 
  async search(t: string): Promise<any[]> { 
    const x = t.toLowerCase()
    const allDepositors = await this.getAll()
    return allDepositors
      .filter(d => d.first_name?.toLowerCase().includes(x) || d.last_name?.toLowerCase().includes(x) || d.phone?.includes(t))
      .slice(0, 5) 
  } 
}

// Blacklist Service
export interface BlacklistItem { 
  id: string;  // UUID
  entity_type: 'borrower' | 'guarantor'; 
  entity_id: string;  // UUID foreign key
  reason: string; 
  added_at: string 
}

export const blacklistService = {
  async getAll(): Promise<BlacklistItem[]> { return getAllItems<BlacklistItem>('blacklist') },
  async isBlacklisted(entityType: 'borrower' | 'guarantor', entityId: string): Promise<BlacklistItem | null> {
    const items = await this.getAll()
    return items.find(item => item.entity_type === entityType && item.entity_id === entityId) || null
  },
  async getBlacklistedBorrowerIds(): Promise<string[]> {
    const items = await this.getAll()
    return items.filter(item => item.entity_type === 'borrower').map(item => item.entity_id)
  },
  async getBlacklistedGuarantorIds(): Promise<string[]> {
    const items = await this.getAll()
    return items.filter(item => item.entity_type === 'guarantor').map(item => item.entity_id)
  }
}

// Waitlist Service
export interface WaitlistEntry {
  id: string  // UUID
  borrower_id: string  // UUID foreign key
  requested_amount: number
  request_date: string
  loan_type: 'fixed' | 'flexible'
  requested_months?: number
  notes?: string
  priority: 'normal' | 'urgent'
  status: 'waiting' | 'processing' | 'approved' | 'rejected'
  position: number
  created_at: string
  updated_at: string
}

export const waitlistService = {
  async getAll(): Promise<WaitlistEntry[]> {
    return getAllItems<WaitlistEntry>('waitlist').sort((a, b) => a.position - b.position)
  },
  
  async getById(id: string): Promise<WaitlistEntry | null> {
    return getItem<WaitlistEntry>('waitlist', id)
  },
  
  async getByBorrower(borrowerId: string): Promise<WaitlistEntry[]> {
    return (await this.getAll()).filter(w => w.borrower_id === borrowerId)
  },
  
  async getWaiting(): Promise<WaitlistEntry[]> {
    return (await this.getAll()).filter(w => w.status === 'waiting')
  },
  
  async create(entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'updated_at' | 'position'>): Promise<{ id: string }> {
    const id = generateId('waitlist')
    const allEntries = await this.getAll()
    const maxPosition = allEntries.reduce((max, e) => Math.max(max, e.position), 0)
    const position = entry.priority === 'urgent' ? 1 : maxPosition + 1
    
    // If urgent, shift all other positions down
    if (entry.priority === 'urgent') {
      for (const e of allEntries) {
        setItem('waitlist', String(e.id), { ...e, position: e.position + 1, updated_at: new Date().toISOString() })
      }
    }
    
    const now = new Date().toISOString()
    setItem('waitlist', String(id), { 
      ...entry, 
      id, 
      position,
      created_at: now,
      updated_at: now
    })
    return { id }
  },
  
  async update(id: string, data: Partial<WaitlistEntry>): Promise<void> {
    const existing = await this.getById(id)
    if (!existing) return
    
    // If priority changed to urgent, move to top
    if (data.priority === 'urgent' && existing.priority !== 'urgent') {
      await this.moveToPosition(id, 1)
      // After moving, get the updated entry with new position
      const updated = await this.getById(id)
      if (updated) {
        setItem('waitlist', String(id), { 
          ...updated, 
          ...data,
          updated_at: new Date().toISOString()
        })
      }
    } else {
      setItem('waitlist', String(id), { 
        ...existing, 
        ...data,
        updated_at: new Date().toISOString()
      })
    }
  },
  
  async delete(id: string): Promise<void> {
    const entry = await this.getById(id)
    if (!entry) return
    
    removeItem('waitlist', id)
    
    // Reorder positions
    const allEntries = await this.getAll()
    for (const e of allEntries) {
      if (e.position > entry.position) {
        setItem('waitlist', e.id, { ...e, position: e.position - 1, updated_at: new Date().toISOString() })
      }
    }
  },
  
  async moveUp(id: number): Promise<void> {
    const entry = await this.getById(id)
    if (!entry || entry.position === 1) return
    
    const allEntries = await this.getAll()
    const above = allEntries.find(e => e.position === entry.position - 1)
    
    if (above) {
      setItem('waitlist', String(above.id), { ...above, position: entry.position, updated_at: new Date().toISOString() })
      setItem('waitlist', String(entry.id), { ...entry, position: entry.position - 1, updated_at: new Date().toISOString() })
    }
  },
  
  async moveDown(id: number): Promise<void> {
    const entry = await this.getById(id)
    if (!entry) return
    
    const allEntries = await this.getAll()
    const maxPosition = allEntries.reduce((max, e) => Math.max(max, e.position), 0)
    if (entry.position === maxPosition) return
    
    const below = allEntries.find(e => e.position === entry.position + 1)
    
    if (below) {
      setItem('waitlist', String(below.id), { ...below, position: entry.position, updated_at: new Date().toISOString() })
      setItem('waitlist', String(entry.id), { ...entry, position: entry.position + 1, updated_at: new Date().toISOString() })
    }
  },
  
  async moveToPosition(id: number, newPosition: number): Promise<void> {
    const entry = await this.getById(id)
    if (!entry) return
    
    const allEntries = await this.getAll()
    const oldPosition = entry.position
    
    if (oldPosition === newPosition) return
    
    // Update positions
    for (const e of allEntries) {
      if (e.id === id) continue
      
      if (oldPosition < newPosition) {
        // Moving down
        if (e.position > oldPosition && e.position <= newPosition) {
          setItem('waitlist', String(e.id), { ...e, position: e.position - 1, updated_at: new Date().toISOString() })
        }
      } else {
        // Moving up
        if (e.position >= newPosition && e.position < oldPosition) {
          setItem('waitlist', String(e.id), { ...e, position: e.position + 1, updated_at: new Date().toISOString() })
        }
      }
    }
    
    setItem('waitlist', String(id), { ...entry, position: newPosition, updated_at: new Date().toISOString() })
  },
  
  async getStats(): Promise<{ total: number; waiting: number; totalRequested: number; urgent: number }> {
    const all = await this.getAll()
    const waiting = all.filter(w => w.status === 'waiting')
    return {
      total: all.length,
      waiting: waiting.length,
      totalRequested: waiting.reduce((sum, w) => sum + w.requested_amount, 0),
      urgent: waiting.filter(w => w.priority === 'urgent').length
    }
  },
  
  async getNextInLine(): Promise<WaitlistEntry | null> {
    const waiting = await this.getWaiting()
    return waiting.length > 0 ? waiting[0] : null
  },
  
  async approveEntry(id: string, loanId: string): Promise<void> {
    const entry = await this.getById(id)
    if (!entry) return
    
    await this.update(id, { 
      status: 'approved',
      notes: (entry.notes || '') + `\n[${new Date().toISOString().split('T')[0]}] אושר - הלוואה #${loanId}`
    })
  }
}

// Deposit Withdrawals Service - משיכות הפקדות
export interface DepositWithdrawal {
  id: number
  deposit_id: number
  amount: number
  withdrawal_date: string
  payment_method?: string
  payment_details?: string
  notes?: string
  created_at: string
}

export const depositWithdrawalsService = {
  async getAll(): Promise<DepositWithdrawal[]> {
    return getAllItems<DepositWithdrawal>('depositWithdrawals').sort((a, b) => 
      new Date(b.withdrawal_date).getTime() - new Date(a.withdrawal_date).getTime()
    )
  },
  
  async getById(id: number): Promise<DepositWithdrawal | null> {
    return getItem<DepositWithdrawal>('depositWithdrawals', String(id))
  },
  
  async getByDeposit(depositId: number | string): Promise<DepositWithdrawal[]> {
    return (await this.getAll()).filter(w => w.deposit_id === depositId)
  },
  
  async create(withdrawal: Omit<DepositWithdrawal, 'id' | 'created_at'>): Promise<{ id: string }> {
    const id = generateId('depositWithdrawals')
    setItem('depositWithdrawals', id, {
      ...withdrawal,
      id,
      created_at: new Date().toISOString()
    })
    return { id }
  },
  
  async delete(id: string): Promise<void> {
    removeItem('depositWithdrawals', id)
  },
  
  async getTotalWithdrawn(depositId: string | number): Promise<number> {
    const withdrawals = await this.getByDeposit(depositId)
    return withdrawals.reduce((sum, w) => sum + w.amount, 0)
  }
}

// Contacts Service - אנשי קשר מאוחדים
export interface Contact {
  phone: string // מפתח ראשי
  first_name: string
  last_name: string
  id_number?: string
  city?: string
  address?: string
  email?: string
  notes?: string
  tags: string // JSON array
  borrower_id?: number
  guarantor_id?: number
  donor_id?: number
  depositor_id?: number
  created_at: string
  updated_at: string
}

export const contactsService = {
  async getAll(): Promise<Contact[]> {
    return getAllItems<Contact>('contacts').sort((a, b) => 
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    )
  },
  
  async getByPhone(phone: string): Promise<Contact | null> {
    return getItem<Contact>('contacts', phone)
  },
  
  async search(term: string): Promise<Contact[]> {
    const t = term.toLowerCase()
    return (await this.getAll()).filter(c => 
      c.first_name?.toLowerCase().includes(t) || 
      c.last_name?.toLowerCase().includes(t) || 
      c.phone?.includes(term) ||
      c.id_number?.includes(term) ||
      c.city?.toLowerCase().includes(t)
    ).slice(0, 50) // הגבלה ל-50 תוצאות לביצועים
  },
  
  async create(contact: Omit<Contact, 'created_at' | 'updated_at'>): Promise<{ phone: string }> {
    const now = new Date().toISOString()
    setItem('contacts', contact.phone, { 
      ...contact, 
      created_at: now,
      updated_at: now
    })
    return { phone: contact.phone }
  },
  
  async update(phone: string, data: Partial<Contact>): Promise<void> {
    const existing = await this.getByPhone(phone)
    if (existing) {
      setItem('contacts', phone, { 
        ...existing, 
        ...data,
        updated_at: new Date().toISOString()
      })
    }
  },
  
  async delete(phone: string): Promise<void> {
    removeItem('contacts', phone)
  },
  
  async findByIdNumber(idNumber: string): Promise<Contact | null> {
    const contacts = await this.getAll()
    return contacts.find(c => c.id_number === idNumber) || null
  },
  
  async addTag(phone: string, tag: string): Promise<void> {
    const contact = await this.getByPhone(phone)
    if (contact) {
      const tags = JSON.parse(contact.tags || '[]')
      if (!tags.includes(tag)) {
        tags.push(tag)
        await this.update(phone, { tags: JSON.stringify(tags) })
      }
    }
  },
  
  async removeTag(phone: string, tag: string): Promise<void> {
    const contact = await this.getByPhone(phone)
    if (contact) {
      const tags = JSON.parse(contact.tags || '[]')
      const filtered = tags.filter((t: string) => t !== tag)
      await this.update(phone, { tags: JSON.stringify(filtered) })
    }
  },
  
  async filterByRoles(roles: Array<'borrower' | 'guarantor' | 'donor' | 'depositor'>): Promise<Contact[]> {
    const contacts = await this.getAll()
    return contacts.filter(c => {
      return roles.some(role => {
        switch (role) {
          case 'borrower': return c.borrower_id !== undefined && c.borrower_id !== null
          case 'guarantor': return c.guarantor_id !== undefined && c.guarantor_id !== null
          case 'donor': return c.donor_id !== undefined && c.donor_id !== null
          case 'depositor': return c.depositor_id !== undefined && c.depositor_id !== null
          default: return false
        }
      })
    })
  }
}

// Export/Import
export async function exportAllData(): Promise<DataStore> { return JSON.parse(JSON.stringify(data)) }
export async function importAllData(newData: Partial<DataStore>): Promise<void> { data = { ...JSON.parse(JSON.stringify(defaultData)), ...newData }; saveData() }
export const stores = { settings: { getItem: (k: string) => data.settings[k] || null, setItem: (k: string, v: any) => { data.settings[k] = v; saveData() } } }
