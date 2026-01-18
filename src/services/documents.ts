import { toHebrewDate } from '../utils/dateUtils'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// Debug log function
const debugLog = (message: string, data?: unknown) => {
  console.log(`[EMAIL DEBUG] ${message}`, data || '')
}

// Check if running in Tauri - check multiple indicators
const isTauri = (): boolean => {
  const hasTauriGlobal = typeof window !== 'undefined' && '__TAURI__' in window
  const hasTauriInternals = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const result = hasTauriGlobal || hasTauriInternals
  debugLog('isTauri check', { result, hasTauriGlobal, hasTauriInternals })
  return result
}

// Open URL - works in both browser and Tauri
const openUrl = async (url: string) => {
  debugLog('openUrl called', { url: url.substring(0, 100) + '...' })
  
  if (isTauri()) {
    try {
      debugLog('Trying Tauri invoke open_url')
      const { invoke } = await import('@tauri-apps/api/core')
      debugLog('invoke imported successfully')
      await invoke('open_url', { url })
      debugLog('invoke open_url succeeded')
      return
    } catch (error) {
      debugLog('Tauri open_url error', { error: String(error) })
    }
  }
  
  // Fallback - try to use window.location for external URLs
  debugLog('Using location.href fallback')
  
  // Create a hidden link and click it
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  debugLog('Link click executed')
}

// Download HTML content as PDF
const downloadPdf = async (htmlContent: string, filename: string): Promise<string | null> => {
  return new Promise((resolve) => {
    // Create a temporary container
    const container = document.createElement('div')
    container.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;direction:rtl;font-family:Arial,sans-serif;padding:40px;background:white;'
    container.innerHTML = htmlContent
    document.body.appendChild(container)
    
    // Wait for fonts and images to load
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
        })
        
        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        })
        
        const imgWidth = 210 // A4 width in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
        pdf.save(`${filename}.pdf`)
        
        document.body.removeChild(container)
        resolve(`${filename}.pdf`)
      } catch (error) {
        console.error('Error generating PDF:', error)
        document.body.removeChild(container)
        resolve(null)
      }
    }, 500)
  })
}

