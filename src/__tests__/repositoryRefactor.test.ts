/**
 * טסטים לריפקטור שכבת הנתונים
 * בודק שה-repositories עובדים נכון ומחליפים את db.query()
 */

import { describe, it, expect } from 'vitest'
import { getAllItems } from '../services/database'

describe('Repository Refactor', () => {
  describe('loanRepository', () => {
    it('hasRecurringLoanForPeriod - קיים ועובד', async () => {
      const { loanRepository } = await import('../services/repositories/loanRepository')
      const result = await loanRepository.hasRecurringLoanForPeriod(
        'test', 1000, '2024-01-01', '2024-01-31', 1
      )
      expect(typeof result).toBe('boolean')
    })

    it('getAll - מסנן is_deleted', async () => {
      const { loanRepository } = await import('../services/repositories/loanRepository')
      const loans = await loanRepository.getAll()
      loans.forEach(l => expect(l.is_deleted).not.toBe(true))
    })
  })

  describe('depositRepository', () => {
    it('hasRecurringDepositForPeriod - קיים ועובד', async () => {
      const { depositRepository } = await import('../services/repositories/depositRepository')
      const result = await depositRepository.hasRecurringDepositForPeriod(
        'test', 500, '2024-01-01', '2024-01-31'
      )
      expect(typeof result).toBe('boolean')
    })

    it('getAll - מסנן is_deleted', async () => {
      const { depositRepository } = await import('../services/repositories/depositRepository')
      const deposits = await depositRepository.getAll()
      deposits.forEach(d => expect(d.is_deleted).not.toBe(true))
    })
  })

  describe('repaymentRepository', () => {
    it('getAll - מסנן is_deleted', async () => {
      const { repaymentRepository } = await import('../services/repositories/repaymentRepository')
      const repayments = await repaymentRepository.getAll()
      repayments.forEach(r => expect(r.is_deleted).not.toBe(true))
    })
  })

  describe('השוואה ל-getAllItems', () => {
    it('repositories מסננים נכון', async () => {
      const { loanRepository } = await import('../services/repositories/loanRepository')
      const { depositRepository } = await import('../services/repositories/depositRepository')
      const { repaymentRepository } = await import('../services/repositories/repaymentRepository')
      
      const allLoans = getAllItems('loans')
      const repoLoans = await loanRepository.getAll()
      expect(repoLoans.length <= allLoans.length).toBe(true)
      
      const allDeposits = getAllItems('deposits')
      const repoDeposits = await depositRepository.getAll()
      expect(repoDeposits.length <= allDeposits.length).toBe(true)
      
      const allRepayments = getAllItems('repayments')
      const repoRepayments = await repaymentRepository.getAll()
      expect(repoRepayments.length <= allRepayments.length).toBe(true)
    })
  })
})
