# פיצול תרומות והפקדות - תכנון מפורט

## רקע
כרגע המערכת מנהלת תורמים (donors) בטבלה נפרדת, אבל אין להם מסך ייעודי. זה מקשה על:
- חיפוש מהיר של תורמים
- צפייה בהיסטוריית תרומות לפי תורם
- עדכון פרטי תורם במקום אחד

## מטרה
פיצול דף "תרומות והפקדות" ל-**2 דפים נפרדים** בתפריט:

### דף 1: תרומות (Donations.tsx)
- **טאב 0**: תורמים (DonorsTab) - רשימת כל התורמים + ניהול
- **טאב 1**: תרומות (DonationsTab) - רשימת כל התרומות

### דף 2: הפקדות (Deposits.tsx)
- **טאב 0**: מפקידים (DepositorsTab) - רשימת כל המפקידים + ניהול
- **טאב 1**: הפקדות (DepositsTab) - רשימת כל ההפקדות

## מבנה נוכחי
```
Layout.tsx (תפריט)
└── תרומות והפקדות → DonationsDeposits.tsx
    ├── Tab 0: תרומות (DonationsTab)
    ├── Tab 1: מפקידים (DepositorsTab)
    └── Tab 2: הפקדות (DepositsTab)
```

## מבנה חדש מוצע
```
Layout.tsx (תפריט)
├── תרומות → Donations.tsx ⭐ חדש
│   ├── Tab 0: תורמים (DonorsTab) ⭐ חדש
│   └── Tab 1: תרומות (DonationsTab)
└── הפקדות → Deposits.tsx ⭐ חדש
    ├── Tab 0: מפקידים (DepositorsTab)
    └── Tab 1: הפקדות (DepositsTab)
```

## שלבי ביצוע

### שלב 1: יצירת DonorsTab.tsx ✅
**קובץ**: `src/components/donations/DonorsTab.tsx`

**תכונות** (מבוסס על DepositorsTab):
- טופס הוספת תורם חדש
- חיפוש תורמים (שם, טלפון, ת.ז.)
- טבלת תורמים עם:
  - שם מלא
  - טלפון
  - ת.ז.
  - סה"כ תרם (total_donations)
  - מספר תרומות (donation_count)
- פעולות:
  - עריכת תורם
  - מחיקת תורם (רק אם אין תרומות)
  - הפקת דוח תורם
  - שליחת דוח במייל
- לחיצה על שורה → מעבר לטאב תרומות עם סינון לפי תורם

**שדות בטבלת donors**:
```sql
CREATE TABLE donors (
  id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  id_number TEXT,
  address TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT
)
```

### שלב 2: יצירת Donations.tsx ✅
**קובץ**: `src/pages/Donations.tsx` ⭐ חדש

**תכונות**:
1. דף חדש לניהול תרומות
2. מבנה טאבים:
   - Tab 0: תורמים (DonorsTab)
   - Tab 1: תרומות (DonationsTab)
3. state לניהול תורם נבחר
4. העברת פרמטרים בין טאבים (לחיצה על תורם → מעבר לטאב תרומות עם סינון)

**אייקונים**:
- תורמים: `VolunteerActivism` (לב עם ידיים)
- תרומות: `CardGiftcard` (מתנה)

### שלב 2.5: יצירת Deposits.tsx ✅
**קובץ**: `src/pages/Deposits.tsx` ⭐ חדש

**תכונות**:
1. דף חדש לניהול הפקדות (מבוסס על DonationsDeposits.tsx הנוכחי)
2. מבנה טאבים:
   - Tab 0: מפקידים (DepositorsTab)
   - Tab 1: הפקדות (DepositsTab)
3. state לניהול מפקיד נבחר
4. העברת פרמטרים בין טאבים

**אייקונים**:
- מפקידים: `Person` (אדם)
- הפקדות: `AccountBalanceWallet` (ארנק)

### שלב 3: עדכון DonationsTab.tsx ✅
**קובץ**: `src/components/donations/DonationsTab.tsx`

