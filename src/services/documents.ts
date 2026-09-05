import { toHebrewDate } from '../utils/dateUtils'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { DocumentLayoutConfig } from '../types/documentLayout'

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
// מזהה את פורמט התמונה (PNG/JPEG/וכו') מתוך data URL, כי jsPDF דורש
// שהפורמט המוצהר יתאים לתמונה בפועל, אחרת הציור עלול להיכשל בשקט או
// להיראות פגום. תמונת מסגרת שמנהל מעלה יכולה להיות כל פורמט — לא רק
// PNG (בניגוד לתוכן המסמך עצמו, שתמיד PNG כי מגיע מ-html2canvas).
const detectImageFormat = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:image\/(\w+);/)
  const ext = match?.[1]?.toUpperCase()
  return ext === 'JPG' ? 'JPEG' : (ext || 'PNG')
}

export const downloadPdf = async (
  htmlContent: string, 
  filename: string, 
  frameImageBase64?: string,
  margins?: { top: number; bottom: number; right: number; left: number }
): Promise<string | null> => {
  return new Promise((resolve) => {
    const hasFrame = !!frameImageBase64

    // באג אמיתי שנמצא בבדיקה ידנית: הרקע הלבן האטום + ה-padding כאן היו
    // מוחלים תמיד, גם כשיש מסגרת — וה-PNG שיצא מ-html2canvas "בלע" את
    // הרקע הלבן כחלק מהתמונה עצמה. התוצאה: מלבן לבן צף מעל המסגרת, לא
    // תוכן שמתמזג איתה. כשיש מסגרת: רקע שקוף לגמרי (גם ב-CSS וגם דרך
    // backgroundColor:null ב-html2canvas, כדי לקבל ערוץ אלפא אמיתי ב-PNG)
    // כך שהמסגרת שמצוירת מתחת (ר' drawFrameOnCurrentPage) נראית דרך
    // האזורים שאין בהם טקסט. בלי מסגרת — בדיוק כמו קודם (רקע לבן רגיל).
    const container = document.createElement('div')
    container.style.cssText = `position:absolute;left:-9999px;top:0;width:750px;direction:rtl;font-family:Arial,sans-serif;background:${hasFrame ? 'transparent' : 'white'};padding:${hasFrame ? '0' : '20px'};`
    container.innerHTML = htmlContent
    document.body.appendChild(container)
    
    // Wait for fonts and images to load
    setTimeout(async () => {
      try {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        })
        
        const pageWidth = 210 // A4 width in mm
        const pageHeight = 297 // A4 height in mm

        // margins קובעים כמה "מרווח בטיחות" יש לתוכן מקצוות הדף, כדי
        // שלא יתנגש ויזואלית עם עיצוב תמונת המסגרת (שמצוירת כרקע מלא-עמוד,
        // ר' drawFrameOnCurrentPage). בלי מסגרת אין סיבה לצמצם את התוכן.
        const m = hasFrame ? (margins ?? { top: 0, bottom: 0, right: 0, left: 0 }) : { top: 0, bottom: 0, right: 0, left: 0 }
        const contentX = m.left
        const contentWidth = pageWidth - m.left - m.right
        const usablePageHeight = pageHeight - m.top - m.bottom
        
        // Use html2canvas with better settings
        const canvas = await html2canvas(container, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          windowWidth: 750,
          backgroundColor: hasFrame ? null : '#ffffff',
        })
        
        const imgData = canvas.toDataURL('image/png', 0.95)
        const imgWidth = contentWidth
        const imgHeight = (canvas.height * contentWidth) / canvas.width

        const frameImageFormat = frameImageBase64 ? detectImageFormat(frameImageBase64) : 'PNG'
        const drawFrameOnCurrentPage = () => {
          // תמונת רקע מלאה מאחורי כל התוכן (עמוד שלם) — נמתחת לכיסוי כל
          // הדף (0,0 עד pageWidth/pageHeight), מצוירת לפני התוכן כך שהתוכן
          // תמיד גלוי מעליה.
          if (frameImageBase64) {
            pdf.addImage(frameImageBase64, frameImageFormat, 0, 0, pageWidth, pageHeight, undefined, 'FAST')
          }
        }
        
        // מצייר את פלח התוכן של העמוד הנוכחי (מתוך התמונה הרציפה האחת,
        // שמוזזת כלפי מעלה ב-position לכל עמוד נוסף) כשהוא חתוך (clip)
        // בדיוק לאזור השמיש שבין השוליים.
        //
        // באג אמיתי שנמצא בבדיקה ידנית (דו"ח לווה רב-עמודים): בלי ה-clip
        // הזה, מהעמוד השני ואילך position שלילי דוחף את תחילת התמונה אל
        // מעל לגבול העליון של העמוד (y<0) — ומכיוון שאין שום דבר שחותך את
        // מה שמעל y=0, בפועל רואים תוכן ממש מ-y=0 של העמוד, בלי שום רווח
        // שוליים עליון. בעמוד הראשון כן רואים רווח כזה (כי שם position=0
        // ותחילת התמונה ב-y=m.top בדיוק), ולכן ההתנהגות נראית כאילו כל
        // עמוד נוסף "שוכח" את השוליים/המסגרת שהוגדרו ומתחיל מתחילת העמוד
        // ממש. ה-clip מבטיח שרק האזור [m.top, pageHeight-m.bottom] אי-פעם
        // מוצג, בכל עמוד כולל הראשון, כך שהתוכן העודף מעל/מתחת לאזור הזה
        // (שנובע מהזזת התמונה השלמה) פשוט לא מצויר — בדיוק כמו שהעמוד
        // הראשון מתנהג היום.
        const drawContentClipped = () => {
          if (hasFrame) {
            pdf.saveGraphicsState()
            pdf.rect(contentX, m.top, contentWidth, usablePageHeight, null)
            pdf.clip()
            pdf.discardPath()
          }
          pdf.addImage(imgData, 'PNG', contentX, m.top + position, imgWidth, imgHeight, undefined, 'FAST')
          if (hasFrame) {
            pdf.restoreGraphicsState()
          }
        }

        let heightLeft = imgHeight
        let position = 0
        
        // Add first page
        drawFrameOnCurrentPage()
        drawContentClipped()
        heightLeft -= usablePageHeight
        
        // Add additional pages if content is longer
        while (heightLeft > 0) {
          position -= usablePageHeight
          pdf.addPage()
          drawFrameOnCurrentPage()
          drawContentClipped()
          heightLeft -= usablePageHeight
        }
        
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
            @page { size: A4; margin: 0; }
            * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            body { 
              font-family: 'Heebo', Arial, sans-serif; 
              direction: rtl; 
              margin: 0;
              padding: 0;
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
        @page { size: A4; margin: 0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { 
          font-family: 'Heebo', Arial, sans-serif; 
          direction: rtl; 
          margin: 0;
          padding: 0;
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
            z-index: 1000;
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
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
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
  isRecurring?: boolean
  recurringLoanNumber?: number
  recurringLoanCount?: number
  repayments?: Array<{
    amount: number
    payment_date: string
    isRecurring?: boolean
    recurringRepaymentNumber?: number
    recurringRepaymentCount?: number
  }>
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
  }).format(amount)
}

interface DocumentBrandingOptions {
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
}

/**
 * document_layouts הוא מקור האמת אחרי המיגרציה. אם הוא קיים, גם מסמך
 * ללא frame מבטל במפורש את המסגרת הגלובלית הישנה עבור אותו מסמך.
 * בהיעדר layout נשמרת התאימות להגדרות הישנות.
 */
export function resolveDocumentBranding(
  legacy: DocumentBrandingOptions,
  layout?: DocumentLayoutConfig
): DocumentBrandingOptions {
  if (!layout) return legacy

  const frame = layout.frame
  return {
    gemachLogo: legacy.gemachLogo,
    gemachDocumentFrame: frame?.imageBase64,
    frameMarginTop: frame?.marginTop,
    frameMarginBottom: frame?.marginBottom,
    frameMarginRight: frame?.marginRight,
    frameMarginLeft: frame?.marginLeft,
  }
}

/**
 * עוטף תוכן HTML של מסמך עם מיתוג הגמ"ח.
 * החלטה בלבד אם להציג לוגו רגיל או לא - ללא ציור מסגרת ב-CSS.
 * אם קיימת gemachDocumentFrame — מחזיר רק את innerHtml (ללא לוגו, המסגרת תצויר ב-downloadPdf).
 * אם אין מסגרת — מחזיר לוגו + innerHtml כרגיל.
 */
/**
 * הימלטות HTML entity לכל טקסט חופשי לפני הזרקה ל-HTML — חובה לפי
 * רשימת הבאגים הצפויים (#1, XSS/הזרקת HTML). מוחל על customBlocks
 * ו-labelOverrides בכל 8 הפונקציות (4 מסמכים × 2 נתיבים).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * מרנדר את כל בלוקי הטקסט החופשי המצורפים לעוגן נתון, ממוינים לפי order.
 * תומך ביותר מבלוק אחד על אותו עוגן (ר' שלב 1 — CustomTextBlock[]).
 * direction מפורש כדי למנוע התנגשות יישור שמאל/ימין מול RTL (באג #4).
 */
function renderCustomBlocks(anchorId: string, layout?: DocumentLayoutConfig): string {
  if (!layout?.customBlocks?.length) return ''
  const blocks = layout.customBlocks
    .filter(b => b.anchorId === anchorId)
    .sort((a, b) => a.order - b.order)
  if (blocks.length === 0) return ''

  return blocks.map(b => {
    const weight = b.bold ? 'font-weight: bold;' : ''
    const underline = b.underline ? 'text-decoration: underline;' : ''
    const dir = b.align === 'left' ? 'ltr' : 'rtl'
    return `<div style="text-align: ${b.align}; direction: ${dir}; font-family: '${b.fontFamily}', Arial, sans-serif; font-size: ${b.fontSize}px; ${weight} ${underline} margin: 8px 0;">${escapeHtml(b.text)}</div>`
  }).join('')
}

/**
 * חשוב: זה **לא** קשור ל-`field_labels` הישן (שמות שדות בטופס קליטת
 * לווה, כמו "שם פרטי"/"טלפון") — זו מערכת נפרדת לגמרי, ללא חפיפה.
 * `labelOverrides` כאן דורס תוויות שמודפסות בגוף המסמך עצמו (למשל
 * "אני הח״מ"/"סכום הלוואה מקורי:"). בדקתי את שתי המערכות בפועל בקוד
 * לפני כתיבת השורה הזו — אין ביניהן שום קשר, בניגוד להנחה קודמת שלי.
 */
function label(key: string, fallback: string, layout?: DocumentLayoutConfig): string {
  const override = layout?.labelOverrides?.[key]
  return override ? escapeHtml(override) : fallback
}

/** true אלא אם showSystemBlocks[key] === false במפורש (באג #9: הסתרה היא opt-in מפורש, לא ברירת מחדל) */
function isSystemBlockVisible(key: string, layout?: DocumentLayoutConfig): boolean {
  return layout?.showSystemBlocks?.[key] !== false
}

/**
 * עוטף תוכן HTML של מסמך עם מיתוג הגמ"ח.
 * החלטה בלבד אם להציג לוגו רגיל או לא - ללא ציור מסגרת ב-CSS.
 * אם קיימת gemachDocumentFrame — מחזיר רק את innerHtml (ללא לוגו, המסגרת תצויר ב-downloadPdf).
 * אם אין מסגרת — מחזיר לוגו + innerHtml כרגיל.
 */
function applyDocumentBranding(
  innerHtml: string,
  branding: DocumentBrandingOptions,
  logoHtmlIfNoFrame: string
): string {
  if (branding.gemachDocumentFrame) {
    // מצב מסגרת: רק תוכן ללא לוגו (המסגרת תצויר ב-downloadPdf)
    return innerHtml
  }
  // מצב רגיל: לוגו מוצג כרגיל (preservation)
  return `${logoHtmlIfNoFrame}${innerHtml}`
}


/**
 * מקור אמת יחיד לתוכן שטר ההלוואה — נקרא הן מ-generateLoanDocument
 * (הדפסה/PDF) והן מ-createLoanEmailData (אימייל). ר' שלב 2 במסמך ההוראות.
 * עם layout ריק/undefined מייצר בדיוק את אותו HTML שיוצר היה נוצר לפני
 * הריפקטור בנתיב ההדפסה (ר' diff בפלט הבדיקה).
 */
export function buildLoanDocumentHtml(data: LoanDocumentData, layout?: DocumentLayoutConfig): string {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'

  const loanDateDisplay = new Date(data.loanDate).toLocaleDateString('he-IL')
  const loanDateHebrew = showHebrew ? toHebrewDate(data.loanDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''

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
      <div style="font-weight: bold; margin-bottom: 8px;">${label('loan.guarantorsTitle', 'ערבים:', layout)}</div>
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
    ${renderCustomBlocks('afterGuarantors', layout)}
  ` : ''
  // 'afterGuarantors' מוגדר כעוגן מותנה (ר' DOCUMENT_ANCHORS.loan) —
  // "מוצג רק אם יש ערב 1 ו/או ערב 2". התיקון: הענף בלי ערבים לא מרנדר
  // את הבלוק בכלל, בהתאם להגדרה (קודם רונדר גם כשאין אף ערב).

  const migratedCommitmentText = renderCustomBlocks('commitmentText', layout)
  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : 'מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע.'

  const totalRepaid = data.repayments?.reduce((sum, r) => sum + r.amount, 0) || 0
  const remaining = data.amount - totalRepaid
  const isFullyRepaid = remaining <= 0 && (data.repayments?.length || 0) > 0

  const repaymentsTableVisible = isSystemBlockVisible('repaymentsTable', layout)
  const repaymentsHtml = repaymentsTableVisible && data.repayments && data.repayments.length > 0 ? `
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

  const loanFullyRepaidBlock = isFullyRepaid ? renderCustomBlocks('loanFullyRepaid', layout) : ''

  return `
    <div style="text-align: center; padding: 15px; max-width: 800px; margin: 0 auto;">
      ${renderCustomBlocks('header', layout)}
      <h1 style="font-size: 24px; margin: 8px 0;">שטר הלוואה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      ${recurringLoanHtml}
      
      <div style="text-align: right; font-size: 15px; line-height: 1.6;">
        <p style="margin: 8px 0;">${label('loan.commitmentIntro', 'אני הח"מ', layout)} <strong>${data.borrowerName}</strong></p>
        ${renderCustomBlocks('afterBorrowerName', layout)}
        ${migratedCommitmentText || `<p style="margin: 8px 0;">${commitmentText}</p>`}
        <p style="font-size: 18px; margin: 15px 0;">
          ${label('loan.originalAmount', 'סכום הלוואה מקורי:', layout)} <strong>${formatCurrency(data.amount)}</strong>
        </p>
        ${renderCustomBlocks('afterAmount', layout)}
        <p style="margin: 8px 0;">בתאריך: <strong>${loanDateDisplay}</strong>${loanDateHebrew ? ` <span style="color: #666;">(${loanDateHebrew})</span>` : ''}</p>
        <p style="margin: 8px 0;">
          ${data.loanType === 'fixed' && dueDateDisplay 
            ? `תאריך החזרה: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}`
            : 'החזרה: לפי התראה'
          }
        </p>
      </div>
      
      ${repaymentsTableVisible ? `${renderCustomBlocks('beforeRepaymentsTable', layout)}${repaymentsHtml}${renderCustomBlocks('afterRepaymentsTable', layout)}` : renderCustomBlocks('afterRepaymentsTable', layout)}
      ${loanFullyRepaidBlock}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
      
      ${renderCustomBlocks('beforeSignature', layout)}
      <div style="text-align: right; margin-top: 20px;">
        <p style="margin: 8px 0;">חתימת הלווה: _______________________</p>
      </div>
      
      ${guarantorsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 11px; color: #666;">
        תאריך הפקת השטר: ${today}${showHebrew ? ` (${todayHebrew})` : ''}
      </div>
      ${renderCustomBlocks('footer', layout)}
    </div>
  `
}

export async function generateLoanDocument(data: LoanDocumentData, layout?: DocumentLayoutConfig): Promise<void> {
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const htmlContent = buildLoanDocumentHtml(data, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: data.gemachLogo, 
    gemachDocumentFrame: data.gemachDocumentFrame,
    frameMarginTop: data.frameMarginTop,
    frameMarginBottom: data.frameMarginBottom,
    frameMarginRight: data.frameMarginRight,
    frameMarginLeft: data.frameMarginLeft
  }, layout)
  const finalContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  
  if (branding.gemachDocumentFrame) {
    const result = await downloadPdf(finalContent, `שטר-הלוואה-${data.borrowerName}`, branding.gemachDocumentFrame, {
      top: branding.frameMarginTop ?? 35, bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20, left: branding.frameMarginLeft ?? 20,
    })
    // downloadPdf בולעת שגיאות פנימיות ומחזירה null בשקט (ר' הבאג שנתפס
    // בבדיקה ידנית — כפתור שנראה "לא עושה כלום"). זורקים כאן כדי שהקריאה
    // הקוראת (handler במסך) תוכל לתפוס ולהציג הודעת שגיאה למשתמש.
    if (!result) throw new Error('שגיאה ביצירת קובץ ה-PDF של שטר ההלוואה')
    return
  }
  printHtml(finalContent, `שטר הלוואה - ${data.borrowerName}`)
}


export async function generateEmptyLoanDocument(
  gemachName: string, 
  gemachLogo?: string, 
  gemachDocumentFrame?: string,
  frameMarginTop?: number,
  frameMarginBottom?: number,
  frameMarginRight?: number,
  frameMarginLeft?: number
): Promise<void> {
  const today = new Date().toLocaleDateString('he-IL')
  
  const logoHtml = gemachLogo 
    ? `<img src="${gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  const htmlContent = `
    <div style="text-align: center; padding: 20px;">
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

  const finalContent = applyDocumentBranding(htmlContent, { 
    gemachLogo, 
    gemachDocumentFrame,
    frameMarginTop,
    frameMarginBottom,
    frameMarginRight,
    frameMarginLeft
  }, logoHtml)
  
  // הערה: תמיכה במסגרות תופסק בגרסה זו
  printHtml(finalContent, 'שטר הלוואה ריק')
}

/**
 * מקור אמת יחיד לתוכן קבלת התרומה — נקרא הן מ-generateDonationReceipt
 * (הדפסה/PDF) והן מ-createDonationEmailData (אימייל).
 * שינוי מכוון בנתיב האימייל: הגרסה הישנה לא עברה דרך applyDocumentBranding
 * (לא תמכה במסגרת) ולא כללה את שורת "חתימת הגמ"ח" — כעת שתיהן כן, כמו
 * בגרסה המודפסת (מקור אמת יחיד, ר' קריטריוני קבלה).
 */
export function buildDonationReceiptHtml(data: {
  gemachName: string
  donorName: string
  amount: number
  donationDate: string
  receiptNumber: string
  dateFormat?: string
}, layout?: DocumentLayoutConfig): string {
  const showHebrew = data.dateFormat === 'combined'
  const dateDisplay = new Date(data.donationDate).toLocaleDateString('he-IL')
  const dateHebrew = showHebrew ? toHebrewDate(data.donationDate) : ''

  return `
    <div style="text-align: center; padding: 20px; max-width: 400px; margin: 0 auto;">
      ${renderCustomBlocks('header', layout)}
      <h1 style="font-size: 24px; margin: 10px 0;">קבלה על תרומה</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 20px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>${label('donation.receiptNumber', 'מספר קבלה:', layout)} <strong>${data.receiptNumber}</strong></p>
        ${renderCustomBlocks('afterReceiptNumber', layout)}
        <p>${label('donation.receivedFrom', 'התקבל מאת:', layout)} <strong>${data.donorName}</strong></p>
        ${renderCustomBlocks('afterDonorName', layout)}
        <p style="font-size: 20px; margin: 15px 0;">
          ${label('donation.amount', 'סכום:', layout)} <strong>${formatCurrency(data.amount)}</strong>
        </p>
        ${renderCustomBlocks('afterAmount', layout)}
        <p>תאריך: <strong>${dateDisplay}</strong>${dateHebrew ? ` <span style="color: #666;">(${dateHebrew})</span>` : ''}</p>
      </div>
      
      ${renderCustomBlocks('beforeThankYou', layout)}
      <div style="margin: 30px 0; text-align: center;">
        <p style="font-size: 18px; font-weight: bold;">תודה רבה על תרומתך!</p>
        <p style="font-size: 16px;">יישר כח!</p>
      </div>
      ${renderCustomBlocks('afterThankYou', layout)}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;" />
      
      ${renderCustomBlocks('beforeSignature', layout)}
      <div style="text-align: right; font-size: 14px;">
        <p>חתימת הגמ"ח: _______________________</p>
      </div>
    </div>
  `
}

export async function generateDonationReceipt(data: {
  gemachName: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  donorName: string
  amount: number
  donationDate: string
  receiptNumber: string
  dateFormat?: string
}, layout?: DocumentLayoutConfig): Promise<void> {
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const htmlContent = buildDonationReceiptHtml(data, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: data.gemachLogo, 
    gemachDocumentFrame: data.gemachDocumentFrame,
    frameMarginTop: data.frameMarginTop,
    frameMarginBottom: data.frameMarginBottom,
    frameMarginRight: data.frameMarginRight,
    frameMarginLeft: data.frameMarginLeft
  }, layout)
  const finalContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  
  if (branding.gemachDocumentFrame) {
    const result = await downloadPdf(finalContent, `קבלה-${data.receiptNumber}`, branding.gemachDocumentFrame, {
      top: branding.frameMarginTop ?? 35, bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20, left: branding.frameMarginLeft ?? 20,
    })
    if (!result) throw new Error('שגיאה ביצירת קובץ ה-PDF של הקבלה')
    return
  }
  printHtml(finalContent, `קבלה ${data.receiptNumber}`)
}

/**
 * מקור אמת יחיד לתוכן שטר ההפקדה — נקרא הן מ-generateDepositDocument
 * (הדפסה/PDF) והן מ-createDepositEmailData (אימייל).
 */
export function buildDepositDocumentHtml(data: {
  gemachName: string
  depositorName: string
  amount: number
  depositDate: string
  periodType: string
  dueDate?: string
  dateFormat?: string
  customText?: string
  isRecurring?: boolean
  recurringDepositNumber?: number
  recurringDepositCount?: number
  withdrawals?: Array<{ amount: number; withdrawal_date: string }>
}, layout?: DocumentLayoutConfig): string {
  const today = new Date().toLocaleDateString('he-IL')
  const todayHebrew = toHebrewDate(new Date().toISOString().split('T')[0])
  const showHebrew = data.dateFormat === 'combined'

  const depositDateDisplay = new Date(data.depositDate).toLocaleDateString('he-IL')
  const depositDateHebrew = showHebrew ? toHebrewDate(data.depositDate) : ''
  const dueDateDisplay = data.dueDate ? new Date(data.dueDate).toLocaleDateString('he-IL') : ''
  const dueDateHebrew = showHebrew && data.dueDate ? toHebrewDate(data.dueDate) : ''

  const isValidCustomText = data.customText && !data.customText.includes('{שם_') && !data.customText.includes('{סכום}')
  const commitmentText = isValidCustomText ? data.customText : ''

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

  const totalWithdrawn = data.withdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0
  const remaining = data.amount - totalWithdrawn

  const withdrawalsTableVisible = isSystemBlockVisible('withdrawalsTable', layout)
  const withdrawalsHtml = withdrawalsTableVisible && data.withdrawals && data.withdrawals.length > 0 ? `
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

  return `
    <div style="text-align: center; padding: 20px;">
      ${renderCustomBlocks('header', layout)}
      <h1 style="font-size: 28px; margin: 10px 0;">שטר הפקדה</h1>
      <h2 style="font-size: 18px; color: #666; margin-bottom: 30px;">${data.gemachName}</h2>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      ${recurringDepositHtml}
      
      <div style="text-align: right; font-size: 16px; line-height: 2;">
        <p>${label('deposit.commitmentIntro', 'אני הח"מ מנהל גמ"ח', layout)} "<strong>${data.gemachName}</strong>"</p>
        <p>${label('deposit.receivedFrom', 'מאשר בזה כי קיבלתי הפקדה מאת:', layout)} <strong>${data.depositorName}</strong></p>
        ${renderCustomBlocks('afterDepositorName', layout)}
        <p style="font-size: 20px; margin: 20px 0;">
          ${label('deposit.originalAmount', 'סכום הפקדה מקורי:', layout)} <strong>${formatCurrency(data.amount)}</strong>
        </p>
        <p>בתאריך: <strong>${depositDateDisplay}</strong>${depositDateHebrew ? ` <span style="color: #666;">(${depositDateHebrew})</span>` : ''}</p>
        <p style="margin-top: 20px;">
          סוג הפקדה: <strong>${data.periodType === 'fixed' ? 'קבועה' : 'גמישה'}</strong>
          ${dueDateDisplay ? `<br/>תאריך סיום: <strong>${dueDateDisplay}</strong>${dueDateHebrew ? ` <span style="color: #666;">(${dueDateHebrew})</span>` : ''}` : ''}
        </p>
        ${commitmentText ? `<p style="margin-top: 20px;">${commitmentText}</p>` : ''}
        ${renderCustomBlocks('afterAmount', layout)}
      </div>
      
      ${withdrawalsTableVisible ? `${renderCustomBlocks('beforeWithdrawalsTable', layout)}${withdrawalsHtml}${renderCustomBlocks('afterWithdrawalsTable', layout)}` : renderCustomBlocks('afterWithdrawalsTable', layout)}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      ${renderCustomBlocks('beforeSignature', layout)}
      <div style="text-align: right; margin-top: 30px;">
        <p>חתימת הגמ"ח: _______________________</p>
        <p style="margin-top: 20px;">חתימת המפקיד: _______________________</p>
      </div>
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 30px 0;" />
      
      <div style="text-align: right; font-size: 12px; color: #666;">
        תאריך הפקת השטר: ${today}${showHebrew ? ` (${todayHebrew})` : ''}
      </div>
      ${renderCustomBlocks('footer', layout)}
    </div>
  `
}


export async function generateDepositDocument(data: {
  gemachName: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  depositorName: string
  amount: number
  depositDate: string
  periodType: string
  dueDate?: string
  dateFormat?: string
  customText?: string
  isRecurring?: boolean
  recurringDepositNumber?: number
  recurringDepositCount?: number
  withdrawals?: Array<{
    amount: number
    withdrawal_date: string
  }>
}, layout?: DocumentLayoutConfig) {
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const htmlContent = buildDepositDocumentHtml(data, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: data.gemachLogo, 
    gemachDocumentFrame: data.gemachDocumentFrame,
    frameMarginTop: data.frameMarginTop,
    frameMarginBottom: data.frameMarginBottom,
    frameMarginRight: data.frameMarginRight,
    frameMarginLeft: data.frameMarginLeft
  }, layout)
  const finalContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  if (branding.gemachDocumentFrame) {
    await downloadPdf(finalContent, `שטר-הפקדה-${data.depositorName}`, branding.gemachDocumentFrame, {
      top: branding.frameMarginTop ?? 35, bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20, left: branding.frameMarginLeft ?? 20,
    })
    return
  }
  printHtml(finalContent, `שטר הפקדה - ${data.depositorName}`)
}


/**
 * גיליון עיצוב משותף לדוח לווה — מוזרק הן לתוך fullHtmlDocument (הדפסה)
 * והן לתוך htmlContent של האימייל, כדי ששתי הגרסאות ייראו זהה (הן
 * מסתמכות על אותם class names בתוך buildBorrowerReportHtml).
 */
const BORROWER_REPORT_STYLES = `
        body { font-family: Arial, sans-serif; }
        .header { text-align: center; margin-bottom: 20px; }
        .summary-box { 
          background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%); 
          padding: 20px; 
          border-radius: 10px; 
          margin: 20px 0; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-table { width: 100%; border-collapse: collapse; }
        .summary-table td { padding: 10px; border-bottom: 1px solid #ddd; }
        .summary-table tr:last-child td { border-bottom: none; }
        .debt-amount { font-size: 20px; font-weight: bold; }
        .section-title { 
          margin-top: 30px; 
          padding-bottom: 8px; 
          border-bottom: 2px solid #1976d2; 
          color: #1976d2;
          font-size: 18px;
        }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .data-table th { 
          padding: 12px; 
          border: 1px solid #ddd; 
          font-weight: bold;
          font-size: 14px;
        }
        .data-table td { 
          padding: 10px; 
          border: 1px solid #ddd; 
          text-align: center;
          font-size: 13px;
        }
        .loans-header { background: #e3f2fd; }
        .repayments-header { background: #e8f5e9; }
        .expenses-header { background: #fff3e0; }
        .multi-repayment-row { background: #e3f2fd; }
        .total-row { font-weight: bold; }
        .multi-badge { 
          color: #1976d2; 
          font-weight: bold; 
          background: white;
          padding: 2px 8px;
          border-radius: 4px;
          display: inline-block;
        }
        .recurring-badge {
          color: #2e7d32;
          font-weight: bold;
        }
        @media print {
          .summary-box { box-shadow: none; border: 1px solid #ddd; }
        }
`

type BorrowerReportData = {
  gemachName: string
  borrowerName: string
  loans: Array<{
    id: number
    amount: number
    loanDate: string
    remaining: number
    status: string
    isRecurring?: boolean
    recurringLoanNumber?: number
    recurringLoanCount?: number
    repayments?: Array<{
      amount: number
      payment_date: string
      isRecurring?: boolean
      recurringRepaymentNumber?: number
      recurringRepaymentCount?: number
      notes?: string
    }>
  }>
  expenses?: Array<{
    id: number
    description: string
    amount: number
    expense_date: string
    category: string
  }>
  totalDebt: number
  repaymentsOrder?: 'newest_first' | 'oldest_first'
}

/**
 * מקור אמת יחיד לתוכן דוח הלווה — נקרא הן מ-generateBorrowerReport
 * (הדפסה/PDF) והן מ-createBorrowerReportEmailData (אימייל).
 * שינוי מכוון (לא תקלה) — הגדול מבין 4 המסמכים: נתיב האימייל הישן היה
 * תבנית נפרדת ומינימלית לחלוטין (בלי תיבת סיכום, בלי טבלת פרעונות, בלי
 * טבלת הוצאות, בלי class-based styling). מ-שלב 2 ואילך אימייל דוח לווה
 * מציג את אותו דוח מלא בדיוק כמו הגרסה המודפסת. ר' תיעוד קריטריון
 * הקבלה — "מקור אמת יחיד" גובר על שימור ההתנהגות הישנה של האימייל כאן.
 */
export function buildBorrowerReportHtml(data: BorrowerReportData, layout?: DocumentLayoutConfig): string {
  const today = new Date().toLocaleDateString('he-IL')

  const totalLoansAmount = data.loans.reduce((sum, loan) => sum + loan.amount, 0)
  const totalRepayments = data.loans.reduce((sum, loan) => {
    return sum + (loan.repayments?.reduce((s, r) => s + r.amount, 0) || 0)
  }, 0)
  const activeLoansCount = data.loans.filter(l => l.status === 'active').length
  const completedLoansCount = data.loans.filter(l => l.status === 'completed').length

  const loansHtml = data.loans.map(loan => {
    const recurringInfo = loan.isRecurring && loan.recurringLoanNumber && loan.recurringLoanCount && loan.recurringLoanCount > 1
      ? `<span class="recurring-badge">🔄 ${loan.recurringLoanNumber}/${loan.recurringLoanCount}</span>`
      : '-'
    
    const statusText = loan.status === 'active' ? 'פעילה' : loan.status === 'planned' ? 'מתוכננת' : 'נפרעה'
    const statusColor = loan.status === 'active' ? '#1976d2' : loan.status === 'planned' ? '#f57c00' : '#2e7d32'
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

  const sortMultiplier = (data.repaymentsOrder || 'newest_first') === 'oldest_first' ? 1 : -1
  const allRepayments = data.loans.flatMap(loan => 
    (loan.repayments || []).map(r => ({
      ...r,
      loanId: loan.id
    }))
  ).sort((a, b) => sortMultiplier * (new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()))

  const repaymentsTableVisible = isSystemBlockVisible('repaymentsTable', layout)
  const repaymentsHtml = repaymentsTableVisible && allRepayments.length > 0 ? `
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

  const expensesTableVisible = isSystemBlockVisible('expensesTable', layout)

  // 'beforeRepaymentsTable'/'afterRepaymentsTable'/'beforeExpensesTable'/
  // 'afterExpensesTable' מוגדרים כעוגנים מותנים בדוח לווה (ר' DOCUMENT_ANCHORS.
  // borrowerReport) — "מוצג רק אם יש פירעונות/הוצאות כלשהם". התיקון למטה:
  // תלוי גם בנתונים בפועל (allRepayments.length / data.expenses.length),
  // לא רק במתג ההצגה (showSystemBlocks), שברירת המחדל שלו true בכל מקרה
  // (קודם הבלוק היה מופיע גם ללווה בלי אף פירעון/הוצאה).
  const expensesHtml = expensesTableVisible && data.expenses && data.expenses.length > 0 ? `
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

  return `
    <div style="padding: 20px;">
      ${renderCustomBlocks('header', layout)}
      <div class="header">
        <h1 style="font-size: 26px; margin: 10px 0; color: #1976d2;">דוח לווה</h1>
        <h2 style="font-size: 16px; color: #666; margin: 5px 0;">${data.gemachName}</h2>
      </div>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 15px; margin-bottom: 20px;">
        <p style="margin: 5px 0;"><strong>${label('borrowerReport.borrowerNameLabel', 'שם הלווה:', layout)}</strong> ${data.borrowerName}</p>
        <p style="margin: 5px 0;"><strong>תאריך הפקה:</strong> ${today}</p>
      </div>

      <!-- סיכום כללי -->
      <div class="summary-box">
        <h3 style="margin: 0 0 15px 0; color: #1976d2; font-size: 18px;">📊 סיכום כללי</h3>
        <table class="summary-table">
          <tr>
            <td style="width: 25%;"><strong>הלוואות פעילות:</strong></td>
            <td style="width: 25%; text-align: left; color: #1976d2; font-size: 16px;"><strong>${activeLoansCount}</strong></td>
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
      ${renderCustomBlocks('afterSummaryBox', layout)}
      
      <h3 class="section-title">💰 פירוט הלוואות</h3>
      
      ${renderCustomBlocks('beforeLoansTable', layout)}
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
      ${renderCustomBlocks('afterLoansTable', layout)}
      
      ${(repaymentsTableVisible && allRepayments.length > 0) ? `${renderCustomBlocks('beforeRepaymentsTable', layout)}${repaymentsHtml}${renderCustomBlocks('afterRepaymentsTable', layout)}` : ''}
      ${(expensesTableVisible && (data.expenses?.length || 0) > 0) ? `${renderCustomBlocks('beforeExpensesTable', layout)}${expensesHtml}${renderCustomBlocks('afterExpensesTable', layout)}` : ''}
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
        <p>דוח זה הופק אוטומטית ממערכת ניהול הגמ"ח</p>
      </div>
      ${renderCustomBlocks('footer', layout)}
    </div>
  `
}


export async function generateBorrowerReport(data: {
  gemachName: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  borrowerName: string
  loans: Array<{
    id: number
    amount: number
    loanDate: string
    remaining: number
    status: string
    isRecurring?: boolean
    recurringLoanNumber?: number
    recurringLoanCount?: number
    repayments?: Array<{
      amount: number
      payment_date: string
      isRecurring?: boolean
      recurringRepaymentNumber?: number
      recurringRepaymentCount?: number
      notes?: string
    }>
  }>
  expenses?: Array<{
    id: number
    description: string
    amount: number
    expense_date: string
    category: string
  }>
  totalDebt: number
  repaymentsOrder?: 'newest_first' | 'oldest_first'
}, layout?: DocumentLayoutConfig): Promise<void> {
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const innerContent = buildBorrowerReportHtml(data, layout)
  const branding = resolveDocumentBranding({
    gemachLogo: data.gemachLogo,
    gemachDocumentFrame: data.gemachDocumentFrame,
    frameMarginTop: data.frameMarginTop,
    frameMarginBottom: data.frameMarginBottom,
    frameMarginRight: data.frameMarginRight,
    frameMarginLeft: data.frameMarginLeft,
  }, layout)

  const fullHtmlDocument = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
${BORROWER_REPORT_STYLES}
      </style>
    </head>
    <body>
    ${applyDocumentBranding(innerContent, branding, logoHtml)}
    </body>
    </html>
  `

  if (branding.gemachDocumentFrame) {
    await downloadPdf(fullHtmlDocument, `דוח-לווה-${data.borrowerName}`, branding.gemachDocumentFrame, {
      top: branding.frameMarginTop ?? 35, bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20, left: branding.frameMarginLeft ?? 20,
    })
    return
  }
  printHtml(fullHtmlDocument, `דוח לווה - ${data.borrowerName}`)
}

export function generateExpenseReceipt(data: {
  gemachName: string
  gemachLogo?: string
  borrowerName: string
  expense: {
    id: string
    description: string
    amount: number
    expense_date: string
    category: string
    payment_method?: string
  }
  receiptNumber: string
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
    ? `<img src="${data.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
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
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
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

/**
 * גיליון עיצוב לדוח מפקיד — במבנה זהה ל-BORROWER_REPORT_STYLES (אותה
 * שיטת class names), כדי שדוח מפקיד יזכה לאותה גמישות ותמיכה במסגרות
 * כמו דוח לווה. מוזרק הן לתוך fullHtmlDocument (הדפסה/PDF) והן לתוך
 * htmlContent של האימייל, כדי ששתי הגרסאות ייראו זהה.
 */
const DEPOSITOR_REPORT_STYLES = `
        body { font-family: Arial, sans-serif; }
        .header { text-align: center; margin-bottom: 20px; }
        .summary-box { 
          background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%); 
          padding: 20px; 
          border-radius: 10px; 
          margin: 20px 0; 
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-table { width: 100%; border-collapse: collapse; }
        .summary-table td { padding: 10px; border-bottom: 1px solid #ddd; }
        .summary-table tr:last-child td { border-bottom: none; }
        .balance-amount { font-size: 20px; font-weight: bold; }
        .section-title { 
          margin-top: 30px; 
          padding-bottom: 8px; 
          border-bottom: 2px solid #1976d2; 
          color: #1976d2;
          font-size: 18px;
        }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .data-table th { 
          padding: 12px; 
          border: 1px solid #ddd; 
          font-weight: bold;
          font-size: 14px;
        }
        .data-table td { 
          padding: 10px; 
          border: 1px solid #ddd; 
          text-align: center;
          font-size: 13px;
        }
        .deposits-header { background: #e3f2fd; }
        .withdrawals-subheader { background: #ffc107; }
        .withdrawals-row { background: #fff3e0; }
        .recurring-badge {
          color: #2e7d32;
          font-weight: bold;
        }
        @media print {
          .summary-box { box-shadow: none; border: 1px solid #ddd; }
        }
`

type DepositorReportData = {
  gemachName: string
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
    recurring_deposit_number?: number
    recurring_deposit_count?: number
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
}

/**
 * מקור אמת יחיד לתוכן דוח המפקיד — נקרא הן מ-generateDepositorReport
 * (הדפסה/PDF) והן מ-createDepositorReportEmailData (אימייל), באותו
 * מבנה כמו buildBorrowerReportHtml: עוגני טקסט חופשי, דריסת תוויות,
 * הצגה/הסתרה של רכיבי מערכת, ותמיכה במסגרת מסמך.
 */
export function buildDepositorReportHtml(data: DepositorReportData, layout?: DocumentLayoutConfig): string {
  const today = new Date().toLocaleDateString('he-IL')
  const showHebrew = data.dateFormat === 'combined'
  const withdrawalsDetailsVisible = isSystemBlockVisible('withdrawalsDetails', layout)

  const depositsHtml = data.deposits.map(dep => {
    // BUG FIX: removed `* recurring_deposit_number` multiplication (and the
    // "amount × N" caption it fed below) — see Deposits.tsx for the full
    // explanation. Each recurring deposit row is its own independent monthly
    // contribution, not a running cumulative total.
    const depositAmount = dep.amount

    const withdrawn = dep.withdrawn_amount || 0
    const remaining = dep.remaining !== undefined ? dep.remaining : (depositAmount - withdrawn)
    const hasWithdrawals = withdrawalsDetailsVisible && dep.withdrawals && dep.withdrawals.length > 0
    const lastWithdrawalDate = dep.withdrawals && dep.withdrawals.length > 0
      ? new Date(dep.withdrawals[0].withdrawal_date).toLocaleDateString('he-IL')
      : '-'

    // מידע מחזורי
    const recurringInfo = dep.is_recurring && dep.recurring_deposit_number && dep.recurring_deposit_count && dep.recurring_deposit_count > 1
      ? `<span class="recurring-badge">🔄 ${dep.recurring_deposit_number}/${dep.recurring_deposit_count}</span>`
      : dep.is_recurring ? `<span class="recurring-badge">🔄</span>` : ''

    const amountDisplay = formatCurrency(depositAmount)

    return `
    <tr style="background: ${remaining === 0 ? '#f5f5f5' : 'white'};">
      <td>${dep.id}</td>
      <td>${amountDisplay}</td>
      <td>${withdrawn > 0 ? `<span style="color: #f57c00;">${formatCurrency(withdrawn)}</span>` : '-'}</td>
      <td>${remaining > 0 ? `<span style="color: #2e7d32; font-weight: bold;">${formatCurrency(remaining)}</span>` : `<span style="color: #666;">-</span>`}</td>
      <td>${new Date(dep.deposit_date).toLocaleDateString('he-IL')}${showHebrew ? `<br/><small style="color:#666;">${toHebrewDate(dep.deposit_date)}</small>` : ''}</td>
      <td>${dep.period_type === 'flexible' ? 'גמישה' : 'קבועה'}${recurringInfo ? ` ${recurringInfo}` : ''}</td>
      <td>${lastWithdrawalDate}</td>
      <td>${remaining > 0 ? '<span style="color: green; font-weight: bold;">פעילה</span>' : '<span style="color: gray;">נמשכה</span>'}</td>
    </tr>
    ${hasWithdrawals ? `
    <tr class="withdrawals-row">
      <td colspan="8" style="text-align: right;">
        <strong>פירוט משיכות:</strong>
        <table style="width: 100%; margin-top: 5px; border-collapse: collapse;">
          <thead>
            <tr class="withdrawals-subheader">
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

  return `
    <div style="padding: 20px;">
      ${renderCustomBlocks('header', layout)}
      <div class="header">
        <h1 style="font-size: 26px; margin: 10px 0; color: #1976d2;">דוח מפקיד</h1>
        <h2 style="font-size: 16px; color: #666; margin: 5px 0;">${data.gemachName}</h2>
      </div>

      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />

      <div style="text-align: right; font-size: 15px; margin-bottom: 20px;">
        <p style="margin: 5px 0;"><strong>${label('depositorReport.depositorNameLabel', 'שם המפקיד:', layout)}</strong> ${data.depositorName}</p>
        ${data.depositorPhone ? `<p style="margin: 5px 0;"><strong>טלפון:</strong> ${data.depositorPhone}</p>` : ''}
        ${data.depositorIdNumber ? `<p style="margin: 5px 0;"><strong>מ.ז.:</strong> ${data.depositorIdNumber}</p>` : ''}
        <p style="margin: 5px 0;"><strong>תאריך הפקה:</strong> ${today}</p>
      </div>

      <!-- סיכום כללי -->
      <div class="summary-box">
        <h3 style="margin: 0 0 15px 0; color: #1976d2; font-size: 18px;">📊 סיכום כללי</h3>
        <table class="summary-table">
          <tr>
            <td style="width: 50%;"><strong style="font-size: 16px;">יתרה פעילה:</strong></td>
            <td style="width: 50%; text-align: left;">
              <span class="balance-amount" style="color: #2e7d32;">${formatCurrency(data.totalActive)}</span>
            </td>
          </tr>
          <tr>
            <td><strong style="font-size: 16px;">סה"כ נמשך:</strong></td>
            <td style="text-align: left;">
              <span class="balance-amount" style="color: #f57c00;">${formatCurrency(data.totalWithdrawn)}</span>
            </td>
          </tr>
        </table>
      </div>
      ${renderCustomBlocks('afterSummaryBox', layout)}

      <h3 class="section-title">💰 פירוט הפקדות</h3>

      ${renderCustomBlocks('beforeDepositsTable', layout)}
      <table class="data-table">
        <thead>
          <tr class="deposits-header">
            <th style="width: 6%;">מס'</th>
            <th style="width: 13%;">סכום מקורי</th>
            <th style="width: 11%;">נמשך</th>
            <th style="width: 12%;">יתרה</th>
            <th style="width: 17%;">תאריך הפקדה</th>
            <th style="width: 15%;">סוג</th>
            <th style="width: 14%;">משיכה אחרונה</th>
            <th style="width: 12%;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${depositsHtml || '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #999;">אין הפקדות</td></tr>'}
        </tbody>
      </table>
      ${renderCustomBlocks('afterDepositsTable', layout)}

      <div style="margin-top: 30px; text-align: right; font-size: 12px; color: #666;">
        <p>🔄 = הפקדה מחזורית</p>
      </div>

      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
        <p>דוח זה הופק אוטומטית ממערכת ניהול הגמ"ח</p>
      </div>
      ${renderCustomBlocks('footer', layout)}
    </div>
  `
}

export async function generateDepositorReport(data: {
  gemachName: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
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
    recurring_deposit_number?: number
    recurring_deposit_count?: number
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
}, layout?: DocumentLayoutConfig): Promise<void> {
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const innerContent = buildDepositorReportHtml(data, layout)
  const branding = resolveDocumentBranding({
    gemachLogo: data.gemachLogo,
    gemachDocumentFrame: data.gemachDocumentFrame,
    frameMarginTop: data.frameMarginTop,
    frameMarginBottom: data.frameMarginBottom,
    frameMarginRight: data.frameMarginRight,
    frameMarginLeft: data.frameMarginLeft,
  }, layout)

  const fullHtmlDocument = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
${DEPOSITOR_REPORT_STYLES}
      </style>
    </head>
    <body>
    ${applyDocumentBranding(innerContent, branding, logoHtml)}
    </body>
    </html>
  `

  if (branding.gemachDocumentFrame) {
    await downloadPdf(fullHtmlDocument, `דוח-מפקיד-${data.depositorName}`, branding.gemachDocumentFrame, {
      top: branding.frameMarginTop ?? 35, bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20, left: branding.frameMarginLeft ?? 20,
    })
    return
  }
  printHtml(fullHtmlDocument, `דוח מפקיד - ${data.depositorName}`)
}


// Email functionality
export type EmailProvider = 'gmail' | 'outlook' | 'default'

export interface EmailData {
  to: string
  subject: string
  body: string
  documentType: 'loan' | 'deposit' | 'donation' | 'borrower_report' | 'depositor_report' | 'donor_report' | 'guarantor_debt'
  htmlContent?: string
  filename?: string
  attachmentPath?: string
  frameImageBase64?: string
  frameMargins?: { top: number; bottom: number; right: number; left: number }
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
    await downloadPdf(data.htmlContent, data.filename, data.frameImageBase64, data.frameMargins)
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

export async function createLoanEmailData(params: {
  gemachName: string
  borrowerName: string
  borrowerEmail: string
  amount: number
  loanDate: string
  dueDate?: string
  loanType: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  guarantor1Name?: string
  guarantor2Name?: string
  dateFormat?: string
  isRecurring?: boolean
  recurringLoanNumber?: number
  recurringLoanCount?: number
  customText?: string
  repayments?: Array<{
    amount: number
    payment_date: string
    isRecurring?: boolean
    recurringRepaymentNumber?: number
    recurringRepaymentCount?: number
  }>
}, layout?: DocumentLayoutConfig): Promise<EmailData> {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.loanDate).toLocaleDateString('he-IL')

  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // שינוי מכוון (לא תקלה): נתיב האימייל השתמש עד כה בתבנית HTML נפרדת,
  // עם ניסוח שונה, ללא תמיכה ב-customText וללא שורת חתימה/חתימות ערבים.
  // מ-שלב 2 ואילך, נתיב האימייל קורא לאותה buildLoanDocumentHtml כמו
  // נתיב ההדפסה/PDF (מקור אמת יחיד — ר' קריטריוני קבלה). המשמעות בפועל:
  // אימייל שטר הלוואה מציג מעתה גם משפט התחייבות מותאם (אם הוגדר) וגם
  // שורות חתימה, בדיוק כמו הגרסה המודפסת.
  const htmlContent = buildLoanDocumentHtml({
    gemachName: params.gemachName,
    borrowerName: params.borrowerName,
    amount: params.amount,
    loanDate: params.loanDate,
    dueDate: params.dueDate,
    loanType: params.loanType,
    gemachLogo: params.gemachLogo,
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft,
    guarantor1Name: params.guarantor1Name,
    guarantor2Name: params.guarantor2Name,
    dateFormat: params.dateFormat,
    isRecurring: params.isRecurring,
    recurringLoanNumber: params.recurringLoanNumber,
    recurringLoanCount: params.recurringLoanCount,
    customText: params.customText,
    repayments: params.repayments,
  } as LoanDocumentData, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: params.gemachLogo, 
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft
  }, layout)
  const finalHtmlContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  
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
    htmlContent: finalHtmlContent,
    filename: `שטר-הלוואה-${params.borrowerName}`,
    frameImageBase64: branding.gemachDocumentFrame,
    frameMargins: branding.gemachDocumentFrame ? {
      top: branding.frameMarginTop ?? 35,
      bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20,
      left: branding.frameMarginLeft ?? 20,
    } : undefined,
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
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  dateFormat?: string
  customText?: string
  isRecurring?: boolean
  recurringDepositNumber?: number
  recurringDepositCount?: number
  withdrawals?: Array<{
    amount: number
    withdrawal_date: string
  }>
}, layout?: DocumentLayoutConfig): EmailData {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.depositDate).toLocaleDateString('he-IL')

  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // שינוי מכוון (לא תקלה): הגרסה הישנה לא כללה שורות חתימה ולא תמכה
  // ב-customText/הפקדה מחזורית. כעת קוראת לאותה buildDepositDocumentHtml
  // כמו נתיב ההדפסה — מקור אמת יחיד.
  const htmlContent = buildDepositDocumentHtml(params, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: params.gemachLogo, 
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft
  }, layout)
  const finalHtmlContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  
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
    htmlContent: finalHtmlContent,
    filename: `שטר-הפקדה-${params.depositorName}`,
    frameImageBase64: branding.gemachDocumentFrame,
    frameMargins: branding.gemachDocumentFrame ? {
      top: branding.frameMarginTop ?? 35,
      bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20,
      left: branding.frameMarginLeft ?? 20,
    } : undefined,
  }
}

// Email data for donation receipt
export function createDonationEmailData(params: {
  gemachName: string
  donorName: string
  donorEmail: string
  amount: number
  donationDate: string
  receiptNumber: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  dateFormat?: string
}, layout?: DocumentLayoutConfig): EmailData {
  const formattedAmount = formatCurrency(params.amount)
  const formattedDate = new Date(params.donationDate).toLocaleDateString('he-IL')

  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // שינוי מכוון (לא תקלה): הגרסה הישנה לא עברה דרך applyDocumentBranding
  // (לא תמכה במסגרת, לוגו הוזרק ידנית לתוך ה-div) ולא כללה שורת חתימה.
  // כעת קוראת לאותה buildDonationReceiptHtml כמו נתיב ההדפסה — מקור אמת
  // יחיד. המשמעות בפועל: אימייל קבלת תרומה מציג מעתה גם שורת חתימת הגמ"ח,
  // וגם תומך במסגרת אם הוגדרה (בדיוק כמו הגרסה המודפסת).
  const htmlContent = buildDonationReceiptHtml({
    gemachName: params.gemachName,
    donorName: params.donorName,
    amount: params.amount,
    donationDate: params.donationDate,
    receiptNumber: params.receiptNumber,
    dateFormat: params.dateFormat,
  }, layout)

  const branding = resolveDocumentBranding({
    gemachLogo: params.gemachLogo,
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft,
  }, layout)
  const finalHtmlContent = applyDocumentBranding(htmlContent, branding, logoHtml)
  
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
    htmlContent: finalHtmlContent,
    filename: `קבלה-${params.receiptNumber}-${params.donorName}`,
    frameImageBase64: branding.gemachDocumentFrame,
    frameMargins: branding.gemachDocumentFrame ? {
      top: branding.frameMarginTop ?? 35,
      bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20,
      left: branding.frameMarginLeft ?? 20,
    } : undefined,
  }
}

// Email data for borrower report
export function createBorrowerReportEmailData(params: BorrowerReportData & {
  borrowerEmail: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
}, layout?: DocumentLayoutConfig): EmailData {
  const formattedDebt = formatCurrency(params.totalDebt)

  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // שינוי מכוון (לא תקלה) — הגדול מבין 4 המסמכים: הגרסה הישנה הייתה
  // תבנית מינימלית נפרדת (בלי תיבת סיכום/פרעונות/הוצאות/CSS classes,
  // ובלי תמיכה בלוגו או מסגרת בכלל). כעת קוראת לאותה buildBorrowerReportHtml
  // כמו נתיב ההדפסה, כולל אותו גיליון עיצוב (BORROWER_REPORT_STYLES) —
  // מקור אמת יחיד. אימייל דוח לווה מציג מעתה דוח מלא זהה לגרסה המודפסת.
  const innerContent = buildBorrowerReportHtml(params, layout)
  const branding = resolveDocumentBranding({
    gemachLogo: params.gemachLogo,
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft,
  }, layout)
  const brandedContent = applyDocumentBranding(innerContent, branding, logoHtml)
  const htmlContent = `<style>${BORROWER_REPORT_STYLES}</style>${brandedContent}`

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
    filename: `דוח-לווה-${params.borrowerName}`,
    frameImageBase64: branding.gemachDocumentFrame,
    frameMargins: branding.gemachDocumentFrame ? {
      top: branding.frameMarginTop ?? 35,
      bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20,
      left: branding.frameMarginLeft ?? 20,
    } : undefined,
  }
}

// Email data for depositor report
export function createDepositorReportEmailData(params: DepositorReportData & {
  depositorEmail: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
}, layout?: DocumentLayoutConfig): EmailData {
  const formattedTotal = formatCurrency(params.totalActive)

  const logoHtml = params.gemachLogo 
    ? `<img src="${params.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px;" />`
    : ''

  // מקור אמת יחיד: אותה buildDepositorReportHtml כמו נתיב ההדפסה/PDF,
  // כולל אותו גיליון עיצוב (DEPOSITOR_REPORT_STYLES) — בדיוק כמו
  // createBorrowerReportEmailData. אימייל דוח מפקיד מציג מעתה דוח מלא
  // זהה לגרסה המודפסת, כולל עוגני טקסט חופשי, דריסת תוויות ומסגרת.
  const innerContent = buildDepositorReportHtml(params, layout)
  const branding = resolveDocumentBranding({
    gemachLogo: params.gemachLogo,
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft,
  }, layout)
  const brandedContent = applyDocumentBranding(innerContent, branding, logoHtml)
  const htmlContent = `<style>${DEPOSITOR_REPORT_STYLES}</style>${brandedContent}`

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
    filename: `דוח-מפקיד-${params.depositorName}`,
    frameImageBase64: branding.gemachDocumentFrame,
    frameMargins: branding.gemachDocumentFrame ? {
      top: branding.frameMarginTop ?? 35,
      bottom: branding.frameMarginBottom ?? 48,
      right: branding.frameMarginRight ?? 20,
      left: branding.frameMarginLeft ?? 20,
    } : undefined,
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
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
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
  
  const finalHtmlContent = applyDocumentBranding(htmlContent, { 
    gemachLogo: params.gemachLogo, 
    gemachDocumentFrame: params.gemachDocumentFrame,
    frameMarginTop: params.frameMarginTop,
    frameMarginBottom: params.frameMarginBottom,
    frameMarginRight: params.frameMarginRight,
    frameMarginLeft: params.frameMarginLeft
  }, logoHtml)
  
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
    htmlContent: finalHtmlContent,
    filename: `הודעת-חוב-ערב-${params.guarantorName}`
  }
}


// Generate detailed guarantor statement document
export interface GuarantorStatementData {
  gemachName: string
  gemachLogo?: string
  gemachDocumentFrame?: string
  frameMarginTop?: number
  frameMarginBottom?: number
  frameMarginRight?: number
  frameMarginLeft?: number
  guarantorName: string
  guarantorPhone?: string
  guarantorEmail?: string
  dateFormat?: string
  // Guarantor loans (loans transferred to guarantor)
  guarantorLoans?: Array<{
    borrowerName: string
    originalLoanAmount: number
    originalLoanDate: string
    guarantorLoanAmount: number
    totalPaid: number
    remaining: number
    status: 'active' | 'paid'
    repayments: Array<{
      amount: number
      payment_date: string
      notes?: string
    }>
    refundDue?: number
  }>
  // Regular loans where this person is a guarantor
  regularLoans?: Array<{
    borrowerName: string
    loanAmount: number
    loanDate: string
    remaining: number
    status: string
    dueDate?: string
  }>
}

export async function generateGuarantorStatement(data: GuarantorStatementData): Promise<void> {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (data.dateFormat === 'hebrew') {
      return toHebrewDate(dateStr)
    }
    return date.toLocaleDateString('he-IL')
  }

  const today = new Date().toLocaleDateString('he-IL')
  const logoHtml = data.gemachLogo ? `<img src="${data.gemachLogo}" alt="לוגו" style="max-width: 120px; max-height: 60px; margin-bottom: 15px;" />` : ''

  // Build guarantor loans section - minimalist style
  const guarantorLoansHtml = data.guarantorLoans && data.guarantorLoans.length > 0 ? `
    <div style="margin-top: 25px;">
      <h3 style="color: #424242; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; font-size: 16px; font-weight: 600;">הלוואות שהועברו לערב</h3>
      ${data.guarantorLoans.map((gl, index) => {
        const refundAlert = gl.refundDue && gl.refundDue > 0 ? `
          <div style="background: #ffebee; border-left: 4px solid #d32f2f; padding: 12px; margin: 12px 0;">
            <p style="margin: 0; font-size: 13px; color: #c62828;">
              <strong>⚠️ שים לב:</strong> מגיע החזר לערב בסך ${formatCurrency(gl.refundDue)}
            </p>
          </div>
        ` : ''

        const repaymentsHtml = gl.repayments.length > 0 ? `
          <div style="margin-top: 12px;">
            <p style="font-size: 12px; color: #616161; margin-bottom: 6px; font-weight: 600;">היסטוריית תשלומים:</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background: #fafafa; border-bottom: 1px solid #e0e0e0;">
                  <th style="padding: 6px 8px; text-align: right; font-weight: 600; color: #616161;">תאריך</th>
                  <th style="padding: 6px 8px; text-align: center; font-weight: 600; color: #616161;">סכום</th>
                  <th style="padding: 6px 8px; text-align: right; font-weight: 600; color: #616161;">הערות</th>
                </tr>
              </thead>
              <tbody>
                ${gl.repayments.map((r, i) => `
                  <tr style="border-bottom: 1px solid #f5f5f5;">
                    <td style="padding: 6px 8px; text-align: right;">${formatDate(r.payment_date)}</td>
                    <td style="padding: 6px 8px; text-align: center; font-weight: 600; color: #2e7d32;">${formatCurrency(r.amount)}</td>
                    <td style="padding: 6px 8px; text-align: right; color: #757575;">${r.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<p style="color: #9e9e9e; margin-top: 8px; font-size: 11px;">אין תשלומים עדיין</p>'

        return `
          <div style="background: #fafafa; padding: 15px; margin: 15px 0; border-left: 3px solid #757575;">
            <p style="margin: 0 0 10px 0; font-size: 13px; color: #424242; font-weight: 600;">הלוואה #${index + 1} - ${gl.borrowerName}</p>
            <table style="width: 100%; font-size: 11px; margin-bottom: 10px;">
              <tr>
                <td style="padding: 4px 0; color: #757575; width: 45%;">סכום הלוואה מקורי:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #424242;">${formatCurrency(gl.originalLoanAmount)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #757575;">תאריך הלוואה:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #424242;">${formatDate(gl.originalLoanDate)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #757575;">סכום שהועבר לערב:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #424242;">${formatCurrency(gl.guarantorLoanAmount)}</td>
              </tr>
              <tr style="background: #e8f5e9;">
                <td style="padding: 4px 0; color: #2e7d32; font-weight: 600;">סה"כ שולם:</td>
                <td style="padding: 4px 0; font-weight: 600; color: #2e7d32;">${formatCurrency(gl.totalPaid)}</td>
              </tr>
              <tr style="background: ${gl.remaining > 0 ? '#ffebee' : '#e8f5e9'};">
                <td style="padding: 4px 0; font-weight: 600; color: ${gl.remaining > 0 ? '#c62828' : '#2e7d32'};">יתרה לתשלום:</td>
                <td style="padding: 4px 0; font-weight: 700; font-size: 13px; color: ${gl.remaining > 0 ? '#c62828' : '#2e7d32'};">${formatCurrency(gl.remaining)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #757575;">סטטוס:</td>
                <td style="padding: 4px 0;">
                  <span style="background: ${gl.status === 'paid' ? '#e8f5e9' : '#fff3e0'}; color: ${gl.status === 'paid' ? '#2e7d32' : '#e65100'}; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: 600;">
                    ${gl.status === 'paid' ? 'נפרע במלואו' : 'פעיל'}
                  </span>
                </td>
              </tr>
            </table>
            
            ${refundAlert}
            ${repaymentsHtml}
          </div>
        `
      }).join('')}
    </div>
  ` : ''

  // Build regular loans section - minimalist style
  const regularLoansHtml = data.regularLoans && data.regularLoans.length > 0 ? `
    <div style="margin-top: 25px; page-break-before: auto;">
      <h3 style="color: #424242; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; font-size: 16px; font-weight: 600;">הלוואות פעילות שאני ערב עליהן</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10px;">
        <thead>
          <tr style="background: #fafafa; border-bottom: 2px solid #e0e0e0;">
            <th style="padding: 8px 6px; text-align: right; font-weight: 600; color: #616161;">לווה</th>
            <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">סכום</th>
            <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">יתרה</th>
            <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">תאריך</th>
            <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">פירעון</th>
            <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${data.regularLoans.map((loan, i) => {
            const statusLabels: Record<string, string> = {
              'active': 'פעילה',
              'overdue': 'באיחור',
              'transferred': 'הועברה',
              'paid': 'נפרעה'
            }
            const statusColors: Record<string, string> = {
              'active': '#e8f5e9',
              'overdue': '#ffebee',
              'transferred': '#fff3e0',
              'paid': '#f5f5f5'
            }
            const statusTextColors: Record<string, string> = {
              'active': '#2e7d32',
              'overdue': '#c62828',
              'transferred': '#e65100',
              'paid': '#757575'
            }
            return `
              <tr style="border-bottom: 1px solid #f5f5f5; ${i % 2 === 0 ? 'background: #fafafa;' : ''}">
                <td style="padding: 8px 6px; text-align: right;">${loan.borrowerName}</td>
                <td style="padding: 8px 6px; text-align: center; font-weight: 600;">${formatCurrency(loan.loanAmount)}</td>
                <td style="padding: 8px 6px; text-align: center; font-weight: 700; color: ${loan.remaining > 0 ? '#c62828' : '#2e7d32'};">${formatCurrency(loan.remaining)}</td>
                <td style="padding: 8px 6px; text-align: center; color: #757575;">${formatDate(loan.loanDate)}</td>
                <td style="padding: 8px 6px; text-align: center; color: #757575;">${loan.dueDate ? formatDate(loan.dueDate) : '-'}</td>
                <td style="padding: 8px 6px; text-align: center;">
                  <span style="background: ${statusColors[loan.status] || '#f5f5f5'}; color: ${statusTextColors[loan.status] || '#757575'}; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600;">
                    ${statusLabels[loan.status] || loan.status}
                  </span>
                </td>
              </tr>
            `
          }).join('')}
        </tbody>
      </table>
      <div style="margin-top: 12px; padding: 10px; background: #fafafa; border-left: 3px solid #757575;">
        <p style="margin: 0 0 4px 0; font-size: 11px; color: #424242;">
          <strong>סה"כ סכום הלוואות:</strong> ${formatCurrency(data.regularLoans.reduce((sum, l) => sum + l.loanAmount, 0))}
        </p>
        <p style="margin: 0; font-size: 11px; color: #424242;">
          <strong>סה"כ יתרה:</strong> ${formatCurrency(data.regularLoans.reduce((sum, l) => sum + l.remaining, 0))}
        </p>
      </div>
    </div>
  ` : ''

  const innerContent = `
    <div style="text-align: center; margin-bottom: 25px;">
      <h1 style="font-size: 24px; margin: 8px 0; color: #212121; font-weight: 600;">${data.gemachName}</h1>
      <h2 style="font-size: 16px; margin: 4px 0; color: #757575; font-weight: 400;">דוח ערב מפורט</h2>
    </div>

    <div style="background: #fafafa; padding: 15px; margin-bottom: 20px; border-left: 3px solid #424242;">
      <p style="margin: 0 0 6px 0; font-size: 14px; color: #212121; font-weight: 600;">פרטי הערב</p>
      <table style="width: 100%; font-size: 12px;">
        <tr>
          <td style="padding: 3px 0; color: #757575; width: 30%;">שם:</td>
          <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.guarantorName}</td>
        </tr>
        ${data.guarantorPhone ? `
        <tr>
          <td style="padding: 3px 0; color: #757575;">טלפון:</td>
          <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.guarantorPhone}</td>
        </tr>` : ''}
        ${data.guarantorEmail ? `
        <tr>
          <td style="padding: 3px 0; color: #757575;">אימייל:</td>
          <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.guarantorEmail}</td>
        </tr>` : ''}
        <tr>
          <td style="padding: 3px 0; color: #9e9e9e; font-size: 10px;">תאריך הפקה:</td>
          <td style="padding: 3px 0; color: #9e9e9e; font-size: 10px;">${today}</td>
        </tr>
      </table>
    </div>

    ${guarantorLoansHtml}
    
    ${regularLoansHtml}

    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; text-align: center;">
      <p style="margin: 0; font-size: 10px; color: #9e9e9e;">דוח זה הופק אוטומטית ממערכת ניהול הגמ"ח</p>
    </div>
  `

  const fullDocument = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>דוח ערב - ${data.guarantorName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap');
        body { 
          font-family: 'Heebo', Arial, sans-serif; 
          margin: 0;
          padding: 20px;
          background: white;
          color: #212121;
        }
        .page-container {
          max-width: 750px;
          margin: 0 auto;
          padding: 25px;
          background: white;
        }
        @media print {
          body { padding: 10px; }
          .page-container { padding: 15px; }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        ${applyDocumentBranding(innerContent, { 
          gemachLogo: data.gemachLogo, 
          gemachDocumentFrame: data.gemachDocumentFrame,
          frameMarginTop: data.frameMarginTop,
          frameMarginBottom: data.frameMarginBottom,
          frameMarginRight: data.frameMarginRight,
          frameMarginLeft: data.frameMarginLeft
        }, logoHtml)}
      </div>
    </body>
    </html>
  `

  // הערה: תמיכה במסגרות תופסק בגרסה זו
  printHtml(fullDocument, `דוח ערב - ${data.guarantorName}`)
}


// Generate donor report
export interface DonorReportData {
  gemachName: string
  gemachLogo?: string
  donorName: string
  donorPhone?: string
  donorIdNumber?: string
  donations: Array<{
    id: number
    amount: number
    donation_date: string
    notes?: string
  }>
  totalDonations: number
  dateFormat?: string
}

export function generateDonorReport(data: DonorReportData): void {
  const today = new Date().toLocaleDateString('he-IL')
  const logoHtml = data.gemachLogo ? `<img src="${data.gemachLogo}" alt="לוגו" style="max-width: 120px; max-height: 60px; margin-bottom: 15px;" />` : ''

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    if (data.dateFormat === 'hebrew') {
      return toHebrewDate(dateStr)
    }
    return date.toLocaleDateString('he-IL')
  }

  const donationsHtml = data.donations.length > 0 ? `
    <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px;">
      <thead>
        <tr style="background: #fafafa; border-bottom: 2px solid #e0e0e0;">
          <th style="padding: 8px 6px; text-align: right; font-weight: 600; color: #616161;">מס'</th>
          <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">תאריך</th>
          <th style="padding: 8px 6px; text-align: center; font-weight: 600; color: #616161;">סכום</th>
          <th style="padding: 8px 6px; text-align: right; font-weight: 600; color: #616161;">הערות</th>
        </tr>
      </thead>
      <tbody>
        ${data.donations.map((don, i) => `
          <tr style="border-bottom: 1px solid #f5f5f5; ${i % 2 === 0 ? 'background: #fafafa;' : ''}">
            <td style="padding: 8px 6px; text-align: right;">${i + 1}</td>
            <td style="padding: 8px 6px; text-align: center; color: #757575;">${formatDate(don.donation_date)}</td>
            <td style="padding: 8px 6px; text-align: center; font-weight: 600; color: #2e7d32;">${formatCurrency(don.amount)}</td>
            <td style="padding: 8px 6px; text-align: right; color: #757575;">${don.notes || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p style="color: #9e9e9e; margin-top: 8px; font-size: 11px; text-align: center;">אין תרומות</p>'

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>דוח תורם - ${data.donorName}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap');
        body { 
          font-family: 'Heebo', Arial, sans-serif; 
          margin: 0;
          padding: 20px;
          background: white;
          color: #212121;
        }
        .page-container {
          max-width: 750px;
          margin: 0 auto;
          padding: 25px;
          background: white;
        }
        @media print {
          body { padding: 10px; }
          .page-container { padding: 15px; }
        }
      </style>
    </head>
    <body>
      <div class="page-container">
        <div style="text-align: center; margin-bottom: 25px;">
          ${logoHtml}
          <h1 style="font-size: 24px; margin: 8px 0; color: #212121; font-weight: 600;">${data.gemachName}</h1>
          <h2 style="font-size: 16px; margin: 4px 0; color: #757575; font-weight: 400;">דוח תורם</h2>
        </div>

        <div style="background: #fafafa; padding: 15px; margin-bottom: 20px; border-left: 3px solid #424242;">
          <p style="margin: 0 0 6px 0; font-size: 14px; color: #212121; font-weight: 600;">פרטי התורם</p>
          <table style="width: 100%; font-size: 12px;">
            <tr>
              <td style="padding: 3px 0; color: #757575; width: 30%;">שם:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.donorName}</td>
            </tr>
            ${data.donorPhone ? `
            <tr>
              <td style="padding: 3px 0; color: #757575;">טלפון:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.donorPhone}</td>
            </tr>` : ''}
            ${data.donorIdNumber ? `
            <tr>
              <td style="padding: 3px 0; color: #757575;">ת.ז.:</td>
              <td style="padding: 3px 0; font-weight: 600; color: #424242;">${data.donorIdNumber}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 3px 0; color: #9e9e9e; font-size: 10px;">תאריך הפקה:</td>
              <td style="padding: 3px 0; color: #9e9e9e; font-size: 10px;">${today}</td>
            </tr>
          </table>
        </div>

        <div style="background: #e8f5e9; padding: 15px; margin-bottom: 20px; border-left: 3px solid #2e7d32;">
          <p style="margin: 0; font-size: 18px; color: #2e7d32; font-weight: 700;">
            סה"כ תרומות: ${formatCurrency(data.totalDonations)}
          </p>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #2e7d32;">
            מספר תרומות: ${data.donations.length}
          </p>
        </div>

        <div style="margin-top: 25px;">
          <h3 style="color: #424242; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; font-size: 16px; font-weight: 600;">פירוט תרומות</h3>
          ${donationsHtml}
        </div>

        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; text-align: center;">
          <p style="margin: 0; font-size: 10px; color: #9e9e9e;">דוח זה הופק אוטומטית ממערכת ניהול הגמ"ח</p>
          <p style="margin: 5px 0 0 0; font-size: 10px; color: #9e9e9e;">תודה רבה על תרומתך הנדיבה! 🙏</p>
        </div>
      </div>
    </body>
    </html>
  `

  downloadPdf(htmlContent, `דוח-תורם-${data.donorName}`)
}

// Email data for donor report
export function createDonorReportEmailData(params: {
  gemachName: string
  donorName: string
  donorEmail: string
  totalDonations: number
  donations: Array<{ id: number; amount: number; donation_date: string; notes?: string }>
}): EmailData {
  const formattedTotal = formatCurrency(params.totalDonations)
  
  const donationsHtml = params.donations.map(don => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${don.id}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrency(don.amount)}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${new Date(don.donation_date).toLocaleDateString('he-IL')}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${don.notes || '-'}</td>
    </tr>
  `).join('')

  const htmlContent = `
    <div style="padding: 20px;">
      <div style="text-align: center;">
        <h1 style="font-size: 24px; margin: 10px 0;">דוח תורם</h1>
        <h2 style="font-size: 16px; color: #666;">${params.gemachName}</h2>
      </div>
      <hr style="border: none; border-top: 2px solid #333; margin: 20px 0;" />
      <div style="text-align: right; font-size: 16px;">
        <p><strong>שם התורם:</strong> ${params.donorName}</p>
        <p><strong>תאריך הפקה:</strong> ${new Date().toLocaleDateString('he-IL')}</p>
        <p style="font-size: 18px; margin-top: 15px;"><strong>סה"כ תרומות:</strong> ${formattedTotal}</p>
      </div>
      <h3 style="text-align: right; margin-top: 30px;">פירוט תרומות:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: right;">
        <thead>
          <tr style="background: #e8f5e9;">
            <th style="padding: 10px; border: 1px solid #ddd;">מס'</th>
            <th style="padding: 10px; border: 1px solid #ddd;">סכום</th>
            <th style="padding: 10px; border: 1px solid #ddd;">תאריך</th>
            <th style="padding: 10px; border: 1px solid #ddd;">הערות</th>
          </tr>
        </thead>
        <tbody>
          ${donationsHtml || '<tr><td colspan="4" style="padding: 20px; text-align: center;">אין תרומות</td></tr>'}
        </tbody>
      </table>
      <div style="margin-top: 30px; padding: 15px; background: #e8f5e9; border-radius: 8px; text-align: center;">
        <p style="margin: 0; font-size: 16px; color: #2e7d32;">תודה רבה על תרומתך הנדיבה! 🙏</p>
      </div>
    </div>
  `
  
  return {
    to: params.donorEmail,
    subject: `דוח תרומות - ${params.gemachName}`,
    body: `שלום ${params.donorName},

מצורף דוח תרומות מגמ"ח "${params.gemachName}".

סה"כ תרומות: ${formattedTotal}
מספר תרומות: ${params.donations.length}

תודה רבה על תרומתך הנדיבה!

בברכה,
${params.gemachName}`,
    documentType: 'donor_report',
    htmlContent,
    filename: `דוח-תורם-${params.donorName}`
  }
}


/**
 * יצירת דוח תנועות תקופתי (חודשי/שנתי)
 * כולל הלוואות שניתנו, פירעונות שהתקבלו, תרומות והפקדות
 */
export function generatePeriodicTransactionsReport(data: {
  gemachName: string
  gemachLogo?: string
  startDate: string
  endDate: string
  loans: Array<{
    loan_number: number
    borrower_name: string
    amount: number
    loan_date: string
    status: string
    remaining: number
    is_recurring?: number
    recurring_loan_number?: number
    recurring_loan_count?: number
  }>
  repayments: Array<{
    loan_number: number
    borrower_name: string
    amount: number
    payment_date: string
    is_recurring?: number
    recurring_repayment_number?: number
    recurring_repayment_count?: number
  }>
  donations: Array<{
    donor_name: string
    amount: number
    donation_date: string
  }>
  deposits: Array<{
    depositor_name: string
    amount: number
    deposit_date: string
    is_recurring?: number
    recurring_deposit_number?: number
    recurring_deposit_count?: number
  }>
  summary: {
    totalLoansAmount: number
    totalRepaymentsAmount: number
    totalDonationsAmount: number
    totalDepositsAmount: number
    loansClosedInPeriod: number
  }
}) {
  const today = new Date().toLocaleDateString('he-IL')
  const startDateDisplay = new Date(data.startDate).toLocaleDateString('he-IL')
  const endDateDisplay = new Date(data.endDate).toLocaleDateString('he-IL')
  
  const logoHtml = data.gemachLogo 
    ? `<img src="${data.gemachLogo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px auto; display: block;" />`
    : ''

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // טבלת סיכום
  const summaryHtml = `
    <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 8px;">
      <h3 style="margin: 0 0 10px 0; font-size: 16px; text-align: center;">סיכום תקופתי</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">הלוואות שניתנו:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${data.loans.length} הלוואות</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${formatCurrency(data.summary.totalLoansAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">פירעונות שהתקבלו:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${data.repayments.length} פירעונות</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${formatCurrency(data.summary.totalRepaymentsAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">תרומות שהתקבלו:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${data.donations.length} תרומות</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${formatCurrency(data.summary.totalDonationsAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">הפקדות שהתקבלו:</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${data.deposits.length} הפקדות</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${formatCurrency(data.summary.totalDepositsAmount)}</td>
        </tr>
        <tr style="background: #e3f2fd;">
          <td style="padding: 8px; font-weight: bold;">הלוואות שנסגרו בתקופה:</td>
          <td colspan="2" style="padding: 8px; text-align: left; font-weight: bold;">${data.summary.loansClosedInPeriod} הלוואות</td>
        </tr>
      </table>
    </div>
  `

  // טבלת הלוואות
  const loansTableHtml = data.loans.length > 0 ? `
    <h3 style="margin-top: 30px; color: #d32f2f;">📤 הלוואות שניתנו</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
      <thead>
        <tr style="background: #f44336; color: white;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">מס' הלוואה</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">שם לווה</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">סכום</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">תאריך</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">מחזורי</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">יתרה</th>
        </tr>
      </thead>
      <tbody>
        ${data.loans.map((loan, index) => {
          const recurringInfo = loan.is_recurring && loan.recurring_loan_number && loan.recurring_loan_count && loan.recurring_loan_count > 1
            ? `🔄 ${loan.recurring_loan_number}/${loan.recurring_loan_count}`
            : '-'
          return `
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${loan.loan_number}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${loan.borrower_name}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;"><strong>${formatCurrency(loan.amount)}</strong></td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${new Date(loan.loan_date).toLocaleDateString('he-IL')}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${recurringInfo}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center; color: ${loan.remaining > 0 ? '#d32f2f' : '#2e7d32'};">${formatCurrency(loan.remaining)}</td>
          </tr>
        `}).join('')}
        <tr style="background: #ffebee; font-weight: bold;">
          <td colspan="3" style="padding: 8px; border: 1px solid #ddd; text-align: right;">סה"כ</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(data.summary.totalLoansAmount)}</td>
          <td colspan="3" style="padding: 8px; border: 1px solid #ddd;"></td>
        </tr>
      </tbody>
    </table>
  ` : '<p style="color: #999;">אין הלוואות בתקופה זו.</p>'

  // טבלת פירעונות
  const repaymentsTableHtml = data.repayments.length > 0 ? `
    <h3 style="margin-top: 30px; color: #2e7d32;">📥 פירעונות שהתקבלו</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
      <thead>
        <tr style="background: #4caf50; color: white;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">מס' הלוואה</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">שם לווה</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">סכום</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">תאריך</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">מחזורי</th>
        </tr>
      </thead>
      <tbody>
        ${data.repayments.map((rep, index) => {
          const recurringInfo = rep.is_recurring && rep.recurring_repayment_number && rep.recurring_repayment_count && rep.recurring_repayment_count > 1
            ? `🔄 ${rep.recurring_repayment_number}/${rep.recurring_repayment_count}`
            : '-'
          return `
          <tr>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${rep.loan_number}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${rep.borrower_name}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;"><strong>${formatCurrency(rep.amount)}</strong></td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${new Date(rep.payment_date).toLocaleDateString('he-IL')}</td>
            <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${recurringInfo}</td>
          </tr>
        `}).join('')}
        <tr style="background: #e8f5e9; font-weight: bold;">
          <td colspan="3" style="padding: 8px; border: 1px solid #ddd; text-align: right;">סה"כ</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(data.summary.totalRepaymentsAmount)}</td>
          <td colspan="2" style="padding: 8px; border: 1px solid #ddd;"></td>
        </tr>
      </tbody>
    </table>
  ` : '<p style="color: #999;">אין פירעונות בתקופה זו.</p>'

  // טבלת תרומות והפקדות
  const donationsAndDepositsHtml = `
    <h3 style="margin-top: 30px; color: #1976d2;">💰 תרומות והפקדות</h3>
    ${data.donations.length > 0 ? `
      <h4 style="margin: 15px 0 5px 0; font-size: 14px;">💝 תרומות</h4>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
        <thead>
          <tr style="background: #ff9800; color: white;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">שם תורם</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">סכום</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">תאריך</th>
          </tr>
        </thead>
        <tbody>
          ${data.donations.map((don, index) => `
            <tr>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${don.donor_name}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;"><strong>${formatCurrency(don.amount)}</strong></td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${new Date(don.donation_date).toLocaleDateString('he-IL')}</td>
            </tr>
          `).join('')}
          <tr style="background: #fff3e0; font-weight: bold;">
            <td colspan="2" style="padding: 8px; border: 1px solid #ddd; text-align: right;">סה"כ</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(data.summary.totalDonationsAmount)}</td>
            <td style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
        </tbody>
      </table>
    ` : '<p style="color: #999; margin: 10px 0;">אין תרומות בתקופה זו.</p>'}
    
    ${data.deposits.length > 0 ? `
      <h4 style="margin: 15px 0 5px 0; font-size: 14px;">🏦 הפקדות</h4>
      <table style="width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;">
        <thead>
          <tr style="background: #2196f3; color: white;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">#</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">שם מפקיד</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">סכום</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">תאריך</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">מחזורי</th>
          </tr>
        </thead>
        <tbody>
          ${data.deposits.map((dep, index) => {
            const recurringInfo = dep.is_recurring && dep.recurring_deposit_number && dep.recurring_deposit_count && dep.recurring_deposit_count > 1
              ? `🔄 ${dep.recurring_deposit_number}/${dep.recurring_deposit_count}`
              : '-'
            return `
            <tr>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${index + 1}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${dep.depositor_name}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;"><strong>${formatCurrency(dep.amount)}</strong></td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${new Date(dep.deposit_date).toLocaleDateString('he-IL')}</td>
              <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${recurringInfo}</td>
            </tr>
          `}).join('')}
          <tr style="background: #e3f2fd; font-weight: bold;">
            <td colspan="2" style="padding: 8px; border: 1px solid #ddd; text-align: right;">סה"כ</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${formatCurrency(data.summary.totalDepositsAmount)}</td>
            <td colspan="2" style="padding: 8px; border: 1px solid #ddd;"></td>
          </tr>
        </tbody>
      </table>
    ` : '<p style="color: #999; margin: 10px 0;">אין הפקדות בתקופה זו.</p>'}
  `

  const htmlContent = `
    <div style="text-align: center; padding: 15px; max-width: 900px; margin: 0 auto;">
      ${logoHtml}
      <h1 style="font-size: 24px; margin: 8px 0;">דוח תנועות תקופתי</h1>
      <h2 style="font-size: 16px; color: #666; margin-bottom: 5px;">${data.gemachName}</h2>
      <p style="font-size: 14px; color: #999; margin: 5px 0;">
        תקופה: ${startDateDisplay} - ${endDateDisplay}
      </p>
      
      <hr style="border: none; border-top: 2px solid #333; margin: 15px 0;" />
      
      ${summaryHtml}
      
      ${loansTableHtml}
      
      ${repaymentsTableHtml}
      
      ${donationsAndDepositsHtml}
      
      <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
      
      <div style="text-align: right; font-size: 11px; color: #666;">
        תאריך הפקת הדוח: ${today}
      </div>
    </div>
  `

  printHtml(htmlContent, `דוח תנועות ${startDateDisplay} - ${endDateDisplay}`)
}
