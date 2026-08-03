# הוראות ההגדרה שלך - גרסה 4.2.0

## ✅ מה כבר עשינו

1. ✅ יצרנו מפתח חתימה
2. ✅ הכנסנו את המפתח הציבורי ל-tauri.conf.json
3. ✅ התוכנה מוכנה לעדכונים אוטומטיים!

---

## 📋 מה נשאר לעשות

### שלב 1: ~~עדכן את שם המשתמש ב-GitHub~~ ✅ סיימת!

~~פתח את הקובץ: `src-tauri\tauri.conf.json`~~

~~החלף `YOUR_USERNAME` בשם המשתמש שלך ב-GitHub~~

✅ **כבר עדכנת ל:** `https://github.com/sh5616107/Administration-gemach/...`

---
**החלף `YOUR_USERNAME` בשם המשתמש שלך ב-GitHub**

לדוגמה אם שם המשתמש שלך הוא `yonatan123`:
```json
"https://github.com/yonatan123/gemach-manager/releases/latest/download/latest.json"
```

---

### שלב 2: GitHub Action ✅ נוצר!

הקובץ `.github\workflows\release.yml` כבר נוצר עבורך!

---

### שלב 3: הוסף את המפתח הפרטי ל-GitHub

1. פתח את הקובץ: `C:\Users\Yoni\.tauri\gemach-manager.key` (בעורך טקסט)
2. העתק את **כל** התוכן (כולל ה-headers)
3. לך ל-GitHub Repository שלך
4. **Settings** → **Secrets and variables** → **Actions**
5. לחץ **New repository secret**
6. שם: `TAURI_PRIVATE_KEY`
7. ערך: הדבק את התוכן שהעתקת
8. לחץ **Add secret**

---

### שלב 3: צור GitHub Action

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
            עדכונים וטיוטים בגרסה זו
          releaseDraft: false
          prerelease: false
```

---

### שלב 4: בדיקה

הרץ את התוכנה:
```powershell
npm run tauri:dev
```

לך ל**הגדרות** → גלול למטה → לחץ **"בדוק עדכונים"**

אם הכל תקין תראה: "אין עדכונים זמינים"

---

## 🚀 איך לשחרר גרסה חדשה

```powershell
# 1. עדכן גרסה (למשל 4.3.0) ב-3 הקבצים:
#    - package.json
#    - src-tauri/tauri.conf.json  
#    - src-tauri/Cargo.toml

# 2. Commit
git add .
git commit -m "Release v4.3.0: תכונות חדשות"

# 3. צור Tag
git tag v4.3.0

# 4. דחוף
git push origin main
git push origin v4.3.0

# GitHub Actions יבנה ויפרסם אוטומטית!
```

---

## 🎯 איך זה יעבוד

1. **משתמש פותח את התוכנה** → בודקת אם יש עדכון
2. **יש עדכון?** → מציגה: "גרסה X.X.X זמינה! 🎉"
3. **משתמש לוחץ "עדכן עכשיו"** → מוריד ומתקין
4. **התוכנה מופעלת מחדש** עם הגרסה החדשה

---

## 📍 המפתחות שלך (שמור!)

**מפתח פרטי:** `C:\Users\Yoni\.tauri\gemach-manager.key`
- ⚠️ לא לשתף עם אף אחד!
- ⚠️ גבה במקום בטוח!

**מפתח ציבורי:** כבר בקובץ ההגדרות ✅
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM4MjY4MjYwMjM0OUFEREYKUldUZnJVa2pZSUltT0ZSVXV1MGxkQlZkRlBhYzc0c3BjOUZseE5MQ0ZBOHVvbENXUENxK2pTOVoK
```

---

## ❓ שאלות נפוצות

**ש: איך אני יודע שהעדכון עבד?**
ת: לך להגדרות ולחץ על "בדוק עדכונים"

**ש: מה אם אשכח את הסיסמה?**
ת: לא הזנת סיסמה (לחצת Enter), אז אין בעיה!

**ש: איך אני מוודא שה-Secret הוזן נכון?**
ת: ב-GitHub Actions תראה build מוצלח אחרי ה-push של ה-tag

**ש: האם צריך לבנות את הקובץ מחדש?**
ת: לא! GitHub Actions בונה אוטומטית

---

**זהו! עכשיו פשוט תבצע את שלבים 1-3 והכל יעבוד מעולה! 🎉**
