/**
 * Script לאימות מיגרציית מספרי פירעון מחזורי
 * מחפש פירעונות עם auto_repayment=1 שחסר להם recurring_repayment_number
 */

const fs = require('fs')
const path = require('path')

// קריאת הנתונים מקובץ localStorage (הנתיב צריך להתאים למערכת)
const DATA_FILE = path.join(process.env.APPDATA || process.env.HOME, 'gemach-data.json')

try {
  if (!fs.existsSync(DATA_FILE)) {
    console.log('❌ לא נמצא קובץ נתונים ב-', DATA_FILE)
    process.exit(1)
  }

  const rawData = fs.readFileSync(DATA_FILE, 'utf-8')
  const data = JSON.parse(rawData)

  const loans = Object.values(data.loans || {})
  const repayments = Object.values(data.repayments || {})

  let totalRecurringLoans = 0
  let totalRepaymentsNeedMigration = 0
  let detailsByLoan = []

  console.log('\n🔍 בדיקת פירעונות מחזוריים שחסרים מספרים...\n')

  for (const loan of loans) {
    // רק הלוואות עם פירעון מחזורי מוגדר
    if (loan.auto_repayment !== 1 || !loan.repayment_amount || loan.repayment_amount <= 0) {
      continue
    }

    totalRecurringLoans++

    const loanRepayments = repayments.filter(r => r.loan_id === loan.id && !r.is_deleted)
    const missingNumbers = loanRepayments.filter(r => !r.recurring_repayment_number)

    if (missingNumbers.length > 0) {
      totalRepaymentsNeedMigration += missingNumbers.length
      detailsByLoan.push({
        loanId: loan.id,
        borrowerName: loan.borrower_name || '(לא ידוע)',
        totalRepayments: loanRepayments.length,
        missing: missingNumbers.length,
      })

      console.log(
        `📋 הלוואה #${loan.id} (${loan.borrower_name || 'לא ידוע'}): ${missingNumbers.length}/${loanRepayments.length} פירעונות חסרי מספור`
      )
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ סה"כ הלוואות עם פירעון מחזורי: ${totalRecurringLoans}`)
  console.log(`⚠️  סה"כ פירעונות שצריכים מיגרציה: ${totalRepaymentsNeedMigration}`)
  console.log('='.repeat(60) + '\n')

  if (totalRepaymentsNeedMigration === 0) {
    console.log('✅ כל הפירעונות מסומנים נכון! אין צורך במיגרציה.\n')
  } else {
    console.log(
      `⚠️  נמצאו ${totalRepaymentsNeedMigration} פירעונות שצריכים מיגרציה.`
    )
    console.log('   הרץ את המיגרציה מתוך ההגדרות > מסד הנתונים.\n')
  }
} catch (error) {
  console.error('❌ שגיאה בקריאת הנתונים:', error.message)
  process.exit(1)
}
