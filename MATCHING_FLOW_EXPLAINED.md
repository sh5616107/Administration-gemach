# 🔍 הסבר מפורט - זרימת יצירת התאמות

## תאריך: 2026-07-02

---

## 📊 זרימה כללית

```
[משתמש לוחץ "צור התאמות אוטומטיות"]
         ↓
[Frontend: BankMatchingPage.handleCreateAutoMatches()]
         ↓
[טוען נתונים מ-DB: לווים, תורמים, מפקידים, הוצאות]
         ↓
[לכל עסקה ללא התאמה (עד 50)]
         ↓
[Backend: create_auto_matches_for_transaction()]
         ↓
[Rust: create_auto_match_suggestions()]
         ↓
[עבור כל לווה/תורם/מפקיד]
         ↓
[Rust: calculate_match_score()]
         ↓
[בודק: סכום, תאריך, שם, טלפון, כיוון]
         ↓
[אם ציון >= 50 → יוצר התאמה]
         ↓
[שומר את ההתאמה ב-bank_data.json]
         ↓
[מציג למשתמש]
```

---

## 🎯 אלגוריתם ציון ההתאמה (115 נקודות מקסימום)

### 1️⃣ **סכום (35 נקודות)**
```rust
if amount_diff < 0.01   → 35 נקודות  // סכום זהה
if amount_diff < 1.0    → 30 נקודות  // הפרש של עד 1 ₪
if amount_diff < 10.0   → 20 נקודות  // הפרש של עד 10 ₪
if amount_diff < 100.0  → 8 נקודות   // הפרש של עד 100 ₪
else                    → 0 נקודות
```

### 2️⃣ **תאריך (25 נקודות)**
```rust
if date_diff == 0 days  → 25 נקודות  // תאריך זהה
if date_diff <= 3 days  → 20 נקודות  // הפרש של עד 3 ימים
if date_diff <= 7 days  → 12 נקודות  // הפרש של עד שבוע
if date_diff <= 14 days → 4 נקודות   // הפרש של עד שבועיים
else                    → 0 נקודות
```

### 3️⃣ **שם (30 נקודות) - החדש! 🆕**
```rust
// מחלץ שמות מ-memo או description
if match_any_extracted_name()     → 30 נקודות  // שם תואם עם prefix
  OR
if full_name_exact_match()        → 25 נקודות  // שם מלא זהה
  OR  
if all_words_match()              → 20 נקודות  // כל המילים תואמות
  OR
if significant_word_match()       → 12 נקודות  // מילה אחת משמעותית
else                              → 0 נקודות
```

### 4️⃣ **טלפון (20 נקודות)**
```rust
if phone_matches()  → 20 נקודות
else                → 0 נקודות
```

### 5️⃣ **כיוון (5 נקודות)**
```rust
if direction_matches()  → 5 נקודות
else                    → 0 נקודות (+ אזהרה "⚠️ כיוון לא תואם")
```

---

## ⚖️ רמות אמינות

| ציון | רמה | תיאור |
|------|-----|--------|
| 90-100 | Excellent 🟢 | סכום+תאריך מדויק+שם/טלפון |
| 75-89 | High 🔵 | סכום+תאריך+חלק משם |
| 50-74 | Medium 🟡 | סכום+תאריך בלבד |
| 25-49 | Low 🟠 | סכום קרוב או תאריך רחוק |
| 0-24 | Suspect 🔴 | כמעט ללא התאמה |

**חשוב:** רק ציון >= 50 יוצר התאמה!

---

## 🔍 דוגמאות מעשיות

### דוגמה 1: התאמה מושלמת (95 נקודות)

**עסקת בנק:**
```json
{
  "amount": 250.0,
  "date": "2024-01-15",
  "description": "העברה/הפקדה-טל",
  "memo": "המבצע: בן ציון ופעשא רבקה וורמס."
}
```

