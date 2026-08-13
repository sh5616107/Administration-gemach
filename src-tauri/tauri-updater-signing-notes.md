# תיעוד: הקמת עדכונים אוטומטיים (Updater) ב-Tauri v2 דרך GitHub Actions

> נכתב אחרי יום שלם של דיבוג, כדי שלא נצטרך לעבור את זה שוב בפרויקט הבא.

## התובנה המרכזית (זה מה שגרם לכל הכאב)

כש-Tauri מקבל מפתח (פרטי או ציבורי) **כמחרוזת inline** (ולא כנתיב לקובץ בדיסק), הוא **לא** מפרש את הפורמט הקריא-לאדם של minisign (השורות `untrusted comment: ...` + שורת ה-base64). הוא מצפה למחרוזת שהיא **`base64` של כל תוכן הקובץ המקורי, פעם אחת**.

כלומר:
- ❌ **לא נכון**: להדביק את התוכן הגולמי של קובץ ה-`.key`/`.pub` (מה שרואים כשפותחים אותו ב-Notepad)
- ✅ **נכון**: לקחת את הבייטים הגולמיים של הקובץ, ולהצפין אותם ל-base64 עם `[Convert]::ToBase64String()` - וזו המחרוזת שנכנסת ל-secret / לקונפיג.

זה נכון גם ל-`TAURI_SIGNING_PRIVATE_KEY` וגם ל-`pubkey` ב-`tauri.conf.json`.

## המתכון המלא ליצירת מפתח חדש (רק אם באמת צריך!)

⚠️ **אל תיצור מפתח חדש בלי סיבה טובה** - זה מחייב עדכון גם ב-secret וגם ב-`pubkey`, ומשתמשים עם גרסה ישנה לא יקבלו עדכון אוטומטי לגרסה עם מפתח חדש.

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\gemach-manager.key" -f
```
- אם רוצים סיסמה ריקה: כשהוא מבקש `Password:` ו-`Password (one more time):`, פשוט Enter פעמיים בלי להקליד כלום.
- **הפלג `-p ""` לא עבד** אצלנו (`error: a value is required for '--password <PASSWORD>'`) - עדיף פשוט Enter כפול אינטראקטיבי.

## איך להכין את הערכים הנכונים

```powershell
# מפתח פרטי -> ל-secret
$keyBytes = [System.IO.File]::ReadAllBytes("$env:USERPROFILE\.tauri\gemach-manager.key")
$keyB64 = [Convert]::ToBase64String($keyBytes)

# מפתח ציבורי -> ל-tauri.conf.json
$pubBytes = [System.IO.File]::ReadAllBytes("$env:USERPROFILE\.tauri\gemach-manager.key.pub")
$pubB64 = [Convert]::ToBase64String($pubBytes)
```

## העלאת secrets ל-GitHub - עם GitHub CLI, לא הדבקה בדפדפן

הדבקה ידנית בתיבת הטקסט של GitHub Secrets לא אמינה (איבדנו newlines ותווים בדרך כמה פעמים). עדיף `gh` CLI:

```powershell
# התקנה (פעם אחת)
winget install GitHub.cli --source winget
# לפתוח טרמינל חדש אחרי ההתקנה!
gh auth login

# העלאת המפתח הפרטי המקודד
$keyB64 | gh secret set TAURI_PRIVATE_KEY --repo <owner>/<repo>

# העלאת הסיסמה (אם יש)
"הסיסמה-האמיתית" | gh secret set TAURI_PRIVATE_KEY_PASSWORD --repo <owner>/<repo>

# וידוא שהעדכון אכן נכנס
gh secret list --repo <owner>/<repo>
```

## `tauri.conf.json` - הקונפיג הנכון

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/<owner>/<repo>/releases/latest/download/latest.json"
      ],
      "pubkey": "<$pubB64 מהשלב הקודם>"
    }
  }
}
```

- `createUpdaterArtifacts` חייב להיות תחת `bundle`, **לא** תחת `plugins.updater`. זו טעות נפוצה מאוד.
- בלי זה, Tauri לא יוצר קבצי `.sig` בכלל, ו-`latest.json` לא ייווצר - בלי שום שגיאה ברורה.

## `.github/workflows/release.yml` - הגרסה הסופית שעובדת

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
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'גרסה __VERSION__'
          releaseBody: |
            ## שינויים בגרסה זו
            עדכונים וטיוטים
          releaseDraft: false
          prerelease: false
          includeUpdaterJson: true
```

נקודות קריטיות:
- `tauri-apps/tauri-action@v0` - **לא** `@v1` (לא קיים/לא נבדק).
- `includeUpdaterJson: true` - **לא** `uploadUpdaterJson` (שם ישן שלא קיים יותר, ו-GitHub Actions פשוט מתעלם ממנו בשקט עם אזהרה).
- `TAURI_SIGNING_PRIVATE_KEY` ו-`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` מגיעים ישירות מ-secrets, בלי שום שלב "decode"/"write to file" ביניים - מיותר לגמרי כשה-secret כבר מקודד כמו שצריך.

## בדיקה מקומית לפני כל push (חוסך סבבי CI מיותרים)

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$env:USERPROFILE\.tauri\gemach-manager.key"))
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "הסיסמה-האמיתית"
npm run tauri build
```

אם זה עובר עד הסוף בלי לבקש סיסמה ובלי שגיאה - זה אמור לעבוד גם ב-CI.

## טבלת שגיאות שראינו ומה הן באמת אמרו

| שגיאה | הסיבה האמיתית |
|---|---|
| אין `latest.json` בכלל, בלי שגיאה | `createUpdaterArtifacts` חסר / במקום הלא נכון ב-`tauri.conf.json` |
| `Unexpected input(s) 'uploadUpdaterJson'` | שם input שגוי; הנכון הוא `includeUpdaterJson` |
| `failed to decode base64 key: Invalid symbol X, offset Y` | המחרוזת שניתנה ל-`TAURI_SIGNING_PRIVATE_KEY` (או ל-`pubkey`) היא הטקסט הגולמי של הקובץ, לא base64 של הקובץ |
| `incorrect updater private key password: Wrong password for that key` | הסיסמה שניתנה לא תואמת לסיסמה שאיתה נוצר המפתח בפועל |
| `failed to decode pubkey: ... invalid utf-8 sequence` | אותה טעות פורמט כמו למעלה, אבל ב-`pubkey` בקונפיג ולא במפתח הפרטי |

## שחרור גרסה חדשה מכאן והלאה - זהו, זה כל מה שצריך

```powershell
# עדכון מספר גרסה ב-tauri.conf.json / package.json
git add .
git commit -m "גרסה 4.4.0"
git tag v4.4.0
git push origin main --tags
```

אין צורך לגעת שוב במפתחות, ב-secrets, או בקונפיג - כל זה כבר מוגדר נכון ונשאר כך.

## אזהרות לעתיד

- **אל תיצרו מפתח חדש** בלי סיבה - זה שובר עדכונים אוטומטיים למשתמשים עם גרסה ישנה מותקנת (הם יצטרכו להתקין ידנית פעם אחת).
- אם `pubkey` בקונפיג משתנה - חובה לעדכן גם את ה-secret של המפתח הפרטי בהתאמה, הם זוג שחייב תמיד להישאר מסונכרן.
- הדבקה ידנית של secrets multi-line דרך דפדפן GitHub לא אמינה - עדיפה תמיד `gh secret set` עם pipe.
