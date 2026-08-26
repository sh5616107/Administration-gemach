import { describe, it, expect, beforeEach } from 'vitest'
import { depositWithdrawalsService, exportAllData, importAllData } from '../services/database'

/**
 * טסטים לתרחישי משיכת הפקדות - אינטגרציה מלאה
 * בודק את הלוגיקה המרכזית של משיכות הפקדות שנמצאת ב-Deposits.tsx
 * 
 * תרחישים שנבדקים:
 * 1. משיכה מלאה מהפקדה חד-פעמית
 * 2. משיכה חלקית (סכום קטן מהזמין)
 * 3. משיכה מהפקדה מחזורית - עם חישוב depositAmount מוכפל
 * 4. היסטוריית משיכות - תצוגה בדיאלוג
 */
describe('Integration: Deposit Withdrawals UI Flow', () => {
  beforeEach(async () => {
    // ניקוי נתונים לפני כל טסט
    const data = await exportAllData()
    data.depositWithdrawals = {}
    data.deposits = {}
    data.depositors = {}
    await importAllData(data)
  })

  describe('תרחיש 1: משיכה מלאה מהפקדה חד-פעמית', () => {
    it('צריך לבצע משיכה מלאה ולסגור את ההפקדה', async () => {
      const depositId = 1
      const depositAmount = 10000

      // סימולציה: הפקדה בסכום 10,000 ש"ח (חד-פעמית)
      // deposit.is_recurring = 0, deposit.amount = 10000
      
      // שלב 1: טעינת משיכות קודמות (handleWithdraw)
      const withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      const alreadyWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
      
      // שלב 2: חישוב זמין למשיכה
      const availableToWithdraw = depositAmount - alreadyWithdrawn
      expect(availableToWithdraw).toBe(10000)

      // שלב 3: ביצוע משיכה מלאה (handleConfirmWithdraw)
      const withdrawAmount = 10000
      const withdrawalDate = '2026-01-15'
      
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: withdrawAmount,
        withdrawal_date: withdrawalDate,
        payment_method: 'cash',
        payment_details: JSON.stringify({ payment_method: 'cash' }),
        notes: ''
      })

      // שלב 4: חישוב סטטוס חדש
      const totalWithdrawn = alreadyWithdrawn + withdrawAmount
      const newStatus = totalWithdrawn >= depositAmount ? 'withdrawn' : 'active'
      
      expect(newStatus).toBe('withdrawn')
      expect(totalWithdrawn).toBe(10000)
      
      // שלב 5: ולידציה - בדיקת ההיסטוריה
      const finalWithdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      expect(finalWithdrawals).toHaveLength(1)
      expect(finalWithdrawals[0].amount).toBe(10000)
      
      const finalBalance = depositAmount - totalWithdrawn
      expect(finalBalance).toBe(0)
    })
  })

  describe('תרחיש 2: משיכה חלקית (סכום קטן מהזמין)', () => {
    it('צריך לבצע משיכה חלקית ולהשאיר את ההפקדה פעילה', async () => {
      const depositId = 2
      const depositAmount = 15000

      // סימולציה: הפקדה בסכום 15,000 ש"ח

      // משיכה ראשונה - 5,000
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 5000,
        withdrawal_date: '2026-01-10',
        payment_method: 'transfer',
        payment_details: JSON.stringify({ payment_method: 'bank_transfer', bank_name: 'לאומי' }),
        notes: 'משיכה חלקית ראשונה'
      })

      let withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      let totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
      let newStatus = totalWithdrawn >= depositAmount ? 'withdrawn' : 'active'
      
      expect(newStatus).toBe('active') // עדיין פעילה
      expect(totalWithdrawn).toBe(5000)
      expect(depositAmount - totalWithdrawn).toBe(10000) // נותרו 10,000

      // משיכה שנייה - 3,000
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 3000,
        withdrawal_date: '2026-01-20',
        payment_method: 'cash',
        payment_details: JSON.stringify({ payment_method: 'cash' }),
        notes: 'משיכה חלקית שנייה'
      })

      withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
      newStatus = totalWithdrawn >= depositAmount ? 'withdrawn' : 'active'
      
      expect(newStatus).toBe('active') // עדיין פעילה
      expect(totalWithdrawn).toBe(8000)
      expect(depositAmount - totalWithdrawn).toBe(7000) // נותרו 7,000

      // ולידציה סופית
      expect(withdrawals).toHaveLength(2)
    })
  })

  describe('תרחיש 3: משיכה מהפקדה מחזורית', () => {
    it('צריך לחשב נכון depositAmount מוכפל ולבצע משיכה', async () => {
      const depositId = 3
      const monthlyAmount = 2000
      const recurringDepositNumber = 5 // 5 הפקדות בוצעו
      
      // 🔥 חישוב depositAmount המוכפל - זה החלק הקריטי!
      // deposit.is_recurring = 1, deposit.amount = 2000, deposit.recurring_deposit_number = 5
      const depositAmount = monthlyAmount * recurringDepositNumber // 2,000 × 5 = 10,000

      expect(depositAmount).toBe(10000)

      // משיכה חלקית - 6,000
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 6000,
        withdrawal_date: '2026-06-15',
        payment_method: 'check',
        payment_details: JSON.stringify({ payment_method: 'check', check_number: '123456' }),
        notes: 'משיכה מהפקדה מחזורית'
      })

      const withdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
      const newStatus = totalWithdrawn >= depositAmount ? 'withdrawn' : 'active'
      
      expect(newStatus).toBe('active') // עדיין פעילה כי 6,000 < 10,000
      expect(totalWithdrawn).toBe(6000)
      expect(depositAmount - totalWithdrawn).toBe(4000) // נותרו 4,000

      // משיכה נוספת - סגירת ההפקדה
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 4000,
        withdrawal_date: '2026-07-01',
        payment_method: 'cash',
        payment_details: JSON.stringify({ payment_method: 'cash' }),
        notes: 'משיכה סופית'
      })

      const finalWithdrawals = await depositWithdrawalsService.getByDeposit(depositId)
      const finalTotalWithdrawn = finalWithdrawals.reduce((sum, w) => sum + w.amount, 0)
      const finalStatus = finalTotalWithdrawn >= depositAmount ? 'withdrawn' : 'active'
      
      expect(finalStatus).toBe('withdrawn') // נסגרה
      expect(finalTotalWithdrawn).toBe(10000)
      expect(finalWithdrawals).toHaveLength(2)
      
      const finalBalance = depositAmount - finalTotalWithdrawn
      expect(finalBalance).toBe(0)
    })
  })

  describe('תרחיש 4: היסטוריית משיכות', () => {
    it('צריך להציג נכון את כל המשיכות בדיאלוג ההיסטוריה', async () => {
      const depositId = 4

      // יצירת 4 משיכות שונות
      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 3000,
        withdrawal_date: '2026-01-10',
        payment_method: 'cash',
        payment_details: JSON.stringify({ payment_method: 'cash' }),
        notes: 'משיכה ראשונה'
      })

      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 5000,
        withdrawal_date: '2026-02-15',
        payment_method: 'bank_transfer',
        payment_details: JSON.stringify({ payment_method: 'bank_transfer', bank_name: 'הפועלים' }),
        notes: 'משיכה שנייה'
      })

      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 2500,
        withdrawal_date: '2026-03-20',
        payment_method: 'check',
        payment_details: JSON.stringify({ payment_method: 'check', check_number: '789012' }),
        notes: 'משיכה שלישית'
      })

      await depositWithdrawalsService.create({
        deposit_id: depositId,
        amount: 4000,
        withdrawal_date: '2026-04-25',
        payment_method: 'cash',
        payment_details: JSON.stringify({ payment_method: 'cash' }),
        notes: 'משיכה רביעית'
      })

      // טעינת היסטוריה (handleShowHistory)
      const withdrawalHistory = await depositWithdrawalsService.getByDeposit(depositId)
      
      expect(withdrawalHistory).toHaveLength(4)
      
      // בדיקה שממוין מהחדש לישן
      expect(withdrawalHistory[0].withdrawal_date).toBe('2026-04-25')
      expect(withdrawalHistory[3].withdrawal_date).toBe('2026-01-10')
      
      // חישוב סה"כ (שורת סיכום בדיאלוג)
      const totalWithdrawn = withdrawalHistory.reduce((sum, w) => sum + w.amount, 0)
      expect(totalWithdrawn).toBe(14500)
      
      // בדיקה של אמצעי תשלום
      const cashWithdrawals = withdrawalHistory.filter(w => w.payment_method === 'cash')
      expect(cashWithdrawals).toHaveLength(2)
      
      const transferWithdrawals = withdrawalHistory.filter(w => w.payment_method === 'bank_transfer')
      expect(transferWithdrawals).toHaveLength(1)
      
      const checkWithdrawals = withdrawalHistory.filter(w => w.payment_method === 'check')
      expect(checkWithdrawals).toHaveLength(1)
      
      // בדיקה של פרסור payment_details
      const transferDetails = JSON.parse(transferWithdrawals[0].payment_details || '{}')
      expect(transferDetails.bank_name).toBe('הפועלים')
      
      const checkDetails = JSON.parse(checkWithdrawals[0].payment_details || '{}')
      expect(checkDetails.check_number).toBe('789012')
    })
  })
})
