import { commitData, fundsService, getAllItems, setItem } from '../database'
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

    // שלב 2: מיגרציה
    await runMigration()

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
    const data = await loadAppData()
    const backupKey = `gemach_backup_pre_funds_migration_${Date.now()}`
    localStorage.setItem(backupKey, JSON.stringify(data))
    
    logger.info('✅ Backup created:', backupKey)
  } catch (error) {
    throw new Error('נכשל ביצירת גיבוי לפני מיגרציה: ' + (error as Error).message)
  }
}

async function runMigration(): Promise<void> {
  logger.info('⚙️ Running migration...')

  // טעינת נתונים קיימים לתוך ה-store הפנימי
  const storedData = await loadAppData()
  if (storedData) {
    const { importAllData } = await import('../database')
    await importAllData(storedData)
  }

  // קבלת/יצירת קופת ברירת מחדל
  const defaultFund = await getOrCreateDefaultFund()
  
  // עדכון מרוכז - ללא לולאה
  const tables = ['loans', 'donations', 'deposits', 'expenses'] as const
  
  for (const table of tables) {
    const count = await updateTableFundId(table, defaultFund.id)
    logger.info(`  ✓ Updated ${count} records in ${table}`)
  }

  // שמירת שינויים
  await commitData()
  logger.info('✅ Migration transaction committed')
}

async function getOrCreateDefaultFund(): Promise<{ id: string; name: string }> {
  try {
    // נסה לקבל קופת ברירת מחדל קיימת
    const defaultFund = await fundsService.getDefault()
    logger.info('  ✓ Found existing default fund:', defaultFund.name)
    return { id: defaultFund.id, name: defaultFund.name }
  } catch {
    // אין קופת ברירת מחדל - צור חדשה
    logger.info('  ℹ No default fund found, creating one...')
    
    const result = await fundsService.create({
      name: 'קופה ראשית',
      description: 'קופת ברירת המחדל',
      is_default: true,
      is_active: true,
    })
    
    logger.info('  ✓ Created new default fund')
    return { id: result.id, name: 'קופה ראשית' }
  }
}

async function updateTableFundId(tableName: 'loans' | 'donations' | 'deposits' | 'expenses', fundId: string): Promise<number> {
  const items = getAllItems<any>(tableName)
  let count = 0

  for (const item of items) {
    // בדיקה אם השדה fund_id לא קיים או undefined
    if (item.fund_id === undefined || item.fund_id === null) {
      setItem(tableName as any, item.id, { ...item, fund_id: fundId })
      count++
    }
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