**לווה:**
```json
{
  "first_name": "בן ציון",
  "last_name": "וורמסר",
  "phone": "0501234567",
  "loan_amount": 250.0,
  "loan_date": "2024-01-15"
}
```

**חישוב:**
- סכום: 250 = 250 → **35 נקודות** ✅
- תאריך: 2024-01-15 = 2024-01-15 → **25 נקודות** ✅
- שם: "בן ציון" מופיע ב-memo → **30 נקודות** ✅
- טלפון: אין ב-description/memo → **0 נקודות**
- כיוון: IN = IN → **5 נקודות** ✅

**סה"כ: 95 נקודות (Excellent)**

---

### דוגמה 2: התאמה טובה (80 נקודות)

**עסקת בנק:**
```json
{
  "amount": 250.0,
  "date": "2024-01-16",
  "description": "העברה/הפקדה-טל",
  "memo": null
}
```

**לווה:**
```json
{
  "first_name": "משה",
  "last_name": "כהן",
  "phone": "0501234567",
  "loan_amount": 250.0,
  "loan_date": "2024-01-15"
}
```

**חישוב:**
- סכום: 250 = 250 → **35 נקודות** ✅
- תאריך: 2024-01-16 vs 2024-01-15 (1 יום) → **20 נקודות** ✅
- שם: אין memo, לא נמצא ב-description → **0 נקודות**
- טלפון: לא נמצא → **0 נקודות**
- כיוון: אין טלפון, אין שם, אבל כיוון נכון → **5 נקודות** ✅

**סה"כ: 60 נקודות (Medium)**

---

### דוגמה 3: אין התאמה (35 נקודות)

**עסקת בנק:**
```json
{
  "amount": 300.0,
  "date": "2024-01-20",
  "description": "העברה",
  "memo": null
}
```

**לווה:**
```json
{
  "first_name": "דוד",
  "last_name": "לוי",
  "phone": null,
  "loan_amount": 250.0,
  "loan_date": "2024-01-15"
}
```

**חישוב:**
- סכום: |300 - 250| = 50 → **0 נקודות** ❌
- תאריך: |20 - 15| = 5 ימים → **12 נקודות**
- שם: לא נמצא → **0 נקודות**
- טלפון: null → **0 נקודות**
- כיוון: IN = IN → **5 נקודות**

**סה"כ: 17 נקודות (Suspect)** - לא נוצרת התאמה!

---

## 🐛 למה לא נוצרות התאמות? - אבחון

### בדיקה 1: יש עסקאות ללא התאמה?
```javascript
const txns = await window.__TAURI__.invoke('get_unmatched_transactions');
console.log('Unmatched transactions:', txns.length);
```

**אם 0:** אין עסקאות → אין מה להתאים!

---

### בדיקה 2: יש לווים עם הלוואות פעילות?
```javascript
const { db } = await import('./src/services/database');
const borrowers = await db.query('SELECT * FROM borrowers WHERE is_deleted = 0');
console.log('Active borrowers:', borrowers.length);

// בדוק הלוואות פעילות
const loans = await db.query('SELECT * FROM loans WHERE is_deleted = 0');
const activeLoans = loans.filter(l => l.remaining > 0);
console.log('Active loans:', activeLoans.length);
```

**אם 0:** אין לווים פעילים → אין למי להתאים!

---

### בדיקה 3: הסכומים תואמים?
```javascript
// עבור עסקה ספציפית
const txn = txns[0];
console.log('Transaction amount:', txn.amount);

// עבור הלוואה ספציפית
const loan = activeLoans[0];
console.log('Loan remaining:', loan.remaining);

// ההפרש
console.log('Difference:', Math.abs(txn.amount - loan.remaining));
```

**אם ההפרש > 100:** הציון יהיה נמוך מדי!

---

