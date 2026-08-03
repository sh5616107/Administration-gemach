# מדריך מהיר - הגדרת עדכונים אוטומטיים

## מה יש כאן?

התוכנה כבר מוכנה לעדכונים אוטומטיים! 
כל מה שנשאר זה להגדיר את מערכת החתימה.

---

## שלב 1: צור מפתח חתימה

פתח PowerShell והרץ **בלי סיסמה** (לחץ Enter כשהוא שואל):

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\gemach-manager.key"
```

**כשהוא שואל סיסמה - פשוט לחץ Enter (השאר ריק)**

הפקודה תדפיס משהו כזה:

```
Your keypair was generated successfully
Private: C:\Users\YourName\.tauri\gemach-manager.key (Keep this secret!)
Public: dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...
```

**העתק את המפתח הציבורי** (השורה הארוכה שמתחילה ב-`dW50...`)

---

## שלב 2: הכנס את המפתח הציבורי

פתח את הקובץ: `src-tauri\tauri.conf.json`

חפש את החלק:

```json
"updater": {
  "endpoints": [
    "https://github.com/YOUR_USERNAME/gemach-manager/releases/latest/download/latest.json"
  ],
  "pubkey": "YOUR_PUBLIC_KEY_WILL_BE_HERE"
}
```

**שנה 2 דברים:**

1. `YOUR_USERNAME` → שם המשתמש שלך ב-GitHub
2. `YOUR_PUBLIC_KEY_WILL_BE_HERE` → המפתח הציבורי שהעתקת

**דוגמה:**
```json
"updater": {
  "endpoints": [
    "https://github.com/yonatan/gemach-manager/releases/latest/download/latest.json"
  ],
  "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk..."
}
```

---

## שלב 3: הוסף את המפתח הפרטי ל-GitHub

1. לך ל-GitHub Repository שלך
2. **Settings** → **Secrets and variables** → **Actions**
3. לחץ **New repository secret**
4. שם: `TAURI_PRIVATE_KEY`
5. ערך: פתח את הקובץ `C:\Users\YourName\.tauri\gemach-manager.key` והעתק את התוכן
6. לחץ **Add secret**

---

## שלב 4: הוסף GitHub Action

צור קובץ חדש: `.github\workflows\release.yml`

העתק לתוכו:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        platform: [windows-latest]
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      
      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
        with:
          tagName: v__VERSION__
          releaseName: 'גרסה __VERSION__'
          releaseBody: |
            שינויים בגרסה זו
          releaseDraft: false
          prerelease: false
```

---

## שלב 5: שחרר גרסה חדשה!

```powershell
# 1. עדכן גרסה (למשל 4.3.0) ב-3 הקבצים:
#    - package.json
#    - src-tauri/tauri.conf.json  
#    - src-tauri/Cargo.toml

# 2. Commit
git add .
git commit -m "Release v4.3.0"

# 3. צור Tag
git tag v4.3.0

# 4. דחוף
git push origin main
git push origin v4.3.0

# GitHub Actions יבנה ויפרסם אוטומטית!
```

---

## איך זה עובד?

1. **משתמש פותח את התוכנה** → בודקת אם יש עדכון ב-GitHub
2. **יש עדכון?** → מציגה חלון "גרסה X.X.X זמינה!"
3. **משתמש לוחץ "עדכן"** → מוריד, מתקין ומפעיל מחדש
4. **סיימנו!** המשתמש עכשיו עם הגרסה החדשה

---

## בדיקה ידנית

בתוכנה, לך ל**הגדרות** → למטה תראה:

```
מידע על האפליקציה
גרסה 4.2.0
[כפתור: בדוק עדכונים]
```

לחץ על הכפתור לבדיקה ידנית!

---

## שאלות נפוצות

**ש: איפה המפתח הפרטי שלי?**
ת: `C:\Users\YourName\.tauri\gemach-manager.key` - אל תמחק אותו!

**ש: שכחתי את המפתח הציבורי**
ת: הרץ: `npx tauri signer generate -r "$env:USERPROFILE\.tauri\gemach-manager.key"`

**ש: אני רוצה לשנות את המפתח**
ת: פשוט תריץ שוב את השלב 1 עם שם קובץ אחר

**ש: העדכון לא עובד**
ת: בדוק שה-pubkey ב-tauri.conf.json תואם למפתח שיצרת

---

**זהו! עכשיו כל גרסה שתשחרר תגיע אוטומטית למשתמשים 🎉**
