import { describe, it, expect, beforeEach } from 'vitest'
import { depositWithdrawalsService, exportAllData, importAllData } from '../services/database'

describe('Deposit Withdrawals Service', () => {
  beforeEach(async () => {
    // ניקוי נתונים לפני כל טסט
    const data = await exportAllData()
    data.depositWithdrawals = {}
    data.deposits = {}
    await importAllData(data)
  })

  describe('יצירת משיכה', () => {
    it('צריך ליצור משיכה חדשה בהצלחה', async () => {
      const result = await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-15',
        payment_method: 'cash',
        payment_details: '{}',
        notes: 'משיכה ראשונה'
      })

      expect(result.id).toBeDefined()
      expect(typeof result.id).toBe('string')

      const withdrawal = await depositWithdrawalsService.getById(result.id)
      expect(withdrawal).toBeDefined()
      expect(withdrawal?.amount).toBe(1000)
      expect(withdrawal?.deposit_id).toBe(1)
      expect(withdrawal?.withdrawal_date).toBe('2026-01-15')
    })

    it('צריך לשמור את כל הפרטים של המשיכה', async () => {
      const result = await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 5000,
        withdrawal_date: '2026-01-20',
        payment_method: 'transfer',
        payment_details: JSON.stringify({ bank: 'לאומי', account: '12345' }),
        notes: 'משיכה חלקית'
      })

      const withdrawal = await depositWithdrawalsService.getById(result.id)
      expect(withdrawal?.payment_method).toBe('transfer')
      expect(withdrawal?.notes).toBe('משיכה חלקית')
      expect(withdrawal?.created_at).toBeDefined()
    })
  })

  describe('שליפת משיכות', () => {
    it('צריך להחזיר את כל המשיכות של הפקדה', async () => {
      // יצירת 3 משיכות להפקדה 1
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-10',
        payment_method: 'cash'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2000,
        withdrawal_date: '2026-01-15',
        payment_method: 'transfer'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1500,
        withdrawal_date: '2026-01-20',
        payment_method: 'cash'
      })

      // משיכה להפקדה אחרת
      await depositWithdrawalsService.create({
        deposit_id: 2,
        amount: 3000,
        withdrawal_date: '2026-01-12',
        payment_method: 'check'
      })

      const withdrawals = await depositWithdrawalsService.getByDeposit(1)
      expect(withdrawals).toHaveLength(3)
      expect(withdrawals.every(w => w.deposit_id === 1)).toBe(true)
    })

    it('צריך למיין משיכות לפי תאריך (החדש ביותר ראשון)', async () => {
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-10'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2000,
        withdrawal_date: '2026-01-20'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1500,
        withdrawal_date: '2026-01-15'
      })

      const withdrawals = await depositWithdrawalsService.getByDeposit(1)
      expect(withdrawals[0].withdrawal_date).toBe('2026-01-20')
      expect(withdrawals[1].withdrawal_date).toBe('2026-01-15')
      expect(withdrawals[2].withdrawal_date).toBe('2026-01-10')
    })

    it('צריך להחזיר מערך רק אם אין משיכות', async () => {
      const withdrawals = await depositWithdrawalsService.getByDeposit(999)
      expect(withdrawals).toEqual([])
    })
  })

  describe('חישוב סכום כולל נמשך', () => {
    it('צריך לחשב נכון את סך המשיכות', async () => {
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-10'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2500,
        withdrawal_date: '2026-01-15'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1500,
        withdrawal_date: '2026-01-20'
      })

      const total = await depositWithdrawalsService.getTotalWithdrawn(1)
      expect(total).toBe(5000)
    })

    it('צריך להחזיר 0 אם אין משיכות', async () => {
      const total = await depositWithdrawalsService.getTotalWithdrawn(999)
      expect(total).toBe(0)
    })
  })

  describe('מחיקת משיכה', () => {
    it('צריך למחוק משיכה בהצלחה', async () => {
      const result = await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-15'
      })

      await depositWithdrawalsService.delete(result.id)

      const withdrawal = await depositWithdrawalsService.getById(result.id)
      expect(withdrawal).toBeNull()
    })

    it('לא צריך לזרוק שגיאה כשמוחקים משיכה שלא קיימת', async () => {
      await expect(depositWithdrawalsService.delete(999)).resolves.not.toThrow()
    })
  })

  describe('תרחישים מורכבים', () => {
    it('משיכה חלקית - צריך לשמור היסטוריה נכונה', async () => {
      // הפקדה של 10,000
      const depositAmount = 10000

      // משיכה ראשונה - 3,000
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 3000,
        withdrawal_date: '2026-01-10',
        payment_method: 'cash',
        notes: 'משיכה חלקית ראשונה'
      })

      let total = await depositWithdrawalsService.getTotalWithdrawn(1)
      expect(total).toBe(3000)
      expect(depositAmount - total).toBe(7000) // יתרה

      // משיכה שנייה - 2,500
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2500,
        withdrawal_date: '2026-01-15',
        payment_method: 'transfer',
        notes: 'משיכה חלקית שנייה'
      })

      total = await depositWithdrawalsService.getTotalWithdrawn(1)
      expect(total).toBe(5500)
      expect(depositAmount - total).toBe(4500) // יתרה

      // משיכה שלישית - 4,500 (סגירת ההפקדה)
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 4500,
        withdrawal_date: '2026-01-20',
        payment_method: 'cash',
        notes: 'משיכה סופית'
      })

      total = await depositWithdrawalsService.getTotalWithdrawn(1)
      expect(total).toBe(10000)
      expect(depositAmount - total).toBe(0) // אין יתרה

      // בדיקה שיש 3 משיכות בהיסטוריה
      const withdrawals = await depositWithdrawalsService.getByDeposit(1)
      expect(withdrawals).toHaveLength(3)
    })

    it('מספר הפקדות עם משיכות - צריך לנהל נכון', async () => {
      // הפקדה 1 - 5,000
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2000,
        withdrawal_date: '2026-01-10'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-15'
      })

      // הפקדה 2 - 8,000
      await depositWithdrawalsService.create({
        deposit_id: 2,
        amount: 3000,
        withdrawal_date: '2026-01-12'
      })
      await depositWithdrawalsService.create({
        deposit_id: 2,
        amount: 2000,
        withdrawal_date: '2026-01-18'
      })

      // הפקדה 3 - 10,000
      await depositWithdrawalsService.create({
        deposit_id: 3,
        amount: 10000,
        withdrawal_date: '2026-01-20'
      })

      const total1 = await depositWithdrawalsService.getTotalWithdrawn(1)
      const total2 = await depositWithdrawalsService.getTotalWithdrawn(2)
      const total3 = await depositWithdrawalsService.getTotalWithdrawn(3)

      expect(total1).toBe(3000)
      expect(total2).toBe(5000)
      expect(total3).toBe(10000)
    })
  })

  describe('גיבוי ושחזור', () => {
    it('צריך לגבות ולשחזר משיכות בהצלחה', async () => {
      // יצירת משיכות
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2026-01-10',
        payment_method: 'cash'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2000,
        withdrawal_date: '2026-01-15',
        payment_method: 'transfer'
      })

      // גיבוי
      const backup = await exportAllData()
      expect(Object.keys(backup.depositWithdrawals).length).toBe(2)

      // ניקוי
      const emptyData = await exportAllData()
      emptyData.depositWithdrawals = {}
      await importAllData(emptyData)

      let withdrawals = await depositWithdrawalsService.getAll()
      expect(withdrawals).toHaveLength(0)

      // שחזור
      await importAllData(backup)

      withdrawals = await depositWithdrawalsService.getAll()
      expect(withdrawals).toHaveLength(2)

      const total = await depositWithdrawalsService.getTotalWithdrawn(1)
      expect(total).toBe(3000)
    })
  })

  describe('ולידציות', () => {
    it('צריך לטפל בסכומים שליליים', async () => {
      const result = await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: -1000, // סכום שלילי
        withdrawal_date: '2026-01-15'
      })

      const withdrawal = await depositWithdrawalsService.getById(result.id)
      expect(withdrawal?.amount).toBe(-1000)

      // בפועל, הולידציה צריכה להיות ב-UI
      // אבל ה-service מאפשר את זה לגמישות
    })

    it('צריך לטפל בתאריכים שונים', async () => {
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1000,
        withdrawal_date: '2025-12-31'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 2000,
        withdrawal_date: '2026-01-01'
      })
      await depositWithdrawalsService.create({
        deposit_id: 1,
        amount: 1500,
        withdrawal_date: '2026-06-15'
      })

      const withdrawals = await depositWithdrawalsService.getByDeposit(1)
      expect(withdrawals).toHaveLength(3)

      // בדיקת מיון
      expect(new Date(withdrawals[0].withdrawal_date).getTime())
        .toBeGreaterThan(new Date(withdrawals[1].withdrawal_date).getTime())
    })
  })
})
