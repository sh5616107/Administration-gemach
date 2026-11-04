/**
 * טעינת תאריך הפירעון האחרון להלוואות עם פירעון אוטומטי.
 * נחוץ לחישוב "פירעון הבא" (האם כבר שולם החודש) - ראו utils/loanDueDate.ts.
 * משתמש רק ב-API הציבורי של repaymentsService, כך שלא תלוי במבנה האחסון.
 */

import { repaymentsService } from './database'

export async function getLastRepaymentDates(
  loans: Array<{ id?: string; auto_repayment?: number }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  await Promise.all(
    loans
      .filter(l => l.id && l.auto_repayment === 1)
      .map(async l => {
        try {
          // getByLoan ממוין מהחדש לישן ומסנן פירעונות שנמחקו
          const repayments = await repaymentsService.getByLoan(l.id!)
          if (repayments.length > 0) result.set(l.id!, repayments[0].payment_date.slice(0, 10))
        } catch (error) {
          console.error(`Error loading last repayment for loan ${l.id}:`, error)
        }
      })
  )
  return result
}
