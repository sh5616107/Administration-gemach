# התקנת Rust לפרויקט Tauri

## הבעיה
Rust לא נמצא במערכת, למרות שהיה מותקן לפני יומיים.

## פתרון - התקנה מחדש

### אפשרות 1: התקנה אוטומטית (מומלץ)

1. **הורד את rustup-init.exe**:
   https://rustup.rs/
   
2. **הרץ את הקובץ** והמתן להתקנה (כ-5 דקות)

3. **סגור ופתח מחדש** את הטרמינל/VSCode

4. **בדוק התקנה**:
   ```powershell
   cargo --version
   rustc --version
   ```

### אפשרות 2: התקנה דרך Scoop (אם מותקן)

```powershell
scoop install rustup
rustup default stable
```

### אפשרות 3: התקנה ידנית

1. פתח PowerShell **כמנהל מערכת**
2. הרץ:
   ```powershell
   Invoke-WebRequest -Uri https://win.rustup.rs/x86_64 -OutFile rustup-init.exe
   .\rustup-init.exe
   ```
3. בחר באפשרות ברירת המחדל (1)
4. המתן להתקנה

---

## בדיקת התקנה

לאחר ההתקנה, **פתח טרמינל חדש** ובדוק:

```powershell
# בדיקת Rust
cargo --version
rustc --version

# בדיקת PATH
$env:PATH -split ';' | Select-String "cargo"

# אם הכל תקין, אמור להופיע:
# cargo 1.xx.x
# rustc 1.xx.x
```

---

## הרצת הפרויקט

לאחר שRust מותקן:

```powershell
cd "c:\proyecys\gemach system"
npm run tauri dev
```

---

## אם עדיין לא עובד

### בעיית PATH
אם cargo מותקן אבל לא מזוהה, הוסף ידנית ל-PATH:

1. חפש "עריכת משתני הסביבה" בחיפוש Windows
2. ב-"משתני משתמש", בחר PATH → עריכה
3. הוסף: `C:\Users\Yoni\.cargo\bin`
4. שמור וסגור הכל
5. פתח PowerShell **חדש** ובדוק שוב

### הרצה במצב Web
אם אתה רוצה לבדוק את התיקונים מבלי להתקין Rust:

```powershell
npm run dev
```

זה יריץ את האפליקציה בדפדפן (ללא חלון native).

---

## שאלות נפוצות

**ש: למה זה קרה?**
ת: Rust עלול להימחק בטעות, או שהיתה בעיה בעדכון Windows/התקנות אחרות.

**ש: כמה זמן לוקחת ההתקנה?**
ת: בערך 5-10 דקות, תלוי במהירות האינטרנט.

**ש: האם זה בטוח?**
ת: כן, rustup הוא הכלי הרשמי להתקנת Rust.

**ש: האם צריך הרשאות מנהל?**
ת: לא, ההתקנה היא לרמת המשתמש.

---

## תמיכה

אם נתקעת:
1. בדוק שאין תוכנת אנטי-וירוס שחוסמת
2. נסה להריץ PowerShell כמנהל
3. בדוק שיש מקום פנוי בדיסק (לפחות 2GB)
