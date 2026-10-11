# תוכנית מימוש מפורטת - תיקוני מערכת קופות

## סקירה מקדימה

לאחר חקירת הקוד, זוהו הקבצים והממשקים הבאים:

### קבצים מרכזיים:
- `src/services/database.ts` - מכיל את `loansService`, `fundsService`, `statsService`, `repaymentsService`
- `src/services/fullBackupService.ts` - טיפול בייבוא/ייצוא גיבויים
- `src/services/migrations/fundsMigration.ts` - מיגרציה למערכת קופות
- `src/components/loans/LoansTab.tsx` - טופס הלוואות וניהול
- `src/pages/Dashboard.tsx` - דף הבית עם סטטיסטיקות
- `src/__tests__/*.test.ts` - קבצי בדיקות vitest קיימים

### ממשקים קריטיים:
```typescript
// Fund
interface Fund {
  id: string
  name: string
  description?: string
  is_default: boolean
  is_active: boolean
  created_at: string
  is_deleted?: boolean
  deleted_at?: string
}

// Loan (עם fund_id)
interface Loan {
  id: string
  borrower_id: string
  fund_id?: string  // ← צריך להיות NOT NULL לאחר מיגרציה
  amount: number
  remaining?: number
  // ... שאר השדות
}
```

### פקודות build ו-test:
- Build: `npm run build` (tsc + vite build)
- Tests: `npm test` (vitest run)
- Dev: `npm run dev`

---

## סעיף 1: ייבוא/שחזור גיבוי

### 1.1 הוספת funds ל-parseBackupJson

**קובץ**: `src/services/fullBackupService.ts`

**הממשק הנוכחי**:
```typescript
// שורה ~138
const importData: Record<string, any> = {
  settings: {},
  borrowers: {},
  // ... שאר השדות
  auditLog: {},
  feePayments: {},
}
```

**הבעיה**: חסר `funds: {}` ברשימה, אז גיבוי שכולל קופות מאבד אותן בייבוא.

**בדיקת vitest לפני התיקון** (`src/__tests__/fullBackupImport.test.ts`):
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { parseBackupJson } from '../services/fullBackupService'

describe('parseBackupJson - funds support', () => {
  it('צריך לשמר funds מגיבוי', () => {
    const backup = {
      exportDate: '2026-01-01',
      version: '1.0',
      funds: {
        'fund-1': { id: 'fund-1', name: 'קופה ראשית', is_default: true, is_active: true, created_at: '2026-01-01' },
        'fund-2': { id: 'fund-2', name: 'קרן חתונות', is_default: false, is_active: true, created_at: '2026-01-02' }
      },
      borrowers: {},
      loans: {}
    }
    
    const { importData } = parseBackupJson(JSON.stringify(backup))
    
    expect(importData.funds).toBeDefined()
    expect(Object.keys(importData.funds)).toHaveLength(2)
    expect(importData.funds['fund-1'].name).toBe('קופה ראשית')
  })

  it('צריך להחזיר אובייקט ריק אם אין funds בגיבוי ישן', () => {
    const oldBackup = {
      exportDate: '2025-01-01',
      borrowers: {},
      loans: {}
      // אין funds
    }
    
    const { importData } = parseBackupJson(JSON.stringify(oldBackup))
    
    expect(importData.funds).toBeDefined()
    expect(importData.funds).toEqual({})
  })
})
```

**התיקון**:
```typescript
// שורה ~138 ב-fullBackupService.ts
const importData: Record<string, any> = {
  settings: {},
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
  attachments: {},
  auditLog: {},
  feePayments: {},
  funds: {},  // ← הוספה
}

