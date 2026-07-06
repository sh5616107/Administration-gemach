# יישום Backend - חילוץ שמות והתאמה חלקית

## תאריך: 2026-07-02

## סיכום

יושמו 4 פונקציות חדשות ב-Backend (Rust) לטיפול בחילוץ שמות מרובים משדה memo והתאמה חלקית של שמות משפחה.

---

## שינויים טכניים - `src-tauri/src/bank_integration.rs`

### 1. פונקציה חדשה: `extract_names_from_memo()`

**תיאור:** חולצת שמות משדה memo בפורמט "המבצע: <שמות>."

**חתימה:**
```rust
pub fn extract_names_from_memo(memo: &str) -> Option<String>
```

**לוגיקה:**
- משתמש ב-regex: `r"המבצע:\s*([^.]+)\."`
- מחזיר את תוכן השמות ללא "המבצע:" וללא הנקודה
- מחזיר `None` אם הפורמט לא נמצא

**דוגמה:**
```rust
let memo = "המבצע: בן ציון ופעשא רבקה וורמס.";
let result = extract_names_from_memo(memo);
// result = Some("בן ציון ופעשא רבקה וורמס")
```

---

### 2. פונקציה חדשה: `split_multiple_names()`

**תיאור:** מפצלת שמות מרובים לפי המילה "ו" (and), תוך הימנעות מפיצול שמות כמו "וורמס".

**חתימה:**
```rust
pub fn split_multiple_names(names: &str) -> Vec<String>
```

**לוגיקה:**
- סורקת את המחרוזת תו אחר תו
- מזהה את הדפוס: רווח + ו + תו שאינו ו (` ו` + not `ו`)
- מפצלת רק כאשר " ו" הוא separator ולא חלק משם
- שומרת שמות כמו "וורמס" שלמים

**דוגמה:**
```rust
let names = "בן ציון ופעשא רבקה וורמס";
let result = split_multiple_names(names);
// result = ["בן ציון", "פעשא רבקה וורמס"]
```

---

### 3. פונקציה חדשה: `match_name_prefix()`

**תיאור:** בודקת התאמה חלקית של שמות (prefix match) עם מינימום 3 תווים.

**חתימה:**
```rust
pub fn match_name_prefix(extracted_name: &str, target_name: &str, min_chars: usize) -> bool
```

**לוגיקה:**
1. התאמה מדויקת תחילה (case-insensitive)
2. פיצול לפי מילים (שם פרטי, שם משפחה)
3. בדיקה אם מילה מחולצת היא prefix של מילה מטרה (או להיפך)
4. דורש מינימום `min_chars` תווים למניעת false positives

**דוגמאות:**
```rust
// Exact match
assert!(match_name_prefix("וורמס", "וורמס", 3)); // true

// Prefix match (truncated)
assert!(match_name_prefix("וורמס", "וורמסר", 3)); // true
assert!(match_name_prefix("וורמסר", "וורמס", 3)); // true

// With full names
assert!(match_name_prefix("בן ציון וורמס", "בן ציון וורמסר", 3)); // true

// No match
assert!(!match_name_prefix("כהן", "לוי", 3)); // false

// Below minimum
assert!(!match_name_prefix("בן", "בנימין", 3)); // false (only 2 chars)
```

---

### 4. פונקציה חדשה: `match_any_extracted_name()`

**תיאור:** בודקת אם לפחות אחד מהשמות המחולצים תואם לשם המטרה.

**חתימה:**
```rust
pub fn match_any_extracted_name(extracted_names: &[String], target_name: &str) -> bool
```

**לוגיקה:**
- עוברת על כל השמות המחולצים
- משתמשת ב-`match_name_prefix()` לכל אחד
- מחזירה `true` אם נמצאה התאמה אחת לפחות

**דוגמה:**
```rust
let extracted = vec!["בן ציון".to_string(), "פעשא רבקה וורמס".to_string()];

assert!(match_any_extracted_name(&extracted, "בן ציון")); // true
assert!(match_any_extracted_name(&extracted, "פעשא רבקה וורמסר")); // true (prefix)
assert!(!match_any_extracted_name(&extracted, "משה כהן")); // false
```

---

### 5. עדכון פונקציה: `parse_transaction_with_memo()`

**תיאור:** גרסה מורחבת של `parse_transaction_description()` שמטפלת גם ב-memo.

**חתימה:**
```rust
pub fn parse_transaction_with_memo(description: &str, memo: Option<&str>) -> ParsedTransaction
```

**לוגיקה:**
1. אם יש memo, מנסה לחלץ שמות ממנו תחילה
2. מפצלת שמות מרובים אם נמצאו
3. ממשיכה לחלץ טלפונים, סכומים ומילות מפתח מה-description
4. אם לא נמצאו שמות ב-memo, מנסה לחלץ מה-description (התנהגות קודמת)

**דוגמה:**
```rust
let description = "העברה/הפקדה-טל";
let memo = Some("המבצע: בן ציון ופעשא רבקה וורמס.");
let parsed = parse_transaction_with_memo(description, memo);

// parsed.extracted_names = ["בן ציון", "פעשא רבקה וורמס"]
```