**שינויים**:
1. הוספת props:
   - `selectedDonor?: Donor` - תורם נבחר
   - `onSelectDonor?: (donor: Donor) => void` - callback לבחירת תורם
2. סינון תרומות לפי תורם נבחר
3. הוספת Autocomplete לבחירת תורם בטופס תרומה חדשה
4. הצגת שם התורם בטבלת התרומות

### שלב 4: עדכון Layout.tsx ✅
**קובץ**: `src/components/Layout.tsx`

**שינויים**:
- הסרת פריט תפריט "תרומות והפקדות"
- הוספת 2 פריטי תפריט נפרדים:
  - "תרומות" → `/donations` (Donations.tsx)
  - "הפקדות" → `/deposits` (Deposits.tsx)

### שלב 4.5: עדכון App.tsx ✅
**קובץ**: `src/App.tsx`

**שינויים**:
- הוספת route חדש: `/donations` → `<Donations />`
- שינוי route קיים: `/deposits` → `<Deposits />` (במקום DonationsDeposits)
- או: שמירת route ישן לתאימות לאחור

### שלב 5: יצירת services לתורמים ✅
**קובץ**: `src/services/database.ts`

**הוספות**:
```typescript
export const donorsService = {
  getAll: async () => { ... },
  getById: async (id: number) => { ... },
  create: async (donor: Donor) => { ... },
  update: async (id: number, donor: Partial<Donor>) => { ... },
  delete: async (id: number) => { ... },
  search: async (term: string) => { ... },
}
```

### שלב 6: עדכון documents.ts ✅
**קובץ**: `src/services/documents.ts`

**הוספות**:
- `generateDonorReport()` - דוח תורם
- `createDonorReportEmailData()` - נתוני מייל לתורם

### שלב 7: בדיקות ✅
1. בדיקת הוספת תורם חדש
2. בדיקת חיפוש תורמים
3. בדיקת עריכת תורם
4. בדיקת מחיקת תורם
5. בדיקת הפקת דוח
6. בדיקת שליחת מייל
7. בדיקת מעבר בין טאבים
8. בדיקת סינון תרומות לפי תורם

### שלב 8: עדכון גיבוי ושחזור ✅
**קבצים**: 
- `src/pages/AdvancedTools.tsx`
- `src/pages/Dashboard.tsx`

**שינויים**:
- הוספת `donors` לייצוא/ייבוא
- הוספת `donors` למחיקת הכל

## יתרונות
1. ✅ **ניהול מרכזי** - כל התורמים במקום אחד
2. ✅ **חיפוש מהיר** - מציאת תורם בקלות
3. ✅ **היסטוריה** - צפייה בכל תרומות התורם
4. ✅ **עדכון פשוט** - שינוי פרטים במקום אחד
5. ✅ **דוחות** - הפקת דוח מפורט לתורם
6. ✅ **עקביות** - מבנה זהה לניהול לווים/ערבים/מפקידים

## הערות טכניות
- טבלת `donors` כבר קיימת במערכת
- טבלת `donations` כבר מקושרת ל-`donor_id`
- צריך לוודא תאימות לאחור עם נתונים קיימים
- כל הטסטים הקיימים צריכים להמשיך לעבור

## סטטוס ביצוע
- [x] שלב 1: יצירת DonorsTab.tsx
- [x] שלב 2: יצירת Donations.tsx (דף חדש)
- [x] שלב 2.5: יצירת Deposits.tsx (דף חדש)
- [x] שלב 3: עדכון DonationsTab.tsx
- [x] שלב 4: עדכון Layout.tsx (פיצול תפריט)
- [x] שלב 4.5: עדכון App.tsx (routes)
- [x] שלב 5: יצירת services לתורמים (donorsService כבר קיים)
- [x] שלב 6: עדכון documents.ts (generateDonorReport + createDonorReportEmailData)
- [ ] שלב 7: בדיקות
- [ ] שלב 8: עדכון גיבוי ושחזור