// שורה ~168 - אחרי feePayments:
if (data.funds) importData.funds = convertToObject(data.funds)
```

**Verify**: `npm test -- fullBackupImport.test.ts`

---

### 1.2 יצירת ensureFundsIntegrity()

**קובץ חדש**: `src/services/fundsIntegrity.ts`

**המטרה**: פונקציה אידמפוטנטית שמבטיחה:
1. קיימת קופת ברירת מחדל
2. כל הלוואה/תרומה/הפקדה/הוצאה בלי fund_id או עם fund_id לא קיים → שיוך לברירת מחדל

**בדיקת vitest לפני היישום** (`src/__tests__/fundsIntegrity.test.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService, borrowersService } from '../services/database'
import { ensureFundsIntegrity } from '../services/fundsIntegrity'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('ensureFundsIntegrity', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('צריכה ליצור קופת ברירת מחדל אם אין', async () => {
    // מצב: אין שום קופות
    const fundsBefore = await fundsService.getAll()
    expect(fundsBefore).toHaveLength(0)
    
    await ensureFundsIntegrity()
    
    const fundsAfter = await fundsService.getAll()
    expect(fundsAfter).toHaveLength(1)
    expect(fundsAfter[0].is_default).toBe(true)
    expect(fundsAfter[0].name).toBe('קופה ראשית')
  })

  it('לא צריכה ליצור קופה חדשה אם כבר יש ברירת מחדל', async () => {
    // יצירת קופה
    await fundsService.create({
      name: 'קופה קיימת',
      is_default: true,
      is_active: true
    })
    
    await ensureFundsIntegrity()
    
    const funds = await fundsService.getAll()
    expect(funds).toHaveLength(1)
    expect(funds[0].name).toBe('קופה קיימת')
  })

  it('צריכה לשייך הלוואות ללא fund_id לקופת ברירת מחדל', async () => {
    const borrowerId = (await borrowersService.create({
      first_name: 'משה',
      last_name: 'כהן',
      phone: '0501234567'
    } as any)).lastInsertRowid
    
    // יצירת הלוואה ללא fund_id (עוקף את ה-validation הרגיל)
    const { getAllItems, setItem, generateId } = await import('../services/database')
    const loanId = generateId('loans')
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: borrowerId,
      amount: 1000,
      loan_date: '2026-01-01',
      status: 'active',
      fund_id: undefined,  // ← אין fund_id
      created_at: new Date().toISOString()
    } as any)
    
    await ensureFundsIntegrity()
    
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBeDefined()
    
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('צריכה לשייך הלוואות עם fund_id לא קיים לקופת ברירת מחדל', async () => {
    const borrowerId = (await borrowersService.create({
      first_name: 'דוד',
      last_name: 'לוי',
      phone: '0507654321'
    } as any)).lastInsertRowid
    
    const { setItem, generateId } = await import('../services/database')
    const loanId = generateId('loans')
    setItem('loans', loanId, {
      id: loanId,
      borrower_id: borrowerId,
      amount: 2000,
      loan_date: '2026-01-15',
      status: 'active',
      fund_id: 'non-existent-fund-id',  // ← fund_id לא קיים
      created_at: new Date().toISOString()
    } as any)
    
    await ensureFundsIntegrity()
    
    const loan = await loansService.getById(loanId)
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('צריכה להיות אידמפוטנטית - ריצה שנייה לא משנה כלום', async () => {
    await ensureFundsIntegrity()
    const fundsAfterFirst = await fundsService.getAll()
    
    await ensureFundsIntegrity()
    const fundsAfterSecond = await fundsService.getAll()
    
    expect(fundsAfterSecond).toHaveLength(fundsAfterFirst.length)
  })
})
```

**היישום** (`src/services/fundsIntegrity.ts`):
```typescript
import { fundsService, getAllItems, setItem, commitData } from './database'
import logger from '../utils/logger'

/**
 * פונקציה אידמפוטנטית המבטיחה תקינות מערכת הקופות
 * 
 * מה היא עושה:
 * 1. מוודאת שיש קופת ברירת מחדל (יוצרת אם אין)
 * 2. משייכת כל רשומה ללא fund_id או עם fund_id לא קיים לקופת ברירת המחדל
 * 
 * קוראים לה:
 * - בסוף כל ייבוא (JSON + ZIP)
 * - באתחול המערכת (database.ts)
 */
export async function ensureFundsIntegrity(): Promise<void> {
  logger.info('🔍 Running ensureFundsIntegrity...')
  
  // שלב 1: וידוא קיום קופת ברירת מחדל
  let defaultFund
  try {
    defaultFund = await fundsService.getDefault()
    logger.info(`  ✓ Default fund exists: ${defaultFund.name}`)
  } catch {
    // אין קופת ברירת מחדל - צור אחת
    logger.info('  ℹ No default fund found, creating one...')
    const result = await fundsService.create({
      name: 'קופה ראשית',
      description: 'קופת ברירת המחדל של הגמ"ח',
      is_default: true,
      is_active: true,
    })
    defaultFund = await fundsService.getById(result.id)
    logger.info(`  ✓ Created default fund: ${defaultFund?.id}`)
  }

  if (!defaultFund) {
    throw new Error('Failed to ensure default fund')
  }

  // שלב 2: קבלת כל הקופות הקיימות (כולל מחוקות - לזיהוי fund_id לא תקין)
  const allFunds = await fundsService.getAll()
  const validFundIds = new Set(allFunds.map(f => f.id))

  // שלב 3: תיקון רשומות בכל הטבלאות
  const tables = ['loans', 'donations', 'deposits', 'expenses'] as const
  let totalFixed = 0

  for (const table of tables) {
    const items = getAllItems<any>(table)
    let fixedInTable = 0

    for (const item of items) {
      // בדיקה: אין fund_id או fund_id לא קיים
      if (!item.fund_id || !validFundIds.has(item.fund_id)) {
        setItem(table, item.id, { ...item, fund_id: defaultFund.id })
        fixedInTable++
      }
    }

    if (fixedInTable > 0) {
      logger.info(`  ✓ Fixed ${fixedInTable} records in ${table}`)
      totalFixed += fixedInTable
    }
  }

  if (totalFixed > 0) {
    await commitData()
    logger.info(`✅ ensureFundsIntegrity completed: fixed ${totalFixed} records`)
  } else {
    logger.info('✅ ensureFundsIntegrity completed: no fixes needed')
  }
}
```

**Verify**: `npm test -- fundsIntegrity.test.ts`

---

### 1.3 קריאה ל-ensureFundsIntegrity בנקודות הנכונות

**קבצים לעדכון**:

1. **`src/services/fullBackupService.ts`** - בסוף `importFullBackupZip`:
```typescript
// שורה ~220 (אחרי הסיום של file restoration loop)
export async function importFullBackupZip(file: File): Promise<ZipImportResult> {
  // ... קוד קיים ...
  
  // הוספה:
  const { ensureFundsIntegrity } = await import('./fundsIntegrity')
  await ensureFundsIntegrity()

  return { ...parsed, restoredFileCount }
}
```

2. **`src/pages/AdvancedTools.tsx`** - ב-handleImport (ייבוא JSON רגיל):
```typescript
// אחרי importAllData(importData)
const { ensureFundsIntegrity } = await import('../services/fundsIntegrity')
await ensureFundsIntegrity()
```

3. **`src/services/database.ts`** - בסוף `loadData()`:
```typescript
// שורה ~142 (בתוך runStartupMigrations, אחרי המיגרציה של funds)
try {
  const { migrateFundsSystem } = await import('./migrations/fundsMigration')
  await migrateFundsSystem()
  
  // הוספה:
  const { ensureFundsIntegrity } = await import('./fundsIntegrity')
  await ensureFundsIntegrity()
} catch (error) {
  logger.error('❌ Funds migration failed:', error)
}
```

**בדיקת אינטגרציה** (`src/__tests__/fundsImportIntegration.test.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService } from '../services/database'
import { parseBackupJson } from '../services/fullBackupService'
import { importAllData } from '../services/database'
import { ensureFundsIntegrity } from '../services/fundsIntegrity'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('ייבוא גיבוי ישן ללא קופות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('גיבוי ישן בלי funds צריך לעבור מיגרציה אוטומטית', async () => {
    const oldBackup = {
      exportDate: '2025-01-01',
      version: '1.0',
      borrowers: {
        'b1': { id: 'b1', first_name: 'יוסף', last_name: 'אברהם', phone: '0501111111' }
      },
      loans: {
        'l1': { id: 'l1', borrower_id: 'b1', amount: 5000, loan_date: '2025-12-01', status: 'active' }
        // ← אין fund_id
      }
    }
    
    const { importData } = parseBackupJson(JSON.stringify(oldBackup))
    await importAllData(importData)
    await ensureFundsIntegrity()
    
    // בדיקה שנוצרה קופת ברירת מחדל
    const funds = await fundsService.getAll()
    expect(funds.length).toBeGreaterThan(0)
    
    // בדיקה שההלוואה קיבלה fund_id
    const loan = await loansService.getById('l1')
    expect(loan?.fund_id).toBeDefined()
    
    const defaultFund = await fundsService.getDefault()
    expect(loan?.fund_id).toBe(defaultFund.id)
  })

  it('גיבוי חדש עם funds נשמר נכון', async () => {
    const newBackup = {
      exportDate: '2026-01-01',
      version: '1.0',
      funds: {
        'f1': { id: 'f1', name: 'קופה ראשית', is_default: true, is_active: true, created_at: '2026-01-01' },
        'f2': { id: 'f2', name: 'קרן חתונות', is_default: false, is_active: true, created_at: '2026-01-02' }
      },
      borrowers: {
        'b1': { id: 'b1', first_name: 'משה', last_name: 'כהן', phone: '0502222222' }
      },
      loans: {
        'l1': { id: 'l1', borrower_id: 'b1', fund_id: 'f1', amount: 3000, loan_date: '2026-01-10', status: 'active' },
        'l2': { id: 'l2', borrower_id: 'b1', fund_id: 'f2', amount: 2000, loan_date: '2026-01-15', status: 'active' }
      }
    }
    
    const { importData } = parseBackupJson(JSON.stringify(newBackup))
    await importAllData(importData)
    await ensureFundsIntegrity()
    
    const funds = await fundsService.getAll()
    expect(funds).toHaveLength(2)
    
    const loan1 = await loansService.getById('l1')
    const loan2 = await loansService.getById('l2')
    
    expect(loan1?.fund_id).toBe('f1')
    expect(loan2?.fund_id).toBe('f2')
  })
})
```

**Verify**: `npm test -- fundsImportIntegration.test.ts`

---

## סעיף 2: בנייה (TypeScript) - תיקון טיפוסים

### 2.1 בעיית fund_id vs fundId ב-Dashboard

**הבעיה**: ב-`database.ts` שורה 1264, `getDashboardStats` מחזיר:
```typescript
result.byFund.push({
  fund_id: fund.id,  // ← fund_id
  fundName: fund.name,
  // ...
})
```

אבל ב-`Dashboard.tsx` שורה 371:
```typescript
const fund = activeFunds.find(f => f.id === fundStats.fund_id)  
// ← משתמש ב-fund_id אבל TypeScript מצפה ל-fundId
```

**תיקון ב-`src/services/database.ts`** שורה ~1264:
```typescript
// ממשק מפורש
interface FundStats {
  fund_id: string
  fundName: string
  activeLoans: { count: number; total: number }
  plannedLoans: { count: number; total: number }
  availableCash: number
}