---

### 6. עדכון פונקציה: `calculate_match_score()`

**תיאור:** אלגוריתם ציון ההתאמה עודכן להשתמש בהתאמת שמות מ-memo.

**שינויים:**
- משקלים עודכנו: Amount (35), Date (25), **Name (30)**, Phone (20), Direction (5)
- התאמת שמות משתמשת ב-`parse_transaction_with_memo()` במקום `parse_transaction_description()`
- בודקת התאמה עם `match_any_extracted_name()` לפני fallback לשיטה הישנה
- ציון מלא (30 נקודות) לשם שמתאים עם prefix match

**לוגיקת ציון שמות:**
1. **30 נקודות** - שם מתאים עם prefix match (מ-memo או description)
2. **25 נקודות** - שם מלא תואם בדיוק (fallback)
3. **20 נקודות** - כל מילות המטרה נמצאות (fallback)
4. **12 נקודות** - לפחות מילה אחת משמעותית תואמת (fallback)

---

## בדיקות יחידה (Unit Tests)

**נוספו 5 בדיקות חדשות:**

### ✅ `test_extract_names_from_memo`
- בודקת חילוץ שמות מפורמט תקין
- בודקת אי-התאמה לפורמט לא תקין
- בודקת טיפול ברווחים מיותרים

### ✅ `test_split_multiple_names`
- בודקת פיצול יחיד ("בן ציון ופעשא רבקה וורמס")
- בודקת פיצולים מרובים ("משה ודוד ושרה")
- בודקת אי-פיצול כאשר אין צורך ("יוסף לוי")
- **קריטי:** בודקת שלא מפצלת "וורמס" בטעות

### ✅ `test_match_name_prefix`
- בודקת התאמה מדויקת
- בודקת prefix match (קיטוע שם משפחה)
- בודקת עם שמות מלאים
- בודקת אי-התאמה
- בודקת דרישת מינימום 3 תווים

### ✅ `test_match_any_extracted_name`
- בודקת התאמה על שם ראשון
- בודקת התאמה על שם שני עם prefix
- בודקת אי-התאמה

### ✅ `test_parse_transaction_with_memo`
- בודקת ניתוח עם memo בפורמט "המבצע:"
- מוודאת פיצול נכון לשני שמות
- בודקת ניתוח ללא memo

**כל 9 הבדיקות של bank_integration עוברות בהצלחה!**

---

## השפעה על המערכת

### ✅ לפני השינוי
- חילוץ שמות רק מ-description
- אין טיפול בשמות מרובים
- אין התאמה חלקית של שמות משפחה
- קשיים עם שמות מקוטעים על ידי הבנק

### ✅ אחרי השינוי
- חילוץ שמות בעדיפות מ-memo (אם קיים)
- פיצול אוטומטי של שמות מרובים לפי "ו"
- התאמה חלקית (prefix match) של שמות משפחה
- זיהוי מוצלח של "וורמס" כתואם ל"וורמסר"

---

## דוגמת זרימה מלאה

**קלט:**
```rust
let transaction = BankTransaction {
    description: "העברה/הפקדה-טל",
    memo: Some("המבצע: בן ציון ופעשא רבקה וורמס."),
    amount: 250.0,
    date: "2024-01-15",
    // ...
};

let target_name = "בן ציון וורמסר"; // שם משפחה מקוטע בבנק
```

**עיבוד:**
1. `parse_transaction_with_memo()` → חילוץ מ-memo
2. `extract_names_from_memo()` → "בן ציון ופעשא רבקה וורמס"
3. `split_multiple_names()` → ["בן ציון", "פעשא רבקה וורמס"]
4. `calculate_match_score()` → בדיקת התאמה
5. `match_any_extracted_name()` → בודק כל שם
6. `match_name_prefix("בן ציון", "בן ציון וורמסר", 3)` → true!
7. `match_name_prefix("פעשא רבקה וורמס", "בן ציון וורמסר", 3)` → 
   - מחלק ל: ["פעשא", "רבקה", "וורמס"] vs ["בן", "ציון", "וורמסר"]
   - "וורמס" הוא prefix של "וורמסר" → true!

**תוצאה:**
```rust
(score: 90.0, reasons: ["סכום מדויק", "תאריך בטווח 1 ימים", "שם תואם: בן ציון"])
// ConfidenceLevel::Excellent
```

---

## סטטוס

✅ **כל הבדיקות עוברות**  
✅ **הקוד קומפל בהצלחה**  
✅ **מוכן לאינטגרציה עם Frontend**

---

## צעדים הבאים

1. ✅ יישום Backend הושלם
2. ✅ בדיקות יחידה עוברות
3. ⏳ בדיקת אינטגרציה עם נתונים אמיתיים
4. ⏳ בדיקת ביצועים עם מאות עסקאות
5. ⏳ בדיקת edge cases נוספים

---

**מסמך זה נוצר:** 2026-07-02  
**מפתח:** Kiro AI Assistant  
**סטטוס:** ✅ הושלם ונבדק