// Print HTML content - works in both browser and Tauri
const printHtml = (htmlContent: string, title: string) => {
  // Create a new window for printing
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  
  if (!printWindow) {
    // If popup blocked, use iframe method
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
    document.body.appendChild(iframe)
    
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (doc) {
      doc.open()
      doc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap');
            body { 
              font-family: 'Heebo', Arial, sans-serif; 
              direction: rtl; 
              padding: 40px;
              margin: 0;
            }
            @media print { 
              body { padding: 20px; }
            }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
          </style>
        </head>
        <body>${htmlContent}</body>
        </html>
      `)
      doc.close()
      
      setTimeout(() => {
        iframe.contentWindow?.print()
        setTimeout(() => document.body.removeChild(iframe), 1000)
      }, 500)
    }
    return
  }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&display=swap');
        body { 
          font-family: 'Heebo', Arial, sans-serif; 
          direction: rtl; 
          padding: 40px;
          margin: 0;
        }
        @media print { 
          body { padding: 20px; }
        }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        .no-print { display: none; }
        @media screen {
          .print-btn {
            position: fixed;
            top: 10px;
            left: 10px;
            padding: 10px 20px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            font-family: 'Heebo', Arial, sans-serif;
          }
          .print-btn:hover { background: #1565c0; }
        }
        @media print {
          .print-btn { display: none; }
        }
      </style>
    </head>
    <body>
      <button class="print-btn" onclick="window.print()">🖨️ הדפס</button>
      ${htmlContent}
    </body>
    </html>
  `)
  printWindow.document.close()
}

interface LoanDocumentData {
  gemachName: string
  gemachLogo?: string
  borrowerName: string
  borrowerId?: string
  amount: number
  loanDate: string
  loanDateHebrew?: string
  dueDate?: string
  dueDateHebrew?: string
  loanType: string
  guarantor1Name?: string
  guarantor2Name?: string
  dateFormat?: string
  customText?: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function generateLoanDocument(data: LoanDocumentData) {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'
  
  // Format dates
  const loanDateDisplay = new Date(data.loanDate).toLocaleDateString('he-IL')
  const loanDateHebrew = showHebrew ? toHebrewDate(data.loanDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const guarantorsHtml = (data.guarantor1Name || data.guarantor2Name) ? `
    <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
      <div style="font-weight: bold; margin-bottom: 10px;">ערבים:</div>
      ${data.guarantor1Name ? `
        <div style="margin-bottom: 15px;">
          <span>ערב 1: ${data.guarantor1Name}</span>
          <span style="margin-right: 30px;">חתימה: _______________________</span>
        </div>
      ` : ''}
      ${data.guarantor2Name ? `
        <div>
          <span>ערב 2: ${data.guarantor2Name}</span>
          <span style="margin-right: 30px;">חתימה: _______________________</span>
        </div>
      ` : ''}
    </div>
  ` : ''

  // Custom text - only use if provided and not containing old template variables
  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : 'מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע.'

  const htmlContent = `
    <div style="text-align: center; padding: 20px;">
      ${logoHtml}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הלוואה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>אני הח"מ <strong>${data.borrowerName}</strong></p>
        <p>${commitmentText}</p>
        <p style="font-size: 20px; margin: 20px 0;">
          סכום של: <strong>${formatCurrency(data.amount)}</strong>
        </p>
        <p>בתאריך: <strong>${loanDateDisplay}</strong>${loanDateHebrew ? ` <span style="color: #666;">(${loanDateHebrew})</span>` : ''}</p>
        <p style="margin-top: 20px;">
          ${data.loanType === 'fixed' && dueDateDisplay 
            ? `תאריך החזרה: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}`
            : 'החזרה: לפי התראה'
          }
        </p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; margin-top: 30px;">
        <p>חתימת הלווה: _______________________</p>
      </div>
      
      ${guarantorsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; font-size: 12px; color: #666;">
        תאריך הפקת השטר: ${today}${showHebrew ? ` (${todayHebrew})` : ''}
      </div>
    </div>
  `

  printHtml(htmlContent, `שטר הלוואה - ${data.borrowerName}`)
}


export function generateEmptyLoanDocument(gemachName: string, gemachLogo?: string) {
  const today = new Date().toLocaleDateString('he-IL')
  
  const logoHtml = gemachLogo 
    ? `<img src="${gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px;">
      ${logoHtml}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הלוואה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 16px; line-height: 2.5;">
        <p>אני הח"מ _______________________ ת.ז. _______________________</p>
        <p>מאשר בזה כי לוויתי מגמ"ח "<strong>${gemachName}</strong>"</p>
        <p style="font-size: 18px; margin: 20px 0;">
          סכום של: _______________________ ש"ח
        </p>
        <p>בתאריך: _______________________ (_______________________)</p>
        <p style="margin-top: 20px;">
          אני מתחייב להחזיר את הסכום בתאריך: _______________________
        </p>
        <p style="font-size: 14px; color: #666;">או לפי התראה (במקרה של הלוואה גמישה)</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; margin-top: 30px;">
        <p>חתימת הלווה: _______________________</p>
      </div>
      
      <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; text-align: right;">
        <div style="font-weight: bold; margin-bottom: 10px;">ערבים:</div>
        <p>ערב 1: _______________________ חתימה: _______________________</p>
        <p>ערב 2: _______________________ חתימה: _______________________</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; font-size: 12px; color: #666;">
        תאריך הפקת השטר: ${today}
      </div>
    </div>
  `

  printHtml(htmlContent, 'שטר הלוואה ריק')
}

export function generateDonationReceipt(data: {
  gemachName: string
  gemachLogo?: string
  donorName: string
  amount: number
  donationDate: string
  receiptNumber: number
  dateFormat?: string
}) {
  const showHebrew = data.dateFormat === 'combined'
  const dateDisplay = new Date(data.donationDate).toLocaleDateString('he-IL')
  const dateHebrew = showHebrew ? toHebrewDate(data.donationDate) : ''
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
      ${logoHtml}
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

  printHtml(htmlContent, `קבלה ${data.receiptNumber}`)
}

export function generateDepositDocument(data: {
  gemachName: string
  gemachLogo?: string
  depositorName: string
  amount: number
  depositDate: string
  periodType: string
  dueDate?: string
  dateFormat?: string
  customText?: string
  withdrawals?: Array<{
    amount: number
    withdrawal_date: string
  }>
}) {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'
  
  const depositDateDisplay = new Date(data.depositDate).toLocaleDateString('he-IL')
  const depositDateHebrew = showHebrew ? toHebrewDate(data.depositDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // Custom text - only use if provided and not containing old template variables
  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : ''
  
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
      ${logoHtml}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הפקדה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
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

  printHtml(htmlContent, `שטר הפקדה - ${data.depositorName}`)
}


export function generateBorrowerReport(data: {
  gemachName: string
  gemachLogo?: string
  borrowerName: string
  loans: Array<{
    id: number
    amount: number
    loanDate: string
    remaining: number
    status: string
  }>
  expenses?: Array<{
    id: number
    description: string
    amount: number
    expense_date: string
    category: string
  }>
  totalDebt: number
}) {
  const today = new Date().toLocaleDateString('he-IL')

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const loansHtml = data.loans.map(loan => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${loan.id}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(loan.amount)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${loan.loanDate}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(loan.remaining)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${loan.status === 'active' ? 'פעילה' : loan.status === 'planned' ? 'מתוכננת' : 'נפרעה'}</td>
    </tr>
  `).join('')

  const categoryLabels: Record<string, string> = {
    fee: 'עמלה',
    office: 'הוצאות משרד',
    bank: 'עמלת בנק',
    legal: 'משפטי',
    other: 'אחר'
  }

  const expensesHtml = data.expenses && data.expenses.length > 0 ? `
    <h3 style="margin-top: 30px; text-align: right;">הוצאות ששולמו ע"י הלווה:</h3>
    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
      <thead>
        <tr style="background: #fff3e0;">
          <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
          <th style="padding: 10px; border: 1px solid #ddd;">תיאור</th>
          <th style="padding: 10px; border: 1px solid #ddd;">קטגוריה</th>
          <th style="padding: 10px; border: 1px solid #ddd;">סכום</th>
          <th style="padding: 10px; border: 1px solid #ddd;">תאריך</th>
        </tr>
      </thead>
      <tbody>
        ${data.expenses.map(exp => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${exp.id}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${exp.description}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${categoryLabels[exp.category] || exp.category}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(exp.amount)}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">${new Date(exp.expense_date).toLocaleDateString('he-IL')}</td>
          </tr>
        `).join('')}
        <tr style="background: #fff3e0;">
          <td colspan="3" style="padding: 8px; border: 1px solid #ddd;"><strong>סה"כ הוצאות</strong></td>
          <td colspan="2" style="padding: 8px; border: 1px solid #ddd;"><strong>${formatCurrency(data.expenses.reduce((sum, e) => sum + e.amount, 0))}</strong></td>
        </tr>
      </tbody>
    </table>
  ` : ''

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        ${logoHtml}
        <h1 style="font-size: 24px; margin: 10px 0;">דוח לווה</h1>
        <h2 style="font-size: 16px; color: #666;">${data.gemachName}</h2>
      </div>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 16px;">
        <p><strong>שם הלווה:</strong> ${data.borrowerName}</p>
        <p><strong>תאריך הפקה:</strong> ${today}</p>
        <p style="font-size: 18px; margin-top: 15px;">
          <strong>סה"כ חוב:</strong> ${formatCurrency(data.totalDebt)}
        </p>
      </div>
      
      <h3 style="margin-top: 30px; text-align: right;">פירוט הלוואות:</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סכום</th>
            <th style="padding: 10px; border: 1px solid #ddd;">תאריך</th>
            <th style="padding: 10px; border: 1px solid #ddd;">יתרה</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${loansHtml || '<tr><td colspan="5" style="padding: 20px; text-align: center;">אין הלוואות</td></tr>'}
        </tbody>
      </table>
      
      ${expensesHtml}
    </div>
  `

  printHtml(htmlContent, `דוח לווה - ${data.borrowerName}`)
}

export function generateExpenseReceipt(data: {
  gemachName: string
  gemachLogo?: string
  borrowerName: string
  expense: {
    id: number
    description: string
    amount: number
    expense_date: string
    category: string
    payment_method?: string
  }
  receiptNumber: number
  dateFormat?: string
}) {
  const showHebrew = data.dateFormat === 'combined'
  const dateDisplay = new Date(data.expense.expense_date).toLocaleDateString('he-IL')
  const dateHebrew = showHebrew ? toHebrewDate(data.expense.expense_date) : ''
  
  const categoryLabels: Record<string, string> = {
    fee: 'עמלה',
    office: 'הוצאות משרד',
    bank: 'עמלת בנק',
    legal: 'משפטי',
    other: 'אחר'
  }
  
  const paymentLabels: Record<string, string> = {
    cash: 'מזומן',
    credit: 'אשראי',
    transfer: 'העברה',
    check: "צ'ק",
    other: 'אחר'
  }
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
      ${logoHtml}
      <h1 style="font-size: 24px; margin: 10px 0;">קבלה על תשלום הוצאה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>מספר קבלה: <strong>${data.receiptNumber}</strong></p>
        <p>התקבל מאת: <strong>${data.borrowerName}</strong></p>
        <p style="font-size: 20px; margin: 15px 0;">
          סכום: <strong>${formatCurrency(data.expense.amount)}</strong>
        </p>
        <p>תאריך: <strong>${dateDisplay}</strong>${dateHebrew ? ` <span style="color: #666;">(${dateHebrew})</span>` : ''}</p>
        <p>עבור: <strong>${data.expense.description}</strong></p>
        <p>קטגוריה: <strong>${categoryLabels[data.expense.category] || data.expense.category}</strong></p>
        ${data.expense.payment_method ? `<p>אמצעי תשלום: <strong>${paymentLabels[data.expense.payment_method] || data.expense.payment_method}</strong></p>` : ''}
      </div>
      
      <div style="margin: 30px 0; text-align: center; background: #e8f5e9; padding: 15px; border-radius: 8px;">
        <p style="font-size: 16px; margin: 0;">✅ התשלום התקבל בהצלחה</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;" />
      
      <div style="text-align: right; font-size: 14px;">
        <p>חתימת הגמ"ח: _______________________</p>
      </div>
      
      <div style="text-align: center; font-size: 12px; color: #666; margin-top: 20px;">
        <p>מסמך זה מהווה אישור על תשלום ההוצאה</p>
      </div>
    </div>
  `

  printHtml(htmlContent, `קבלה הוצאה ${data.receiptNumber}`)
}

export function generateFullReport(data: {
  gemachName: string
  gemachLogo?: string
  stats: {
    totalLoans: number
    activeLoans: number
    totalLoanAmount: number
    totalDeposits: number
    totalDepositAmount: number
    totalDonations: number
    totalDonationAmount: number
    availableCash: number
  }
  borrowers: Array<{ name: string; totalDebt: number }>
}) {
  const today = new Date().toLocaleDateString('he-IL')

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const borrowersHtml = data.borrowers.map((b, i) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${b.name}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(b.totalDebt)}</td>
    </tr>
  `).join('')

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        ${logoHtml}
        <h1 style="font-size: 24px; margin: 10px 0;">דוח כללי</h1>
        <h2 style="font-size: 16px; color: #666;">${data.gemachName}</h2>
        <p style="color: #999;">תאריך: ${today}</p>
      </div>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <h3 style="text-align: right;">סיכום מצב הגמ"ח:</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; text-align: right;">
        <tr>
          <td style="padding: 12px; border: 1px solid #ddd; background: #f9f9f9;"><strong>הלוואות פעילות</strong></td>
          <td style="padding: 12px; border: 1px solid #ddd;">${data.stats.activeLoans}</td>
          <td style="padding: 12px; border: 1px solid #ddd;">${formatCurrency(data.stats.totalLoanAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #ddd; background: #f9f9f9;"><strong>הפקדות</strong></td>
          <td style="padding: 12px; border: 1px solid #ddd;">${data.stats.totalDeposits}</td>
          <td style="padding: 12px; border: 1px solid #ddd;">${formatCurrency(data.stats.totalDepositAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #ddd; background: #f9f9f9;"><strong>תרומות</strong></td>
          <td style="padding: 12px; border: 1px solid #ddd;">${data.stats.totalDonations}</td>
          <td style="padding: 12px; border: 1px solid #ddd;">${formatCurrency(data.stats.totalDonationAmount)}</td>
        </tr>
        <tr style="background: ${data.stats.availableCash >= 0 ? '#e8f5e9' : '#ffebee'};">
          <td style="padding: 12px; border: 1px solid #ddd;"><strong>כסף זמין</strong></td>
          <td style="padding: 12px; border: 1px solid #ddd;" colspan="2">
            <strong>${formatCurrency(data.stats.availableCash)}</strong>
          </td>
        </tr>
      </table>
      
      <h3 style="text-align: right; margin-top: 30px;">רשימת לווים פעילים:</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; border: 1px solid #ddd;">#</th>
            <th style="padding: 10px; border: 1px solid #ddd;">שם</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סך חוב</th>
          </tr>
        </thead>
        <tbody>
          ${borrowersHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center;">אין לווים פעילים</td></tr>'}
        </tbody>
      </table>
    </div>
  `

  printHtml(htmlContent, 'דוח כללי')
}

export function generateDepositorReport(data: {
  gemachName: string
  gemachLogo?: string
  depositorName: string
  depositorPhone?: string
  depositorIdNumber?: string
  deposits: Array<{
    id: number
    amount: number
    deposit_date: string
    period_type: string
    due_date?: string
    status: string
    withdrawal_date?: string
    is_recurring: number
    withdrawals?: Array<{
      amount: number
      withdrawal_date: string
    }>
    withdrawn_amount?: number
    remaining?: number
  }>
  totalActive: number
  totalWithdrawn: number
  dateFormat?: string
}) {
  const today = new Date().toLocaleDateString('he-IL')
  const showHebrew = data.dateFormat === 'combined'

  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const depositsHtml = data.deposits.map(dep => {
    const withdrawn = dep.withdrawn_amount || 0
    const remaining = dep.remaining !== undefined ? dep.remaining : (dep.amount - withdrawn)
    const hasWithdrawals = dep.withdrawals && dep.withdrawals.length > 0
    const lastWithdrawalDate = hasWithdrawals && dep.withdrawals!.length > 0 
      ? new Date(dep.withdrawals![0].withdrawal_date).toLocaleDateString('he-IL')
      : '-'
    
    return `
    <tr style="background: ${remaining === 0 ? '#f5f5f5' : 'white'};">
      <td style="padding: 8px; border: 1px solid #ddd;">${dep.id}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(dep.amount)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${withdrawn > 0 ? `<span style="color: #f57c00;">${formatCurrency(withdrawn)}</span>` : '-'}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${remaining > 0 ? `<span style="color: #2e7d32; font-weight: bold;">${formatCurrency(remaining)}</span>` : `<span style="color: #666;">-</span>`}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${new Date(dep.deposit_date).toLocaleDateString('he-IL')}${showHebrew ? `<br/><small style="color:#666;">${toHebrewDate(dep.deposit_date)}</small>` : ''}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${dep.period_type === 'flexible' ? 'גמישה' : 'קבועה'}${dep.is_recurring ? ' 🔄' : ''}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${lastWithdrawalDate}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${remaining > 0 ? '<span style="color: green; font-weight: bold;">פעילה</span>' : '<span style="color: gray;">נמשכה</span>'}</td>
    </tr>
    ${hasWithdrawals ? `
    <tr style="background: #fff3e0;">
      <td colspan="8" style="padding: 8px; border: 1px solid #ddd;">
        <strong>פירוט משיכות:</strong>
        <table style="width: 100%; margin-top: 5px; border-collapse: collapse;">
          <thead>
            <tr style="background: #ffc107;">
              <th style="padding: 4px; border: 1px solid #ddd; font-size: 12px;">תאריך</th>
              <th style="padding: 4px; border: 1px solid #ddd; font-size: 12px;">סכום</th>
            </tr>
          </thead>
          <tbody>
            ${dep.withdrawals!.map(w => `
              <tr>
                <td style="padding: 4px; border: 1px solid #ddd; font-size: 12px; text-align: center;">${new Date(w.withdrawal_date).toLocaleDateString('he-IL')}</td>
                <td style="padding: 4px; border: 1px solid #ddd; font-size: 12px; text-align: center;">${formatCurrency(w.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </td>
    </tr>
    ` : ''}
  `}).join('')

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        ${logoHtml}
        <h1 style="font-size: 24px; margin: 10px 0;">דוח מפקיד</h1>
        <h2 style="font-size: 16px; color: #666;">${data.gemachName}</h2>
      </div>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 16px; background: #f5f5f5; padding: 15px; border-radius: 8px;">
        <p><strong>שם המפקיד:</strong> ${data.depositorName}</p>
        ${data.depositorPhone ? `<p><strong>טלפון:</strong> ${data.depositorPhone}</p>` : ''}
        ${data.depositorIdNumber ? `<p><strong>מ.ז.:</strong> ${data.depositorIdNumber}</p>` : ''}
        <p><strong>תאריך הפקה:</strong> ${today}</p>
      </div>
      
      <div style="display: flex; gap: 20px; margin: 20px 0; text-align: center;">
        <div style="flex: 1; background: #e8f5e9; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #2e7d32;">${formatCurrency(data.totalActive)}</div>
          <div style="color: #666;">יתרה פעילה</div>
        </div>
        <div style="flex: 1; background: #fff3e0; padding: 15px; border-radius: 8px;">
          <div style="font-size: 24px; font-weight: bold; color: #f57c00;">${formatCurrency(data.totalWithdrawn)}</div>
          <div style="color: #666;">סה"כ נמשך</div>
        </div>
      </div>
      
      <h3 style="text-align: right; margin-top: 30px;">פירוט הפקדות:</h3>
      
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #e3f2fd;">
            <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סכום מקורי</th>
            <th style="padding: 10px; border: 1px solid #ddd;">נמשך</th>
            <th style="padding: 10px; border: 1px solid #ddd;">יתרה</th>
            <th style="padding: 10px; border: 1px solid #ddd;">תאריך הפקדה</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סוג</th>
            <th style="padding: 10px; border: 1px solid #ddd;">משיכה אחרונה</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${depositsHtml || '<tr><td colspan="8" style="padding: 20px; text-align: center;">אין הפקדות</td></tr>'}
        </tbody>
      </table>
      
      <div style="margin-top: 30px; text-align: right; font-size: 12px; color: #666;">
        <p>🔄 = הפקדה מחזורית</p>
      </div>
    </div>
  `

  printHtml(htmlContent, `דוח מפקיד - ${data.depositorName}`)
}


// Email functionality
export type EmailProvider = 'gmail' | 'outlook' | 'default'

export interface EmailData {
  to: string
  subject: string
  body: string
  documentType: 'loan' | 'deposit' | 'donation' | 'borrower_report' | 'depositor_report' | 'guarantor_debt'
  htmlContent?: string
  filename?: string
}

export async function openEmailWithDocument(data: EmailData, provider: EmailProvider = 'gmail'): Promise<{ success: boolean; message: string }> {
  if (!data.to) {
    return { success: false, message: 'לא הוזנה כתובת מייל' }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(data.to)) {
    return { success: false, message: 'כתובת מייל לא תקינה' }
  }

  // Download PDF first if HTML content provided
  if (data.htmlContent && data.filename) {
    await downloadPdf(data.htmlContent, data.filename)
  }

  let url: string
  
  if (provider === 'gmail') {
    url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(data.to)}&su=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`
  } else if (provider === 'outlook') {
    url = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(data.to)}&subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`
  } else {
    url = `mailto:${encodeURIComponent(data.to)}?subject=${encodeURIComponent(data.subject)}&body=${encodeURIComponent(data.body)}`
  }
  
  await openUrl(url)
  
  return { 
    success: true, 
    message: data.htmlContent ? 'המסמך הורד וחלון המייל נפתח. אנא צרף את הקובץ שהורד.' : 'חלון המייל נפתח.'
  }
}

export function createLoanEmailData(params: {
  gemachName: string
  borrowerName: string
  borrowerEmail: string
  amount: number
  loanDate: string
  dueDate?: string
  loanType: string
  gemachLogo?: string
  guarantor1Name?: string
  guarantor2Name?: string
  dateFormat?: string
}): EmailData {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.loanDate).toLocaleDateString('he-IL')
  const showHebrew = params.dateFormat === 'combined'
  
  // Generate HTML for PDF
  const loanDateHebrew = showHebrew ? toHebrewDate(params.loanDate) : ''
  const dueDateDisplay = params.dueDate ? new Date(params.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && params.dueDate ? toHebrewDate(params.dueDate) : ''
  
  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const guarantorsHtml = (params.guarantor1Name || params.guarantor2Name) ? `
    <div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px;">
      <div style="font-weight: bold; margin-bottom: 10px;">ערבים:</div>
      ${params.guarantor1Name ? `<div style="margin-bottom: 15px;"><span>ערב 1: ${params.guarantor1Name}</span></div>` : ''}
      ${params.guarantor2Name ? `<div><span>ערב 2: ${params.guarantor2Name}</span></div>` : ''}
    </div>
  ` : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px;">
      ${logoHtml}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הלוואה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${params.gemachName}</h2>
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>אני הח"מ <strong>${params.borrowerName}</strong></p>
        <p>מאשר בזה כי לוויתי מגמ"ח "<strong>${params.gemachName}</strong>"</p>
        <p style="font-size: 20px; margin: 20px 0;">סכום של: <strong>${formattedAmount}</strong></p>
        <p>בתאריך: <strong>${formattedDate}</strong>${loanDateHebrew ? ` <span style="color: #666;">(${loanDateHebrew})</span>` : ''}</p>
        <p style="margin-top: 20px;">
          ${params.loanType === 'fixed' && dueDateDisplay 
            ? `אני מתחייב להחזיר את הסכום עד תאריך: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}`
            : 'אני מתחייב להחזיר את הסכום לפי התראה'
          }
        </p>
      </div>
      ${guarantorsHtml}
    </div>
  `
  
  return {
    to: params.borrowerEmail,
    subject: `שטר הלוואה - ${params.gemachName}`,
    body: `שלום ${params.borrowerName},

מצורף שטר הלוואה מגמ"ח "${params.gemachName}".

פרטי ההלוואה:
- סכום: ${formattedAmount}
- תאריך: ${formattedDate}

אנא הדפס, חתום והחזר את השטר.

בברכה,
${params.gemachName}`,
    documentType: 'loan',
    htmlContent,
    filename: `שטר-הלוואה-${params.borrowerName}`
  }
}

export function createDepositEmailData(params: {
  gemachName: string
  depositorName: string
  depositorEmail: string
  amount: number
  depositDate: string
  periodType: string
  dueDate?: string
  gemachLogo?: string
  dateFormat?: string
  withdrawals?: Array<{
    amount: number
    withdrawal_date: string
  }>
}): EmailData {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.depositDate).toLocaleDateString('he-IL')
  const showHebrew = params.dateFormat === 'combined'
  
  const depositDateHebrew = showHebrew ? toHebrewDate(params.depositDate) : ''
  const dueDateDisplay = params.dueDate ? new Date(params.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && params.dueDate ? toHebrewDate(params.dueDate) : ''
  
  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''
  
  // חישוב משיכות
  const totalWithdrawn = params.withdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0
  const remaining = params.amount - totalWithdrawn
  
  // HTML למשיכות
  const withdrawalsHtml = params.withdrawals && params.withdrawals.length > 0 ? `
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
          ${params.withdrawals.map(w => `
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
      ${logoHtml}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הפקדה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${params.gemachName}</h2>
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>אני הח"מ מנהל גמ"ח "<strong>${params.gemachName}</strong>"</p>
        <p>מאשר בזה כי קיבלתי הפקדה מאת: <strong>${params.depositorName}</strong></p>
        <p style="font-size: 20px; margin: 20px 0;">סכום הפקדה מקורי: <strong>${formattedAmount}</strong></p>
        <p>בתאריך: <strong>${formattedDate}</strong>${depositDateHebrew ? ` <span style="color: #666;">(${depositDateHebrew})</span>` : ''}</p>
        <p style="margin-top: 20px;">
          סוג הפקדה: <strong>${params.periodType === 'fixed' ? 'קבועה' : 'גמישה'}</strong>
          ${dueDateDisplay ? `<br/>תאריך סיום: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}` : ''}
        </p>
      </div>
      ${withdrawalsHtml}
    </div>
  `
  
  return {
    to: params.depositorEmail,
    subject: `שטר הפקדה - ${params.gemachName}`,
    body: `שלום ${params.depositorName},

מצורף שטר הפקדה מגמ"ח "${params.gemachName}".

פרטי ההפקדה:
- סכום: ${formattedAmount}
- תאריך: ${formattedDate}

תודה על אמונך בגמ"ח!

בברכה,
${params.gemachName}`,
    documentType: 'deposit',
    htmlContent,
    filename: `שטר-הפקדה-${params.depositorName}`
  }
}

// Email data for donation receipt
export function createDonationEmailData(params: {
  gemachName: string
  donorName: string
  donorEmail: string
  amount: number
  donationDate: string
  receiptNumber: number
  gemachLogo?: string
  dateFormat?: string
}): EmailData {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.donationDate).toLocaleDateString('he-IL')
  const showHebrew = params.dateFormat === 'combined'
  const dateHebrew = showHebrew ? toHebrewDate(params.donationDate) : ''
  
  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
      ${logoHtml}
      <h1 style="font-size: 24px; margin: 10px 0;">קבלה על תרומה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${params.gemachName}</h2>
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>מספר קבלה: <strong>${params.receiptNumber}</strong></p>
        <p>התקבל מאת: <strong>${params.donorName}</strong></p>
        <p style="font-size: 20px; margin: 15px 0;">סכום: <strong>${formattedAmount}</strong></p>
        <p>תאריך: <strong>${formattedDate}</strong>${dateHebrew ? ` <span style="color: #666;">(${dateHebrew})</span>` : ''}</p>
      </div>
      <div style="margin: 30px 0; text-align: center;">
        <p style="font-size: 18px; font-weight: bold;">תודה רבה על תרומתך!</p>
        <p style="font-size: 16px;">יישר כח!</p>
      </div>
    </div>
  `
  
  return {
    to: params.donorEmail,
    subject: `קבלה על תרומה #${params.receiptNumber} - ${params.gemachName}`,
    body: `שלום ${params.donorName},

מצורפת קבלה על תרומתך לגמ"ח "${params.gemachName}".

פרטי התרומה:
- מספר קבלה: ${params.receiptNumber}
- סכום: ${formattedAmount}
- תאריך: ${formattedDate}

תודה רבה על תרומתך!
יישר כח!

בברכה,
${params.gemachName}`,
    documentType: 'donation',
    htmlContent,
    filename: `קבלה-${params.receiptNumber}-${params.donorName}`
  }
}

// Email data for borrower report
export function createBorrowerReportEmailData(params: {
  gemachName: string
  borrowerName: string
  borrowerEmail: string
  totalDebt: number
  loans: Array<{ id: number; amount: number; loanDate: string; remaining: number; status: string }>
}): EmailData {
  const formattedDebt = formatCurrency(params.totalDebt)
  
  const loansHtml = params.loans.map(loan => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${loan.id}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(loan.amount)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${new Date(loan.loanDate).toLocaleDateString('he-IL')}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(loan.remaining)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${loan.status === 'active' ? 'פעילה' : loan.status === 'planned' ? 'מתוכננת' : 'נפרעה'}</td>
    </tr>
  `).join('')

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        <h1 style="font-size: 24px; margin: 10px 0;">דוח לווה</h1>
        <h2 style="font-size: 16px; color: #666;">${params.gemachName}</h2>
      </div>
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px;">
        <p><strong>שם הלווה:</strong> ${params.borrowerName}</p>
        <p><strong>תאריך הפקה:</strong> ${new Date().toLocaleDateString('he-IL')}</p>
        <p style="font-size: 18px; margin-top: 15px;"><strong>סה"כ חוב:</strong> ${formattedDebt}</p>
      </div>
      <h3 style="text-align: right; margin-top: 30px;">פירוט הלוואות:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סכום</th>
            <th style="padding: 10px; border: 1px solid #ddd;">תאריך</th>
            <th style="padding: 10px; border: 1px solid #ddd;">יתרה</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${loansHtml || '<tr><td colspan="5" style="padding: 20px; text-align: center;">אין הלוואות</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  
  return {
    to: params.borrowerEmail,
    subject: `דוח הלוואות - ${params.gemachName}`,
    body: `שלום ${params.borrowerName},

מצורף דוח הלוואות מגמ"ח "${params.gemachName}".

סה"כ יתרת חוב: ${formattedDebt}

בברכה,
${params.gemachName}`,
    documentType: 'borrower_report',
    htmlContent,
    filename: `דוח-לווה-${params.borrowerName}`
  }
}

// Email data for depositor report
export function createDepositorReportEmailData(params: {
  gemachName: string
  depositorName: string
  depositorEmail: string
  totalActive: number
  deposits: Array<{ id: number; amount: number; deposit_date: string; period_type: string; status: string }>
}): EmailData {
  const formattedTotal = formatCurrency(params.totalActive)
  
  const depositsHtml = params.deposits.map(dep => `
    <tr style="background: ${dep.status === 'withdrawn' ? '#f5f5f5' : 'white'};">
      <td style="padding: 8px; border: 1px solid #ddd;">${dep.id}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(dep.amount)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${new Date(dep.deposit_date).toLocaleDateString('he-IL')}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${dep.period_type === 'flexible' ? 'גמישה' : 'קבועה'}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${dep.status === 'active' ? 'פעילה' : 'נמשכה'}</td>
    </tr>
  `).join('')

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        <h1 style="font-size: 24px; margin: 10px 0;">דוח מפקיד</h1>
        <h2 style="font-size: 16px; color: #666;">${params.gemachName}</h2>
      </div>
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px;">
        <p><strong>שם המפקיד:</strong> ${params.depositorName}</p>
        <p><strong>תאריך הפקה:</strong> ${new Date().toLocaleDateString('he-IL')}</p>
        <p style="font-size: 18px; margin-top: 15px;"><strong>סה"כ הפקדות פעילות:</strong> ${formattedTotal}</p>
      </div>
      <h3 style="text-align: right; margin-top: 30px;">פירוט הפקדות:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #e3f2fd;">
            <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סכום</th>
            <th style="padding: 10px; border: 1px solid #ddd;">תאריך</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סוג</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${depositsHtml || '<tr><td colspan="5" style="padding: 20px; text-align: center;">אין הפקדות</td></tr>'}
        </tbody>
      </table>
    </div>
  `
  
  return {
    to: params.depositorEmail,
    subject: `דוח הפקדות - ${params.gemachName}`,
    body: `שלום ${params.depositorName},

מצורף דוח הפקדות מגמ"ח "${params.gemachName}".

סה"כ הפקדות פעילות: ${formattedTotal}

בברכה,
${params.gemachName}`,
    documentType: 'depositor_report',
    htmlContent,
    filename: `דוח-מפקיד-${params.depositorName}`
  }
}

// Email data for guarantor debt notification
export function createGuarantorDebtEmailData(params: {
  gemachName: string
  guarantorName: string
  guarantorEmail: string
  borrowerName: string
  originalAmount: number
  guarantorAmount: number
  guarantorRemaining: number
  dueDate?: string
  monthlyPayments?: number
  gemachLogo?: string
  dateFormat?: string
}): EmailData {
  const formattedOriginal = formatCurrency(params.originalAmount)
  const formattedAmount = formatCurrency(params.guarantorAmount)
  const formattedRemaining = formatCurrency(params.guarantorRemaining)
  const today = new Date().toLocaleDateString('he-IL')
  
  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const dueDateInfo = params.dueDate 
    ? `תאריך פירעון: <strong>${new Date(params.dueDate).toLocaleDateString('he-IL')}</strong>`
    : params.monthlyPayments 
      ? `תשלומים חודשיים: <strong>${params.monthlyPayments}</strong>`
      : ''

  const htmlContent = `
    <div style="padding: 20px; direction: rtl; font-family: Arial, sans-serif;">
      <div style="text-align: center;">
        ${logoHtml}
        <h1 style="font-size: 24px; margin: 10px 0; color: #d32f2f;">הודעת חוב לערב</h1>
        <h2 style="font-size: 16px; color: #666;">${params.gemachName}</h2>
      </div>
      <hr style="border: none; border-top: 2px solid #d32f2f; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>לכבוד: <strong>${params.guarantorName}</strong></p>
        <p>תאריך: ${today}</p>
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;">הנדון: <strong>הודעה על מימוש ערבות</strong></p>
        </div>
        <p>הריני להודיעך כי הלווה <strong>${params.borrowerName}</strong> לא עמד בהתחייבויותיו לפירעון ההלוואה.</p>
        <p>בהתאם לערבותך, הנך נדרש/ת לפרוע את החוב כדלקמן:</p>
        <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;">סכום ההלוואה המקורית: ${formattedOriginal}</p>
          <p style="margin: 5px 0;">חלקך בערבות: ${formattedAmount}</p>
          <p style="margin: 5px 0; font-size: 20px;"><strong>יתרה לתשלום: ${formattedRemaining}</strong></p>
          ${dueDateInfo ? `<p style="margin: 5px 0;">${dueDateInfo}</p>` : ''}
        </div>
        <p>נא ליצור קשר בהקדם לתיאום התשלום.</p>
        <p style="margin-top: 30px;">בברכה,<br/><strong>${params.gemachName}</strong></p>
      </div>
    </div>
  `
  
  return {
    to: params.guarantorEmail,
    subject: `הודעת חוב - מימוש ערבות - ${params.gemachName}`,
    body: `שלום ${params.guarantorName},

הריני להודיעך כי הלווה ${params.borrowerName} לא עמד בהתחייבויותיו לפירעון ההלוואה.

בהתאם לערבותך, הנך נדרש/ת לפרוע את החוב:

- סכום ההלוואה המקורית: ${formattedOriginal}
- חלקך בערבות: ${formattedAmount}
- יתרה לתשלום: ${formattedRemaining}
${params.dueDate ? `- תאריך פירעון: ${new Date(params.dueDate).toLocaleDateString('he-IL')}` : ''}
${params.monthlyPayments ? `- תשלומים חודשיים: ${params.monthlyPayments}` : ''}

נא ליצור קשר בהקדם לתיאום התשלום.

בברכה,
${params.gemachName}`,
    documentType: 'guarantor_debt',
    htmlContent,
    filename: `הודעת-חוב-ערב-${params.guarantorName}`
  }
}