// בפונקציה getDashboardStats:
async getDashboardStats() {
  // ... קוד קיים ...
  
  const result = {
    activeLoans: { /* ... */ },
    plannedLoans: { /* ... */ },
    deposits: { /* ... */ },
    donations: { /* ... */ },
    gemachExpenses,
    byFund: [] as FundStats[]  // ← הוספת טיפוס מפורש
  }

  const funds = await fundsService.getAll()
  for (const fund of funds) {
    const fundStats = await this.getStatsByFund(fund.id)
    result.byFund.push({
      fund_id: fund.id,  // ← לשמור fund_id (לא fundId)
      fundName: fund.name,
      activeLoans: fundStats.activeLoans,
      plannedLoans: fundStats.plannedLoans,
      availableCash: fundStats.availableCash
    })
  }
  
  return result
}
```

**בדיקת קומפילציה**:
```bash
npm run build
```

צריך לעבור ללא שגיאות TypeScript.

**Verify**: `npm run build && npm test`

---

## סעיף 3: שינוי קופה של הלוואה

### 3.1 הסרת fund_id מ-payload בעריכה (אלא אם שונה)

**קובץ**: `src/components/loans/LoansTab.tsx`

**הבעיה**: כרגע בשורה ~463 (`handleSave`), כל עריכה שולחת את `fund_id` גם אם לא שונה.

**בדיקת vitest** (`src/__tests__/loanFundChangeValidation.test.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, fundsService, borrowersService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('שינוי קופה של הלוואה', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string
  let loanId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    // יצירת 2 קופות
    fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    fund2Id = (await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })).id
    
    // יצירת לווה
    borrowerId = (await borrowersService.create({
      first_name: 'אברהם',
      last_name: 'יצחק',
      phone: '0501234567'
    } as any)).lastInsertRowid
    
    // יצירת הלוואה
    loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 10000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
  })

  it('changeFund: צריך לזרוק שגיאה אם קופת היעד לא קיימת', async () => {
    await expect(
      loansService.changeFund(loanId, 'non-existent-fund', 'טעות')
    ).rejects.toThrow()
  })

  it('changeFund: צריך לזרוק שגיאה אם קופת היעד לא פעילה', async () => {
    // השבתת קופה 2
    await fundsService.deactivate(fund2Id)
    
    await expect(
      loansService.changeFund(loanId, fund2Id, 'ניסיון להעביר לקופה מושבתת')
    ).rejects.toThrow('קופה לא פעילה')
  })

  it('changeFund: צריך לזרוק שגיאה אם הקופה זהה לנוכחית', async () => {
    await expect(
      loansService.changeFund(loanId, fund1Id, 'אותה קופה')
    ).rejects.toThrow('הקופה זהה')
  })

  it('changeFund: צריך לזרוק שגיאה אם לא סופקה סיבה', async () => {
    await expect(
      loansService.changeFund(loanId, fund2Id, '')
    ).rejects.toThrow('סיבה חובה')
  })

  it('changeFund: צריך לעדכן fund_id ולרשום ביומן', async () => {
    await loansService.changeFund(loanId, fund2Id, 'טעות בבחירת קופה')
    
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBe(fund2Id)
    
    // בדיקת audit log
    const { getAllItems } = await import('../services/database')
    const auditLogs = getAllItems<any>('auditLog')
    const relevantLog = auditLogs.find(
      log => log.entity_type === 'loan' && 
             log.entity_id === loanId && 
             log.action === 'loan_fund_change'
    )
    
    expect(relevantLog).toBeDefined()
    expect(JSON.parse(relevantLog.before_data).fund_id).toBe(fund1Id)
    expect(JSON.parse(relevantLog.after_data).fund_id).toBe(fund2Id)
    expect(JSON.parse(relevantLog.metadata).reason).toBe('טעות בבחירת קופה')
  })
})
```

**התיקון ב-`src/services/database.ts`** (loansService.changeFund):
```typescript
// שורה ~1211 (אחרי getByFund)
async changeFund(loanId: string, newFundId: string, reason: string): Promise<void> {
  if (!reason || reason.trim() === '') {
    throw new Error('סיבה חובה לשינוי קופה')
  }

  const loan = await this.getById(loanId)
  if (!loan) {
    throw new Error('הלוואה לא נמצאה')
  }

  if (loan.fund_id === newFundId) {
    throw new Error('הקופה זהה לקופה הנוכחית')
  }

  // בדיקה שקופת היעד קיימת ופעילה
  const targetFund = await fundsService.getById(newFundId)
  if (!targetFund) {
    throw new Error('קופת היעד לא קיימת')
  }
  if (!targetFund.is_active) {
    throw new Error('קופה לא פעילה - לא ניתן להעביר הלוואות אליה')
  }

  const oldFundId = loan.fund_id

  // עדכון הלוואה
  await this.update(loanId, { fund_id: newFundId })

  // רישום ביומן audit
  const auditId = generateId('auditLog')
  setItem('auditLog', auditId, {
    id: auditId,
    timestamp: new Date().toISOString(),
    action: 'loan_fund_change',
    entity_type: 'loan',
    entity_id: loanId,
    actor: 'system',
    before_data: JSON.stringify({ fund_id: oldFundId }),
    after_data: JSON.stringify({ fund_id: newFundId }),
    metadata: JSON.stringify({ reason: reason.trim() })
  })
  
  await commitData()
}
```

**Verify**: `npm test -- loanFundChangeValidation.test.ts`

---

### 3.2 חסימת fund_id: undefined ב-loansService.update

**התיקון ב-`src/services/database.ts`** שורה ~1088:
```typescript
async update(id: string, d: Partial<Loan>): Promise<void> {
  const e = await this.getById(id)
  if (!e) return

  // חסימה: fund_id undefined לא יכול לדרוס ערך קיים
  if ('fund_id' in d && d.fund_id === undefined) {
    delete d.fund_id  // ← מסיר מה-payload
  }

  // ... שאר הקוד הקיים (חסימות סכום, תאריך וכו')
  
  setItem('loans', id, { ...e, ...d })
  await flushPendingSave()
}
```

**בדיקת vitest** (להוסיף ל-`loanFundChangeValidation.test.ts`):
```typescript
it('loansService.update: fund_id undefined לא צריך לדרוס ערך קיים', async () => {
  const loan = await loansService.getById(loanId)
  expect(loan?.fund_id).toBe(fund1Id)
  
  await loansService.update(loanId, { fund_id: undefined })
  
  const updatedLoan = await loansService.getById(loanId)
  expect(updatedLoan?.fund_id).toBe(fund1Id)  // ← לא השתנה
})
```

**Verify**: `npm test -- loanFundChangeValidation.test.ts`

---

## סעיף 4: דשבורד ואינווריאנט

### 4.1 הצגת קופות מושבתות עם הלוואות פעילות + שורת סיכום

**קובץ**: `src/pages/Dashboard.tsx`

**הממשק הנוכחי** שורה ~175:
```typescript
const funds = await fundsService.getAll()
for (const fund of funds) {
  const fundStats = await this.getStatsByFund(fund.id)
  result.byFund.push({ /* ... */ })
}
```

**הבעיה**:
1. מציג רק קופות פעילות (is_active=true)
2. אין שורת סיכום כוללת

**התיקון ב-`src/services/database.ts`** שורה ~1250 בתוך `getDashboardStats`:
```typescript
// החלפת:
const funds = await fundsService.getAll()

