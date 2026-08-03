# פתרון בעיית העדכונים האוטומטיים

## הבעיה
הקובץ `latest.json` לא נוצר ב-GitHub Releases, מה שמונע מה-updater לעבוד.

## הסיבה
השתמשנו בגרסה `tauri-apps/tauri-action@v0.5` שהיא ישנה מדי.

## הפתרון
על פי [הדיון הרשמי](https://github.com/orgs/tauri-apps/discussions/6385) ו[ה-changelog](https://github.com/tauri-apps/tauri-action/releases):

- **tauri-action מגרסה 0.5 ומעלה** יוצר את `latest.json` אוטומטית
- **אין צורך בשלב נוסף** ליצירה ידנית של הקובץ
- **עדכנו ל-`@v0`** שמצביע תמיד על הגרסה העדכנית ביותר (כרגע v1.0.0)

## מה שונה
1. הסרנו את השלב `Create update manifest` שניסה ליצור את `latest.json` ידנית
2. עדכנו את הגרסה מ-`@v0.5` ל-`@v0` (אוטומטית הגרסה האחרונה)
3. עדכנו את מספר הגרסה ל-4.2.9

## איך זה עובד
1. כשמפרסמים tag חדש (למשל `v4.2.9`), GitHub Actions מריץ את ה-workflow
2. `tauri-action` בונה את האפליקציה ויוצר `.exe` + `.sig`
3. **האקשן יוצר אוטומטית** את `latest.json` עם כל המידע הנדרש
4. הקובץ מועלה ל-GitHub Release
5. האפליקציה יכולה לבדוק עדכונים דרך הכתובת:
   ```
   https://github.com/sh5616107/Administration-gemach/releases/latest/download/latest.json
   ```

## שלבים הבאים
1. לעשות commit ו-push לשינויים
2. ליצור tag חדש: `git tag v4.2.9 && git push origin v4.2.9`
3. לחכות ש-GitHub Actions יסיים את הבנייה
4. לבדוק שהקובץ `latest.json` קיים ב-release
5. לבדוק בתוכנה שמותקנת בגרסה 4.2.6 שהיא מציגה עדכון זמין

## מקורות
- [GitHub Discussion על latest.json](https://github.com/orgs/tauri-apps/discussions/6385)
- [tauri-action Releases](https://github.com/tauri-apps/tauri-action/releases)
