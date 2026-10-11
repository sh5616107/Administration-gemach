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
