# BrowserCtl 🛰️

שליטה מלאה בדפדפן Chrome מהמחשב שלך — דרך פורט מקומי מאובטח (127.0.0.1 בלבד).

התוסף מאפשר לכלי חיצוני (כמו Freebuff/AI) לשלוח לו פקודות: פתיחת טאבים, קריאת וכתיבת עוגיות,
הרצת JavaScript בדפים, צילומי מסך, היסטוריה, הורדות, התראות ועוד — **בלי דגלים, בלי CDP, בלי טריקים**.

---

## ארכיטקטורה

```
אתה / AI  ──►  tools/bctl.js (CLI)  ──►  tools/control-server.js (relay מקומי)
                                              │  ws://127.0.0.1:9798  + טוקן
                                              ▼
                                        התוסף BrowserCtl
                                        (offscreen WebSocket bridge)
                                              │
                                              ▼
                                   Service Worker (chrome.* APIs)
                                   טאבים • עוגיות • סקריפטים • הורדות...
```

- **השרת** (`tools/control-server.js`) — גשר WebSocket מקומי, **אפס תלותויות**, נקשר ל-`127.0.0.1` בלבד.
- **התוסף** מתחבר החוצה לשרת (לא צריך הרשאות מיוחדות, עובד גם מאחורי חומת אש).
- **טוקן** — סוד משותף בין השרת לתוסף; בלי הטוקן שום חיבור לא מתקבל.

---

## התקנה (פעם אחת)

### 1. טעינת התוסף בכרום

1. פתח את `chrome://extensions`
2. הפעל **מצב פיתוח** (Developer mode) בפינה
3. לחץ **"טעינת פריט Unpacked"** ובחר את התיקייה `browserctl/`
4. פתח את דף ההגדרות של התוסף (לחץ על האייקון שלו → "הגדרות" או "פרטים → אפשרויות")

### 2. הפעלת השרת המקומי

בטרמינל (בתיקיית הפרויקט):

```bash
node tools/control-server.js
```

השרת מדפיס **טוקן** (ונשמר גם בקובץ `tools/bctl.token`).

### 3. קישור התוסף לשרת

בדף ההגדרות של התוסף:
- הדבק את הטוקן בשדה "טוקן חיבור" (או לחץ 🎲 ליצירת אחד ושמור)
- ודא שהפורט תואם (ברירת מחדל `9798`)
- לחץ **שמור הגדרות**

התוסף מתחבר אוטומטית — נראה את הנקודה הירוקה "מחובר".

> **קיצור דרך:** אם הטוקן כבר הוזן פעם אחת, התוסף זוכר אותו — צריך רק להפעיל את השרת.

---

## שימוש

```bash
# רשימת כל הטאבים
node tools/bctl.js tabs.list

# הטאב הפעיל
node tools/bctl.js tabs.active

# פתיחת טאב חדש
node tools/bctl.js tabs.open '{"url":"https://example.com"}'

# הרצת JavaScript בטאב (אובייקט/ערך מוחזר)
node tools/bctl.js tabs.js '{"id":123,"code":"return { title: document.title, url: location.href };"}'

# הרצה ברמת DevTools (חופשי מ-CSP של הדף)
node tools/bctl.js tabs.eval '{"code":"document.title"}'

# טקסט הדף
node tools/bctl.js tabs.html '{"max":1000}'

# התקנה על פרופיל חדש — בלי להדביק טוקן ביד!
# 1) ה-relay רץ: node tools/control-server.js
# 2) chrome://extensions → מצב מפתח → טען פריט לא ארוז → תיקיית browserctl
# 3) הקוד החדש מתחבר אוטומטית: אם אין טוקן בזיכרון, התוסף שולף אותו מה-relay
#    (http://127.0.0.1:9798/token) ושומר לעצמו. אין צורך להזין כלום.
#    אם התוסף כבר היה טעון לפני הגרסה הזו — לחץ reload בכרטיס שלו (או אתחל כרום).

# צילום מסך (מחזיר dataUrl PNG)
node tools/bctl.js tabs.screenshot

# עוגיות
node tools/bctl.js cookies.list '{"domain":"example.com"}'
node tools/bctl.js cookies.get '{"url":"https://example.com","name":"sid"}'
node tools/bctl.js cookies.set '{"url":"https://example.com","name":"k","value":"v"}'
node tools/bctl.js cookies.remove '{"url":"https://example.com","name":"k"}'

# היסטוריה והורדות
node tools/bctl.js history.search '{"text":"youtube","max":10}'
node tools/bctl.js downloads.list '{"max":5}'

# התראה
node tools/bctl.js notifications.send '{"title":"היי","message":"מהטרמינל!"}'

# מצב החיבור
curl http://127.0.0.1:9798/health
```

כל פקודה מחזירה JSON. סטטוס יציאה: `0` = הצלחה, `1` = שגיאה.

---

## פקודות מלאות

| פקודה | פרמטרים | תיאור |
|---|---|---|
| `ping` | — | בדיקת חיים |
| `info` | — | שם, גרסה, האם הוגדר טוקן |
| `tabs.list` | — | כל הטאבים |
| `tabs.active` | — | הטאב הפעיל |
| `tabs.open` | `url`, `active?` | פתיחת טאב |
| `tabs.close` | `id` או `ids[]` | סגירת טאבים |
| `tabs.navigate` | `id`, `url` | ניווט |
| `tabs.js` | `id?`, `code`, `params?`, `world?` | הרצת JS (fallback אוטומטי ל-DevTools אם ה-CSP חוסם) |
| `tabs.eval` | `id?`, `code` | הרצת JS ברמת DevTools — עוקף CSP |
| `tabs.html` | `id?`, `max?` | טקסט הדף |
| `tabs.screenshot` | `id?` | צילום מסך PNG (dataUrl) |
| `cookies.list` | `domain?` | כל העוגיות |
| `cookies.get` | `url`, `name` | עוגיה אחת |
| `cookies.set` | `url`, `name`, `value`, ... | כתיבת עוגיה |
| `cookies.remove` | `url`, `name` | מחיקת עוגיה |
| `downloads.download` | `url`, `filename?` | הורדה |
| `downloads.list` | `max?` | הורדות אחרונות |
| `history.search` | `text?`, `max?` | חיפוש בהיסטוריה |
| `bookmarks.list` | — | סימניות |
| `notifications.send` | `title`, `message` | התראה |
| `storage.get` / `storage.set` | — | אחסון התוסף |
| `log.get` | — | יומן ביקורת |

---

## אבטחה

- השרת נקשר ל-`127.0.0.1` בלבד — לא נגיש מהרשת.
- טוקן חובה בכל חיבור; בלי הטוקן החיבור נסגר (`E_BAD_TOKEN`).
- מתג "שליטה פעילה" בדף ההגדרות מכבה את כל הפקודות.
- כל פעולה מתועדת ביומן ביקורת בדף ההגדרות (100 אחרונות).
- דף ההגדרות מציג את סטטוס החיבור בזמן אמת.

> ⚠️ תוסף זה נותן שליטה מלאה (כולל עוגיות וכתיבה בדפים) — השתמש בו רק במחשב שלך,
> אל תפרסם אותו בחנות, והשהה/כבה אותו כשאתה לא משתמש.

---

## הגדרות משתנות

```bash
# פורט אחר
BCTL_PORT=9799 node tools/control-server.js
node tools/bctl.js ...   # עם BCTL_PORT=9799

# טוקן מפורש
BCTL_TOKEN=my-token node tools/control-server.js
```

יש לעדכן גם את שדה הפורט בדף ההגדרות של התוסף אם משנים אותו.
