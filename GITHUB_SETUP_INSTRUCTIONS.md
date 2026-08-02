# הוראות הגדרת עדכונים אוטומטיים ב-GitHub

## 1. הפעלת Auto-merge ב-Repository

1. לך ל: `https://github.com/[שם-המשתמש]/[שם-הפרויקט]/settings`
2. גלול ל-**"Pull Requests"**
3. סמן ✅ **"Allow auto-merge"**

## 2. הפעלת Workflow Permissions

1. לך ל: `Settings` → `Actions` → `General`
2. גלול ל-**"Workflow permissions"**
3. בחר: **"Read and write permissions"**
4. סמן ✅ **"Allow GitHub Actions to create and approve pull requests"**

## 3. בדיקה ידנית ראשונה

כדי לבדוק שהכל עובד:

1. לך ל-**Actions** בריפו
2. בחר **"עדכון אוטומטי israeli-bank-scrapers"**
3. לחץ **"Run workflow"**

## 4. שימוש מקומי

להרצת העדכון ידנית מהמחשב:

```powershell
cd sidecar
.\update-bank-scraper.ps1
```

---

## מה קורה עכשיו?

### ✅ Dependabot
- רץ **יומית**
- יוצר PR אוטומטית לכל עדכון
- מקבץ עדכונים של israeli-bank וכן puppeteer

### 🤖 Auto-merge
- **Patch/Minor updates** - מתמזגים אוטומטית אחרי בדיקות
- **Security updates** - מתמזגים מיידית
- **Major updates** - דורשים אישור ידני

### 🏦 israeli-bank-scrapers Monitor
- בודק **יומית** בשעה 10:00
- יוצר PR אוטומטית כשיש גרסה חדשה
- מתקין Chrome אוטומטית

### 📊 Dependency Check
- רץ **שבועית**
- מדווח על כל העדכונים הזמינים

---

## הערות חשובות

⚠️ **לפני שמתקנים major version** של israeli-bank-scrapers - בדוק את ה-changelog!

🔒 **עדכוני אבטחה** - תמיד מתמזגים אוטומטית

🧪 **בדיקות** - כל PR רצה npm audit לפני המיזוג
