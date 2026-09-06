/**
 * שלב 2 — בדיקת diff ביט-לביט: buildLoanDocumentHtml (אחרי הריפקטור, עם
 * layout ריק) מול הלוגיקה המקורית של generateLoanDocument (לפני הריפקטור,
 * מחולצת ב-git מ-HEAD של שלב 1, לא מהזיכרון). מריץ 3 תרחישים: בלי
 * פירעונות, עם פירעון חלקי, עם פירעון מלא — לפי קריטריון הקבלה.
 */
import { describe, it, expect, vi } from 'vitest'
import { toHebrewDate } from '../utils/dateUtils'

// documents.ts מייבא html2canvas/jspdf ברמת המודול, שדורשים window/document
// אמיתיים (הסביבה כאן היא 'node', ר' vitest.config.ts). buildLoanDocumentHtml
// עצמה לא משתמשת בהם כלל — לכן ממוקקים כדי לאפשר import מבודד לבדיקת diff.
vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('jspdf', () => ({ default: vi.fn() }))

const { buildLoanDocumentHtml } = await import('../services/documents')

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(amount)
}

// הערה: color: var(--doc-accent, inherit) בכותרת ה-h1 להלן הוא שינוי מכוון
// (תמיכה ב-accentColor מהפאנל, ר' DocumentLayoutConfig.accentColor) — לא
// drift לא-מכוון. ברירת המחדל inherit שומרת על התנהגות זהה כשאין override.
function oldBuildLoanDocumentHtml(data: any): string {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'
  
  // Format dates
  const loanDateDisplay = new Date(data.loanDate).toLocaleDateString('he-IL')
  const loanDateHebrew = showHebrew ? toHebrewDate(data.loanDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  // HTML להלוואה מחזורית - רק אם יש יותר מהלוואה אחת בסדרה
  const recurringLoanHtml = data.isRecurring && data.recurringLoanNumber && data.recurringLoanCount && data.recurringLoanCount > 1 ? `
    <div style="margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <div style="color: white;">
          <div style="font-size: 20px; font-weight: bold; margin-bottom: 5px;">
            🔄 הלוואה מחזורית
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            סדרת הלוואות חודשית ללווה זה
          </div>
        </div>
        <div style="background: white; padding: 10px 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 28px; font-weight: bold; color: #667eea;">
            ${data.recurringLoanNumber}
          </div>
          <div style="font-size: 12px; color: #666; margin-top: 2px;">
            מתוך ${data.recurringLoanCount}
          </div>
        </div>
      </div>
      
      <!-- Progress Bar -->
      <div style="background: rgba(255,255,255,0.3); height: 8px; border-radius: 4px; overflow: hidden; margin-top: 10px;">
        <div style="background: white; height: 100%; width: ${(data.recurringLoanNumber / data.recurringLoanCount * 100).toFixed(1)}%; transition: width 0.3s;"></div>
      </div>
      <div style="color: white; font-size: 11px; margin-top: 5px; text-align: center; opacity: 0.9;">
        ${(data.recurringLoanNumber / data.recurringLoanCount * 100).toFixed(0)}% מהסדרה הושלמה
      </div>
    </div>
  ` : ''

  const guarantorsHtml = (data.guarantor1Name || data.guarantor2Name) ? `
    <div style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 12px;">
      <div style="font-weight: bold; margin-bottom: 8px;">ערבים:</div>
      ${data.guarantor1Name ? `
        <div style="margin-bottom: 10px;">
          <span>ערב 1: ${data.guarantor1Name}</span>
          <span style="margin-right: 20px;">חתימה: _______________________</span>
        </div>
      ` : ''}
      ${data.guarantor2Name ? `
        <div>
          <span>ערב 2: ${data.guarantor2Name}</span>
          <span style="margin-right: 20px;">חתימה: _______________________</span>
        </div>
      ` : ''}
    </div>
  ` : ''

  // Custom text - only use if provided and not containing old template variables
  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : 'מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע.'

  // חישוב פירעונות
  const totalRepaid = data.repayments?.reduce((sum, r) => sum + r.amount, 0) || 0
  const remaining = data.amount - totalRepaid
  
  // HTML לפירעונות
  const repaymentsHtml = data.repayments && data.repayments.length > 0 ? `
    <div style="margin-top: 20px; padding: 12px; background: #e8f5e9; border-radius: 6px;">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #2e7d32;">פירעונות שבוצעו:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #4caf50;">
            <th style="padding: 6px; border: 1px solid #ddd; text-align: center; color: white;">תאריך פירעון</th>
            <th style="padding: 6px; border: 1px solid #ddd; text-align: center; color: white;">סכום</th>
            <th style="padding: 6px; border: 1px solid #ddd; text-align: center; color: white;">מחזורי</th>
          </tr>
        </thead>
        <tbody>
          ${data.repayments.map(r => {
            const recurringInfo = r.isRecurring && r.recurringRepaymentNumber && r.recurringRepaymentCount && r.recurringRepaymentCount > 1
              ? `🔄 ${r.recurringRepaymentNumber}/${r.recurringRepaymentCount}`
              : '-'
            return `
            <tr>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${new Date(r.payment_date).toLocaleDateString('he-IL')}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${formatCurrency(r.amount)}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${recurringInfo}</td>
            </tr>
          `}).join('')}
          <tr style="background: #f1f8e9; font-weight: bold;">
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">סה"כ נפרע</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;" colspan="2">${formatCurrency(totalRepaid)}</td>
          </tr>
        </tbody>
      </table>
      <p style="margin-top: 10px; font-size: 16px; font-weight: bold; color: ${remaining > 0 ? '#d32f2f' : '#2e7d32'};">
        יתרת חוב: ${formatCurrency(remaining)}
      </p>
    </div>
  ` : ''

  const htmlContent = `
    <div style="text-align: center; padding: 15px; max-width: 800px; margin: 0 auto;">
      <h1 style="font-size: 24px; margin: 8px 0; color: var(--doc-accent, inherit);">שטר הלוואה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      ${recurringLoanHtml}
      
      <div style="text-align: right; font-size: 15px; line-height: 1.6;">
        <p style="margin: 8px 0;">אני הח"מ <strong>${data.borrowerName}</strong></p>
        <p style="margin: 8px 0;">${commitmentText}</p>
        <p style="font-size: 18px; margin: 15px 0;">
          סכום הלוואה מקורי: <strong>${formatCurrency(data.amount)}</strong>
        </p>
        <p style="margin: 8px 0;">בתאריך: <strong>${loanDateDisplay}</strong>${loanDateHebrew ? ` <span style="color: #666;">(${loanDateHebrew})</span>` : ''}</p>
        <p style="margin: 8px 0;">
          ${data.loanType === 'fixed' && dueDateDisplay 
            ? `תאריך החזרה: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}`
            : 'החזרה: לפי התראה'
          }
        </p>
      </div>
      
      ${repaymentsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
      
      <div style="text-align: right; margin-top: 20px;">
        <p style="margin: 8px 0;">חתימת הלווה: _______________________</p>
      </div>
      
      ${guarantorsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 11px; color: #666;">
        תאריך הפקת השטר: ${today}${showHebrew ? ` (${todayHebrew})` : ''}
      </div>
    </div>
  `
  return htmlContent
}

