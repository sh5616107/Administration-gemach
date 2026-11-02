---
inclusion: auto
name: colors
description: כללי שימוש בצבעים ב-Gemach system
---

# כללי שימוש בצבעים ב-Gemach system

## מערכת multi-theme

הפרויקט תומך ב-**5 ערכות צבעים** שניתן להחליף ביניהן ב-Settings:

### ערכות זמינות
1. **tealGold (ברירת מחדל)** - טורקיז כהה + זהב | `#0F5C5C` + `#B8892D`
2. **classic (מנוגש)** - כחול MUI קלאסי בהיר | `#1976D2` - sidebar בהיר
3. **royalNavy** - כחול-נייבי עשיר | `#193B63`
4. **burgundy** - בורדו אלגנטי | `#702F43`
5. **indigo** - אינדיגו עמוק | `#4B3F8F`

כל הערכות (מלבד classic) משתמשות ב-sidebar כהה. ערכת classic היחידה עם sidebar בהיר (`#FAFAFA`).

### בחירת ערכה
- נשמר ב-localStorage: `gemach_theme_id`
- UI: Settings → קטע "ערכת צבעים" (מיד אחרי בחירת שפה)
- כל ערכה עוברת בדיקות WCAG AA (ניגודיות ≥4.5:1 לטקסט רגיל, ≥3:1 לטקסט גדול)

---

## עיקרון מרכזי
**אסור להשתמש בצבעים hardcoded בקוד UI.**

כל הצבעים חייבים לבוא מ-`theme.palette` או מ-`getTint()`.

## דוגמאות חוקיות
```tsx
// ✅ שימוש בטוקנים
<Box sx={{ 
  backgroundColor: 'primary.main',
  color: 'text.primary',
  borderColor: 'divider'
}} />

// ✅ שימוש ב-getTint
<Box sx={{ 
  backgroundColor: getTint('primary'),  // primary.main עם 8% opacity
  backgroundColor: getTint('error', 0.12)  // error.main עם 12% opacity
}} />

// ✅ גישה ישירה ל-theme
const MyComponent = () => {
  const theme = useTheme();
  return <div style={{ color: theme.palette.success.main }} />;
};

// ✅ שימוש ב-theme context
import { useThemeContext } from '../contexts/ThemeContext';

const Settings = () => {
  const { themeId, setThemeId, availableThemes } = useThemeContext();
  // החלפת ערכה:
  setThemeId('burgundy');
};
```

## דוגמאות אסורות
```tsx
// ❌ אסור - צבע hardcoded
<Box sx={{ backgroundColor: '#0F5C5C' }} />

// ❌ אסור - rgba hardcoded
<Box sx={{ backgroundColor: 'rgba(15, 92, 92, 0.08)' }} />

// ❌ אסור - CSS inline
<div style="background: #B8892D" />

// ❌ אסור - import ישיר של palette
import { tealGoldPalette } from '../theme/palettes';  // רק ב-theme files

// ❌ אסור - defaultTheme מחוץ לטסטים
import { defaultTheme } from '../theme';  // רק ב-tests
```

## חריגים מותרים
צבעים hardcoded **מותרים רק** בקבצים הבאים:
- `src/theme/**` - הגדרות ערכת נושא (palettes.ts, themes.ts, theme.ts)
- `src/services/documents.ts` - תבניות מסמכים להדפסה (עם CSS variables fallback)
- `src/services/documentConstants.ts` - ברירות מחדל למסמכים
- `src/__tests__/**` - קבצי טסטים
- `docs/**`, `tools/**` - תיעוד וכלים חיצוניים

