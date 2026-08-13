# סיכום גרסה 4.2.0 - עדכונים אוטומטיים

## ✅ מה הושלם

### 1. עדכון גרסה ל-4.2.0
- ✅ `package.json`
- ✅ `src-tauri/tauri.conf.json`
- ✅ `src-tauri/Cargo.toml`

### 2. הסתרת שילוב בנקים
- ✅ התפריט "שילוב בנקים" הוסתר מהתפריט הצדדי
- ✅ כל נתיבי הבנק הוסתרו בהערות ב-App.tsx
- ✅ הקוד קיים אבל לא נגיש למשתמשים

### 3. מערכת עדכונים אוטומטיים 🚀

#### קומפוננטות שנוספו:
- ✅ `src/components/UpdateChecker.tsx` - בודק עדכונים בהפעלת האפליקציה
- ✅ כפתור "בדוק עדכונים" בעמוד ההגדרות
- ✅ Dialog יפה עם "מה חדש" ו-progress bar להורדה
- ✅ Tauri updater plugin מותקן ומוגדר

#### תלויות שנוספו:
- ✅ `@tauri-apps/plugin-updater`
- ✅ `@tauri-apps/plugin-process`
- ✅ `tauri-plugin-updater` (Rust)

#### קבצי עזר:
- ✅ `AUTO_UPDATE_SETUP.md` - מדריך מפורט
- ✅ `QUICK_UPDATE_GUIDE.md` - מדריך מהיר בעברית
- ✅ `generate-signing-key.ps1` - סקריפט ליצירת מפתחות

### 4. בדיקת israeli-bank-scrapers
- ✅ הגרסה הנוכחית (6.9.0) היא העדכנית ביותר
- ✅ Dependabot מוגדר לבדוק עדכונים יומית

---

## 📋 מה נשאר לעשות (דורש אותך!)

### שלב 1: צור מפתחות חתימה

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\gemach-manager.key"
# כשהוא שואל "Password:" - פשוט לחץ Enter (השאר ריק)
```

זה ידפיס מפתח ציבורי - **העתק אותו!**

### שלב 2: עדכן את tauri.conf.json

פתח `src-tauri/tauri.conf.json` וחפש:

```json
"updater": {
  "pubkey": "YOUR_PUBLIC_KEY_WILL_BE_HERE"
}
```

החלף ב-2 דברים:
1. `YOUR_USERNAME` בשדה endpoints → שם המשתמש שלך ב-GitHub
2. `YOUR_PUBLIC_KEY_WILL_BE_HERE` → המפתח הציבורי

### שלב 3: הוסף Secret ל-GitHub

1. GitHub Repository → Settings → Secrets and variables → Actions
2. New repository secret
3. שם: `TAURI_PRIVATE_KEY`
4. ערך: תוכן הקובץ `C:\Users\YourName\.tauri\gemach-manager.key`

### שלב 4: צור GitHub Action

צור `.github/workflows/release.yml` (ראה ב-QUICK_UPDATE_GUIDE.md)

---

## 🎯 איך לבדוק שזה עובד

### בדיקה מקומית:
1. הרץ `npm run tauri:dev`
2. לך להגדרות
3. גלול למטה ל"מידע על האפליקציה"
4. לחץ "בדוק עדכונים"

### בדיקה עם משתמשים:
1. הפץ גרסה 4.2.0 למשתמשים
2. שחרר גרסה 4.3.0 ל-GitHub
3. כל משתמש עם 4.2.0 יקבל התראה על עדכון!

---

## 📦 איך לשחרר גרסה חדשה

```powershell
# 1. עדכן גרסה בכל הקבצים
# 2. Commit
git add .
git commit -m "Release v4.3.0"

# 3. צור Tag
git tag v4.3.0

# 4. דחוף
git push origin main
git push origin v4.3.0
```

GitHub Actions יבנה ויפרסם אוטומטית!

---

## 🎉 תכונות מרכזיות

### למשתמש:
- ✅ בדיקת עדכונים אוטומטית בהפעלת התוכנה
- ✅ כפתור ידני בהגדרות
- ✅ חלון יפה עם "מה חדש"
- ✅ הורדה והתקנה בלחיצה אחת
- ✅ הפעלה מחדש אוטומטית

### למפתח:
- ✅ שחרור גרסה = פשוט Tag ב-Git
- ✅ בנייה אוטומטית ב-GitHub Actions
- ✅ חתימה דיגיטלית לאבטחה
- ✅ ללא צורך בשרת פרטי

---

## 📁 קבצים חשובים

- `src/components/UpdateChecker.tsx` - לוגיקת עדכונים
- `src/pages/Settings.tsx` - כפתור בדיקת עדכונים
- `src-tauri/tauri.conf.json` - הגדרות updater
- `QUICK_UPDATE_GUIDE.md` - מדריך מהיר 🔥
- `AUTO_UPDATE_SETUP.md` - מדריך מפורט

---

## ⚠️ הערות חשובות

1. **המפתח הפרטי** - שמור במקום בטוח! אל תשתף!
2. **GitHub Repository** - חייב להיות public או עם token מתאים
3. **Endpoints** - אפשר להוסיף שרת פרטי במקום GitHub
4. **בדיקה** - תמיד תבדוק עם גרסת פיתוח לפני שחרור

---

## 🐛 פתרון בעיות

**"לא מצליח להזין קלט"**
- השתמש ב-`npx tauri signer generate` במקום `npm run tauri`

**"העדכון לא עובד"**
- בדוק שה-pubkey תואם למפתח שיצרת
- בדוק שה-endpoints מצביע לריפו הנכון

**"שגיאת חתימה"**
- וודא שה-TAURI_PRIVATE_KEY ב-GitHub Secrets תואם למפתח

---

**הכל מוכן! פשוט תעקוב אחרי ה-QUICK_UPDATE_GUIDE.md והכל יעבוד 🚀**
