# תיעוד יישום רב-לשוניות (i18n)

## מה בוצע

### 1. התקנה והגדרה
- ✅ הותקנו הספריות: `i18next`, `react-i18next`
- ✅ נוצרה תשתית i18n ב-`src/i18n/config.ts`
- ✅ נוצרו קבצי תרגום:
  - `src/i18n/locales/he.json` - עברית
  - `src/i18n/locales/en.json` - אנגלית

### 2. הגדרות
- ✅ נוסף שדה `language` ל-Settings interface
- ✅ נוסף בורר שפה בעמוד ההגדרות (עברית/אנגלית)
- ✅ השפה נשמרת ב-localStorage
- ✅ השפה מסתנכרנת אוטומטית עם i18n

### 3. דפים מתורגמים
- ✅ **Settings** - תורגם במלואו
- ✅ **Dashboard** - תורגם במלואו (חלקי)

## איך להשתמש

### החלפת שפה
1. לך להגדרות
2. בחר שפה מהתפריט הנפתח
3. השפה תשתנה מיד
4. השפה תישמר ותיטען אוטומטית בפעם הבאה

### הוספת תרגומים לדפים נוספים

```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  
  return (
    <Typography>{t('common.save')}</Typography>
  )
}
```

### הוספת מפתחות תרגום חדשים

ערוך את `src/i18n/locales/he.json` ו-`src/i18n/locales/en.json`:

```json
{
  "mySection": {
    "myKey": "הטקסט שלי"
  }
}
```

שימוש:
```tsx
{t('mySection.myKey')}
```

## מה נותר לעשות

### דפים שצריך לתרגם:
- [ ] LoansManagement (+ כל הטאבים)
- [ ] DonationsDeposits (+ כל הטאבים)
- [ ] Calendar
- [ ] AdvancedTools
- [ ] Help
- [ ] Layout (תפריט צד)
- [ ] כל הקומפוננטות (Dialogs, Forms, וכו')

### RTL/LTR (לא בוצע עדיין)
- [ ] הוספת dir="rtl" / dir="ltr" דינמי
- [ ] התאמת CSS לשני הכיוונים
- [ ] בדיקת Material-UI RTL support

## מבנה קבצי התרגום

```
src/i18n/
├── config.ts           # הגדרות i18n
└── locales/
    ├── he.json        # תרגומים עברית
    └── en.json        # תרגומים אנגלית
```

### מבנה JSON:
```json
{
  "common": {        // מילים נפוצות
    "save": "שמור",
    "cancel": "ביטול"
  },
  "settings": {      // ספציפי לדף הגדרות
    "title": "הגדרות"
  },
  "dashboard": {     // ספציפי לדשבורד
    "title": "לוח בקרה"
  }
}
```

## טיפים

1. **שמור עקביות** - השתמש באותם מפתחות לאותם מושגים
2. **ארגן לפי דפים** - כל דף מקבל section משלו
3. **common לדברים נפוצים** - כפתורים, הודעות, וכו'
4. **בדוק תרגומים** - החלף שפה ובדוק שהכל נראה טוב

## בעיות ידועות

- אין עדיין תמיכה ב-RTL/LTR דינמי
- חלק מהדפים עדיין לא מתורגמים
- יש להוסיף תרגומים למסמכים (PDF)
