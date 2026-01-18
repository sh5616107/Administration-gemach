import { describe, it, expect, beforeEach } from 'vitest'
import { 
  guarantorLoansService,
  guarantorLoanRepaymentsService,
  exportAllData,
  importAllData
} from '../services/database'

describe('Guarantor Loan Repayments', () => {
  beforeEach(async () => {
    // ניקוי נתונים לפני כל טסט
    const data = await exportAllData()
    data.guarantorLoanRepayments = {}
    data.guarantorLoans = {}
    data.repayments = {}
    data.loans = {}
    data.borrowers = {}
    data.guarantors = {}
    await importAllData(data)
  })

  it('should create guarantor loan repayment and update total_repaid', async () => {
    // יצירת הלוואת ערב
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 10000,
      status: 'active'
    })

    // הוספת פירעון ראשון
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 3000,
      payment_date: '2024-02-01',
      notes: 'פירעון ראשון'
    })

    // בדיקה שה-total_repaid התעדכן
    const updatedGL = await guarantorLoansService.getById(guarantorLoan.id)
    expect(updatedGL?.total_repaid).toBe(3000)
    expect(updatedGL?.status).toBe('active')

    // הוספת פירעון שני
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 7000,
      payment_date: '2024-03-01',
      notes: 'פירעון שני'
    })

    // בדיקה שה-total_repaid התעדכן והסטטוס השתנה ל-paid
    const finalGL = await guarantorLoansService.getById(guarantorLoan.id)
    expect(finalGL?.total_repaid).toBe(10000)
    expect(finalGL?.status).toBe('paid')
  })

  it('should maintain repayment history', async () => {
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 5000,
      status: 'active'
    })

    // הוספת 3 פירעונות
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 1000,
      payment_date: '2024-02-01'
    })

    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 1500,
      payment_date: '2024-03-01'
    })

    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 2000,
      payment_date: '2024-04-01'
    })

    // בדיקה שכל הפירעונות נשמרו
    const repayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoan.id)
    expect(repayments.length).toBe(3)
    expect(repayments[0].amount).toBe(2000) // ממוין לפי תאריך יורד
    expect(repayments[1].amount).toBe(1500)
    expect(repayments[2].amount).toBe(1000)

    // בדיקה שהסכום הכולל נכון
    const total = await guarantorLoanRepaymentsService.getTotalRepaid(guarantorLoan.id)
    expect(total).toBe(4500)
  })

  it('should update status when editing repayment', async () => {
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 8000,
      status: 'active'
    })

    // פירעון שמכסה את כל הסכום
    const repayment = await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 8000,
      payment_date: '2024-02-01'
    })

    // בדיקה שהסטטוס paid
    let gl = await guarantorLoansService.getById(guarantorLoan.id)
    expect(gl?.status).toBe('paid')

    // עריכת הפירעון להיות חלקי
    await guarantorLoanRepaymentsService.update(repayment.id, {
      amount: 5000
    })

    // בדיקה שהסטטוס חזר ל-active
    gl = await guarantorLoansService.getById(guarantorLoan.id)
    expect(gl?.status).toBe('active')
    expect(gl?.total_repaid).toBe(5000)
  })

  it('should update status when deleting repayment', async () => {
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 6000,
      status: 'active'
    })

    // שני פירעונות
    const rep1 = await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 3000,
      payment_date: '2024-02-01'
    })

    const rep2 = await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 3000,
      payment_date: '2024-03-01'
    })

    // בדיקה שהסטטוס paid
    let gl = await guarantorLoansService.getById(guarantorLoan.id)
    expect(gl?.status).toBe('paid')
    expect(gl?.total_repaid).toBe(6000)

    // מחיקת פירעון אחד
    await guarantorLoanRepaymentsService.delete(rep2.id)

    // בדיקה שהסטטוס חזר ל-active
    gl = await guarantorLoansService.getById(guarantorLoan.id)
    expect(gl?.status).toBe('active')
    expect(gl?.total_repaid).toBe(3000)
  })

  it('should handle multiple guarantors with repayments', async () => {
    // שני ערבים
    const gl1 = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 10000,
      status: 'active'
    })

    const gl2 = await guarantorLoansService.create({
      guarantor_id: 2,
      original_loan_id: 1,
      amount: 10000,
      status: 'active'
    })

    // ערב 1 משלם
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: gl1.id,
      amount: 5000,
      payment_date: '2024-02-01'
    })

    // ערב 2 משלם
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: gl2.id,
      amount: 3000,
      payment_date: '2024-02-15'
    })

    // בדיקות
    const updatedGL1 = await guarantorLoansService.getById(gl1.id)
    const updatedGL2 = await guarantorLoansService.getById(gl2.id)

    expect(updatedGL1?.total_repaid).toBe(5000)
    expect(updatedGL1?.status).toBe('active')
    
    expect(updatedGL2?.total_repaid).toBe(3000)
    expect(updatedGL2?.status).toBe('active')

    // בדיקה שכל ערב רואה רק את הפירעונות שלו
    const rep1 = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl1.id)
    const rep2 = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl2.id)

    expect(rep1.length).toBe(1)
    expect(rep2.length).toBe(1)
  })

  it('should delete all repayments when deleting guarantor loan', async () => {
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 5000,
      status: 'active'
    })

    // הוספת מספר פירעונות
    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 1000,
      payment_date: '2024-02-01'
    })

    await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 2000,
      payment_date: '2024-03-01'
    })

    // בדיקה שיש פירעונות
    let repayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoan.id)
    expect(repayments.length).toBe(2)

    // מחיקת כל הפירעונות
    await guarantorLoanRepaymentsService.deleteByGuarantorLoan(guarantorLoan.id)

    // בדיקה שהפירעונות נמחקו
    repayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoan.id)
    expect(repayments.length).toBe(0)
  })

  it('should store payment method and details', async () => {
    const guarantorLoan = await guarantorLoansService.create({
      guarantor_id: 1,
      original_loan_id: 1,
      amount: 5000,
      status: 'active'
    })

    const paymentDetails = JSON.stringify({
      payment_method: 'transfer',
      bank: 'לאומי',
      account: '12345'
    })

    const repayment = await guarantorLoanRepaymentsService.create({
      guarantor_loan_id: guarantorLoan.id,
      amount: 2000,
      payment_date: '2024-02-01',
      payment_method: 'transfer',
      payment_details: paymentDetails,
      notes: 'העברה בנקאית'
    })

    const savedRepayment = await guarantorLoanRepaymentsService.getById(repayment.id)
    expect(savedRepayment?.payment_method).toBe('transfer')
    expect(savedRepayment?.payment_details).toBe(paymentDetails)
    expect(savedRepayment?.notes).toBe('העברה בנקאית')
  })
})