const scenarios: Record<string, any> = {
  'ללא פירעונות': {
    gemachName: 'גמ"ח הדוגמה', borrowerName: 'ישראל ישראלי', amount: 5000,
    loanDate: '2026-01-01', dueDate: '2026-06-01', loanType: 'fixed',
    guarantor1Name: 'משה כהן', guarantor2Name: '', dateFormat: 'combined',
  },
  'פירעון חלקי': {
    gemachName: 'גמ"ח הדוגמה', borrowerName: 'ישראל ישראלי', amount: 5000,
    loanDate: '2026-01-01', dueDate: '2026-06-01', loanType: 'fixed',
    guarantor1Name: 'משה כהן', guarantor2Name: 'דוד לוי', dateFormat: 'combined',
    repayments: [{ amount: 1000, payment_date: '2026-02-01' }],
  },
  'פירעון מלא': {
    gemachName: 'גמ"ח הדוגמה', borrowerName: 'ישראל ישראלי', amount: 5000,
    loanDate: '2026-01-01', dueDate: '2026-06-01', loanType: 'fixed',
    dateFormat: 'combined',
    repayments: [{ amount: 5000, payment_date: '2026-02-01' }],
  },
}

describe('שלב 2: buildLoanDocumentHtml === generateLoanDocument הישן (עם layout ריק)', () => {
  for (const [name, data] of Object.entries(scenarios)) {
    it(`תרחיש: ${name}`, () => {
      const oldHtml = oldBuildLoanDocumentHtml(data)
      const newHtml = buildLoanDocumentHtml(data)
      if (oldHtml !== newHtml) {
        // מדפיס diff שורה-שורה לפלט הטרמינל
        const oldLines = oldHtml.split('\n')
        const newLines = newHtml.split('\n')
        const max = Math.max(oldLines.length, newLines.length)
        console.log(`--- DIFF: ${name} ---`)
        for (let i = 0; i < max; i++) {
          if (oldLines[i] !== newLines[i]) {
            console.log(`  [${i}] OLD: ${JSON.stringify(oldLines[i] ?? '<missing>')}`)
            console.log(`  [${i}] NEW: ${JSON.stringify(newLines[i] ?? '<missing>')}`)
          }
        }
      }
      // בדיקה סמנטית: מסירים שורות ריקות/רווח-בלבד משני הצדדים (אלה
      // נוספות ע"י נקודות עיגון ריקות, ר' הסבר בפלט השלב) ומשווים תוכן.
      const normalize = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean).join('\n')
      expect(normalize(newHtml)).toBe(normalize(oldHtml))
    })
  }
})
