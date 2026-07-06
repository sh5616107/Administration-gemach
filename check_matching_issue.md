# 🔍 מדריך פתרון בעיות - למה לא נוצרות התאמות?

## הקובץ שמטפל בהתאמות

**Backend (Rust):**
- `src-tauri/src/bank_match_commands.rs` - הפקודות
- `src-tauri/src/bank_integration.rs` - האלגוריתם

**Frontend (TypeScript):**
- `src/pages/bank/BankMatchingPage.tsx` - הממשק
- `src/services/bankService.ts` - השירותים

---

## בדיקות שלב-אחר-שלב

### ✅ שלב 1: בדוק שיש עסקאות ללא התאמה

פתח **DevTools (F12)** בעמוד "אישור התאמות" והרץ:

```javascript
const txns = await bankService.getUnmatchedTransactions();
console.log('💳 עסקאות ללא התאמה:', txns.length);

if (txns.length === 0) {
  console.error('❌ אין עסקאות ללא התאמה!');
  console.log('📝 פתרון: לך ל"סנכרון בנק" וסנכרן חשבון');
} else {
  console.log('✅ יש', txns.length, 'עסקאות');
  console.log('📄 עסקה ראשונה:', txns[0]);
}
```

**תוצאה צפויה:** מספר > 0

**אם 0:**
1. לך ל**ניהול בנקים > סנכרון**
2. סנכרן חשבון בנק
3. חזור ובדוק שוב

---

### ✅ שלב 2: בדוק שיש לווים עם הלוואות פעילות

```javascript
const { db, loansService } = await import('./src/services/database');

// קבל כל הלווים
const borrowers = await db.query('SELECT * FROM borrowers WHERE is_deleted = 0');
console.log('👥 לווים במערכת:', borrowers.length);

if (borrowers.length === 0) {
  console.error('❌ אין לווים במערכת!');
  console.log('📝 פתרון: הוסף לווים בעמוד "לווים"');
}

// בדוק הלוואות פעילות
let activeBorrowersCount = 0;
for (const borrower of borrowers) {
  const loans = await loansService.getByBorrower(borrower.id);
  const activeLoans = loans.filter(l => l.remaining > 0);
  
  if (activeLoans.length > 0) {
    activeBorrowersCount++;
    console.log(`✅ ${borrower.first_name} ${borrower.last_name}:`, activeLoans.length, 'הלוואות פעילות');
    activeLoans.forEach(loan => {
      console.log(`   💰 יתרה: ${loan.remaining} ₪, תאריך: ${loan.date || loan.loan_date}`);
    });
  }
}

console.log('\n📊 סיכום:', activeBorrowersCount, 'לווים עם הלוואות פעילות');

if (activeBorrowersCount === 0) {
  console.error('❌ אין לווים עם הלוואות פעילות!');
  console.log('📝 פתרון: הוסף הלוואה חדשה או בדוק שיש יתרת חוב');
}
```

**תוצאה צפויה:** לפחות 1 לווה עם הלוואה פעילה (remaining > 0)

**אם 0:**
1. לך ל**לווים** והוסף לווה
2. צור **הלוואה חדשה** ללווה
3. ודא שה**יתרה > 0**

---

### ✅ שלב 3: בדוק תאימות (עסקה vs לווה)

