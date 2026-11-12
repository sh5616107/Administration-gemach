/**
 * derivedSchema.ts
 * ----------------
 * מבנה v2: עמודות נגזרות ואינדקסים מעל עמודת ה-JSON (data), כדי שיהיה אפשר לסנן, לסכם
 * ולמיין ב-SQL בלי לשנות את דרך השמירה.
 *
 * למה בטוח:
 *  - כל העמודות החדשות הן VIRTUAL GENERATED: SQLite מחשב אותן מתוך data בכל קריאה
 *    (json_extract). אין בהן נתונים משלהן, ולכן אי אפשר שיהיו לא עקביות ל-JSON, והן לא
 *    מנופחות בקובץ. JSON נשאר מקור האמת היחיד (עיקרון 1 ב-sqliteSnapshot.ts).
 *  - קוד הכתיבה (INSERT/UPDATE של id, data) והקריאה (SELECT id, data) לא משתנה.
 *  - רק האינדקסים תופסים מקום בקובץ, והם מתעדכנים אוטומטית עם כל כתיבה.
 *
 * כללים לעמודות:
 *  - מזהים (borrower_id, loan_id ...) הם TEXT: ערך מספרי ישן ב-JSON (למשל 5) הופך ל-'5',
 *    כך שהשוואה למפתח הטקסטואלי של הרשומה עובדת בכל מקרה.
 *  - תאריכים נשמרים כמחרוזת ISO (YYYY-MM-DD...), לכן מיון/טווח לפי TEXT נכון.
 *  - is_deleted הוא תמיד 0/1 (שדה חסר = 0), בדיוק כמו `!x.is_deleted` בקוד.
 *  - ערך חסר/null ב-JSON הוא NULL בעמודה.
 *
 * הוספת עמודה או אינדקס בעתיד = גרסת מבנה חדשה + שלב ב-SCHEMA_MIGRATIONS (ולא עריכה
 * של הרשימה כאן בלבד: מסד קיים לא ישתנה).
 */

import type { Database } from 'sql.js'

export type DerivedColumnType = 'TEXT' | 'REAL' | 'INTEGER'

export interface DerivedColumn {
  name: string
  type: DerivedColumnType
  /** שם השדה ברשומה (מפתח ברמה העליונה של ה-JSON) */
  field: string
  /** true: שדה בוליאני/חסר ← 0/1 (COALESCE ל-0) */
  flag?: boolean
}

export interface DerivedTable {
  columns: DerivedColumn[]
  /** כל איבר = אינדקס אחד (רשימת עמודות) */
  indexes: string[][]
}

const text = (name: string, field: string = name): DerivedColumn => ({ name, type: 'TEXT', field })
const real = (name: string, field: string = name): DerivedColumn => ({ name, type: 'REAL', field })
const deleted: DerivedColumn = { name: 'is_deleted', type: 'INTEGER', field: 'is_deleted', flag: true }