// ב:
const allFunds = await fundsService.getAll()
const funds = allFunds.filter(f => {
  // כולל קופות פעילות + קופות מושבתות שיש להן הלוואות פעילות
  if (f.is_active) return true
  
  // קופה מושבתת - בדוק אם יש לה הלוואות פעילות
  const loansInFund = getAllItems<any>('loans').filter(
    l => l.fund_id === f.id && !l.is_deleted && l.status === 'active'
  )
  return loansInFund.length > 0
})
```

**עדכון ב-`Dashboard.tsx`** שורה ~371 (הוספת שורת סיכום):
```typescript
{/* פירוט לפי קופה */}
{activeFunds.length > 1 && stats && (stats as any).byFund && (
  <Box sx={{ mb: 4 }}>
    <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
      פירוט לפי קופה
    </Typography>
    <Grid container spacing={3}>
      {((stats as any).byFund || []).map((fundStats: any) => {
        const fund = activeFunds.find(f => f.id === fundStats.fund_id)
        if (!fund) return null
        
        return (
          <Grid item xs={12} sm={6} md={4} key={fundStats.fund_id}>
            {/* ... קוד קיים של כרטיס הקופה ... */}
          </Grid>
        )
      })}
      
      {/* שורת סיכום כוללת - רק אם יש יותר מקופה אחת */}
      {((stats as any).byFund || []).length > 1 && (
        <Grid item xs={12}>
          <Card sx={{ bgcolor: 'grey.100', borderTop: '3px solid', borderColor: 'primary.main' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                סה"כ כל הקופות
              </Typography>
              
              <Stack direction="row" spacing={4} justifyContent="space-around">
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    הלוואות פעילות
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>
                    {stats.activeLoans.count}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatCurrency(stats.activeLoans.total)}
                  </Typography>
                </Box>
                
                <Divider orientation="vertical" flexItem />
                
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    כסף זמין
                  </Typography>
                  <Typography 
                    variant="h6" 
                    fontWeight={700}
                    color={availableCash >= 0 ? 'success.main' : 'error.main'}
                  >
                    {formatCurrency(availableCash)}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  </Box>
)}
```

**Verify**: בדיקה ויזואלית - `npm run dev` ולראות את הדשבורד

---

### 4.2 יישור סינון "לווים קיימים"

**הבעיה**: `getStatsByFund` צריך להשתמש באותו סינון כמו `getActiveLoansForExistingBorrowers`.

**התיקון ב-`src/services/database.ts`** - הוספת `getStatsByFund` שורה ~1360:
```typescript
// פונקציה חדשה ב-statsService:
async getStatsByFund(fundId: string) {
  const today = new Date().toISOString().split('T')[0]
  
  // שימוש באותו סינון כמו getActiveLoansForExistingBorrowers
  const allLoans = await loansService.getAll()
  const borrowers = await borrowersService.getAll()
  const existingBorrowerIds = new Set(borrowers.map(b => b.id))
  
  const activeInFund = allLoans.filter(l =>
    l.fund_id === fundId &&
    l.status === 'active' &&
    l.loan_date <= today &&
    (l.remaining || 0) > 0 &&
    existingBorrowerIds.has(l.borrower_id)  // ← סינון לווים קיימים
  )
  
  const plannedInFund = allLoans.filter(l =>
    l.fund_id === fundId &&
    (l.status === 'planned' || l.loan_date > today)
  )
  
  // חישוב כסף זמין בקופה
  const donations = getAllItems<any>('donations').filter(d => d.fund_id === fundId)
  const deposits = await depositRepository.getAll()
  const depositsInFund = deposits.filter(d => d.fund_id === fundId && d.status !== 'planned' && d.deposit_date <= today)
  const expenses = getAllItems<any>('expenses').filter(e => e.fund_id === fundId && e.paid_by === 'gemach')
  
  let totalDeposits = 0
  for (const d of depositsInFund) {
    const withdrawals = await depositWithdrawalsService.getByDeposit(d.id)
    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    totalDeposits += (d.amount - totalWithdrawn)
  }
  
  const totalDonations = donations.reduce((s, d) => s + d.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalActiveLoans = activeInFund.reduce((s, l) => s + (l.remaining || 0), 0)
  
  const availableCash = totalDonations + totalDeposits - totalActiveLoans - totalExpenses
  
  return {
    activeLoans: {
      count: activeInFund.length,
      total: totalActiveLoans
    },
    plannedLoans: {
      count: plannedInFund.length,
      total: plannedInFund.reduce((s, l) => s + l.amount, 0)
    },
    availableCash
  }
}
```

**בדיקת vitest** (`src/__tests__/fundsStatsConsistency.test.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, statsService, fundsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('עקביות סטטיסטיקות קופות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('סכום כל הקופות שווה לסכום הכולל', async () => {
    const overall = await statsService.getDashboardStats()
    const byFund = (overall as any).byFund || []
    
    const sumActiveLoansCount = byFund.reduce((sum: number, f: any) => sum + f.activeLoans.count, 0)
    const sumActiveLoansTotal = byFund.reduce((sum: number, f: any) => sum + f.activeLoans.total, 0)
    
    expect(sumActiveLoansCount).toBe(overall.activeLoans.count)
    expect(sumActiveLoansTotal).toBe(overall.activeLoans.total)
  })
})
```

**Verify**: `npm test -- fundsStatsConsistency.test.ts`

---

### 4.3 הרחבת fundsInvariant לכלול הלוואות והפקדות

**קובץ חדש**: `src/__tests__/fundsInvariant.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { 
  resetDatabase, 
  loansService, 
  borrowersService, 
  fundsService,
  donationsService,
  donorsService
} from '../services/database'
import { depositRepository } from '../services/repositories/depositRepository'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('אינווריאנט: כל רשומה חייבת fund_id תקין', () => {
  let defaultFundId: string
  let borrowerId: string
  let donorId: string
  let depositorId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    // יצירת קופת ברירת מחדל
    defaultFundId = (await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })).id
    
    // יצירת לווה
    borrowerId = (await borrowersService.create({
      first_name: 'יעקב',
      last_name: 'כהן',
      phone: '0501234567'
    } as any)).lastInsertRowid
    
    // יצירת תורם
    donorId = (await donorsService.create({
      first_name: 'שרה',
      last_name: 'לוי',
      phone: '0507654321'
    } as any)).lastInsertRowid
    
    // יצירת מפקיד
    const { depositorsService } = await import('../services/database')
    depositorId = (await depositorsService.create({
      first_name: 'דוד',
      last_name: 'אברהם',
      phone: '0509876543'
    } as any)).lastInsertRowid
  })

  it('הלוואה חדשה מקבלת fund_id של קופת ברירת מחדל', async () => {
    const loanId = (await loansService.create({
      borrower_id: borrowerId,
      amount: 5000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
      // ← ללא fund_id מפורש
    } as any)).lastInsertRowid
    
    const loan = await loansService.getById(loanId)
    expect(loan?.fund_id).toBe(defaultFundId)
  })

  it('תרומה חדשה מקבלת fund_id של קופת ברירת מחדל', async () => {
    const donationId = (await donationsService.create({
      donor_id: donorId,
      amount: 1000,
      donation_date: '2026-01-05',
      notes: '',
      payment_method: 'cash',
      payment_details: ''
      // ← ללא fund_id מפורש
    } as any)).lastInsertRowid
    
    const { getAllItems } = await import('../services/database')
    const donation = getAllItems<any>('donations').find(d => d.id === donationId)
    
    expect(donation?.fund_id).toBe(defaultFundId)
  })

  it('הפקדה חדשה מקבלת fund_id של קופת ברירת מחדל', async () => {
    const depositId = (await depositRepository.create({
      depositor_id: depositorId,
      amount: 20000,
      deposit_date: '2026-01-10',
      status: 'active',
      is_recurring: 0
      // ← ללא fund_id מפורש
    } as any)).lastInsertRowid
    
    const deposit = await depositRepository.getById(depositId)
    expect(deposit?.fund_id).toBe(defaultFundId)
  })

  it('כל הרשומות הקיימות חייבות fund_id תקין', async () => {
    // יצירת רשומות
    await loansService.create({
      borrower_id: borrowerId,
      amount: 3000,
      loan_date: '2026-01-01',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)
    
    await donationsService.create({
      donor_id: donorId,
      amount: 500,
      donation_date: '2026-01-05',
      notes: '',
      payment_method: 'cash',
      payment_details: ''
    } as any)
    
    // בדיקה שכל הרשומות יש להן fund_id
    const { getAllItems } = await import('../services/database')
    const loans = getAllItems<any>('loans')
    const donations = getAllItems<any>('donations')
    const deposits = await depositRepository.getAll()
    
    for (const loan of loans) {
      expect(loan.fund_id).toBeDefined()
      expect(typeof loan.fund_id).toBe('string')
    }
    
    for (const donation of donations) {
      expect(donation.fund_id).toBeDefined()
      expect(typeof donation.fund_id).toBe('string')
    }
    
    for (const deposit of deposits) {
      expect(deposit.fund_id).toBeDefined()
      expect(typeof deposit.fund_id).toBe('string')
    }
  })
})
```

**Verify**: `npm test -- fundsInvariant.test.ts`

---

## סעיף 5: מיגרציה - הסרת שמירת עותק מלא

**קובץ**: `src/services/migrations/fundsMigration.ts`

**הבעיה** שורה ~34:
```typescript
// שורה 34
await createBackupBeforeMigration()
```

מתוך הפונקציה:
```typescript
async function createBackupBeforeMigration(): Promise<void> {
  const data = await loadAppData()
  const backupKey = `gemach_backup_pre_funds_migration_${Date.now()}`
  localStorage.setItem(backupKey, JSON.stringify(data))  // ← עותק מלא ב-localStorage
}
```

**התיקון**:
```typescript
async function createBackupBeforeMigration(): Promise<void> {
  logger.info('💾 Creating backup before migration...')
  
  try {
    // שימוש במנגנון הגיבוי הקיים במקום localStorage
    const { exportFullBackupZip } = await import('../fullBackupService')
    
    // יצירת ZIP בשקט (ללא UI)
    await exportFullBackupZip((msg) => logger.info(`  ${msg}`))
    
    // שמירת דגל בלבד (לא את כל הנתונים)
    const backupKey = `gemach_backup_created_${Date.now()}`
    localStorage.setItem(backupKey, new Date().toISOString())
    
    logger.info('✅ Backup created')
  } catch (error) {
    throw new Error('נכשל ביצירת גיבוי לפני מיגרציה: ' + (error as Error).message)
  }
}
```

**הסרת importAllData מתוך המיגרציה** שורה ~52:
```typescript
// לפני:
async function runMigration(): Promise<void> {
  logger.info('⚙️ Running migration...')

  // טעינת נתונים קיימים לתוך ה-store הפנימי
  const storedData = await loadAppData()
  if (storedData) {
    const { importAllData } = await import('../database')
    await importAllData(storedData)  // ← מיותר!
  }
  
  // ...
}

