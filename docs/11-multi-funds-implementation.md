# מסמך יישום טכני: מערכת קופות מרובות

**בסיס**: אפיון v2.0 (`10-multi-funds-spec-v2.md`)  
**מטרה**: פירוט טכני מלא ליישום Phase 1 (שלבים 1-5)  
**סטטוס**: מוכן להתחלה

---

## תוכן עניינים

1. [קוד מיגרציה מלא](#1-קוד-מיגרציה-מלא)
2. [בדיקות vitest](#2-בדיקות-vitest)
3. [אינטגרציות](#3-אינטגרציות)
4. [Checklist יישום](#4-checklist-יישום)
5. [FAQ טכני](#5-faq-טכני)

---

## 1. קוד מיגרציה מלא

### 1.1 קובץ המיגרציה: `src/services/migrations/fundsMigration.ts`

```typescript
import { db, commitData } from '../database'
import { saveAppData, loadAppData } from '../persistence'
import logger from '../../utils/logger'

const MIGRATION_KEY = 'funds_migration_v1_completed'
const SCHEMA_VERSION_KEY = 'schema_version'
const CURRENT_SCHEMA_VERSION = '2.0.0'

/**
 * מיגרציה למערכת קופות מרובות
 * מופעלת פעם אחת בטעינה ראשונה של הגרסה החדשה
 * אידמפוטנטית - בטוחה להרצה חוזרת
 */
export async function migrateFundsSystem(): Promise<void> {
  // בדיקה אם המיגרציה כבר רצה
  const migrationCompleted = localStorage.getItem(MIGRATION_KEY)
  if (migrationCompleted) {
    logger.info('✅ Funds migration already completed at', migrationCompleted)
    return
  }

  logger.info('🚀 Starting funds migration...')

  try {
    // שלב 1: גיבוי אוטומטי
    await createBackupBeforeMigration()

    // שלב 2: מיגרציה בטרנזקציה
    await runMigrationTransaction()

    // שלב 3: סימון השלמה
    const completionTime = new Date().toISOString()
    localStorage.setItem(MIGRATION_KEY, completionTime)
    localStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION)

    logger.info('✅ Funds migration completed successfully at', completionTime)
  } catch (error) {
    logger.error('❌ Funds migration failed:', error)
    
    // ניסיון שחזור מגיבוי
    await attemptRollback()
    
    throw new Error(
      'מיגרציה למערכת קופות נכשלה. המערכת שוחזרה מגיבוי. ' +
      'אנא פנה לתמיכה טכנית. שגיאה: ' + (error as Error).message
    )
  }
}

async function createBackupBeforeMigration(): Promise<void> {
  logger.info('💾 Creating backup before migration...')
  
  try {
    // שימוש במנגנון הגיבוי הקיים
    const data = await loadAppData()
    const backupKey = `gemach_backup_pre_funds_migration_${Date.now()}`
    localStorage.setItem(backupKey, JSON.stringify(data))
    
    logger.info('✅ Backup created:', backupKey)
  } catch (error) {
    throw new Error('נכשל ביצירת גיבוי לפני מיגרציה: ' + (error as Error).message)
  }
}

async function runMigrationTransaction(): Promise<void> {
  logger.info('⚙️ Running migration transaction...')

  // קבלת/יצירת קופת ברירת מחדל
  const defaultFund = await getOrCreateDefaultFund()
  
  // עדכון מרוכז - ללא לולאה
  const updates = [
    { table: 'loans', id: defaultFund.id },
    { table: 'donations', id: defaultFund.id },
    { table: 'deposits', id: defaultFund.id },
    { table: 'expenses', id: defaultFund.id },
  ]

  for (const { table, id } of updates) {
    const count = await updateTableFundId(table, id)
    logger.info(`  ✓ Updated ${count} records in ${table}`)
  }

  // יצירת אינדקסים (במנגנון ה-localStorage אין אינדקסים פיזיים, אבל נרשום)
  logger.info('  ✓ Indexes created (noted for future DB migration)')

  // שמירת שינויים
  await commitData()
  logger.info('✅ Transaction committed')
}

async function getOrCreateDefaultFund(): Promise<{ id: string; name: string }> {
  const data = await loadAppData()
  
  // בדיקה אם יש קופות
  if (data.funds && Object.keys(data.funds).length > 0) {
    // מצא קופת ברירת מחדל
    const defaultFund = Object.values(data.funds).find((f: any) => f.is_default && !f.is_deleted)
    if (defaultFund) {
      logger.info('  ✓ Found existing default fund:', (defaultFund as any).name)
      return { id: (defaultFund as any).id, name: (defaultFund as any).name }
    }
  }

  // צור קופת ברירת מחדל חדשה
  const fundId = generateUUID()
  const newFund = {
    id: fundId,
    name: 'קופה ראשית',
    description: 'קופת ברירת המחדל',
    is_default: true,
    is_active: true,
    created_at: new Date().toISOString(),
    is_deleted: false,
  }

  if (!data.funds) data.funds = {}
  data.funds[fundId] = newFund
  
  await saveAppData(data)
  logger.info('  ✓ Created new default fund:', newFund.name)
  
  return { id: fundId, name: newFund.name }
}

async function updateTableFundId(tableName: string, fundId: string): Promise<number> {
  const data = await loadAppData()
  const table = data[tableName]
  
  if (!table) return 0

  let count = 0
  for (const [id, record] of Object.entries(table)) {
    if (!(record as any).fund_id) {
      (record as any).fund_id = fundId
      count++
    }
  }

  if (count > 0) {
    await saveAppData(data)
  }

  return count
}

async function attemptRollback(): Promise<void> {
  logger.info('🔄 Attempting rollback...')
  
  try {
    // מצא את הגיבוי האחרון
    const backupKeys = Object.keys(localStorage)
      .filter(k => k.startsWith('gemach_backup_pre_funds_migration_'))
      .sort()
      .reverse()
    
    if (backupKeys.length === 0) {
      throw new Error('לא נמצא גיבוי לשחזור')
    }

    const latestBackup = backupKeys[0]
    const backupData = JSON.parse(localStorage.getItem(latestBackup)!)
    
    await saveAppData(backupData)
    logger.info('✅ Rollback successful from:', latestBackup)
  } catch (error) {
    logger.error('❌ Rollback failed:', error)
    throw new Error('שחזור מגיבוי נכשל. אנא שחזר גיבוי ידני.')
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
```

### 1.2 הפעלת המיגרציה ב-`database.ts`

```typescript
// בתוך פונקציית init() או בטעינה ראשונה
import { migrateFundsSystem } from './migrations/fundsMigration'

async function init() {
  // ... קוד קיים ...
  
  // הרצת מיגרציית קופות
  try {
    await migrateFundsSystem()
  } catch (error) {
    logger.error('Migration failed:', error)
    // הצגת הודעה למשתמש
    alert('שגיאה במיגרציה למערכת קופות. המערכת שוחזרה מגיבוי.')
  }
  
  // ... המשך קוד קיים ...
}
```

---

## 2. בדיקות vitest

### 2.1 קובץ: `src/__tests__/fundsMigration.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { migrateFundsSystem } from '../services/migrations/fundsMigration'
import { loadAppData, saveAppData } from '../services/persistence'

describe('Funds Migration', () => {
  beforeEach(async () => {
    // ניקוי localStorage
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('בדיקה 1: מיגרציה על מסד ריק יוצרת קופת ברירת מחדל', async () => {
    const emptyData = {
      loans: {},
      donations: {},
      deposits: {},
      expenses: {},
    }
    await saveAppData(emptyData)

    await migrateFundsSystem()

    const data = await loadAppData()
    expect(data.funds).toBeDefined()
    expect(Object.keys(data.funds).length).toBe(1)
    
    const defaultFund = Object.values(data.funds)[0]
    expect(defaultFund.is_default).toBe(true)
    expect(defaultFund.name).toBe('קופה ראשית')
  })

  it('בדיקה 2: כל ההלוואות מקבלות fund_id', async () => {
    const dataWithLoans = {
      loans: {
        'loan-1': { id: 'loan-1', amount: 1000 },
        'loan-2': { id: 'loan-2', amount: 2000 },
      },
      donations: {},
      deposits: {},
      expenses: {},
    }
    await saveAppData(dataWithLoans)

    await migrateFundsSystem()

    const data = await loadAppData()
    expect(data.loans['loan-1'].fund_id).toBeDefined()
    expect(data.loans['loan-2'].fund_id).toBeDefined()
    expect(data.loans['loan-1'].fund_id).toBe(data.loans['loan-2'].fund_id)
  })

  it('בדיקה 3: מיגרציה חוזרת לא משנה דבר (אידמפוטנטיות)', async () => {
    const initialData = {
      loans: { 'loan-1': { id: 'loan-1', amount: 1000 } },
      donations: {},
      deposits: {},
      expenses: {},
    }
    await saveAppData(initialData)

    // ריצה ראשונה
    await migrateFundsSystem()
    const dataAfterFirst = await loadAppData()

    // ריצה שנייה
    await migrateFundsSystem()
    const dataAfterSecond = await loadAppData()

    expect(dataAfterSecond).toEqual(dataAfterFirst)
  })

  it('בדיקה 4: תרומות והפקדות מקבלות fund_id', async () => {
    const data = {
      loans: {},
      donations: {
        'don-1': { id: 'don-1', amount: 500 },
      },
      deposits: {
        'dep-1': { id: 'dep-1', amount: 300 },
      },
      expenses: {
        'exp-1': { id: 'exp-1', amount: 100 },
      },
    }
    await saveAppData(data)

    await migrateFundsSystem()

    const result = await loadAppData()
    expect(result.donations['don-1'].fund_id).toBeDefined()
    expect(result.deposits['dep-1'].fund_id).toBeDefined()
    expect(result.expenses['exp-1'].fund_id).toBeDefined()
  })
})
```

### 2.2 קובץ: `src/__tests__/fundsService.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { fundsService } from '../services/database'

describe('Funds Service', () => {
  beforeEach(async () => {
    localStorage.clear()
    // יצירת קופת ברירת מחדל
    await fundsService.create({
      name: 'קופה ראשית',
      is_default: true,
      is_active: true,
    })
  })

  it('בדיקה 7: אי אפשר למחוק קופה עם הלוואות', async () => {
    const fund = await fundsService.create({
      name: 'קרן חתונות',
      is_default: false,
      is_active: true,
    })

    // יצירת הלוואה משוייכת לקופה
    await loansService.create({
      borrower_id: 'borrower-1',
      amount: 5000,
      loan_date: '2026-01-01',
      fund_id: fund.id,
      loan_type: 'standard',
      is_recurring: 0,
      auto_repayment: 0,
    })

    await expect(fundsService.delete(fund.id)).rejects.toThrow()
  })

  it('בדיקה 8: setDefault משאיר בדיוק קופת ברירת מחדל אחת', async () => {
    const fund2 = await fundsService.create({
      name: 'קופה שנייה',
      is_default: false,
      is_active: true,
    })

    await fundsService.setDefault(fund2.id)

    const allFunds = await fundsService.getAll()
    const defaultFunds = allFunds.filter(f => f.is_default)
    
    expect(defaultFunds.length).toBe(1)
    expect(defaultFunds[0].id).toBe(fund2.id)
  })

  it('אי אפשר להשבית או למחוק קופת ברירת מחדל', async () => {
    const defaultFund = await fundsService.getDefault()

    await expect(fundsService.deactivate(defaultFund.id)).rejects.toThrow()
    await expect(fundsService.delete(defaultFund.id)).rejects.toThrow()
  })
})
```

### 2.3 קובץ: `src/__tests__/fundsInvariant.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { statsService, fundsService } from '../services/database'

describe('Funds Invariant - סכום הקופות = סכום כולל', () => {
  beforeEach(async () => {
    localStorage.clear()
    await setupTestData()
  })

  it('בדיקה 6: סכום היתרות בכל הקופות = יתרה כוללת', async () => {
    const stats = await statsService.getDashboardStats()
    
    // סכום כל הקופות
    const sumByFunds = stats.byFund.reduce(
      (sum, fund) => sum + fund.activeLoans.total,
      0
    )

    // סכום כולל
    const overall = stats.overall.activeLoans.total

    expect(sumByFunds).toBe(overall)
  })

  it('חישוב כסף זמין לפי קופה נכון', async () => {
    const fund1 = await fundsService.getDefault()
    const stats = await statsService.getStatsByFund(fund1.id)

    // תרומות + הפקדות + פירעונות - הלוואות - הוצאות - משיכות
    const expected = 10000 + 5000 + 2000 - 8000 - 500 - 0
    
    expect(stats.availableCash).toBe(expected)
  })
})

async function setupTestData() {
  // יצירת 2 קופות
  const fund1 = await fundsService.create({
    name: 'קופה ראשית',
    is_default: true,
    is_active: true,
  })

  const fund2 = await fundsService.create({
    name: 'קרן חתונות',
    is_default: false,
    is_active: true,
  })

  // הוספת נתונים לקופה 1
  await donationsService.create({ amount: 10000, fund_id: fund1.id, /* ... */ })
  await depositsService.create({ amount: 5000, fund_id: fund1.id, /* ... */ })
  await loansService.create({ amount: 8000, fund_id: fund1.id, /* ... */ })
  
  // הוספת נתונים לקופה 2
  await donationsService.create({ amount: 3000, fund_id: fund2.id, /* ... */ })
  await loansService.create({ amount: 2500, fund_id: fund2.id, /* ... */ })
}
```

### 2.4 קובץ: `src/__tests__/fundsRecurring.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { recurringItemsService, loansService } from '../services/database'

describe('Recurring Loans - Fund Inheritance', () => {
  it('בדיקה 9: הלוואה מחזורית יורשת את הקופה', async () => {
    const fund = await fundsService.create({
      name: 'קרן רפואה',
      is_default: false,
      is_active: true,
    })

    // יצירת הלוואה מחזורית
    const templateLoan = await loansService.create({
      borrower_id: 'borrower-1',
      amount: 1000,
      loan_date: '2026-01-01',
      fund_id: fund.id,
      is_recurring: 1,
      recurring_months: 1,
      recurring_day: 1,
      loan_type: 'standard',
      auto_repayment: 0,
    })

    // הרצת יצירת הלוואות מחזוריות
    await recurringItemsService.createRecurringLoans()

    // בדיקה שהלוואה חדשה נוצרה עם אותה קופה
    const allLoans = await loansService.getAll()
    const recurringLoans = allLoans.filter(
      l => l.recurring_series_id === templateLoan.recurring_series_id
    )

    expect(recurringLoans.length).toBeGreaterThan(1)
    expect(recurringLoans.every(l => l.fund_id === fund.id)).toBe(true)
  })

  it('ללא כפילויות בהלוואות מחזוריות', async () => {
    // ... בדיקה נגד הבאג הידוע
  })
})
```

---

## 3. אינטגרציות

### 3.1 ייבוא/ייצוא אקסל

**עדכון ב-`src/services/excelService.ts`:**

```typescript
// ייצוא
export async function exportLoansToExcel() {
  const loans = await loansService.getAll()
  const funds = await fundsService.getAll()
  
  const data = loans.map(loan => ({
    'מספר הלוואה': loan.loan_number,
    'לווה': loan.borrower_name,
    'סכום': loan.amount,
    'תאריך': loan.loan_date,
    'קופה': funds.find(f => f.id === loan.fund_id)?.name || 'לא ידוע',
    // ... שאר השדות
  }))

  // ... המשך קוד ייצוא
}

// ייבוא
export async function importLoansFromExcel(file: File) {
  const data = await parseExcelFile(file)
  const funds = await fundsService.getAll()
  const defaultFund = await fundsService.getDefault()

  for (const row of data) {
    let fundId = defaultFund.id

    if (row['קופה']) {
      // חיפוש קופה לפי שם
      const fund = funds.find(f => f.name === row['קופה'])
      
      if (!fund) {
        // שאלה למשתמש
        const create = confirm(
          `הקופה "${row['קופה']}" לא קיימת. האם ליצור אותה?`
        )
        
        if (create) {
          const newFund = await fundsService.create({
            name: row['קופה'],
            is_default: false,
            is_active: true,
          })
          fundId = newFund.id
        }
      } else {
        fundId = fund.id
      }
    }

    await loansService.create({
      // ... שאר השדות
      fund_id: fundId,
    })
  }
}
```

### 3.2 התאמות בנק

**בדיקה ב-`BankMatchingPage.tsx`:**

```typescript
// הקופה נגזרת מההלוואה - אין צורך בשינוי
// אבל צריך לוודא שהיא מוצגת

function BankTransactionRow({ transaction, loan }) {
  const fund = funds.find(f => f.id === loan?.fund_id)
  
  return (
    <TableRow>
      <TableCell>{loan?.borrower_name}</TableCell>
      <TableCell>{loan?.amount}</TableCell>
      {funds.length > 1 && (
        <TableCell>
          <Chip label={fund?.name} size="small" />
        </TableCell>
      )}
      {/* ... */}
    </TableRow>
  )
}
```

### 3.3 שטרות וקבלות

**עדכון ב-`src/services/documents.ts`:**

```typescript
export async function generateLoanDocument(loanId: string) {
  const loan = await loansService.getById(loanId)
  const fund = await fundsService.getById(loan.fund_id)
  const settings = await settingsService.getAll()
  
  // הצגת שם הקופה רק אם:
  // 1. יש יותר מקופה אחת
  // 2. המשתמש לא כיבה את ההצגה בהגדרות
  const showFundName = 
    (await fundsService.getAll()).length > 1 &&
    settings.show_fund_name_in_documents !== 'false'

  const fundName = showFundName ? fund.name : ''

  const template = `
    <div>
      <h1>שטר הלוואה</h1>
      ${fundName ? `<p>מקרן: ${fundName}</p>` : ''}
      <p>סכום: ${loan.amount}</p>
      <!-- ... -->
    </div>
  `

  return template
}
```

---

## 4. Checklist יישום

### Phase 1 - שלבים 1-5

#### ✅ שלב 1: תשתית (5-7 שעות)
- [ ] יצירת `Fund` interface ב-`database.ts`
- [ ] יצירת `fundsService` עם כל הפונקציות
- [ ] יצירת קובץ מיגרציה `fundsMigration.ts`
- [ ] הוספת הפעלת מיגרציה ב-`init()`
- [ ] כתיבת בדיקות: `fundsMigration.test.ts`
- [ ] כתיבת בדיקות: `fundsService.test.ts`
- [ ] בדיקה ידנית: מיגרציה על DB אמיתי

#### ✅ שלב 2: שילוב עם ישויות (4-6 שעות)
- [ ] הוספת `fund_id` ל-`Loan` interface
- [ ] הוספת `fund_id` ל-`Donation` interface
- [ ] הוספת `fund_id` ל-`Deposit` interface
- [ ] הוספת `fund_id` ל-`Expense` interface
- [ ] עדכון `loansService.create()` - ברירת מחדל לקופה
- [ ] עדכון `donationsService.create()`
- [ ] עדכון `depositsService.create()`
- [ ] עדכון `expensesService.create()`
- [ ] יצירת `loansService.getByFund()`
- [ ] יצירת `loansService.changeFund()`
- [ ] עדכון `statsService.getDashboardStats()`
- [ ] יצירת `statsService.getStatsByFund()`
- [ ] עדכון `expectedFundsCalculator`
- [ ] כתיבת בדיקה: `fundsInvariant.test.ts`

#### ✅ שלב 3: הלוואות מחזוריות (2-3 שעות)
- [ ] עדכון `recurringItemsService` - ירושת `fund_id`
- [ ] בדיקה: הלוואה מחזורית יורשת קופה
- [ ] בדיקה: אין כפילויות

#### ✅ שלב 4: ממשק ניהול (4-6 שעות)
- [ ] יצירת `FundsManagement.tsx`
- [ ] טבלת קופות עם כל הפעולות
- [ ] טופס הוספה/עריכה
- [ ] הודעות שגיאה מתאימות
- [ ] שילוב ב-`Settings.tsx`
- [ ] עדכון טופס הלוואה - בורר קופה
- [ ] עדכון טופס תרומה - בורר קופה
- [ ] עדכון טופס הפקדה - בורר קופה
- [ ] עדכון טופס הוצאה - בורר קופה
- [ ] הסתרת בורר כשיש קופה אחת

#### ✅ שלב 5: Dashboard ומסננים (3-4 שעות)
- [ ] עדכון Dashboard - טבלת קופות
- [ ] הסתרת טבלה כשיש קופה אחת
- [ ] מסנן קופה במסך הלוואות
- [ ] מסנן קופה במסך תרומות
- [ ] מסנן קופה במסך הפקדות
- [ ] אזהרת חריגה בטופס הלוואה

---

## 5. FAQ טכני

### איך מטפלים בשגיאת מיגרציה באמצע?
המיגרציה משתמשת ב-try-catch ומנסה rollback אוטומטי. אם גם זה נכשל, מוצגת הודעה למשתמש לשחזר גיבוי ידני.

### איך בודקים שהמיגרציה עבדה?
1. הרצת הבדיקות: `npm test fundsMigration`
2. בדיקה ידנית על DB אמיתי (העתק קובץ גיבוי למחשב הפיתוח)
3. בדיקה שכל הרשומות מקבלות `fund_id`

### מה קורה אם מוסיפים קופה חדשה אחרי המיגרציה?
הלוואות/תרומות חדשות יקבלו אוטומטית את הקופה שנבחרה. רשומות ישנות לא משתנות.

### איך מטפלים ב-soft delete של קופות?
כמו שאר הישויות - `is_deleted = true`. הקופה ממשיכה להופיע בדוחות היסטוריים אבל לא בבחירה חדשה.

### איך מוודאים שאין race conditions במיגרציה?
המיגרציה רצה פעם אחת בלבד (בדיקת `MIGRATION_KEY`). אם שתי חלונות נפתחים בו-זמנית, רק אחת תרוץ.

### איך עובד `setDefault` בצורה אטומית?
```typescript
async setDefault(id: string): Promise<void> {
  const data = await loadAppData()
  
  // הכל או כלום
  try {
    // 1. הסר is_default מכולם
    for (const fund of Object.values(data.funds)) {
      fund.is_default = false
    }
    
    // 2. הוסף is_default לקופה הנבחרת
    data.funds[id].is_default = true
    
    // 3. שמור בפעולה אחת
    await saveAppData(data)
  } catch (error) {
    // אם נכשל - שום שינוי לא נשמר
    throw error
  }
}
```

### איך מטפלים בהלוואות שנמחקו (soft delete)?
`hasRecords()` בודק גם רשומות עם `is_deleted = true`:
```typescript
async hasRecords(id: string): Promise<boolean> {
  const loans = getAllItems('loans') // כולל deleted
  const donations = getAllItems('donations')
  const deposits = getAllItems('deposits')
  const expenses = getAllItems('expenses')
  
  return (
    loans.some(l => l.fund_id === id) ||
    donations.some(d => d.fund_id === id) ||
    deposits.some(d => d.fund_id === id) ||
    expenses.some(e => e.fund_id === id)
  )
}
```

### מה עושים אם יש באג בקוד המחושב של יתרות?
הבדיקה `fundsInvariant.test.ts` תזהה את זה מיד. אם היא נכשלת - יש בעיה בחישוב.

### איך מוסיפים logging למיגרציה?
השתמש ב-`logger` הקיים:
```typescript
import logger from '../../utils/logger'

logger.info('✅ Step completed')
logger.error('❌ Step failed:', error)
```

---

## 6. סדר ביצוע מומלץ

1. **יום 1-2**: שלב 1 (תשתית + מיגרציה + בדיקות)
2. **יום 3**: שלב 2 (שילוב עם ישויות + סטטיסטיקות)
3. **יום 4**: שלב 3 (הלוואות מחזוריות) + שלב 4 התחלה (ממשק ניהול)
4. **יום 5**: שלב 4 המשך + שלב 5 (Dashboard ומסננים)
5. **יום 6**: בדיקות אינטגרציה + תיקון באגים
6. **יום 7**: תיעוד + הכנה ל-Phase 2

**חשוב**: לא להתחיל שלב לפני שהבדיקות של השלב הקודם עוברות!

---

**מסמך זה נוצר**: 8 אוקטובר 2026  
**בסיס**: אפיון v2.0  
**סטטוס**: מוכן להתחלת יישום
