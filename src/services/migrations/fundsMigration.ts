import { commitData, exportAllData, fundsService, getAllItems, importAllData, setItem } from '../database'
import { saveAppData, loadAppData } from '../persistence'
import logger from '../../utils/logger'

const MIGRATION_KEY = 'funds_migration_v1_completed'
const SCHEMA_VERSION_KEY = 'schema_version'
const CURRENT_SCHEMA_VERSION = '2.0.0'

// עותק מלא של הנתונים שנלקח לפני המיגרציה. נשמר בזיכרון (לא ב-localStorage שמוגבל
// בגודל) ומשמש ל-rollback אמיתי אם המיגרציה נכשלת.
let preMigrationSnapshot: any | null = null

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
    // עותק מלא של הנתונים כפי שהם שמורים בדיסק (ואם אין - מהזיכרון), כדי שה-rollback
    // ישחזר את מצב האמת ולא יידרס בנתונים ריקים שנטענו עדיין.
    const persisted = await loadAppData()
    const source = persisted ?? await exportAllData()
    preMigrationSnapshot = JSON.parse(JSON.stringify(source))

    // סימון בלבד ב-localStorage (חותמת זמן) - העותק עצמו בזיכרון
    const backupKey = `gemach_backup_pre_funds_migration_${Date.now()}`
    localStorage.setItem(backupKey, new Date().toISOString())
    
    logger.info('✅ Backup created:', backupKey)
  } catch (error) {
    throw new Error('נכשל ביצירת גיבוי לפני מיגרציה: ' + (error as Error).message)
  }
}

async function runMigration(): Promise<void> {
  logger.info('⚙️ Running migration...')

  // טעינת נתונים מ-localStorage אם קיימים (לבדיקות)
  try {
    const savedData = await loadAppData()
    if (savedData) {
      // טעינה ל-data store
      const { importAllData } = await import('../database')
      await importAllData(savedData)
    }
  } catch (error) {
    logger.info('  ℹ No saved data to migrate')
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
    if (!preMigrationSnapshot) {
      throw new Error('לא נמצא גיבוי לשחזור')
    }

    // שחזור אמיתי: גם הדיסק וגם הזיכרון חוזרים למצב שלפני המיגרציה
    const snapshot = JSON.parse(JSON.stringify(preMigrationSnapshot))
    await saveAppData(snapshot)
    await importAllData(snapshot)
    await commitData()
    logger.info('✅ Rollback successful from in-memory snapshot')
  } catch (error) {
    logger.error('❌ Rollback failed:', error)
    throw new Error('שחזור מגיבוי נכשל. אנא שחזר גיבוי ידני.')
  }
}
