/**
 * סקריפט להמרת גיבוי מהמערכת הישנה למבנה המערכת החדשה
 * 
 * שימוש:
 * node scripts/convert-old-backup.js <input-file.json> <output-file.json>
 * 
 * דוגמא:
 * node scripts/convert-old-backup.js old-backup.json new-backup.json
 */

const fs = require('fs');
const path = require('path');

// קבלת פרמטרים
const inputFile = process.argv[2];
const outputFile = process.argv[3] || 'converted-backup.json';

if (!inputFile) {
  console.log('שימוש: node convert-old-backup.js <קובץ-קלט.json> [קובץ-פלט.json]');
  console.log('דוגמא: node convert-old-backup.js old-backup.json new-backup.json');
  process.exit(1);
}

// קריאת הקובץ הישן
let oldData;
try {
  const rawData = fs.readFileSync(inputFile, 'utf8');
  oldData = JSON.parse(rawData);
  console.log('✅ קובץ נקרא בהצלחה');
} catch (error) {
  console.error('❌ שגיאה בקריאת הקובץ:', error.message);
  process.exit(1);
}

// מבנה הנתונים החדש
const newData = {
  settings: {},
  borrowers: {},
  guarantors: {},
  loans: {},
  repayments: {},
  donors: {},
  donations: {},
  depositors: {},
  deposits: {},
  blacklist: {},
  expenses: {}
};

// המרת הגדרות
console.log('🔄 ממיר הגדרות...');
if (oldData.settings) {
  newData.settings = {
    gemach_name: oldData.gemachName || oldData.settings.gemachName || 'גמ"ח שלי',
    currency: oldData.settings.currency || 'ILS',
    risk_threshold: '50000',
    default_loan_period: String(oldData.settings.defaultLoanPeriod || 12),
    date_format: oldData.settings.showHebrewDates ? 'combined' : 'gregorian',
    show_recurring_options: oldData.settings.enableRecurringLoans ? 'yes' : 'no',
    show_payment_method: oldData.settings.trackPaymentMethods ? 'yes' : 'no',
  };
} else {
  newData.settings = {
    gemach_name: oldData.gemachName || 'גמ"ח שלי',
    currency: 'ILS',
    risk_threshold: '50000',
    default_loan_period: '12',
    date_format: 'gregorian',
    show_recurring_options: 'yes',
    show_payment_method: 'yes',
  };
}