// אחרי:
async function runMigration(): Promise<void> {
  logger.info('⚙️ Running migration...')

  // הנתונים כבר בזיכרון (data store), אין צורך ב-import
  // קבלת/יצירת קופת ברירת מחדל
  const defaultFund = await getOrCreateDefaultFund()
  
  // ...
}
```

**החלפת דגל בבדיקת מצב** - שימוש ב-`ensureFundsIntegrity()` במקום דגל:
```typescript
// בקובץ database.ts, runStartupMigrations:
async function runStartupMigrations(): Promise<void> {
  logger.info('🔧 Running startup migrations...');
  
  // ... מיגרציות אחרות ...

  // Migration 2: Funds system
  try {
    const { migrateFundsSystem } = await import('./migrations/fundsMigration')
    await migrateFundsSystem()
    
    // במקום בדיקת דגל, הרץ ensureFundsIntegrity שהיא אידמפוטנטית
    const { ensureFundsIntegrity } = await import('./fundsIntegrity')
    await ensureFundsIntegrity()
  } catch (error) {
    logger.error('❌ Funds migration failed:', error)
  }
}
```

**Verify**: `npm run build && npm test`

---

## סעיף 6: fundsService - תיקוני לולאה ווולידציות

### 6.1 תיקון לולאה ב-create

**הבעיה**: שורה ~2818 ב-`database.ts`:
```typescript
for (const [id, existingFund] of Object.entries(allFunds)) {
  if (existingFund.is_default && !existingFund.is_deleted) {
    setItem('funds', id, { ...existingFund, is_default: false })
  }
}
```

השימוש ב-`id` מה-destructuring הוא נכון, אבל לבירור:

**הקוד הנוכחי תקין**. אין צורך בתיקון.

### 6.2 חסימת השבתה/הסרת is_default מקופת ברירת מחדל

**התיקון ב-`database.ts`** שורה ~2861 (`fundsService.update`):
```typescript
async update(id: string, data: Partial<Omit<Fund, 'id' | 'created_at'>>): Promise<void> {
  const existing = await this.getById(id)
  if (!existing) {
    throw new Error('קופה לא נמצאה')
  }

  // חסימה: לא ניתן להסיר is_default מקופת ברירת מחדל (אם זו היחידה)
  if (existing.is_default && data.is_default === false) {
    const allFunds = await this.getAll()
    const otherDefaultFunds = allFunds.filter(f => f.id !== id && f.is_default)
    
    if (otherDefaultFunds.length === 0) {
      throw new Error('לא ניתן להסיר את הסימון מקופת ברירת המחדל האחרונה. יש להגדיר קופה אחרת כברירת מחדל תחילה.')
    }
  }

  // חסימה: לא ניתן להשבית קופת ברירת מחדל יחידה
  if (existing.is_default && data.is_active === false) {
    const allFunds = await this.getAll()
    const activeFunds = allFunds.filter(f => f.is_active && f.id !== id)
    
    if (activeFunds.length === 0) {
      throw new Error('לא ניתן להשבית את קופת ברירת המחדל היחידה. יש להגדיר קופה אחרת כברירת מחדל ופעילה תחילה.')
    }
  }

  // ... שאר הקוד הקיים
}
```

**בדיקת vitest** (`src/__tests__/fundsValidation.test.ts`):
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, fundsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('fundsService - חסימות ווולידציות', () => {
  beforeEach(() => {
    resetDatabase()
    vi.clearAllMocks()
  })

  it('לא ניתן להשבית קופת ברירת מחדל יחידה', async () => {
    const fundId = (await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })).id
    
    await expect(
      fundsService.update(fundId, { is_active: false })
    ).rejects.toThrow('לא ניתן להשבית')
  })

  it('לא ניתן להסיר is_default מקופת ברירת מחדל יחידה', async () => {
    const fundId = (await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })).id
    
    await expect(
      fundsService.update(fundId, { is_default: false })
    ).rejects.toThrow('לא ניתן להסיר')
  })

  it('ניתן להשבית קופת ברירת מחדל אם יש קופה אחרת פעילה', async () => {
    const fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })
    
    // עכשיו אפשר להשבית
    await expect(
      fundsService.update(fund1Id, { is_active: false })
    ).resolves.not.toThrow()
  })
})
```