לכל קובץ אחר שצריך צבעים hardcoded (למשל, תבניות HTML להדפסה), יש לסמן באופן מפורש:
```ts
// @allow-colors-start
const htmlTemplate = `
  <style>
    .header { background: #0F5C5C; }
  </style>
`;
// @allow-colors-end
```

## מה משתנה בין ערכות ומה קבוע?

### 🎨 משתנה (לפי ערכה):
- `primary.*`, `secondary.*` - צבעים עיקריים
- `info.*` - צבע מבטא (accent) 
- `sidebar.*` - רקע תפריט, טקסט, hover, selected
- `text.primary`, `text.secondary` - כהים בערכות לא-classic, בהירים ב-classic

### 📌 קבוע (זהה בכל הערכות):
- `success.*`, `warning.*`, `error.*` - ירוק/כתום/אדום סמנטיים
- `background.default`, `background.paper` - לבן/אפור בהיר
- `grey.*` - סולם אפור סטנדרטי של MUI
- `divider` - קו הפרדה
- `calendarTokens`, `confidenceTokens` - צבעי לוח שנה וסיכוני אשראי

**למה?** צבעי סטטוס (success/warning/error) צריכים להיות קונסיסטנטיים ומוכרים. ירוק=הצלחה, אדום=שגיאה.

---

## getTint() helper
**שימוש:** `getTint(paletteColor: PaletteColorKey, amount?: number)`

- ברירת מחדל: `amount = 0.08` (8% opacity)
- מחזיר את `paletteColor.main` עם opacity מבוקש
- מיפוי מ-MUI:
  - `.50` → `getTint(color, 0.08)`
  - `.100` → `getTint(color, 0.16)`
  - `.200` → `getTint(color, 0.30)`

**דוגמה:**
```tsx
// במקום: primary.50
// כתוב:
sx={{ backgroundColor: getTint('primary') }}

// במקום: error.100
// כתוב:
sx={{ backgroundColor: getTint('error', 0.16) }}
```

## בדיקה אוטומטית
הפרויקט מריץ `noHardcodedColors.test.ts` שסורק את כל קבצי `src/**/*.{ts,tsx}` ונכשל אם נמצאים:
- `#hex` (למעט ברשימת היתר/טווחי @allow-colors)
- `rgb(` או `rgba(` (למעט ברשימת היתר/טווחי @allow-colors)

בנוסף, `themeContrast.test.ts` בודק ש-**כל 5 הערכות** עומדות ב-WCAG AA.

## תיקון קוד קיים
אם נמצאו צבעים hardcoded:
1. חפש את הטוקן המתאים ב-`theme.palette`
2. החלף `#hex` → `'palette.key'`
3. החלף `rgba(R,G,B,A)` → `getTint('palette', A)`
4. אם זו תבנית מסמך להדפסה - סמן בטווחי `@allow-colors` או השתמש ב-CSS variables:
   ```ts
   color: var(--doc-accent, #1976d2);  // fallback למסמכים ישנים
   ```

## הוספת ערכה חדשה

### שלבים:
1. **הוסף palette ל-`src/theme/palettes.ts`:**
   ```typescript
   export const myNewPalette: PaletteSpec = makeSpec({
     primary: { main: '#HEXCODE', light: '...', dark: '...' },
     secondary: { main: '#HEXCODE', light: '...', dark: '...' },
     // success/warning/error בנויים אוטומטית ב-makeSpec()
   });
   ```

2. **רשום ב-`src/theme/themes.ts`:**
   ```typescript
   export const THEMES = [
     // ... ערכות קיימות
     {
       id: 'myNew',
       label: 'הערכה החדשה שלי',
       description: 'תיאור קצר',
       spec: myNewPalette,
     },
   ] as const;
   
   export type ThemeId = typeof THEMES[number]['id'];
   ```

3. **הוסף טסטים ל-`src/__tests__/themeContrast.test.ts`:**  
   (הקוד הקיים כבר רץ על כל THEMES, רק תוודא שעובר)

4. **בדיקה:**
   ```bash
   npm run type-check  # TypeScript
   npm test            # 852+ tests
   ```

5. **בדיקה ידנית:**  
   Settings → ערכת צבעים → בחר את הערכה החדשה

---

## קבצים מרכזיים
- `src/theme/palettes.ts` - הגדרות כל הערכות
- `src/theme/themes.ts` - רשימת ערכות + יצירת theme
- `src/theme/theme.ts` - createAppTheme(), defaultTheme
- `src/theme/themeStorage.ts` - loadThemeId/saveThemeId ל-localStorage
- `src/contexts/ThemeContext.tsx` - provider עם useState, useMemo
- `src/pages/Settings.tsx` - UI בחירת ערכה
- `src/__tests__/themeContrast.test.ts` - WCAG AA לכל הערכות
- `src/__tests__/themeStorage.test.ts` - בדיקת storage