// המרת לווים
console.log('🔄 ממיר לווים...');
if (oldData.borrowers && Array.isArray(oldData.borrowers)) {
  oldData.borrowers.forEach(b => {
    newData.borrowers[String(b.id)] = {
      id: b.id,
      first_name: b.firstName || '',
      last_name: b.lastName || '',
      phone: b.phone || '',
      phone2: b.phone2 || '',
      id_number: b.idNumber || '',
      city: b.city || '',
      address: b.address || '',
      email: b.email || '',
      notes: b.notes || '',
      created_at: b.createdDate || new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.borrowers.length} לווים`);
}

// המרת ערבים
console.log('🔄 ממיר ערבים...');
if (oldData.guarantors && Array.isArray(oldData.guarantors)) {
  oldData.guarantors.forEach(g => {
    newData.guarantors[String(g.id)] = {
      id: g.id,
      first_name: g.firstName || g.name || '',
      last_name: g.lastName || '',
      phone: g.phone || '',
      id_number: g.idNumber || '',
      address: g.address || '',
      email: g.email || '',
      notes: g.notes || '',
      is_blacklisted: 0,
      created_at: g.createdDate || new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.guarantors.length} ערבים`);
}

// המרת הלוואות
console.log('🔄 ממיר הלוואות...');
if (oldData.loans && Array.isArray(oldData.loans)) {
  oldData.loans.forEach(l => {
    // המרת סטטוס
    let status = 'active';
    if (l.status === 'completed') status = 'completed';
    else if (l.status === 'planned') status = 'planned';
    
    // המרת סוג הלוואה
    let loanType = l.loanType || 'flexible';
    
    // המרת פרטי תשלום
    let paymentMethod = l.loanPaymentMethod || '';
    let paymentDetails = l.loanPaymentDetails || '';
    
    newData.loans[String(l.id)] = {
      id: l.id,
      borrower_id: l.borrowerId,
      amount: l.amount || 0,
      loan_date: l.loanDate || '',
      loan_type: loanType,
      due_date: l.returnDate || '',
      is_recurring: l.isRecurring ? 1 : 0,
      recurring_months: l.recurringMonths || 0,
      recurring_day: l.recurringDay || 1,
      auto_repayment: l.autoPayment ? 1 : 0,
      repayment_amount: l.autoPaymentAmount || 0,
      repayment_day: l.autoPaymentDay || 1,
      repayment_frequency: String(l.autoPaymentFrequency || 1),
      repayment_start_date: l.autoPaymentStartDate || '',
      guarantor1_id: null, // ערבים במערכת הישנה היו טקסט, לא ID
      guarantor2_id: null,
      notes: l.notes || '',
      status: status,
      payment_method: paymentMethod,
      payment_details: paymentDetails,
      created_at: l.createdDate || new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.loans.length} הלוואות`);
}

// המרת פירעונות (payments במערכת הישנה)
console.log('🔄 ממיר פירעונות...');
if (oldData.payments && Array.isArray(oldData.payments)) {
  oldData.payments.forEach(p => {
    newData.repayments[String(p.id)] = {
      id: p.id,
      loan_id: p.loanId,
      amount: p.amount || 0,
      payment_date: p.date || '',
      payment_method: p.paymentMethod || '',
      payment_details: p.paymentDetails || '',
      notes: p.notes || '',
      created_at: new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.payments.length} פירעונות`);
}

// המרת מפקידים
console.log('🔄 ממיר מפקידים...');
if (oldData.depositors && Array.isArray(oldData.depositors)) {
  oldData.depositors.forEach(d => {
    // פיצול שם לשם פרטי ושם משפחה
    const nameParts = (d.name || '').trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    newData.depositors[String(d.id)] = {
      id: d.id,
      first_name: firstName,
      last_name: lastName,
      phone: d.phone || '',
      id_number: d.idNumber || '',
      address: d.address || '',
      email: d.email || '',
      notes: d.notes || '',
      created_at: new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.depositors.length} מפקידים`);
}

// המרת הפקדות
console.log('🔄 ממיר הפקדות...');
if (oldData.deposits && Array.isArray(oldData.deposits)) {
  oldData.deposits.forEach(d => {
    // חישוב תאריך סיום לפי תקופה
    let dueDate = '';
    if (d.depositDate && d.depositPeriod) {
      const startDate = new Date(d.depositDate);
      startDate.setMonth(startDate.getMonth() + d.depositPeriod);
      dueDate = startDate.toISOString().split('T')[0];
    }
    
    newData.deposits[String(d.id)] = {
      id: d.id,
      depositor_id: d.depositorId,
      amount: d.amount || 0,
      deposit_date: d.depositDate || '',
      period_type: d.depositPeriod ? 'fixed' : 'flexible',
      due_date: dueDate,
      is_recurring: d.isRecurring ? 1 : 0,
      recurring_day: new Date(d.depositDate || Date.now()).getDate(),
      notes: d.notes || '',
      status: d.status || 'active',
      payment_method: '',
      payment_details: '',
      withdrawal_date: '',
      created_at: new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.deposits.length} הפקדות`);
}

// המרת תרומות
console.log('🔄 ממיר תרומות...');
if (oldData.donations && Array.isArray(oldData.donations)) {
  // יצירת תורמים מהתרומות (במערכת הישנה התורם היה חלק מהתרומה)
  const donorMap = new Map();
  let donorId = 1;
  
  oldData.donations.forEach(d => {
    const donorKey = `${d.donorName || ''}_${d.donorLastName || ''}_${d.phone || ''}`;
    
    if (!donorMap.has(donorKey)) {
      donorMap.set(donorKey, {
        id: donorId,
        first_name: d.donorName || '',
        last_name: d.donorLastName || '',
        phone: d.phone || '',
        address: d.address || '',
        notes: '',
        created_at: new Date().toISOString()
      });
      donorId++;
    }
  });
  
  // שמירת התורמים
  donorMap.forEach((donor, key) => {
    newData.donors[String(donor.id)] = donor;
  });
  console.log(`   נוצרו ${donorMap.size} תורמים`);
  
  // שמירת התרומות
  oldData.donations.forEach((d, index) => {
    const donorKey = `${d.donorName || ''}_${d.donorLastName || ''}_${d.phone || ''}`;
    const donor = donorMap.get(donorKey);
    
    // המרת אמצעי תשלום
    let paymentMethod = '';
    if (d.method === 'cash') paymentMethod = 'cash';
    else if (d.method === 'credit') paymentMethod = 'credit';
    else if (d.method === 'transfer') paymentMethod = 'transfer';
    else if (d.method === 'check') paymentMethod = 'check';
    
    newData.donations[String(d.id || index + 1)] = {
      id: d.id || index + 1,
      donor_id: donor ? donor.id : 1,
      amount: d.amount || 0,
      donation_date: d.donationDate || new Date().toISOString().split('T')[0],
      payment_method: paymentMethod,
      payment_details: d.paymentDetails || '',
      notes: d.notes || '',
      created_at: new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.donations.length} תרומות`);
}

// המרת רשימה שחורה
console.log('🔄 ממיר רשימה שחורה...');
if (oldData.blacklist && Array.isArray(oldData.blacklist)) {
  oldData.blacklist.forEach(b => {
    if (b.isActive) { // רק פעילים
      newData.blacklist[String(b.id)] = {
        id: b.id,
        entity_type: b.type || 'borrower',
        entity_id: b.personId,
        reason: b.reason || '',
        added_at: b.blockedDate || new Date().toISOString()
      };
    }
  });
  const activeCount = oldData.blacklist.filter(b => b.isActive).length;
  console.log(`   נמצאו ${activeCount} רשומות פעילות ברשימה שחורה`);
}

// המרת הוצאות
console.log('🔄 ממיר הוצאות...');
if (oldData.expenses && Array.isArray(oldData.expenses)) {
  oldData.expenses.forEach(e => {
    newData.expenses[String(e.id)] = {
      id: e.id,
      description: e.description || '',
      amount: e.amount || 0,
      expense_date: e.date || e.expenseDate || new Date().toISOString().split('T')[0],
      category: e.category || 'other',
      paid_by: e.paidBy || 'gemach',
      borrower_id: e.borrowerId || null,
      payment_method: e.paymentMethod || '',
      payment_details: e.paymentDetails || '',
      notes: e.notes || '',
      created_at: new Date().toISOString()
    };
  });
  console.log(`   נמצאו ${oldData.expenses.length} הוצאות`);
}

// שמירת הקובץ החדש
try {
  fs.writeFileSync(outputFile, JSON.stringify(newData, null, 2), 'utf8');
  console.log('');
  console.log('✅ ההמרה הושלמה בהצלחה!');
  console.log(`📁 הקובץ נשמר ב: ${outputFile}`);
  console.log('');
  console.log('📊 סיכום:');
  console.log(`   - לווים: ${Object.keys(newData.borrowers).length}`);
  console.log(`   - ערבים: ${Object.keys(newData.guarantors).length}`);
  console.log(`   - הלוואות: ${Object.keys(newData.loans).length}`);
  console.log(`   - פירעונות: ${Object.keys(newData.repayments).length}`);
  console.log(`   - מפקידים: ${Object.keys(newData.depositors).length}`);
  console.log(`   - הפקדות: ${Object.keys(newData.deposits).length}`);
  console.log(`   - תורמים: ${Object.keys(newData.donors).length}`);
  console.log(`   - תרומות: ${Object.keys(newData.donations).length}`);
  console.log(`   - הוצאות: ${Object.keys(newData.expenses).length}`);
  console.log('');
  console.log('💡 כעת ניתן לייבא את הקובץ במערכת החדשה:');
  console.log('   כלים מתקדמים → ייבוא מגיבוי');
} catch (error) {
  console.error('❌ שגיאה בשמירת הקובץ:', error.message);
  process.exit(1);
}