**Verify**: `npm test -- fundsValidation.test.ts`

---

### 6.3 בדיקת קיום קופה ב-services

**קבצים לעדכון**:

1. **`src/services/database.ts`** - `loansService.create` (כבר קיים, שורה ~1068)
2. **`src/services/database.ts`** - `donationsService.create` (להוסיף)
3. **`src/services/database.ts`** - `depositRepository.create` (להוסיף)
4. **`src/services/database.ts`** - `expensesService.create` (להוסיף)

**דוגמה** - הוספה ל-`donationsService.create`:
```typescript
// שורה ~1800 בקירוב
async create(d: Omit<Donation, 'id' | 'receipt_number' | 'created_at'> & { fund_id?: string }): Promise<{ lastInsertRowid: string }> {
  // אם לא צוין fund_id, השתמש בקופת ברירת מחדל
  let fundId = d.fund_id
  if (!fundId) {
    const defaultFund = await fundsService.getDefault()
    fundId = defaultFund.id
  }
  
  // בדיקה שהקופה קיימת ופעילה
  const fund = await fundsService.getById(fundId)
  if (!fund) {
    throw new Error('קופה לא קיימת')
  }
  if (!fund.is_active) {
    throw new Error('קופה לא פעילה - לא ניתן להוסיף תרומות אליה')
  }
  
  // ... שאר הקוד הקיים
}
```

**אותו דפוס** גם ב-:
- `depositRepository.create`
- `expensesService.create`

**Verify**: `npm run build && npm test`

---

### 6.4 הסרת יצירת קופה ראשית בקוד ייצור

**הבעיה**: ב-`loansService.create` שורה ~1072:
```typescript
if (!fundId) {
  try {
    const defaultFund = await fundsService.getDefault()
    fundId = defaultFund.id
  } catch (error) {
    // אם אין קופת ברירת מחדל, צור אחת
    const result = await fundsService.create({
      name: 'קופה ראשית',
      description: 'קופה ראשית של הגמ"ח',
      is_default: true,
      is_active: true
    })
    fundId = result.id
  }
}
```

**התיקון** - הסרת ה-catch:
```typescript
if (!fundId) {
  const defaultFund = await fundsService.getDefault()
  fundId = defaultFund.id
}
```

**הסבר**: `ensureFundsIntegrity()` רצה באתחול ובכל ייבוא, אז תמיד תהיה קופת ברירת מחדל. אין צורך ב-fallback בקוד ייצור.

**Verify**: `npm run build && npm test`

---

## סעיף 7: השלמות מהאפיון

### 7.1 בורר קופה בטופס הוצאה

**קובץ**: `src/components/expenses/ExpensesTab.tsx` (או דומה)

**הוספה**: שדה `FundSelector` בטופס הוצאה חדשה (כמו בטופס הלוואה).

**אין צורך בבדיקת vitest נפרדת** - זה UI בלבד.

**Verify**: בדיקה ויזואלית - `npm run dev`

---

### 7.2 אזהרת חריגה (לא חסימה)

**קובץ**: `src/components/loans/LoansTab.tsx`

**הוספה** - לפני `handleSave` (שורה ~430):
```typescript
const [fundWarning, setFundWarning] = useState<string>('')

// פונקציה לבדיקת חריגה
const checkFundOverdraft = async (fundId: string, loanAmount: number) => {
  if (!fundId) return
  
  try {
    const { statsService } = await import('../../services/database')
    const fundStats = await statsService.getStatsByFund(fundId)
    
    if (loanAmount > fundStats.availableCash) {
      setFundWarning(
        `שים לב: הלוואה זו תגרום לחריגה ביתרת הקופה. ` +
        `זמין: ${formatCurrency(fundStats.availableCash)}, מבוקש: ${formatCurrency(loanAmount)}`
      )
    } else {
      setFundWarning('')
    }
  } catch (error) {
    console.error('Error checking fund overdraft:', error)
  }
}

// בתוך handleSave, לפני השמירה:
if (formData.amount && selectedFundId) {
  await checkFundOverdraft(selectedFundId, formData.amount)
}
```

**הצגת האזהרה** - לפני כפתור השמירה:
```tsx
{fundWarning && (
  <Alert severity="warning" sx={{ mb: 2 }}>
    {fundWarning}
  </Alert>
)}
```