### בדיקה 4: התאריכים בטווח?
```javascript
const txnDate = new Date(txn.date);
const loanDate = new Date(loan.date);
const daysDiff = Math.abs((txnDate - loanDate) / (1000 * 60 * 60 * 24));
console.log('Days difference:', daysDiff);
```

**אם > 14 ימים:** 0 נקודות על תאריך!

---

### בדיקה 5: יש מידע לזיהוי (שם/טלפון)?
```javascript
console.log('Transaction memo:', txn.memo);
console.log('Transaction description:', txn.description);
console.log('Borrower name:', borrower.first_name, borrower.last_name);
console.log('Borrower phone:', borrower.phone);
```

**אם אין memo ואין טלפון:** רק 35+25+5 = 65 נקודות מקסימום

---

## 💡 טיפים לשיפור ההתאמות

### 1. **ודא שיש memo בעסקאות**
- בדוק שה-scraper מושך את שדה `memo`
- אם אין memo, ההתאמה מבוססת רק על סכום ותאריך

### 2. **הזן טלפונים ללווים**
- טלפון שווה 20 נקודות!
- פורמט: `05XXXXXXXX`

### 3. **שמור דיוק בסכומים**
- הזן סכום ההלוואה בדיוק
- עדכן `remaining` אחרי כל פירעון

### 4. **סנכרן באופן קבוע**
- ההפרש בימים משפיע על הציון
- סנכרן לפחות פעם ב-3 ימים

### 5. **השתמש בפורמט מתוקנן ל-memo**
- "המבצע: <שם פרטי> <שם משפחה>."
- המערכת תחלץ אוטומטית

---

## 🔧 Debug Mode - הפעלה

### שלב 1: הרץ את האפליקציה ב-dev mode
```bash
npm run tauri dev
```

### שלב 2: בדוק את הקונסול
חפש הודעות כמו:
```
=== CREATE_AUTO_MATCH_SUGGESTIONS ===
Transaction ID: xxx
Transaction amount: 250
Borrowers with loans count: 5
Checking repayments (amount > 0)...
  Checking borrower: בן ציון וורמסר (phone: 0501234567, loan_amount: 250, loan_date: 2024-01-15)
    Score: 95, Reasons: ["סכום מדויק", "תאריך זהה", "שם תואם: בן ציון"]
    ✅ MATCH CREATED!
```

### שלב 3: אם אין הודעות DEBUG
- האפליקציה לא מעודכנת
- הרץ `cargo build` מחדש
- הפעל מחדש את האפליקציה

---

## 📝 Checklist לפתרון בעיות

- [ ] הרצתי `cargo build` ב-`src-tauri/`
- [ ] הפעלתי מחדש את האפליקציה
- [ ] יש לי עסקאות ללא התאמה (> 0)
- [ ] יש לי לווים עם הלוואות פעילות (remaining > 0)
- [ ] הסכומים תואמים (הפרש < 100 ₪)
- [ ] התאריכים בטווח (< 14 ימים)
- [ ] יש memo או טלפון לזיהוי
- [ ] רואה הודעות DEBUG בקונסול

---

## 🆘 עדיין לא עובד?

שלח את המידע הבא:

1. **מספר עסקאות ללא התאמה:**
   ```javascript
   const txns = await bankService.getUnmatchedTransactions();
   console.log(JSON.stringify(txns, null, 2));
   ```

2. **מספר לווים פעילים:**
   ```javascript
   const borrowers = await db.query('SELECT * FROM borrowers WHERE is_deleted = 0');
   console.log(JSON.stringify(borrowers, null, 2));
   ```

3. **לוגים מהקונסול:**
   - העתק את כל הפלט של `=== CREATE_AUTO_MATCH_SUGGESTIONS ===`

4. **Screenshot:**
   - מסך ההתאמות
   - מסך הלווים
   - קונסול DevTools

---

**מסמך זה נוצר:** 2026-07-02  
**נועד לעזור:** לאבחן ולפתור בעיות בהתאמות אוטומטיות
