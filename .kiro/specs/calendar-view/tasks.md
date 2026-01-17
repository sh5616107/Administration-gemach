# Implementation Plan: Calendar View

## Overview

מימוש לוח שנה אינטראקטיבי עם תאריכים לועזיים ועבריים, סימוני אירועים צבעוניים, וחיפוש תאריך. הפיתוח יתבצע בשלבים - החל מהתשתית, דרך הרכיבים הבסיסיים, ועד לאינטגרציה מלאה.

## Tasks

- [x] 1. הקמת תשתית ושירות נתונים
  - [x] 1.1 יצירת CalendarService עם פונקציות טעינת אירועים
    - יצירת קובץ `src/services/calendarService.ts`
    - מימוש `getEventsForMonth(year, month)` לטעינת כל סוגי האירועים
    - מימוש `getEventsForDay(date)` לטעינת אירועים ליום ספציפי
    - הגדרת interface CalendarEvent
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 1.2 כתיבת property test לטעינת אירועים
    - **Property 3: Event Data Loading Completeness**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

  - [x] 1.3 הרחבת dateUtils עם פונקציות המרה
    - הוספת `parseHebrewDate(input)` להמרת תאריך עברי ללועזי
    - הוספת `parseSearchDate(input)` לפענוח פורמטים שונים
    - הוספת `getHebrewMonthName(date)` לשם חודש עברי
    - _Requirements: 8.2, 8.3, 8.5_

  - [x] 1.4 כתיבת property test להמרת תאריכים
    - **Property 6: Hebrew Date Conversion Round-Trip**
    - **Validates: Requirements 8.3**

- [ ] 2. Checkpoint - וידוא תשתית
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. מימוש רכיבי לוח השנה הבסיסיים
  - [ ] 3.1 יצירת DayCell component
    - יצירת קובץ `src/components/calendar/DayCell.tsx`
    - הצגת תאריך לועזי ועברי
    - תמיכה ב-isToday, isSelected, isCurrentMonth
    - אפקט hover בסגנון Material
    - _Requirements: 1.2, 1.4, 7.3_

  - [ ] 3.2 יצירת EventIndicator component
    - יצירת קובץ `src/components/calendar/EventIndicator.tsx`
    - מיפוי סוג אירוע לצבע
    - תמיכה בריבוי אירועים (עד 3 + מונה)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 3.3 כתיבת property test למיפוי אירוע-צבע
    - **Property 2: Event-to-Indicator Mapping**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

  - [ ] 3.4 יצירת CalendarGrid component
    - יצירת קובץ `src/components/calendar/CalendarGrid.tsx`
    - יצירת רשת 7x6 לימי החודש
    - כותרות ימים (ראשון-שבת)
    - חישוב ימים מחודשים קודם/הבא
    - _Requirements: 1.1, 1.5_

  - [ ] 3.5 כתיבת property test למספר ימים בלוח
    - **Property 1: Calendar Grid Days Count**
    - **Validates: Requirements 1.1**

- [ ] 4. Checkpoint - רכיבים בסיסיים
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. מימוש רכיבי ניווט וחיפוש
  - [ ] 5.1 יצירת CalendarHeader component
    - יצירת קובץ `src/components/calendar/CalendarHeader.tsx`
    - כפתורי ניווט (קודם/הבא/היום)
    - הצגת שם חודש לועזי ועברי
    - _Requirements: 1.3, 4.1, 4.4_

  - [ ] 5.2 יצירת DateSearch component
    - יצירת קובץ `src/components/calendar/DateSearch.tsx`
    - שדה חיפוש עם אייקון
    - תמיכה בפורמטים DD/MM/YYYY, DD.MM.YYYY
    - תמיכה בתאריך עברי
    - הצגת שגיאות
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 5.3 כתיבת property test לפענוח חיפוש
    - **Property 7: Date Search Parsing**
    - **Validates: Requirements 8.2, 8.5**

- [ ] 6. מימוש דיאלוג פרטי אירועים
  - [ ] 6.1 יצירת EventDetailsDialog component
    - יצירת קובץ `src/components/calendar/EventDetailsDialog.tsx`
    - הצגת כל האירועים ליום נבחר
    - פרטי אירוע: סוג, סכום, שם, יתרה
    - הודעה כשאין אירועים
    - סגירה בלחיצה מחוץ או כפתור
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 6.2 כתיבת property test לתצוגת פרטים
    - **Property 5: Event Details Display Completeness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [ ] 7. Checkpoint - רכיבי UI
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. אינטגרציה ודף ראשי
  - [ ] 8.1 יצירת CalendarComponent הראשי
    - יצירת קובץ `src/components/calendar/CalendarComponent.tsx`
    - חיבור כל תת-הרכיבים
    - ניהול state (currentDate, selectedDate, events)
    - טעינת אירועים בשינוי חודש
    - _Requirements: 4.5, 6.1_

  - [ ] 8.2 כתיבת property test לניווט
    - **Property 4: Month Navigation Consistency**
    - **Validates: Requirements 4.2, 4.3, 4.5**

  - [ ] 8.3 יצירת CalendarPage
    - יצירת קובץ `src/pages/Calendar.tsx`
    - שימוש ב-CalendarComponent
    - טיפול בשגיאות טעינה
    - _Requirements: 6.6_

  - [ ] 8.4 הוספת נתיב ותפריט
    - עדכון `src/App.tsx` עם route חדש `/calendar`
    - עדכון `src/components/Layout.tsx` עם פריט תפריט "לוח שנה"
    - מיקום אחרי "תרומות והפקדות"
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 9. עיצוב ו-RTL
  - [ ] 9.1 התאמת עיצוב Material Design
    - שימוש ב-MUI Paper, Box, Typography
    - צבעים מפלטת האפליקציה
    - תמיכה מלאה ב-RTL
    - רספונסיביות למסכים שונים
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ] 9.2 הוספת מקרא צבעים
    - הצגת מקרא בתחתית הלוח
    - הסבר לכל צבע אירוע
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 10. Checkpoint סופי
  - Ensure all tests pass, ask the user if questions arise.
  - בדיקה ידנית של כל הפונקציונליות
  - וידוא תאימות RTL

## Notes

- All tasks are required for complete implementation
- Each task references specific requirements for traceability
- Property tests use vitest with fast-check library
- All components use MUI for consistent Material Design styling
- Hebrew date handling uses @hebcal/core which is already installed
