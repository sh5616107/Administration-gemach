# פתרון בעיית העדכונים האוטומטיים

## הבעיה
הקובץ `latest.json` לא נוצר ב-GitHub Releases, מה שמונע מה-updater לעבוד.

## הסיבה
1. השתמשנו בגרסה `tauri-apps/tauri-action@v0.5` שהיא ישנה
2. **לא הוספנו את הפרמטר `uploadUpdaterJson: true`** ב-workflow

## הפתרון
על פי [הדיון הרשמי](https://github.com/orgs/tauri-apps/discussions/6385) ו[ה-changelog](https://github.com/tauri-apps/tauri-action/releases):

- **tauri-action מגרסה 0.5 ומעלה** יכול ליצור את `latest.json`
- **צריך להוסיף `uploadUpdaterJson: true`** ב-workflow (בגרסה 1.0.0 שינו את השם מ-`includeUpdaterJson`)
- **עדכנו ל-`@v0`** שמצביע תמיד על הגרסה העדכנית ביותר (כרגע v1.0.0)

## מה שונה
1. הסרנו את השלב `Create update manifest` שניסה ליצור את `latest.json` ידנית
2. עדכנו את הגרסה מ-`@v0.5` ל-`@v0` (אוטומטית הגרסה האחרונה)
3. **הוספנו `uploadUpdaterJson: true`** ל-workflow
4. עדכנו את מספר הגרסה ל-4.3.0

## איך זה עובד
1. כשמפרסמים tag חדש (למשל `v4.3.0`), GitHub Actions מריץ את ה-workflow
2. `tauri-action` בונה את האפליקציה ויוצר `.exe` + `.sig`
3. **עם `uploadUpdaterJson: true`** האקשן יוצר את `latest.json` עם כל המידע הנדרש
4. הקובץ מועלה ל-GitHub Release
5. האפליקציה יכולה לבדוק עדכונים דרך הכתובת:
   ```
   https://github.com/sh5616107/Administration-gemach/releases/latest/download/latest.json
   ```

## שלבים הבאים
1. לעשות commit ו-push לשינויים
2. ליצור tag חדש: `git tag v4.3.0 && git push origin v4.3.0`
3. לחכות ש-GitHub Actions יסיים את הבנייה
4. לבדוק שהקובץ `latest.json` קיים ב-release
5. לבדוק בתוכנה שמותקנת בגרסה 4.2.6 שהיא מציגה עדכון זמין

## מקורות
- [GitHub Discussion על latest.json](https://github.com/orgs/tauri-apps/discussions/6385)
- [tauri-action Releases](https://github.com/tauri-apps/tauri-action/releases)
- [tauri-action v1.0.0 Changelog](https://github.com/tauri-apps/tauri-action/releases/tag/action-v1.0.0) - שינוי שם ל-`uploadUpdaterJson`
