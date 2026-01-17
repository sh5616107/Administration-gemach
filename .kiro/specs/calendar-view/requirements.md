# Requirements Document

## Introduction

פיצ'ר לוח שנה למערכת ניהול הגמ"ח המציג תאריכים לועזיים ועבריים יחד עם אירועים פיננסיים חשובים. הלוח יאפשר למנהל הגמ"ח לראות במבט אחד את כל האירועים הקרובים - פירעונות, הפקדות, הלוואות מתוכננות ומשיכות צפויות.

## Glossary

- **Calendar_Component**: רכיב לוח השנה הראשי המציג תצוגת חודש
- **Day_Cell**: תא יום בודד בלוח המציג תאריך לועזי, עברי ואירועים
- **Event_Indicator**: סימון צבעוני המייצג סוג אירוע מסוים
- **Event_Type**: סוג אירוע - פירעון הלוואה (אדום), הפקדה מחזורית (ירוק), הלוואה מתוכננת (כחול), הפקדה להחזרה (כתום), הלוואה רגילה (סגול)
- **Date_Search**: חיפוש לפי תאריך לועזי או עברי
- **Hebrew_Date**: תאריך עברי המחושב באמצעות ספריית @hebcal/core
- **Event_Details_Dialog**: חלון המציג פרטי כל האירועים ביום נבחר
- **Navigation_Controls**: כפתורי ניווט בין חודשים ותצוגות

## Requirements

### Requirement 1: הצגת לוח שנה חודשי

**User Story:** As a גמ"ח מנהל, I want לראות לוח שנה חודשי עם תאריכים לועזיים ועבריים, so that אוכל לתכנן ולעקוב אחר אירועים פיננסיים.

#### Acceptance Criteria

1. THE Calendar_Component SHALL display a monthly grid with all days of the current month
2. WHEN a month is displayed, THE Day_Cell SHALL show both the Gregorian date number and the Hebrew date
3. THE Calendar_Component SHALL display the current month name in both Hebrew and Gregorian formats in the header
4. WHEN the calendar loads, THE Calendar_Component SHALL highlight today's date with a distinct visual indicator
5. THE Calendar_Component SHALL display day names (ראשון-שבת) as column headers

### Requirement 2: סימוני אירועים צבעוניים

**User Story:** As a גמ"ח מנהל, I want לראות סימונים צבעוניים לסוגי אירועים שונים, so that אוכל לזהות במהירות את סוג האירוע.

#### Acceptance Criteria

1. WHEN a loan has a due_date on a specific day, THE Day_Cell SHALL display a red (🔴) Event_Indicator
2. WHEN a recurring deposit is scheduled for a specific day, THE Day_Cell SHALL display a green (🟢) Event_Indicator
3. WHEN a planned loan (status='planned') has loan_date on a specific day, THE Day_Cell SHALL display a blue (🔵) Event_Indicator
4. WHEN a deposit has a due_date for withdrawal on a specific day, THE Day_Cell SHALL display an orange (🟠) Event_Indicator
5. WHEN a regular loan (status='active') has loan_date on a specific day, THE Day_Cell SHALL display a purple (🟣) Event_Indicator
6. WHEN multiple events exist on the same day, THE Day_Cell SHALL display multiple Event_Indicators stacked or grouped
7. THE Event_Indicator SHALL be small dots or badges that don't obscure the date numbers

### Requirement 3: תצוגת פרטי אירועים

**User Story:** As a גמ"ח מנהל, I want ללחוץ על יום ולראות את כל האירועים שלו, so that אוכל לקבל מידע מפורט על כל אירוע.

#### Acceptance Criteria

1. WHEN a user clicks on a Day_Cell, THE Event_Details_Dialog SHALL open showing all events for that day
2. THE Event_Details_Dialog SHALL display event type, amount, and related person name for each event
3. WHEN displaying a loan repayment event, THE Event_Details_Dialog SHALL show borrower name, loan amount, and remaining balance
4. WHEN displaying a deposit event, THE Event_Details_Dialog SHALL show depositor name and deposit amount
5. IF no events exist for the selected day, THEN THE Event_Details_Dialog SHALL display a message indicating no events
6. THE Event_Details_Dialog SHALL allow closing by clicking outside or pressing a close button

### Requirement 4: ניווט בין חודשים

**User Story:** As a גמ"ח מנהל, I want לנווט בין חודשים, so that אוכל לראות אירועים עתידיים ועבר.

#### Acceptance Criteria

1. THE Navigation_Controls SHALL include previous month and next month buttons
2. WHEN the user clicks the previous month button, THE Calendar_Component SHALL display the previous month
3. WHEN the user clicks the next month button, THE Calendar_Component SHALL display the next month
4. THE Navigation_Controls SHALL include a "today" button to return to the current month
5. WHEN navigating between months, THE Calendar_Component SHALL load and display events for the new month

### Requirement 5: אינטגרציה בתפריט

**User Story:** As a גמ"ח מנהל, I want לגשת ללוח השנה מהתפריט הראשי, so that אוכל לנווט אליו בקלות.

#### Acceptance Criteria

1. THE Layout_Component SHALL include a "לוח שנה" menu item with a calendar icon
2. WHEN the user clicks the calendar menu item, THE System SHALL navigate to the calendar page
3. THE calendar menu item SHALL be positioned after "תרומות והפקדות" in the menu order

### Requirement 6: טעינת נתוני אירועים

**User Story:** As a גמ"ח מנהל, I want שהלוח יטען אירועים מהמערכת, so that אראה מידע עדכני ומדויק.

#### Acceptance Criteria

1. WHEN the calendar month changes, THE Calendar_Component SHALL fetch all relevant events for that month
2. THE Calendar_Component SHALL fetch loan due dates from active loans
3. THE Calendar_Component SHALL fetch recurring deposit dates from active recurring deposits
4. THE Calendar_Component SHALL fetch planned loan dates from loans with status='planned'
5. THE Calendar_Component SHALL fetch deposit due dates (withdrawal dates) from active deposits
6. IF an error occurs during data loading, THEN THE Calendar_Component SHALL display an error message

### Requirement 7: עיצוב Material Design

**User Story:** As a גמ"ח מנהל, I want שהלוח יהיה בעיצוב תואם לשאר המערכת, so that החוויה תהיה אחידה ונעימה.

#### Acceptance Criteria

1. THE Calendar_Component SHALL use MUI components and styling consistent with the application
2. THE Calendar_Component SHALL support RTL layout direction
3. THE Day_Cell SHALL have hover effects consistent with Material Design
4. THE Calendar_Component SHALL be responsive and work on different screen sizes
5. THE Event_Indicators SHALL use the application's color palette (primary, secondary, error, warning colors)

### Requirement 8: חיפוש לפי תאריך

**User Story:** As a גמ"ח מנהל, I want לחפש ולקפוץ לתאריך מסוים, so that אוכל למצוא במהירות אירועים בתאריך ספציפי.

#### Acceptance Criteria

1. THE Calendar_Component SHALL include a date search input field
2. WHEN a user enters a Gregorian date (e.g., 15/01/2026), THE Calendar_Component SHALL navigate to that date's month and highlight the day
3. WHEN a user enters a Hebrew date (e.g., ט"ו שבט תשפ"ו), THE Calendar_Component SHALL convert it and navigate to the corresponding Gregorian date
4. WHEN the search input is invalid, THE Calendar_Component SHALL display an error message
5. THE Date_Search SHALL support common date formats (DD/MM/YYYY, DD.MM.YYYY)
