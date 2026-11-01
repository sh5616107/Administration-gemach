---
inclusion: auto
name: colors
description: כללי שימוש בצבעים ב-Gemach system
---

# כללי שימוש בצבעים

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
```

## דוגמאות אסורות
```tsx
// ❌ אסור - צבע hardcoded
<Box sx={{ backgroundColor: '#0F5C5C' }} />

// ❌ אסור - rgba hardcoded
<Box sx={{ backgroundColor: 'rgba(15, 92, 92, 0.08)' }} />

// ❌ אסור - CSS inline
<div style="background: #B8892D" />
```

## חריגים מותרים
צבעים hardcoded **מותרים רק** בקבצים הבאים:
- `src/theme/**` - הגדרות ערכת נושא
- `src/services/documents.ts` - תבניות מסמכים להדפסה
- `src/services/documentConstants.ts` - ברירות מחדל למסמכים
- `src/__tests__/**` - קבצי טסטים

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

## תיקון קוד קיים
אם נמצאו צבעים hardcoded:
1. חפש את הטוקן המתאים ב-`theme.palette`
2. החלף `#hex` → `'palette.key'`
3. החלף `rgba(R,G,B,A)` → `getTint('palette', A)`
4. אם זו תבנית מסמך להדפסה - סמן בטווחי `@allow-colors`