```javascript
// קבל עסקה ראשונה
const txns = await bankService.getUnmatchedTransactions();
const txn = txns[0];

console.log('💳 עסקה לבדיקה:');
console.log('  סכום:', txn.amount, '₪');
console.log('  תאריך:', txn.date);
console.log('  תיאור:', txn.description);
console.log('  Memo:', txn.memo || '(ריק)');

// קבל לווה ראשון עם הלוואה פעילה
const { db, loansService } = await import('./src/services/database');
const borrowers = await db.query('SELECT * FROM borrowers WHERE is_deleted = 0');

let foundMatch = false;
for (const borrower of borrowers) {
  const loans = await loansService.getByBorrower(borrower.id);
  const activeLoans = loans.filter(l => l.remaining > 0);
  
  if (activeLoans.length > 0) {
    const loan = activeLoans[0];
    
    console.log('\n👤 לווה לבדיקה:');
    console.log('  שם:', `${borrower.first_name} ${borrower.last_name}`);
    console.log('  טלפון:', borrower.phone || '(ריק)');
    console.log('  יתרת חוב:', loan.remaining, '₪');
    console.log('  תאריך הלוואה:', loan.date || loan.loan_date);
    
    // חשב הפרשים
    const amountDiff = Math.abs(Math.abs(txn.amount) - loan.remaining);
    const txnDate = new Date(txn.date);
    const loanDate = new Date(loan.date || loan.loan_date);
    const daysDiff = Math.abs((txnDate - loanDate) / (1000 * 60 * 60 * 24));
    
    console.log('\n📊 הפרשים:');
    console.log('  הפרש סכום:', amountDiff.toFixed(2), '₪');
    console.log('  הפרש ימים:', Math.floor(daysDiff), 'ימים');
    
    // חשב ציון
    let score = 0;
    let reasons = [];
    
    // סכום (35 נקודות)
    if (amountDiff < 0.01) {
      score += 35;
      reasons.push('✅ סכום זהה (35)');
    } else if (amountDiff < 1) {
      score += 30;
      reasons.push('✅ סכום קרוב מאוד (30)');
    } else if (amountDiff < 10) {
      score += 20;
      reasons.push('⚠️ סכום קרוב (20)');
    } else if (amountDiff < 100) {
      score += 8;
      reasons.push('⚠️ הפרש סכום גדול (8)');
    } else {
      reasons.push('❌ הפרש סכום גדול מדי (0)');
    }
    
    // תאריך (25 נקודות)
    if (daysDiff === 0) {
      score += 25;
      reasons.push('✅ תאריך זהה (25)');
    } else if (daysDiff <= 3) {
      score += 20;
      reasons.push('✅ תאריך קרוב (20)');
    } else if (daysDiff <= 7) {
      score += 12;
      reasons.push('⚠️ תאריך בשבוע (12)');
    } else if (daysDiff <= 14) {
      score += 4;
      reasons.push('⚠️ תאריך בשבועיים (4)');
    } else {
      reasons.push('❌ תאריך רחוק מדי (0)');
    }
    
    // כיוון (5 נקודות)
    const expectedDirection = 'in'; // repayment = כסף נכנס
    const actualDirection = txn.amount > 0 ? 'in' : 'out';
    if (expectedDirection === actualDirection) {
      score += 5;
      reasons.push('✅ כיוון נכון (5)');
    } else {
      reasons.push('❌ כיוון שגוי (0)');
    }
    
    console.log('\n🎯 ציון חישובי:', score, '/ 115');
    console.log('📋 נימוקים:');
    reasons.forEach(r => console.log('  ', r));
    
    console.log('\n📌 מסקנה:');
    if (score >= 50) {
      console.log('✅ ציון מספיק! התאמה תיווצר (מינימום 50)');
      foundMatch = true;
    } else {
      console.log('❌ ציון נמוך מדי! לא תיווצר התאמה (צריך לפחות 50)');
      console.log('💡 טיפ: הוסף memo עם שם הלווה או טלפון לעסקה');
    }
    
    break; // נבדוק רק לווה אחד
  }
}

if (!foundMatch) {
  console.log('\n💡 אפשרויות:');
  console.log('1. התאם את הסכומים (עסקה vs יתרת חוב)');
  console.log('2. סנכרן בתאריכים קרובים יותר');
  console.log('3. הוסף memo עם שם הלווה');
  console.log('4. הוסף טלפון ללווה');
}
```

---

### ✅ שלב 4: בדוק שה-Backend עודכן

אם עדכנת את הקוד ב-`bank_integration.rs`, **צריך לבצע rebuild:**

```bash
# אופציה 1: dev mode
npm run tauri dev

# אופציה 2: build
cd src-tauri
cargo build --release
cd ..
```

**סימן שה-Backend לא עודכן:**
- אין הודעות DEBUG בקונסול
- פונקציות חדשות לא עובדות
- השינויים לא משפיעים

---

### ✅ שלב 5: נסה ליצור התאמות

```javascript
// הפעל את תהליך יצירת ההתאמות
console.log('🚀 מתחיל תהליך יצירת התאמות...');

// לחץ על כפתור "צור התאמות אוטומטיות" בממשק
// או הרץ:

const { db, loansService } = await import('./src/services/database');

const unmatchedTxns = await bankService.getUnmatchedTransactions();
console.log('💳 עסקאות:', unmatchedTxns.length);

const borrowers = await db.query('SELECT * FROM borrowers WHERE is_deleted = 0');
const borrowersWithLoans = [];

for (const borrower of borrowers) {
  const borrowerLoans = await loansService.getByBorrower(borrower.id);
  const activeLoans = borrowerLoans.filter(l => l.remaining > 0);
  if (activeLoans.length > 0) {
    for (const loan of activeLoans) {
      borrowersWithLoans.push({
        borrower_id: borrower.id,
        first_name: borrower.first_name,
        last_name: borrower.last_name,
        phone: borrower.phone || '',
        loan_amount: loan.remaining,
        loan_date: loan.loan_date || loan.date || new Date().toISOString().split('T')[0],
        loan_id: loan.id,
      });
    }
  }
}

console.log('👥 לווים עם הלוואות פעילות:', borrowersWithLoans.length);

if (unmatchedTxns.length === 0) {
  console.error('❌ אין עסקאות ללא התאמה');
} else if (borrowersWithLoans.length === 0) {
  console.error('❌ אין לווים עם הלוואות פעילות');
} else {
  console.log('✅ יש נתונים, מנסה ליצור התאמות...');
  
  // נסה עסקה אחת
  const txn = unmatchedTxns[0];
  try {
    const count = await bankService.createAutoMatchesForTransaction(
      txn.id,
      borrowersWithLoans,
      [], // donations
      [], // deposits
      [], // expenses
      []  // loan_disbursements
    );
    
    console.log('✅ נוצרו', count, 'התאמות לעסקה זו!');
    
    if (count === 0) {
      console.warn('⚠️ לא נוצרו התאמות - ציון נמוך מדי (< 50)');
      console.log('💡 הרץ את השלב 3 למעלה כדי לראות למה');
    }
  } catch (err) {
    console.error('❌ שגיאה ביצירת התאמות:', err);
  }
}
```

