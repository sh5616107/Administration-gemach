import type { StorageIO } from '../../services/storage/sqliteBackend'

/** דיסק בזיכרון לטסטים: מאפשר לדמות כשלי כתיבה, פגיעה בקבצים וכו'. */
export class MemoryStorageIO implements StorageIO {
  files = new Map<string, Uint8Array>()
  /** כמה כתיבות אטומיות בוצעו בפועל */
  writes = 0
  /** כל עוד > 0: כל כתיבה נכשלת ומקטינה את המונה */
  failWrites = 0
  /** משנה את הבתים שנכתבים (לדמות כתיבה פגומה) */
  corruptOnWrite: ((name: string, bytes: Uint8Array) => Uint8Array) | null = null

  async exists(name: string): Promise<boolean> {
    return this.files.has(name)
  }

  async readBytes(name: string): Promise<Uint8Array> {
    const f = this.files.get(name)
    if (!f) throw new Error(`ENOENT: ${name}`)
    return new Uint8Array(f)
  }

  async writeBytesAtomic(name: string, bytes: Uint8Array): Promise<void> {
    if (this.failWrites > 0) {
      this.failWrites--
      throw new Error('disk full')
    }
    this.writes++
    const out = this.corruptOnWrite ? this.corruptOnWrite(name, bytes) : bytes
    this.files.set(name, new Uint8Array(out))
  }

  async rename(from: string, to: string): Promise<void> {
    const f = this.files.get(from)
    if (!f) throw new Error(`ENOENT: ${from}`)
    this.files.set(to, f)
    this.files.delete(from)
  }

  async remove(name: string): Promise<void> {
    this.files.delete(name)
  }

  names(): string[] {
    return [...this.files.keys()].sort()
  }
}

/** נתוני דוגמה ברמת מורכבות דומה לנתונים אמיתיים */
export function makeSampleData(): Record<string, any> {
  const id = () => crypto.randomUUID()
  const borrowers: Record<string, any> = {}
  const loans: Record<string, any> = {}
  const repayments: Record<string, any> = {}
  for (let b = 0; b < 12; b++) {
    const bid = id()
    borrowers[bid] = { id: bid, first_name: `לווה ${b}`, last_name: 'כהן', phone: `050${1000000 + b}`, notes: 'שורה "עם" מרכאות\nושורה חדשה', is_deleted: 0 }
    for (let l = 0; l < 3; l++) {
      const lid = id()
      loans[lid] = { id: lid, borrower_id: bid, amount: 1000 * (l + 1) + 0.5, loan_date: '2026-01-15', status: 'active', tags: ['a', 'ב'], nested: { x: 1, y: null } }
      for (let r = 0; r < 2; r++) {
        const rid = id()
        repayments[rid] = { id: rid, loan_id: lid, amount: 100 + r, date: '2026-02-01' }
      }
    }
  }
  return {
    settings: { gemach_name: 'גמ"ח שלי', gemach_logo: '', risk_threshold: '50000', _counter_loans: '36' },
    borrowers,
    guarantors: {},
    loans,
    repayments,
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
    attachments: {},
    auditLog: {},
    feePayments: {},
    funds: { f1: { id: 'f1', name: 'קופה ראשית', is_default: true, is_active: true } },
  }
}
