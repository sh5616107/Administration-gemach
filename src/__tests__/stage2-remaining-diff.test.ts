/**
 * שלב 2 — diff ביט-לביט לשלושת המסמכים הנותרים: קבלת תרומה, שטר הפקדה,
 * דוח לווה. כל פונקציית oldXxx מחולצת מ-git HEAD (שלב 1), לא מהזיכרון.
 */
import { describe, it, expect, vi } from 'vitest'
import { toHebrewDate } from '../utils/dateUtils'

vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('jspdf', () => ({ default: vi.fn() }))

const { buildDonationReceiptHtml, buildDepositDocumentHtml, buildBorrowerReportHtml } = await import('../services/documents')

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0 }).format(amount)
}

function normalize(s: string): string {
  return s.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
}

// ===== קבלת תרומה =====
function oldBuildDonationReceiptHtml(data: any): string {
  const showHebrew = data.dateFormat === 'combined'
  const dateDisplay = new Date(data.donationDate).toLocaleDateString('he-IL')
  const dateHebrew = showHebrew ? toHebrewDate(data.donationDate) : ''
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
      <h1 style="font-size: 24px; margin: 10px 0;">קבלה על תרומה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>מספר קבלה: <strong>${data.receiptNumber}</strong></p>
        <p>התקבל מאת: <strong>${data.donorName}</strong></p>
        <p style="font-size: 20px; margin: 15px 0;">
          סכום: <strong>${formatCurrency(data.amount)}</strong>
        </p>
        <p>תאריך: <strong>${dateDisplay}</strong>${dateHebrew ? ` <span style="color: #666;">(${dateHebrew})</span>` : ''}</p>
      </div>
      
      <div style="margin: 30px 0; text-align: center;">
        <p style="font-size: 18px; font-weight: bold;">תודה רבה על תרומתך!</p>
        <p style="font-size: 16px;">יישר כח!</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;" />
      
      <div style="text-align: right; font-size: 14px;">
        <p>חתימת הגמ"ח: _______________________</p>
      </div>
    </div>
  `

  return htmlContent
}

// ===== שטר הפקדה =====
function oldBuildDepositDocumentHtml(data: any): string {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'
  
  const depositDateDisplay = new Date(data.depositDate).toLocaleDateString('he-IL')
  const depositDateHebrew = showHebrew ? toHebrewDate(data.depositDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  // Custom text - only use if provided and not containing old template variables
  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : ''
  
  // HTML להפקדה מחזורית - רק אם יש יותר מהפקדה אחת בסדרה
  const recurringDepositHtml = data.isRecurring && data.recurringDepositNumber && data.recurringDepositCount && data.recurringDepositCount > 1 ? `
    <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 8px; border: 2px solid #2196f3;">
      <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1976d2;">
        🔄 הפקדה מחזורית - מספר ${data.recurringDepositNumber} מתוך ${data.recurringDepositCount}
      </p>
      <p style="margin: 5px 0 0 0; font-size: 14px; color: #555;">
        זוהי הפקדה מחזורית מספר ${data.recurringDepositNumber} שהתקבלה מהמפקיד
      </p>
    </div>
  ` : ''
  
  // חישוב משיכות
  const totalWithdrawn = data.withdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0
  const remaining = data.amount - totalWithdrawn
  
  // HTML למשיכות
  const withdrawalsHtml = data.withdrawals && data.withdrawals.length > 0 ? `
    <div style="margin-top: 30px; padding: 15px; background: #fff3cd; border-radius: 8px;">
      <h3 style="margin: 0 0 15px 0; color: #856404;">משיכות שבוצעו:</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #ffc107;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">תאריך משיכה</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">סכום</th>
          </tr>
        </thead>
        <tbody>
          ${data.withdrawals.map(w => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${new Date(w.withdrawal_date).toLocaleDateString('he-IL')}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(w.amount)}</td>
            </tr>
          `).join('')}
          <tr style="background: #f8f9fa; font-weight: bold;">
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">סה"כ נמשך</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(totalWithdrawn)}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 15px; font-size: 18px; font-weight: bold; color: ${remaining > 0 ? '#28a745' : '#6c757d'};">
        יתרה נוכחית: ${formatCurrency(remaining)}
      </p>
    </div>
  ` : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px;">
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הפקדה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      ${recurringDepositHtml}
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>אני הח"מ מנהל גמ"ח "<strong>${data.gemachName}</strong>"</p>
        <p>מאשר בזה כי קיבלתי הפקדה מאת: <strong>${data.depositorName}</strong></p>
        <p style="font-size: 20px; margin: 20px 0;">
          סכום הפקדה מקורי: <strong>${formatCurrency(data.amount)}</strong>
        </p>
        <p>בתאריך: <strong>${depositDateDisplay}</strong>${depositDateHebrew ? ` <span style="color: #666;">(${depositDateHebrew})</span>` : ''}</p>
        <p style="margin-top: 20px;">
          סוג הפקדה: <strong>${data.periodType === 'fixed' ? 'קבועה' : 'גמישה'}</strong>
          ${dueDateDisplay ? `<br/>תאריך סיום: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}` : ''}
        </p>
        ${commitmentText ? `<p style="margin-top: 20px;">${commitmentText}</p>` : ''}
      </div>
      
      ${withdrawalsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; margin-top: 30px;">
        <p>חתימת הגמ"ח: _______________________</p>
        <p style="margin-top: 20px;">חתימת המפקיד: _______________________</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; font-size: 12px; color: #666;">
        תאריך הפקת השטר: ${today}${showHebrew ? ` (${todayHebrew})` : ''}
      </div>
    </div>
  `

  return htmlContent
}

// ===== דוח לווה =====
// הערה: 4 מופעי var(--doc-accent, #1976d2) להלן (במקום #1976d2 גולמי) הם
// שינוי מכוון בשלב הבא (תמיכה בהתאמת "צבע ראשי" מהפאנל, ר' accentColor
// ב-DocumentLayoutConfig) — לא drift לא-מכוון. עודכנו כאן כדי שהבדיקה
// תמשיך לתפוס רק סטיות אמיתיות, לא את זו.
function oldBuildBorrowerReportHtml(data: any): string {
  const today = new Date().toLocaleDateString('he-IL')

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  // חישוב סטטיסטיקות
  const totalLoansAmount = data.loans.reduce((sum, loan) => sum + loan.amount, 0)
  const totalRepayments = data.loans.reduce((sum, loan) => {
    return sum + (loan.repayments?.reduce((s, r) => s + r.amount, 0) || 0)
  }, 0)
  const activeLoansCount = data.loans.filter(l => l.status === 'active').length
  const completedLoansCount = data.loans.filter(l => l.status === 'completed').length

  // טבלת הלוואות - פשוטה וברורה
  const loansHtml = data.loans.map(loan => {
    const recurringInfo = loan.isRecurring && loan.recurringLoanNumber && loan.recurringLoanCount && loan.recurringLoanCount > 1
      ? `<span class="recurring-badge">🔄 ${loan.recurringLoanNumber}/${loan.recurringLoanCount}</span>`
      : '-'
    
    const statusText = loan.status === 'active' ? 'פעילה' : loan.status === 'planned' ? 'מתוכננת' : 'נפרעה'
    const statusColor = loan.status === 'active' ? 'var(--doc-accent, #1976d2)' : loan.status === 'planned' ? '#f57c00' : '#2e7d32'
    const totalPaid = loan.repayments?.reduce((sum, r) => sum + r.amount, 0) || 0
    
    return `
    <tr>
      <td>${loan.id}</td>
      <td>${new Date(loan.loanDate).toLocaleDateString('he-IL')}</td>
      <td><strong>${formatCurrency(loan.amount)}</strong></td>
      <td style="color: #2e7d32;">${formatCurrency(totalPaid)}</td>
      <td style="color: ${loan.remaining > 0 ? '#d32f2f' : '#2e7d32'}; font-weight: bold;">${formatCurrency(loan.remaining)}</td>
      <td>${recurringInfo}</td>
      <td><span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></td>
    </tr>
  `}).join('')

  // טבלת פרעונות - נפרדת וברורה
  // חישוב פירעונות - מיון לפי ההגדרה
  const sortMultiplier = (data.repaymentsOrder || 'newest_first') === 'oldest_first' ? 1 : -1
  const allRepayments = data.loans.flatMap(loan => 
    (loan.repayments || []).map(r => ({
      ...r,
      loanId: loan.id
    }))
  ).sort((a, b) => sortMultiplier * (new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()))

  // זיהוי פרעונות מרובים - פרעונות באותו תאריך עם הערה "פירעון מרובה"
  const multiRepaymentDates = new Set(
    allRepayments
      .filter(r => r.notes?.includes('פירעון מרובה'))
      .map(r => r.payment_date)
  )

  const repaymentsHtml = allRepayments.length > 0 ? `
    <h3 class="section-title" style="color: #2e7d32;">✅ פירוט פרעונות</h3>
    <table class="data-table">
      <thead>
        <tr class="repayments-header">
          <th style="width: 12%;">מס' הלוואה</th>
          <th style="width: 20%;">תאריך פרעון</th>
          <th style="width: 20%;">סכום</th>
          <th style="width: 48%;">סוג</th>
        </tr>
      </thead>
      <tbody>
        ${allRepayments.map(r => {
          const isMultiRepayment = r.notes?.includes('פירעון מרובה')
          const repRecurringInfo = r.isRecurring && r.recurringRepaymentNumber && r.recurringRepaymentCount && r.recurringRepaymentCount > 1
            ? `🔄 ${r.recurringRepaymentNumber}/${r.recurringRepaymentCount}`
            : '-'
          
          // אם זה פירעון מרובה, נציג אייקון מיוחד
          const typeInfo = isMultiRepayment 
            ? '<span class="multi-badge">📊 פירעון מרובה</span>'
            : `<span class="recurring-badge">${repRecurringInfo}</span>`
          
          const rowClass = isMultiRepayment ? 'multi-repayment-row' : ''
          
          return `
          <tr class="${rowClass}">
            <td>${r.loanId}</td>
            <td>${new Date(r.payment_date).toLocaleDateString('he-IL')}</td>
            <td><strong>${formatCurrency(r.amount)}</strong></td>
            <td>${typeInfo}</td>
          </tr>
        `}).join('')}
        <tr class="total-row" style="background: #c8e6c9;">
          <td colspan="2" style="text-align: right; font-size: 15px;">סה"כ פרעונות</td>
          <td colspan="2" style="font-size: 16px;">${formatCurrency(totalRepayments)}</td>
        </tr>
      </tbody>
    </table>
  ` : ''

  const categoryLabels: Record<string, string> = {
    fee: 'עמלה',
    office: 'הוצאות משרד',
    bank: 'עמלת בנק',
    legal: 'משפטי',
    other: 'אחר'
  }

  const expensesHtml = data.expenses && data.expenses.length > 0 ? `
    <h3 class="section-title" style="color: #f57c00;">💳 הוצאות ששולמו ע"י הלווה</h3>
    <table class="data-table">
      <thead>
        <tr class="expenses-header">
          <th style="width: 8%;">מס'</th>
          <th style="width: 30%;">תיאור</th>
          <th style="width: 17%;">קטגוריה</th>
          <th style="width: 20%;">סכום</th>
          <th style="width: 25%;">תאריך</th>
        </tr>
      </thead>
      <tbody>
        ${data.expenses.map(exp => `
          <tr>
            <td>${exp.id}</td>
            <td style="text-align: right;">${exp.description}</td>
            <td>${categoryLabels[exp.category] || exp.category}</td>
            <td><strong>${formatCurrency(exp.amount)}</strong></td>
            <td>${new Date(exp.expense_date).toLocaleDateString('he-IL')}</td>
          </tr>
        `).join('')}
        <tr class="total-row" style="background: #fff3e0;">
          <td colspan="3" style="text-align: right; font-size: 15px;">סה"כ הוצאות</td>
          <td colspan="2" style="font-size: 16px;"><strong>${formatCurrency(data.expenses.reduce((sum, e) => sum + e.amount, 0))}</strong></td>
        </tr>
      </tbody>
    </table>
  ` : ''

  const innerContent = `
    <div style="padding: 20px;">
      <div class="header">
        <h1 style="font-size: 26px; margin: 10px 0; color: var(--doc-accent, #1976d2);">דוח לווה</h1>
        <h2 style="font-size: 16px; color: #666; margin: 5px 0;">${data.gemachName}</h2>
      </div>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 15px; margin-bottom: 20px;">
        <p style="margin: 5px 0;"><strong>שם הלווה:</strong> ${data.borrowerName}</p>
        <p style="margin: 5px 0;"><strong>תאריך הפקה:</strong> ${today}</p>
      </div>

      <!-- סיכום כללי -->
      <div class="summary-box">
        <h3 style="margin: 0 0 15px 0; color: var(--doc-accent, #1976d2); font-size: 18px;">📊 סיכום כללי</h3>
        <table class="summary-table">
          <tr>
            <td style="width: 25%;"><strong>הלוואות פעילות:</strong></td>
            <td style="width: 25%; text-align: left; color: var(--doc-accent, #1976d2); font-size: 16px;"><strong>${activeLoansCount}</strong></td>
            <td style="width: 25%;"><strong>הלוואות שנפרעו:</strong></td>
            <td style="width: 25%; text-align: left; color: #2e7d32; font-size: 16px;"><strong>${completedLoansCount}</strong></td>
          </tr>
          <tr>
            <td><strong>סה"כ הלוואות:</strong></td>
            <td style="text-align: left; font-size: 16px;">${formatCurrency(totalLoansAmount)}</td>
            <td><strong>סה"כ פרעונות:</strong></td>
            <td style="text-align: left; font-size: 16px;">${formatCurrency(totalRepayments)}</td>
          </tr>
          <tr style="background: ${data.totalDebt > 0 ? '#ffebee' : '#e8f5e9'};">
            <td colspan="2"><strong style="font-size: 16px;">יתרת חוב נוכחית:</strong></td>
            <td colspan="2" style="text-align: left;">
              <span class="debt-amount" style="color: ${data.totalDebt > 0 ? '#d32f2f' : '#2e7d32'};">
                ${formatCurrency(data.totalDebt)}
              </span>
            </td>
          </tr>
        </table>
      </div>
      
      <h3 class="section-title">💰 פירוט הלוואות</h3>
      
      <table class="data-table">
        <thead>
          <tr class="loans-header">
            <th style="width: 8%;">מס'</th>
            <th style="width: 15%;">תאריך</th>
            <th style="width: 15%;">סכום הלוואה</th>
            <th style="width: 15%;">נפרע</th>
            <th style="width: 15%;">יתרה</th>
            <th style="width: 17%;">מחזורית</th>
            <th style="width: 15%;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${loansHtml || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #999;">אין הלוואות</td></tr>'}
        </tbody>
      </table>
      
      ${repaymentsHtml}
      ${expensesHtml}
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
        <p>דוח זה הופק אוטומטית ממערכת ניהול הגמ"ח</p>
      </div>
    </div>
  `

  return innerContent
}


describe('שלב 2: buildDonationReceiptHtml === generateDonationReceipt הישן', () => {
  const scenarios: Record<string, any> = {
    'קבלה רגילה': { gemachName: 'גמ"ח הדוגמה', donorName: 'רחל כהן', amount: 500, donationDate: '2026-03-01', receiptNumber: '1042', dateFormat: 'combined' },
    'קבלה בלי תאריך עברי': { gemachName: 'גמ"ח הדוגמה', donorName: 'שרה לוי', amount: 1200, donationDate: '2026-05-15', receiptNumber: '1099', dateFormat: 'gregorian' },
  }
  for (const [name, data] of Object.entries(scenarios)) {
    it(name, () => {
      const oldHtml = oldBuildDonationReceiptHtml(data)
      const newHtml = buildDonationReceiptHtml(data)
      expect(normalize(newHtml)).toBe(normalize(oldHtml))
    })
  }
})

describe('שלב 2: buildDepositDocumentHtml === generateDepositDocument הישן', () => {
  const scenarios: Record<string, any> = {
    'בלי משיכות': { gemachName: 'גמ"ח הדוגמה', depositorName: 'יעקב לוי', amount: 10000, depositDate: '2026-01-01', periodType: 'fixed', dueDate: '2027-01-01', dateFormat: 'combined' },
    'עם משיכה חלקית': { gemachName: 'גמ"ח הדוגמה', depositorName: 'יעקב לוי', amount: 10000, depositDate: '2026-01-01', periodType: 'flexible', dateFormat: 'combined', withdrawals: [{ amount: 2000, withdrawal_date: '2026-04-01' }] },
    'עם customText': { gemachName: 'גמ"ח הדוגמה', depositorName: 'יעקב לוי', amount: 10000, depositDate: '2026-01-01', periodType: 'fixed', dueDate: '2027-01-01', customText: 'תנאי הפקדה מיוחדים', dateFormat: 'gregorian' },
  }
  for (const [name, data] of Object.entries(scenarios)) {
    it(name, () => {
      const oldHtml = oldBuildDepositDocumentHtml(data)
      const newHtml = buildDepositDocumentHtml(data)
      expect(normalize(newHtml)).toBe(normalize(oldHtml))
    })
  }
})

describe('שלב 2: buildBorrowerReportHtml === generateBorrowerReport הישן (innerContent)', () => {
  const scenarios: Record<string, any> = {
    'הלוואה אחת פעילה, בלי פירעונות': {
      gemachName: 'גמ"ח הדוגמה', borrowerName: 'דוד ישראלי', totalDebt: 5000,
      loans: [{ id: 1, amount: 5000, loanDate: '2026-01-01', remaining: 5000, status: 'active' }],
    },
    'כמה הלוואות + פירעונות + הוצאות': {
      gemachName: 'גמ"ח הדוגמה', borrowerName: 'דוד ישראלי', totalDebt: 3000,
      loans: [
        { id: 1, amount: 5000, loanDate: '2026-01-01', remaining: 2000, status: 'active', repayments: [{ amount: 3000, payment_date: '2026-02-01' }] },
        { id: 2, amount: 1000, loanDate: '2025-06-01', remaining: 0, status: 'completed', repayments: [{ amount: 1000, payment_date: '2025-07-01' }] },
      ],
      expenses: [{ id: 1, description: 'עמלת פתיחה', amount: 50, expense_date: '2026-01-05', category: 'fee' }],
      repaymentsOrder: 'oldest_first',
    },
  }
  for (const [name, data] of Object.entries(scenarios)) {
    it(name, () => {
      const oldHtml = oldBuildBorrowerReportHtml(data)
      const newHtml = buildBorrowerReportHtml(data)
      expect(normalize(newHtml)).toBe(normalize(oldHtml))
    })
  }
})