/** שם הטבלה (כפי שב-STORE_TABLES) -> עמודות ואינדקסים */
export const DERIVED_TABLES: Readonly<Record<string, DerivedTable>> = {
  borrowers: {
    columns: [text('first_name'), text('last_name'), text('id_number'), text('phone'), deleted],
    indexes: [['id_number']],
  },
  loans: {
    columns: [
      text('borrower_id'),
      text('fund_id'),
      real('amount'),
      text('loan_date'),
      text('due_date'),
      text('status'),
      text('recurring_series_id'),
      deleted,
    ],
    indexes: [['borrower_id'], ['fund_id'], ['status'], ['loan_date'], ['due_date'], ['recurring_series_id']],
  },
  repayments: {
    columns: [text('loan_id'), real('amount'), text('payment_date'), deleted],
    indexes: [['loan_id'], ['payment_date']],
  },
  deposits: {
    columns: [
      text('depositor_id'),
      text('fund_id'),
      real('amount'),
      text('deposit_date'),
      text('due_date'),
      text('status'),
      text('recurring_series_id'),
      deleted,
    ],
    indexes: [['depositor_id'], ['fund_id'], ['status'], ['due_date']],
  },
  deposit_withdrawals: {
    columns: [text('deposit_id'), real('amount'), text('withdrawal_date'), deleted],
    indexes: [['deposit_id']],
  },
  donations: {
    columns: [text('donor_id'), text('fund_id'), real('amount'), text('donation_date'), deleted],
    indexes: [['donor_id'], ['donation_date']],
  },
  expenses: {
    columns: [
      text('fund_id'),
      real('amount'),
      text('expense_date'),
      text('category'),
      text('paid_by'),
      text('borrower_id'),
      deleted,
    ],
    indexes: [['expense_date'], ['fund_id']],
  },
  fee_payments: {
    columns: [
      text('borrower_id'),
      text('loan_id'),
      real('amount'),
      text('payment_date'),
      text('status'),
      deleted,
    ],
    indexes: [['borrower_id'], ['loan_id']],
  },
}

function quote(name: string): string {
  return `"${name}"`
}

/** שם אינדקס יציב: idx_<table>_<col1>_<col2> */
export function indexName(table: string, columns: string[]): string {
  return `idx_${table}_${columns.join('_')}`
}

function columnDefinition(col: DerivedColumn): string {
  const path = `json_extract(data, '$.${col.field}')`
  const expr = col.flag ? `COALESCE(${path}, 0)` : path
  return `${quote(col.name)} ${col.type} GENERATED ALWAYS AS (${expr}) VIRTUAL`
}

/** שמות כל העמודות (כולל נגזרות/מוסתרות) של טבלה */
function existingColumns(db: Database, table: string): Set<string> {
  const names = new Set<string>()
  const stmt = db.prepare(`PRAGMA table_xinfo(${quote(table)})`)
  try {
    while (stmt.step()) names.add(String(stmt.get()[1]))
  } finally {
    stmt.free()
  }
  return names
}

/**
 * מוסיף את העמודות הנגזרות והאינדקסים. בטוח להרצה חוזרת (מדלג על מה שכבר קיים).
 * לא פותח טרנזקציה: הקורא (createSchema / upgradeSchema) אחראי לה, כדי שכישלון באמצע
 * יבטל הכול.
 */
export function applyDerivedSchema(db: Database): void {
  for (const [table, def] of Object.entries(DERIVED_TABLES)) {
    const have = existingColumns(db, table)
    if (have.size === 0) throw new Error(`הטבלה "${table}" לא קיימת - אי אפשר להוסיף עמודות נגזרות`)
    for (const col of def.columns) {
      if (have.has(col.name)) continue
      db.run(`ALTER TABLE ${quote(table)} ADD COLUMN ${columnDefinition(col)}`)
    }
    for (const cols of def.indexes) {
      db.run(
        `CREATE INDEX IF NOT EXISTS ${quote(indexName(table, cols))} ON ${quote(table)} (${cols
          .map(quote)
          .join(', ')})`
      )
    }
  }
}

/**
 * בודק שכל העמודות הנגזרות והאינדקסים קיימים. מחזיר רשימת חוסרים (ריקה = תקין).
 * לא נקרא אוטומטית בטעינה; מיועד לבדיקות ולכלי אבחון.
 */
export function listMissingDerivedSchema(db: Database): string[] {
  const missing: string[] = []
  for (const [table, def] of Object.entries(DERIVED_TABLES)) {
    const have = existingColumns(db, table)
    for (const col of def.columns) {
      if (!have.has(col.name)) missing.push(`${table}.${col.name}`)
    }
    for (const cols of def.indexes) {
      const name = indexName(table, cols)
      const rows = db.exec(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = '${name}'`)
      if (rows.length === 0) missing.push(`index ${name}`)
    }
  }
  return missing
}
