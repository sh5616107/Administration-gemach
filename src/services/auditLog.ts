/**
 * Audit Log - מעקב אחר פעולות פיננסיות קריטיות
 * 
 * מטרה: לתעד מי עשה מה ומתי בפעולות כספיות
 * גרסה מינימלית: כיסוי רק writes פיננסיים (הלוואות, פירעונות, הפקדות/משיכות)
 */

import { db } from './database'
import { commitData } from './database'
import logger from '../utils/logger'

/**
 * סוג פעולה שנרשמת ב-audit log
 */
export type AuditAction = 
  | 'loan_create' 
  | 'loan_update' 
  | 'loan_delete'
  | 'repayment_create' 
  | 'repayment_update' 
  | 'repayment_delete'
  | 'deposit_create'
  | 'deposit_update'
  | 'deposit_delete'
  | 'deposit_withdraw'
  | 'donation_create'
  | 'donation_update'
  | 'donation_delete'

/**
 * רשומת audit
 */
export interface AuditEntry {
  id: string
  timestamp: string // ISO 8601
  action: AuditAction
  entity_type: 'loan' | 'repayment' | 'deposit' | 'donation'
  entity_id: string
  actor: string // כרגע 'system', בעתיד ניתן להוסיף user_id
  before?: any // מצב לפני השינוי (JSON)
  after?: any // מצב אחרי השינוי (JSON)
  metadata?: any // מידע נוסף (סיבה, הערות, וכו')
}

/**
 * רישום פעולה ב-audit log
 * 
 * @param action - סוג הפעולה
 * @param entityType - סוג הישות
 * @param entityId - ID של הישות
 * @param options - אופציות נוספות (before, after, metadata)
 */
export async function logAudit(
  action: AuditAction,
  entityType: AuditEntry['entity_type'],
  entityId: string,
  options?: {
    before?: any
    after?: any
    metadata?: any
    actor?: string
  }
): Promise<void> {
  try {
    const entry: AuditEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      entity_type: entityType,
      entity_id: entityId,
      actor: options?.actor || 'system',
      before: options?.before,
      after: options?.after,
      metadata: options?.metadata
    }
    
    // שמירה ב-database
    await db.run(
      `INSERT INTO audit_log (id, timestamp, action, entity_type, entity_id, actor, before_data, after_data, metadata) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.timestamp,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.actor,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null
      ]
    )
    
    logger.info(`[AUDIT] ${action} on ${entityType}/${entityId} by ${entry.actor}`)
    
  } catch (error) {
    // Audit log לא צריך לגרום לכשל של הפעולה העסקית
    logger.error('[AUDIT] Failed to log audit entry:', error)
  }
}

/**
 * קבלת רשומות audit לפי entity
 */
export async function getAuditLog(
  entityType: AuditEntry['entity_type'],
  entityId: string
): Promise<AuditEntry[]> {
  try {
    const rows = await db.query(
      `SELECT * FROM audit_log 
       WHERE entity_type = ? AND entity_id = ? 
       ORDER BY timestamp DESC`,
      [entityType, entityId]
    ) as any[]
    
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      actor: row.actor,
      before: row.before_data ? JSON.parse(row.before_data) : undefined,
      after: row.after_data ? JSON.parse(row.after_data) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  } catch (error) {
    logger.error('[AUDIT] Failed to retrieve audit log:', error)
    return []
  }
}

/**
 * קבלת כל רשומות ה-audit (מוגבל ל-1000 אחרונות)
 */
export async function getAllAuditLogs(limit: number = 1000): Promise<AuditEntry[]> {
  try {
    const rows = await db.query(
      `SELECT * FROM audit_log 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [limit]
    ) as any[]
    
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      actor: row.actor,
      before: row.before_data ? JSON.parse(row.before_data) : undefined,
      after: row.after_data ? JSON.parse(row.after_data) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  } catch (error) {
    logger.error('[AUDIT] Failed to retrieve all audit logs:', error)
    return []
  }
}

/**
 * פונקציות עזר - רישום מהיר לפעולות נפוצות
 */

export async function logLoanCreate(loanId: string, loanData: any): Promise<void> {
  await logAudit('loan_create', 'loan', loanId, { after: loanData })
}

export async function logLoanUpdate(loanId: string, before: any, after: any): Promise<void> {
  await logAudit('loan_update', 'loan', loanId, { before, after })
}

export async function logLoanDelete(loanId: string, loanData: any): Promise<void> {
  await logAudit('loan_delete', 'loan', loanId, { before: loanData })
}

export async function logRepaymentCreate(repaymentId: string, repaymentData: any): Promise<void> {
  await logAudit('repayment_create', 'repayment', repaymentId, { after: repaymentData })
}

export async function logRepaymentUpdate(repaymentId: string, before: any, after: any): Promise<void> {
  await logAudit('repayment_update', 'repayment', repaymentId, { before, after })
}

export async function logRepaymentDelete(repaymentId: string, repaymentData: any): Promise<void> {
  await logAudit('repayment_delete', 'repayment', repaymentId, { before: repaymentData })
}

export async function logDepositCreate(depositId: string, depositData: any): Promise<void> {
  await logAudit('deposit_create', 'deposit', depositId, { after: depositData })
}

export async function logDepositWithdraw(depositId: string, withdrawalAmount: number): Promise<void> {
  await logAudit('deposit_withdraw', 'deposit', depositId, { 
    metadata: { withdrawal_amount: withdrawalAmount } 
  })
}

export async function logDonationCreate(donationId: string, donationData: any): Promise<void> {
  await logAudit('donation_create', 'donation', donationId, { after: donationData })
}