**Verify**: בדיקה ויזואלית

---

### 7.3 פעולת "העבר לקופה אחרת" בעמוד הלוואות

**קובץ**: `src/components/loans/LoansTab.tsx`

**הוספה** - dialog להעברת קופה:
```tsx
const [changeFundDialogOpen, setChangeFundDialogOpen] = useState(false)
const [changeFundLoanId, setChangeFundLoanId] = useState<string | null>(null)
const [newFundId, setNewFundId] = useState('')
const [changeFundReason, setChangeFundReason] = useState('')

// Dialog
<Dialog open={changeFundDialogOpen} onClose={() => setChangeFundDialogOpen(false)}>
  <DialogTitle>העברת הלוואה לקופה אחרת</DialogTitle>
  <DialogContent>
    <FundSelector
      value={newFundId}
      onChange={(e) => setNewFundId(e.target.value)}
      label="קופת יעד"
      required
    />
    <TextField
      fullWidth
      label="סיבה להעברה (חובה)"
      value={changeFundReason}
      onChange={(e) => setChangeFundReason(e.target.value)}
      multiline
      rows={3}
      sx={{ mt: 2 }}
      required
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setChangeFundDialogOpen(false)}>ביטול</Button>
    <Button 
      onClick={handleChangeFundSubmit} 
      variant="contained"
      disabled={!newFundId || !changeFundReason.trim()}
    >
      העבר
    </Button>
  </DialogActions>
</Dialog>

// הטיפול
const handleChangeFundSubmit = async () => {
  if (!changeFundLoanId || !newFundId || !changeFundReason.trim()) return
  
  try {
    await loansService.changeFund(changeFundLoanId, newFundId, changeFundReason)
    setSnackbar({ open: true, message: 'הלוואה הועברה בהצלחה', severity: 'success' })
    setChangeFundDialogOpen(false)
    setChangeFundReason('')
    setNewFundId('')
    if (selectedBorrower) {
      loadBorrowerLoans(selectedBorrower.id)
    }
  } catch (error) {
    setSnackbar({ open: true, message: error instanceof Error ? error.message : 'שגיאה', severity: 'error' })
  }
}
```

**כפתור בטבלת הלוואות**:
```tsx
<IconButton 
  onClick={() => {
    setChangeFundLoanId(loan.id)
    setNewFundId(loan.fund_id || '')
    setChangeFundDialogOpen(true)
  }}
  title="העבר לקופה אחרת"
>
  <SwapHorizIcon />
</IconButton>
```

**Verify**: בדיקה ויזואלית

---

### 7.4 בחירה מראש של קופת ברירת מחדל בבורר

**קובץ**: `src/components/funds/FundSelector.tsx`

**הממשק הנוכחי** (אם קיים) או יצירת קומפוננטה חדשה:
```tsx
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import { useState, useEffect } from 'react'
import { fundsService } from '../../services/database'

interface FundSelectorProps {
  value: string
  onChange: (event: any) => void
  label?: string
  required?: boolean
  disabled?: boolean
  includeInactive?: boolean  // להצגת קופות מושבתות (בעריכה)
}

export default function FundSelector({
  value,
  onChange,
  label = 'קופה',
  required = false,
  disabled = false,
  includeInactive = false
}: FundSelectorProps) {
  const [funds, setFunds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFunds()
  }, [includeInactive])

  const loadFunds = async () => {
    try {
      const allFunds = await fundsService.getAll()
      
      if (includeInactive) {
        setFunds(allFunds)
      } else {
        setFunds(allFunds.filter(f => f.is_active))
      }
      
      // בחירה אוטומטית של ברירת מחדל אם אין ערך
      if (!value && allFunds.length > 0) {
        const defaultFund = allFunds.find(f => f.is_default)
        if (defaultFund) {
          onChange({ target: { value: defaultFund.id } })
        }
      }
    } catch (error) {
      console.error('Error loading funds:', error)
    } finally {
      setLoading(false)
    }
  }

  // הסתר הבורר אם יש רק קופה אחת פעילה (אלא אם includeInactive=true)
  if (!loading && funds.length === 1 && !includeInactive) {
    return null
  }

  return (
    <FormControl fullWidth required={required} disabled={disabled || loading}>
      <InputLabel>{label}</InputLabel>
      <Select value={value} onChange={onChange} label={label}>
        {funds.map(fund => (
          <MenuItem key={fund.id} value={fund.id}>
            {fund.name}
            {fund.is_default && ' (ברירת מחדל)'}
            {!fund.is_active && ' (מושבת)'}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
```

**Verify**: בדיקה ויזואלית

---

### 7.5 הצגת קופה מושבתת בבורר בעריכת רשומה קיימת

**שימוש** ב-`FundSelector` עם `includeInactive={true}` בעת עריכה:
```tsx
<FundSelector
  value={selectedFundId}
  onChange={(e) => setSelectedFundId(e.target.value)}
  includeInactive={!!selectedLoan}  // ← true רק בעריכה
/>
```

**Verify**: בדיקה ויזואלית

---

## סעיף 8: בדיקות חסרות

### 8.1 הלוואה מחזורית יורשת קופה

**קובץ חדש**: `src/__tests__/recurringLoanInheritsFund.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService } from '../services/database'
import { createRecurringLoan } from '../services/scheduler'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('הלוואה מחזורית יורשת fund_id', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    fund1Id = (await fundsService.create({
      name: 'קופה 1',
      is_default: true,
      is_active: true
    })).id
    
    fund2Id = (await fundsService.create({
      name: 'קופה 2',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'ראובן',
      last_name: 'שמעון',
      phone: '0501112233'
    } as any)).lastInsertRowid
  })

  it('הלוואה מחזורית חדשה יורשת fund_id מההלוואה המקורית', async () => {
    // יצירת הלוואה מחזורית ראשונה בקופה 2
    const originalLoanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund2Id,  // ← קופה 2
      amount: 5000,
      loan_date: '2026-01-15',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 15,
      recurring_loan_number: 1,
      recurring_loan_count: 3,
      recurring_series_id: crypto.randomUUID(),
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    const originalLoan = await loansService.getById(originalLoanId)
    expect(originalLoan?.fund_id).toBe(fund2Id)
    
    // יצירת ההלוואה המחזורית הבאה
    const nextLoanId = await createRecurringLoan(originalLoanId)
    
    expect(nextLoanId).toBeDefined()
    const nextLoan = await loansService.getById(nextLoanId!)
    
    // בדיקה שההלוואה החדשה יורשת את אותו fund_id
    expect(nextLoan?.fund_id).toBe(fund2Id)
  })

  it('לא צריך לייצר כפילויות - הלוואה מחזורית קיימת לא נוצרת פעם נוספת', async () => {
    const originalLoanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 3000,
      loan_date: '2026-01-01',
      loan_type: 'fixed',
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 1,
      recurring_loan_number: 1,
      recurring_loan_count: 2,
      recurring_series_id: crypto.randomUUID(),
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    // יצירת ההלוואה השנייה
    const nextLoanId = await createRecurringLoan(originalLoanId)
    expect(nextLoanId).toBeDefined()
    
    // ניסיון שני - לא צריך ליצור כפילות
    const duplicateAttempt = await createRecurringLoan(originalLoanId)
    expect(duplicateAttempt).toBeNull()
  })
})
```

