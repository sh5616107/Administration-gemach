# מדריך הגדרת עדכונים אוטומטיים - Tauri Updater

## מה זה עושה?

כשהמשתמש פותח את התוכנה, היא בודקת אוטומטית אם יש גרסה חדשה ב-GitHub Releases.
אם יש - מציגה חלון יפה עם "מה חדש" ואפשרות להתעדכן בלחיצה.

## שלב 1: יצירת מפתחות חתימה (חובה!)

העדכונים חייבים להיות חתומים דיגיטלית למען אבטחה.

### אופציה 1: דרך Script אוטומטי (מומלץ)

```powershell
# הרץ את הסקריפט המוכן
.\generate-signing-key.ps1
```

הסקריפט ייצור את המפתח ויסביר לך מה לעשות הלאה.

### אופציה 2: ידנית

```powershell
# יצירת מפתח חדש
npx tauri signer generate -w "$env:USERPROFILE\.tauri\gemach-manager.key"

# אם יש שגיאה עם הנתיב, נסה בתיקייה הנוכחית:
npx tauri signer generate -w gemach-manager.key
```

זה ייצור:
- **Private key**: `~/.tauri/gemach-manager.key` (לא לשתף!)
- **Public key**: יודפס במסך - העתק אותו!

## שלב 2: הכנסת המפתח הציבורי

פתח `src-tauri/tauri.conf.json` וחפש:

```json
"updater": {
  "endpoints": [
    "https://github.com/YOUR_USERNAME/gemach-manager/releases/latest/download/latest.json"
  ],
  "pubkey": "YOUR_PUBLIC_KEY_WILL_BE_HERE"
}
```

**שנה:**
1. `YOUR_USERNAME` - שם המשתמש שלך ב-GitHub
2. `YOUR_PUBLIC_KEY_WILL_BE_HERE` - המפתח הציבורי שקיבלת

## שלב 3: הגדרת GitHub Actions (אוטומציה)

צור `.github/workflows/release.yml`:

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
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'גרסה __VERSION__'
          releaseBody: |
            שינויים בגרסה זו:
            - שיפורים וטיוטים
            
            להתקנה - הורד את הקובץ המתאים למערכת ההפעלה שלך.
          releaseDraft: false
          prerelease: false
```

## שלב 4: הוספת Secrets ל-GitHub

1. עבור ל-GitHub Repository
2. **Settings** → **Secrets and variables** → **Actions**
3. הוסף שני secrets:
   - `TAURI_PRIVATE_KEY`: תוכן הקובץ `~/.tauri/gemach-manager.key`
   - `TAURI_KEY_PASSWORD`: הסיסמה (אם הוספת)

## שלב 5: שחרור גרסה חדשה

```powershell
# 1. עדכן את הגרסה ב-3 הקבצים:
# - package.json
# - src-tauri/tauri.conf.json  
# - src-tauri/Cargo.toml

# 2. Commit
git add .
git commit -m "Release v4.3.0"

# 3. יצירת Tag
git tag v4.3.0
git push origin v4.3.0

# 4. GitHub Actions יבנה ויפרסם אוטומטית!
```

## איך זה עובד?

1. **משתמש פותח את התוכנה** → בודקת אם יש עדכון
2. **יש עדכון?** → מציגה dialog יפה עם "מה חדש"
3. **משתמש לוחץ "עדכן"** → מוריד את הגרסה החדשה
4. **הורדה הסתיימה** → מתקין ומפעיל מחדש אוטומטית!

## בדיקה

לבדוק אם זה עובד:

1. בנה גרסה 4.2.0 והפץ למשתמשים
2. שחרר גרסה 4.3.0 ל-GitHub
3. משתמש עם 4.2.0 יקבל התראה אוטומטית!

## הערות חשובות

⚠️ **אבטחה**: המפתח הפרטי אסור לשתף! שמור אותו בסיסמה!

💡 **Endpoints**: אפשר להוסיף endpoint משלך (שרת פרטי) במקום GitHub

🔄 **תדירות בדיקה**: כרגע - רק בהפעלת האפליקציה. אפשר להוסיף בדיקה יומית

---

## מוכן! 🎉

עכשיו כל גרסה שתשחרר ל-GitHub תגיע אוטומטית למשתמשים!