---

## 🐛 בעיות נפוצות ופתרונות

### בעיה 1: "אין עסקאות ללא התאמה"
**פתרון:**
1. לך ל"ניהול בנקים > סנכרון"
2. סנכרן חשבון
3. חזור לאישור התאמות

### בעיה 2: "אין לווים עם הלוואות פעילות"
**פתרון:**
1. לך ל"לווים"
2. הוסף לווה חדש
3. צור הלוואה חדשה
4. ודא ש`remaining > 0`

### בעיה 3: "נוצרו 0 התאמות"
**סיבות אפשריות:**
- הסכומים לא תואמים (הפרש > 100 ₪)
- התאריכים רחוקים מדי (> 14 ימים)
- אין memo או טלפון (ציון נמוך)

**פתרון:**
- הוסף memo עם שם הלווה: "המבצע: [שם פרטי] [שם משפחה]."
- הוסף טלפון ללווה
- ודא שהסכומים תואמים

### בעיה 4: "השינויים לא עובדים"
**פתרון:**
```bash
cd src-tauri
cargo clean
cargo build --release
cd ..
npm run tauri dev
```

### בעיה 5: "שגיאה בטעינת נתונים"
**פתרון:**
- בדוק שסיסמת-על מוגדרת
- בדוק שקובץ `bank_data.json` קיים
- נסה reset: "ניהול בנקים > איפוס נתונים"

---

## 📊 טבלת ציונים מהירה

| קריטריון | תנאי | נקודות |
|----------|------|---------|
| **סכום** | זהה (< 0.01) | 35 |
| | קרוב מאוד (< 1) | 30 |
| | קרוב (< 10) | 20 |
| | הפרש גדול (< 100) | 8 |
| | הפרש ענק (≥ 100) | 0 |
| **פירעון חלקי** | 10-100% מיתרה | 15 |
| | 5-10% מיתרה | 8 |
| **תאריך** | זהה | 25 |
| | ≤ 3 ימים | 20 |
| | ≤ 7 ימים | 12 |
| | ≤ 14 ימים | 4 |
| | > 14 ימים | 0 |
| **שם** | מ-memo + prefix | 30 |
| | מלא תואם | 25 |
| | כל מילים | 20 |
| | מילה אחת | 12 |
| **טלפון** | תואם | 20 |
| **כיוון** | נכון | 5 |

**מינימום לציון:** 50 נקודות

---

## 🎯 דוגמה למצב אידיאלי

**עסקת בנק:**
```json
{
  "amount": 250.0,
  "date": "2024-01-15",
  "memo": "המבצע: משה כהן.",
  "description": "העברה/הפקדה-טל"
}
```

**לווה:**
```json
{
  "first_name": "משה",
  "last_name": "כהן",
  "phone": "0501234567",
  "remaining": 250.0,
  "loan_date": "2024-01-15"
}
```

**תוצאה:**
- סכום: 35 ✅
- תאריך: 25 ✅
- שם (מ-memo): 30 ✅
- כיוון: 5 ✅
- **סה"כ: 95 נקודות** 🟢 Excellent

---

## 📞 עדיין לא עובד?

הרץ את כל הבדיקות למעלה והעתק את התוצאות.
שלח את המידע הבא:

1. תוצאות השלב 1 (כמה עסקאות?)
2. תוצאות השלב 2 (כמה לווים?)
3. תוצאות השלב 3 (מה הציון?)
4. שגיאות מהקונסול
5. Screenshot של הממשק

---

**עודכן:** 2026-07-03  
**קובץ מקור:** `src-tauri/src/bank_match_commands.rs`  
**מפתח:** Kiro AI Assistant
