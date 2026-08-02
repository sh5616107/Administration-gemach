/**
 * סקריפט לבדיקת הלוואות יתומות בקונסול הדפדפן
 * 
 * הוראות שימוש:
 * 1. פתח את האפליקציה בדפדפן
 * 2. פתח את הקונסול (F12)
 * 3. העתק והדבק את הקוד הזה
 * 4. הרץ: await checkOrphanedLoans()
 */

async function checkOrphanedLoans() {
  console.log('🔍 מתחיל בדיקת הלוואות יתומות...\n');
  
  try {
    // גישה ל-statsService דרך window (אם חשוף)
    const { statsService } = await import('./src/services/database.ts');
    
    const result = await statsService.findOrphanedLoans();
    
    console.log('=' .repeat(60));
    console.log('📊 תוצאות הבדיקה:');
    console.log('=' .repeat(60));
    console.log(`✓ מספר הלוואות יתומות: ${result.count}`);
    console.log(`✓ סכום כולל: ${result.totalAmount.toLocaleString('he-IL')} ₪`);
    console.log('=' .repeat(60));
    
    if (result.count === 0) {
      console.log('✅ מעולה! לא נמצאו הלוואות יתומות');
      console.log('   כל ההלוואות משויכות ללווים קיימים במערכת\n');
      return result;
    }
    
    console.log('\n⚠️  נמצאו הלוואות יתומות!\n');
    console.log('פרטי ההלוואות:');
    console.log('-'.repeat(60));
    
    result.loans.forEach((loan, index) => {
      console.log(`\n${index + 1}. הלוואה:`, {
        'מזהה הלוואה': loan.id.substring(0, 13) + '...',
        'מזהה לווה (לא קיים)': loan.borrower_id.substring(0, 13) + '...',
        'סכום מקורי': loan.amount.toLocaleString('he-IL') + ' ₪',
        'יתרה': (loan.remaining || 0).toLocaleString('he-IL') + ' ₪',
        'תאריך הלוואה': loan.loan_date,
        'סטטוס': loan.status
      });
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 אפשרויות טיפול:');
    console.log('='.repeat(60));
    console.log('1. שחזר את רשומת הלווה מגיבוי');
    console.log('2. שייך מחדש את ההלוואה ללווה אחר קיים');
    console.log('3. צור לווה חדש עם הפרטים הנכונים');
    console.log('4. סמן את ההלוואה כנפרעה אם היא שולמה בפועל');
    console.log('\n⚠️  חשוב: אל תמחק הלוואות מבלי לתעד - הן מייצגות כסף אמיתי!\n');
    
    return result;
    
  } catch (error) {
    console.error('❌ שגיאה בבדיקה:', error);
    console.log('\n💡 אם זה לא עובד, נסה:');
    console.log('   1. לעבור לדף "כלים מתקדמים"');
    console.log('   2. ללחוץ על "איתור הלוואות יתומות"\n');
    throw error;
  }
}

// הפונקציה זמינה ב-console
console.log('✓ הפונקציה checkOrphanedLoans() טעונה ומוכנה לשימוש');
console.log('  הרץ: await checkOrphanedLoans()');