**Verify**: `npm test -- recurringLoanInheritsFund.test.ts`

---

### 8.2 changeFund רושם ביומן ומעדכן יתרות

**קובץ חדש**: `src/__tests__/changeFundAuditAndBalances.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService, statsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('changeFund - audit log ועדכון יתרות', () => {
  let fund1Id: string
  let fund2Id: string
  let borrowerId: string
  let loanId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    fund1Id = (await fundsService.create({
      name: 'קופה א',
      is_default: true,
      is_active: true
    })).id
    
    fund2Id = (await fundsService.create({
      name: 'קופה ב',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'לוי',
      last_name: 'כהן',
      phone: '0509998877'
    } as any)).lastInsertRowid
    
    loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fund1Id,
      amount: 8000,
      loan_date: '2026-01-20',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
  })

  it('changeFund צריך לרשום ביומן עם before_data, after_data ו-reason', async () => {
    await loansService.changeFund(loanId, fund2Id, 'תיקון טעות במערכת')
    
    const { getAllItems } = await import('../services/database')
    const auditLogs = getAllItems<any>('auditLog')
    
    const log = auditLogs.find(
      l => l.action === 'loan_fund_change' && 
           l.entity_id === loanId
    )
    
    expect(log).toBeDefined()
    expect(log.entity_type).toBe('loan')
    
    const beforeData = JSON.parse(log.before_data)
    const afterData = JSON.parse(log.after_data)
    const metadata = JSON.parse(log.metadata)
    
    expect(beforeData.fund_id).toBe(fund1Id)
    expect(afterData.fund_id).toBe(fund2Id)
    expect(metadata.reason).toBe('תיקון טעות במערכת')
  })

  it('changeFund צריך לעדכן יתרות של שתי הקופות', async () => {
    // יתרות לפני
    const fund1StatsBefore = await statsService.getStatsByFund(fund1Id)
    const fund2StatsBefore = await statsService.getStatsByFund(fund2Id)
    
    expect(fund1StatsBefore.activeLoans.count).toBe(1)
    expect(fund2StatsBefore.activeLoans.count).toBe(0)
    
    // העברה
    await loansService.changeFund(loanId, fund2Id, 'העברה')
    
    // יתרות אחרי
    const fund1StatsAfter = await statsService.getStatsByFund(fund1Id)
    const fund2StatsAfter = await statsService.getStatsByFund(fund2Id)
    
    expect(fund1StatsAfter.activeLoans.count).toBe(0)
    expect(fund2StatsAfter.activeLoans.count).toBe(1)
    expect(fund2StatsAfter.activeLoans.total).toBe(8000)
  })
})
```

**Verify**: `npm test -- changeFundAuditAndBalances.test.ts`

---

### 8.3 מחיקה נחסמת עם הלוואה soft-deleted

**קובץ חדש**: `src/__tests__/softDeletedLoanBlocksFundDeletion.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../services/persistence', () => ({
  saveAppData: vi.fn().mockResolvedValue(undefined),
  loadAppData: vi.fn().mockResolvedValue(null)
}))

import { resetDatabase, loansService, borrowersService, fundsService } from '../services/database'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    clear: () => { store = {} }
  }
})()

globalThis.localStorage = localStorageMock

describe('מחיקת קופה נחסמת בגלל הלוואה soft-deleted', () => {
  let fundId: string
  let borrowerId: string

  beforeEach(async () => {
    resetDatabase()
    vi.clearAllMocks()
    
    // קופת ברירת מחדל
    await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true
    })
    
    // קופה נוספת
    fundId = (await fundsService.create({
      name: 'קופה משנית',
      is_default: false,
      is_active: true
    })).id
    
    borrowerId = (await borrowersService.create({
      first_name: 'יוסף',
      last_name: 'דוד',
      phone: '0503334455'
    } as any)).lastInsertRowid
  })

  it('לא ניתן למחוק קופה עם הלוואה soft-deleted', async () => {
    // יצירת הלוואה
    const loanId = (await loansService.create({
      borrower_id: borrowerId,
      fund_id: fundId,
      amount: 2000,
      loan_date: '2026-01-25',
      loan_type: 'flexible',
      is_recurring: 0,
      auto_repayment: 0
    } as any)).lastInsertRowid
    
    // מחיקה רכה של ההלוואה
    await loansService.delete(loanId)
    
    const loan = await loansService.getById(loanId)
    expect(loan).toBeNull()  // ← לא מוחזר ב-getById (soft deleted)
    
    // ניסיון למחוק את הקופה - צריך להיחסם
    await expect(
      fundsService.delete(fundId)
    ).rejects.toThrow('לא ניתן למחוק קופה עם הלוואות')
  })

  it('ניתן למחוק קופה ללא רשומות כלל', async () => {
    await expect(
      fundsService.delete(fundId)
    ).resolves.not.toThrow()
    
    const fund = await fundsService.getById(fundId)
    expect(fund).toBeNull()
  })
})
```

**Verify**: `npm test -- softDeletedLoanBlocksFundDeletion.test.ts`

---

## סיכום וסדר ביצוע

### סדר הביצוע המומלץ:

1. **סעיף 1** (ייבוא/גיבוי) - 3-4 שעות
   - 1.1 + 1.2 + 1.3
   - קריטי לתקינות נתונים

2. **סעיף 2** (TypeScript) - 1 שעה
   - תיקון טיפוסים
   - הרצת build

3. **סעיף 6** (fundsService) - 2-3 שעות
   - תיקוני וולידציות
   - בסיס לכל השאר

4. **סעיף 5** (מיגרציה) - 1-2 שעות
   - ניקוי localStorage

5. **סעיף 3** (שינוי קופה) - 2 שעות
   - changeFund logic

6. **סעיף 4** (דשבורד) - 2-3 שעות
   - UI + סטטיסטיקות

7. **סעיף 7** (השלמות UI) - 3-4 שעות
   - בורר קופה, אזהרות, העברות

8. **סעיף 8** (בדיקות) - 2-3 שעות
   - 3 קבצי test חדשים

**סה"כ זמן משוער**: 16-22 שעות

### בדיקה סופית:

```bash
# קומפילציה
npm run build

# כל הבדיקות
npm test

# בדיקה ויזואלית
npm run dev
```

### קבצים ששונו (רשימה חלקית):

- `src/services/fullBackupService.ts`
- `src/services/fundsIntegrity.ts` (חדש)
- `src/services/database.ts`
- `src/services/migrations/fundsMigration.ts`
- `src/components/loans/LoansTab.tsx`
- `src/components/funds/FundSelector.tsx` (חדש)
- `src/pages/Dashboard.tsx`
- `src/pages/AdvancedTools.tsx`
- 8+ קבצי test חדשים

---

**תוכנית זו מוכנה ליישום מלא.**
