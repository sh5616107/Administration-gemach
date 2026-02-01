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

import { saveAppData, loadAppData } from './persistence'

// Save data (async; persistence handles environment detection)
function saveData(): void {
  saveAppData(data).then(() => { console.log('💾 Data saved') }).catch(e => console.error('❌ Error saving:', e))
}

// Load data (async)
function loadData(): void {
  if (isInitialized) return
  loadAppData().then((stored) => {
    if (stored) {
      data = { ...JSON.parse(JSON.stringify(defaultData)), ...stored }
      console.log('✅ Data loaded, borrowers:', Object.keys((data).borrowers).length)
    } else {
      console.log('ℹ️ No existing data, using defaults')
    }
    isInitialized = true
  }).catch(e => {
    console.error('❌ Error loading:', e)
    isInitialized = true
  })
}

// Initialize on module load
loadData()

// Reset function for tests
export function resetDatabase(): void {
  data = JSON.parse(JSON.stringify(defaultData))
  isInitialized = false
  localStorage.clear()
}

// Helper functions
function getAllItems<T>(storeName: keyof DataStore): T[] {
  return Object.values(data[storeName] as Record<string, T>)
}

function generateId(storeName: keyof DataStore): number {
  // שומרים counter נפרד לכל store כדי שלא יהיה שימוש חוזר ב-ID
  const counterKey = `_counter_${storeName}`
  const currentCounter = parseInt(data.settings[counterKey] || '0', 10)
  const items = getAllItems<{ id: number }>(storeName)
  const maxExistingId = items.reduce((max, item) => Math.max(max, item.id || 0), 0)
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
    if (sql.includes('FROM contacts')) {
      const items = getAllItems<any>('contacts')
      if (params && params.length > 0 && sql.includes('WHERE phone')) {
        return items.filter(c => c.phone === params[0])
      }
      return items
    }
    if (sql.includes('FROM donors')) {
      const items = getAllItems<any>('donors')
      if (params && params.length >= 3) {
        const term = String(params[0]).replace(/%/g, '').toLowerCase()
        return items.filter(d => d.first_name?.toLowerCase().includes(term) || d.last_name?.toLowerCase().includes(term) || d.phone?.includes(term)).slice(0, 5)
      }
      return items
    }
    if (sql.includes('FROM depositors')) {
      const items = getAllItems<any>('depositors')
      if (params && params.length >= 3) {
        const term = String(params[0]).replace(/%/g, '').toLowerCase()
        return items.filter(d => d.first_name?.toLowerCase().includes(term) || d.last_name?.toLowerCase().includes(term) || d.phone?.includes(term)).slice(0, 5)
      }
      return items
    }
    if (sql.includes('FROM deposits')) {
      const deposits = getAllItems<any>('deposits')
      const depositors = getAllItems<any>('depositors')
      
      let filtered = deposits
      
      // פילטר לפי depositor_id
      if (params && params.length > 0 && sql.includes('WHERE depositor_id')) {
        filtered = filtered.filter(d => d.depositor_id === params[0])
        return filtered.sort((a: any, b: any) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime())
      }
      
      // פילטר לפי is_recurring
      if (sql.includes('is_recurring = 1')) {
        filtered = filtered.filter(d => d.is_recurring === 1)
      }
      
      // פילטר לפי status
      if (sql.includes('status = ?') && params && params.length > 0) {
        const statusParam = params[params.length - 1] // הפרמטר האחרון הוא בדרך כלל ה-status
        filtered = filtered.filter(d => d.status === statusParam)
      }
      
      return filtered.map(d => ({ ...d, depositor_name: depositors.find(dep => dep.id === d.depositor_id)?.first_name + ' ' + depositors.find(dep => dep.id === d.depositor_id)?.last_name || '' }))
    }
    if (sql.includes('FROM donations')) {
      const donations = getAllItems<any>('donations')
      const donors = getAllItems<any>('donors')
      return donations.map(d => ({ ...d, donor_name: donors.find(don => don.id === d.donor_id)?.first_name + ' ' + donors.find(don => don.id === d.donor_id)?.last_name || '' }))
    }
    if (sql.includes('FROM blacklist')) return getAllItems<any>('blacklist')
    if (sql.includes('FROM repayments')) return getAllItems<any>('repayments')
    if (sql.includes('settings')) return Object.entries(data.settings).map(([key, value]) => ({ key, value }))
    return []
  },

  async run(sql: string, params?: unknown[]): Promise<{ lastInsertRowid: number; changes: number }> {
    if (sql.includes('DELETE FROM repayments') && !sql.includes('WHERE')) { clearStore('repayments'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM loans') && !sql.includes('WHERE')) { clearStore('loans'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM borrowers') && !sql.includes('WHERE')) { clearStore('borrowers'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM guarantors') && !sql.includes('WHERE')) { clearStore('guarantors'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM donations') && !sql.includes('WHERE')) { clearStore('donations'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM donors') && !sql.includes('WHERE')) { clearStore('donors'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM deposits') && !sql.includes('WHERE')) { clearStore('deposits'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM depositors') && !sql.includes('WHERE')) { clearStore('depositors'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM depositors WHERE id') && params) { removeItem('depositors', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM contacts') && !sql.includes('WHERE')) { clearStore('contacts'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM contacts WHERE phone') && params) { removeItem('contacts', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('UPDATE depositors SET') && params) {
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
    if (sql.includes('DELETE FROM blacklist') && !sql.includes('WHERE')) { clearStore('blacklist'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM waitlist') && !sql.includes('WHERE')) { clearStore('waitlist'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM expenses') && !sql.includes('WHERE')) { clearStore('expenses'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM guarantorLoans') && !sql.includes('WHERE')) { clearStore('guarantorLoans'); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM depositWithdrawals') && !sql.includes('WHERE')) { clearStore('depositWithdrawals'); return { lastInsertRowid: 0, changes: 1 } }

    if (sql.includes('INSERT INTO blacklist') && params) { const id = generateId('blacklist'); setItem('blacklist', String(id), { id, entity_type: params[0], entity_id: params[1], reason: params[2], added_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (sql.includes('INSERT INTO contacts') && params) { 
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
    if (sql.includes('UPDATE contacts SET') && params) {
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
    if (sql.includes('INSERT INTO donors') && params) { const id = generateId('donors'); setItem('donors', String(id), { id, first_name: params[0], last_name: params[1], phone: params[2], id_number: params[3], address: params[4], email: params[5], notes: params[6], created_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (sql.includes('INSERT INTO donations') && params) { const id = generateId('donations'); setItem('donations', String(id), { id, donor_id: params[0], amount: params[1], donation_date: params[2], notes: params[3], payment_method: params[4] || '', payment_details: params[5] || '', created_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (sql.includes('INSERT INTO depositors') && params) { const id = generateId('depositors'); setItem('depositors', String(id), { id, first_name: params[0], last_name: params[1], phone: params[2], id_number: params[3], address: params[4], email: params[5], notes: params[6], created_at: new Date().toISOString() }); return { lastInsertRowid: id, changes: 1 } }
    if (sql.includes('INSERT INTO deposits') && params) { 
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
        created_at: new Date().toISOString() 
      }); 
      return { lastInsertRowid: id, changes: 1 } 
    }

    if (sql.includes('UPDATE deposits SET status') && params) { 
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
    if (sql.includes('UPDATE deposits SET amount') && params) {
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
    if (sql.includes('DELETE FROM deposits WHERE id') && params) { removeItem('deposits', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM donations WHERE id') && params) { removeItem('donations', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    if (sql.includes('DELETE FROM blacklist WHERE id') && params) { removeItem('blacklist', String(params[0])); return { lastInsertRowid: 0, changes: 1 } }
    return { lastInsertRowid: 1, changes: 1 }
  },

  async get(sql: string, params?: unknown[]): Promise<unknown> {
    if (sql.includes('SELECT id FROM depositors') && params) return getAllItems<any>('depositors').find(d => d.first_name === params[0] && d.last_name === params[1] && d.phone === params[2]) || null
    if (sql.includes('SELECT id FROM donors') && params) return getAllItems<any>('donors').find(d => d.first_name === params[0] && d.last_name === params[1] && d.phone === params[2]) || null
    return null
  },
}

// Borrowers Service
export interface Borrower { id: number; first_name: string; last_name: string; id_number?: string; city?: string; phone: string; phone2?: string; address?: string; email?: string; notes?: string; created_at: string }

export const borrowersService = {
  async getAll(): Promise<Borrower[]> { return getAllItems<Borrower>('borrowers').sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)) },
  async getById(id: number): Promise<Borrower | null> { return getItem<Borrower>('borrowers', String(id)) },
  async search(term: string): Promise<Borrower[]> { const t = term.toLowerCase(); return (await this.getAll()).filter(b => b.first_name?.toLowerCase().includes(t) || b.last_name?.toLowerCase().includes(t) || b.phone?.includes(term) || b.id_number?.includes(term) || b.city?.toLowerCase().includes(t)) },
  async create(b: Omit<Borrower, 'id' | 'created_at'>): Promise<{ lastInsertRowid: number }> { const id = generateId('borrowers'); setItem('borrowers', String(id), { ...b, id, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: number, d: Partial<Borrower>): Promise<void> { const e = await this.getById(id); if (e) setItem('borrowers', String(id), { ...e, ...d }) },
  async delete(id: number): Promise<void> { 
    // מחיקה מהרשימה השחורה אם קיים
    const blacklistItems = getAllItems<{ id: number; entity_type: string; entity_id: number }>('blacklist')
    const blacklistEntry = blacklistItems.find(b => b.entity_type === 'borrower' && b.entity_id === id)
    if (blacklistEntry) removeItem('blacklist', String(blacklistEntry.id))
    removeItem('borrowers', String(id)) 
  },
}

// Guarantors Service
export interface Guarantor { id: number; first_name: string; last_name: string; phone: string; id_number?: string; address?: string; email?: string; notes?: string; is_blacklisted: number; created_at: string }

export const guarantorsService = {
  async getAll(): Promise<Guarantor[]> { return getAllItems<Guarantor>('guarantors').sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)) },
  async getById(id: number): Promise<Guarantor | null> { return getItem<Guarantor>('guarantors', String(id)) },
  async search(term: string): Promise<Guarantor[]> { const t = term.toLowerCase(); return (await this.getAll()).filter(g => g.first_name?.toLowerCase().includes(t) || g.last_name?.toLowerCase().includes(t) || g.phone?.includes(term) || g.id_number?.includes(term)) },
  async create(g: Omit<Guarantor, 'id' | 'created_at' | 'is_blacklisted'>): Promise<{ lastInsertRowid: number }> { const id = generateId('guarantors'); setItem('guarantors', String(id), { ...g, id, is_blacklisted: 0, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: number, d: Partial<Guarantor>): Promise<void> { const e = await this.getById(id); if (e) setItem('guarantors', String(id), { ...e, ...d }) },
  async delete(id: number): Promise<void> { 
    // מחיקה מהרשימה השחורה אם קיים
    const blacklistItems = getAllItems<{ id: number; entity_type: string; entity_id: number }>('blacklist')
    const blacklistEntry = blacklistItems.find(b => b.entity_type === 'guarantor' && b.entity_id === id)
    if (blacklistEntry) removeItem('blacklist', String(blacklistEntry.id))
    removeItem('guarantors', String(id)) 
  },
  async getTotalGuarantees(id: number): Promise<number> { return (await loansService.getAll()).filter(l => (l.guarantor1_id === id || l.guarantor2_id === id) && l.status === 'active').reduce((s, l) => s + l.amount - (l.total_repaid || 0), 0) },
}


// Loans Service
export interface Loan { id: number; borrower_id: number; amount: number; loan_date: string; loan_date_hebrew?: string; loan_type: string; due_date?: string; due_date_hebrew?: string; is_recurring: number; recurring_months?: number; recurring_day?: number; recurring_loan_number?: number; recurring_loan_count?: number; auto_repayment: number; repayment_amount?: number; repayment_day?: number; repayment_frequency?: string; repayment_start_date?: string; guarantor1_id?: number; guarantor2_id?: number; notes?: string; status: string; created_at: string; total_repaid?: number; remaining?: number; borrower_name?: string; payment_method?: string; payment_details?: string }

export const loansService = {
  async getAll(): Promise<Loan[]> {
    const loans = getAllItems<Loan>('loans')
    const borrowers = await borrowersService.getAll()
    for (const loan of loans) {
      const repayments = await repaymentsService.getByLoan(loan.id)
      loan.total_repaid = repayments.reduce((s, r) => s + r.amount, 0)
      loan.remaining = loan.amount - loan.total_repaid
      const b = borrowers.find(x => x.id === loan.borrower_id)
      loan.borrower_name = b ? `${b.first_name} ${b.last_name}` : ''
    }
    return loans.sort((a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime())
  },
  async getByBorrower(id: number): Promise<Loan[]> { return (await this.getAll()).filter(l => l.borrower_id === id) },
  async getById(id: number): Promise<Loan | null> { const l = getItem<Loan>('loans', String(id)); if (l) { const r = await repaymentsService.getByLoan(id); l.total_repaid = r.reduce((s, x) => s + x.amount, 0); l.remaining = l.amount - l.total_repaid } return l },
  async create(l: Omit<Loan, 'id' | 'created_at' | 'status'>): Promise<{ lastInsertRowid: number }> { const id = generateId('loans'); const status = new Date(l.loan_date) > new Date() ? 'planned' : 'active'; setItem('loans', String(id), { ...l, id, status, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: number, d: Partial<Loan>): Promise<void> { const e = await this.getById(id); if (e) setItem('loans', String(id), { ...e, ...d }) },
  async delete(id: number): Promise<void> { const r = await repaymentsService.getByLoan(id); for (const x of r) await repaymentsService.delete(x.id); removeItem('loans', String(id)) },
  async getOverdue(): Promise<Loan[]> { const t = new Date().toISOString().split('T')[0]; return (await this.getAll()).filter(l => l.due_date && l.due_date < t && (l.status === 'active' || l.status === 'overdue') && (l.remaining || 0) > 0 && l.auto_repayment !== 1) },
}

// Repayments Service
export interface Repayment { id: number; loan_id: number; amount: number; payment_date: string; payment_date_hebrew?: string; notes?: string; created_at: string; payment_method?: string; payment_details?: string; is_recurring?: number; recurring_repayment_number?: number; recurring_repayment_count?: number }

export const repaymentsService = {
  async getByLoan(loanId: number): Promise<Repayment[]> { return getAllItems<Repayment>('repayments').filter(r => r.loan_id === loanId).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()) },
  async create(r: Omit<Repayment, 'id' | 'created_at'>): Promise<{ lastInsertRowid: number }> { const id = generateId('repayments'); setItem('repayments', String(id), { ...r, id, created_at: new Date().toISOString() }); return { lastInsertRowid: id } },
  async update(id: number, data: Partial<Repayment>): Promise<void> { const existing = getItem<Repayment>('repayments', String(id)); if (existing) setItem('repayments', String(id), { ...existing, ...data }) },
  async delete(id: number): Promise<void> { removeItem('repayments', String(id)) },
}

// Stats Service
export const statsService = {
  async getDashboardStats() {
    const loans = await loansService.getAll()
    const t = new Date().toISOString().split('T')[0]
    const active = loans.filter(l => l.status === 'active' && l.loan_date <= t)
    // הלוואות מתוכננות - לא כולל הלוואות מחזוריות שנוצרות אוטומטית
    const planned = loans.filter(l => 
      (l.status === 'planned' || l.loan_date > t) && 
      !(l.is_recurring && l.recurring_loan_number && l.recurring_loan_number > 1)
    )
    const deps = getAllItems<{ amount: number; status: string }>('deposits').filter(d => d.status === 'active')
    const dons = getAllItems<{ amount: number }>('donations')
    const expenses = getAllItems<{ amount: number; paid_by: string }>('expenses')
    const gemachExpenses = expenses.filter(e => e.paid_by === 'gemach').reduce((s, e) => s + e.amount, 0)
    return {
      activeLoans: { count: active.length, total: active.reduce((s, l) => s + (l.remaining || 0), 0) },
      plannedLoans: { count: planned.length, total: planned.reduce((s, l) => s + l.amount, 0) },
      deposits: { count: deps.length, total: deps.reduce((s, d) => s + d.amount, 0) },
      donations: { count: dons.length, total: dons.reduce((s, d) => s + d.amount, 0) },
      gemachExpenses,
    }
  },
  async getActiveBorrowers() {
    const loans = await loansService.getAll()
    const borrowers = await borrowersService.getAll()
    const today = new Date().toISOString().split('T')[0]
    const stats = new Map<number, { loan_count: number; total_debt: number }>()
    for (const l of loans) { if (l.status === 'active' && l.loan_date <= today && (l.remaining || 0) > 0) { const s = stats.get(l.borrower_id) || { loan_count: 0, total_debt: 0 }; s.loan_count++; s.total_debt += l.remaining || 0; stats.set(l.borrower_id, s) } }
    return borrowers.filter(b => stats.has(b.id)).map(b => ({ ...b, ...stats.get(b.id) })).sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0))
  },
  async getPaymentMethodStats() {
    const loans = getAllItems<any>('loans')
    const repayments = getAllItems<any>('repayments')
    const donations = getAllItems<any>('donations')
    const deposits = getAllItems<any>('deposits')
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
      const method = d.payment_method || 'unknown'
      if (d.status === 'active') {
        if (stats[method]) stats[method].depositsIn += d.amount || 0
        else stats['unknown'].depositsIn += d.amount || 0
      } else if (d.status === 'withdrawn') {
        const wMethod = d.withdrawal_payment_method || 'unknown'
        if (stats[wMethod]) stats[wMethod].withdrawalsOut += d.amount || 0
        else stats['unknown'].withdrawalsOut += d.amount || 0
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
  async getExpensesByBorrower(borrowerId: number) {
    const expenses = getAllItems<any>('expenses')
    return expenses.filter(e => e.paid_by === 'borrower' && e.borrower_id === borrowerId)
      .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime())
  },
  async addExpense(expense: { description: string; amount: number; expense_date: string; category: string; paid_by: string; borrower_id?: number; payment_method?: string; payment_details?: string; notes?: string }) {
    const id = generateId('expenses')
    setItem('expenses', String(id), { ...expense, id, created_at: new Date().toISOString() })
    return { id }
  },
  async updateExpense(id: number, expense: { description: string; amount: number; expense_date: string; category: string; paid_by: string; borrower_id?: number; payment_method?: string; payment_details?: string; notes?: string }) {
    const existing = getItem<any>('expenses', String(id))
    if (existing) {
      setItem('expenses', String(id), { ...existing, ...expense })
    }
  },
  async deleteExpense(id: number) {
    removeItem('expenses', String(id))
  },
  async getTotalGemachExpenses() {
    const expenses = getAllItems<any>('expenses')
    return expenses.filter(e => e.paid_by === 'gemach').reduce((sum, e) => sum + (e.amount || 0), 0)
  },
}

// Guarantor Loans Service - הלוואות שהועברו לערבים
export interface GuarantorLoan {
  id: number
  guarantor_id: number
  original_loan_id: number
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
  id: number
  guarantor_loan_id: number
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
  async getById(id: number): Promise<GuarantorLoan | null> {
    return getItem<GuarantorLoan>('guarantorLoans', String(id))
  },
  async getByOriginalLoan(loanId: number): Promise<GuarantorLoan[]> {
    return (await this.getAll()).filter(gl => gl.original_loan_id === loanId)
  },
  async getByGuarantor(guarantorId: number): Promise<GuarantorLoan[]> {
    return (await this.getAll()).filter(gl => gl.guarantor_id === guarantorId)
  },
  async create(gl: Omit<GuarantorLoan, 'id' | 'created_at' | 'total_repaid' | 'total_refunded'>): Promise<{ id: number }> {
    const id = generateId('guarantorLoans')
    setItem('guarantorLoans', String(id), { ...gl, id, total_repaid: 0, total_refunded: 0, created_at: new Date().toISOString() })
    return { id }
  },
  async update(id: number, data: Partial<GuarantorLoan>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) setItem('guarantorLoans', String(id), { ...existing, ...data })
  },
  async delete(id: number): Promise<void> {
    removeItem('guarantorLoans', String(id))
  },
  async addRepayment(guarantorLoanId: number, amount: number, paymentDate: string, paymentMethod?: string, paymentDetails?: string, notes?: string): Promise<void> {
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
  async deleteByOriginalLoan(loanId: number): Promise<void> {
    const loans = await this.getByOriginalLoan(loanId)
    for (const loan of loans) {
      removeItem('guarantorLoans', String(loan.id))
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
  async getById(id: number): Promise<GuarantorLoanRepayment | null> {
    return getItem<GuarantorLoanRepayment>('guarantorLoanRepayments', String(id))
  },
  async getByGuarantorLoan(guarantorLoanId: number): Promise<GuarantorLoanRepayment[]> {
    return (await this.getAll()).filter(r => r.guarantor_loan_id === guarantorLoanId)
  },
  async getTotalRepaid(guarantorLoanId: number): Promise<number> {
    const repayments = await this.getByGuarantorLoan(guarantorLoanId)
    return repayments.reduce((sum, r) => sum + r.amount, 0)
  },
  async create(repayment: Omit<GuarantorLoanRepayment, 'id' | 'created_at'>): Promise<{ id: number; lastInsertRowid: number }> {
    const id = generateId('guarantorLoanRepayments')
    setItem('guarantorLoanRepayments', String(id), { 
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
  async update(id: number, data: Partial<GuarantorLoanRepayment>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      setItem('guarantorLoanRepayments', String(id), { ...existing, ...data })
      
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
  async delete(id: number): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      removeItem('guarantorLoanRepayments', String(id))
      
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
  async deleteByGuarantorLoan(guarantorLoanId: number): Promise<void> {
    const repayments = await this.getByGuarantorLoan(guarantorLoanId)
    for (const repayment of repayments) {
      removeItem('guarantorLoanRepayments', String(repayment.id))
    }
  }
}

// Guarantor Refunds Service - החזרים מהלווה לערב
export interface GuarantorRefund {
  id: number
  guarantor_loan_id: number
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
  
  async getById(id: number): Promise<GuarantorRefund | null> {
    return getItem<GuarantorRefund>('guarantorRefunds', String(id))
  },
  
  async getByGuarantorLoan(guarantorLoanId: number): Promise<GuarantorRefund[]> {
    return (await this.getAll()).filter(r => r.guarantor_loan_id === guarantorLoanId)
  },
  
  async getTotalRefunded(guarantorLoanId: number): Promise<number> {
    const refunds = await this.getByGuarantorLoan(guarantorLoanId)
    return refunds.reduce((sum, r) => sum + r.amount, 0)
  },
  
  async create(refund: Omit<GuarantorRefund, 'id' | 'created_at'>): Promise<{ id: number }> {
    const id = generateId('guarantorRefunds')
    setItem('guarantorRefunds', String(id), { 
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
  
  async update(id: number, data: Partial<GuarantorRefund>): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      setItem('guarantorRefunds', String(id), { ...existing, ...data })
      
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
  
  async delete(id: number): Promise<void> {
    const existing = await this.getById(id)
    if (existing) {
      removeItem('guarantorRefunds', String(id))
      
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
  
  async deleteByGuarantorLoan(guarantorLoanId: number): Promise<void> {
    const refunds = await this.getByGuarantorLoan(guarantorLoanId)
    for (const refund of refunds) {
      removeItem('guarantorRefunds', String(refund.id))
    }
  }
}

// Other services
export const donorsService = { 
  async getAll(): Promise<any[]> { return getAllItems<any>('donors') }, 
  async search(t: string): Promise<any[]> { 
    const x = t.toLowerCase()
    const allDonors = await this.getAll()
    const donations = getAllItems<any>('donations')
    // סינון רק תורמים שיש להם תרומות
    const donorIdsWithDonations = new Set(donations.map(d => d.donor_id))
    return allDonors
      .filter(d => donorIdsWithDonations.has(d.id))
      .filter(d => d.first_name?.toLowerCase().includes(x) || d.last_name?.toLowerCase().includes(x) || d.phone?.includes(t))
      .slice(0, 5) 
  } 
}
export const depositorsService = { 
  async getAll(): Promise<any[]> { return getAllItems<any>('depositors') }, 
  async search(t: string): Promise<any[]> { 
    const x = t.toLowerCase()
    const allDepositors = await this.getAll()
    const deposits = getAllItems<any>('deposits')
    // סינון רק מפקידים שיש להם הפקדות
    const depositorIdsWithDeposits = new Set(deposits.map(d => d.depositor_id))
    return allDepositors
      .filter(d => depositorIdsWithDeposits.has(d.id))
      .filter(d => d.first_name?.toLowerCase().includes(x) || d.last_name?.toLowerCase().includes(x) || d.phone?.includes(t))
      .slice(0, 5) 
  } 
}

// Blacklist Service
export interface BlacklistItem { id: number; entity_type: 'borrower' | 'guarantor'; entity_id: number; reason: string; added_at: string }
export const blacklistService = {
  async getAll(): Promise<BlacklistItem[]> { return getAllItems<BlacklistItem>('blacklist') },
  async isBlacklisted(entityType: 'borrower' | 'guarantor', entityId: number): Promise<BlacklistItem | null> {
    const items = await this.getAll()
    return items.find(item => item.entity_type === entityType && item.entity_id === entityId) || null
  },
  async getBlacklistedBorrowerIds(): Promise<number[]> {
    const items = await this.getAll()
    return items.filter(item => item.entity_type === 'borrower').map(item => item.entity_id)
  },
  async getBlacklistedGuarantorIds(): Promise<number[]> {
    const items = await this.getAll()
    return items.filter(item => item.entity_type === 'guarantor').map(item => item.entity_id)
  }
}

// Waitlist Service
export interface WaitlistEntry {
  id: number
  borrower_id: number
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
  
  async getById(id: number): Promise<WaitlistEntry | null> {
    return getItem<WaitlistEntry>('waitlist', String(id))
  },
  
  async getByBorrower(borrowerId: number): Promise<WaitlistEntry[]> {
    return (await this.getAll()).filter(w => w.borrower_id === borrowerId)
  },
  
  async getWaiting(): Promise<WaitlistEntry[]> {
    return (await this.getAll()).filter(w => w.status === 'waiting')
  },
  
  async create(entry: Omit<WaitlistEntry, 'id' | 'created_at' | 'updated_at' | 'position'>): Promise<{ id: number }> {
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
  
  async update(id: number, data: Partial<WaitlistEntry>): Promise<void> {
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
  
  async delete(id: number): Promise<void> {
    const entry = await this.getById(id)
    if (!entry) return
    
    removeItem('waitlist', String(id))
    
    // Reorder positions
    const allEntries = await this.getAll()
    for (const e of allEntries) {
      if (e.position > entry.position) {
        setItem('waitlist', String(e.id), { ...e, position: e.position - 1, updated_at: new Date().toISOString() })
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
  
  async approveEntry(id: number, loanId: number): Promise<void> {
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
  
  async getByDeposit(depositId: number): Promise<DepositWithdrawal[]> {
    return (await this.getAll()).filter(w => w.deposit_id === depositId)
  },
  
  async create(withdrawal: Omit<DepositWithdrawal, 'id' | 'created_at'>): Promise<{ id: number }> {
    const id = generateId('depositWithdrawals')
    setItem('depositWithdrawals', String(id), {
      ...withdrawal,
      id,
      created_at: new Date().toISOString()
    })
    return { id }
  },
  
  async delete(id: number): Promise<void> {
    removeItem('depositWithdrawals', String(id))
  },
  
  async getTotalWithdrawn(depositId: number): Promise<number> {
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
