# מסמך דרישות

## מבוא

תכונה זו מאפשרת עריכה וניהול של פריטים מחזוריים (הלוואות, פירעונות והפקדות) שכבר נוצרו במערכת. כרגע, משתמש שיצר פריט מחזורי ורוצה לשנות פרטים (סכום, יום גבייה, משך) צריך למחוק את הפריט ולהתחיל מחדש. תכונה זו תאפשר עריכה של הפרמטרים המחזוריים, הצגת היסטוריה של כל הפריטים שנוצרו בסדרה, ועדכון שישפיע על **כל הפריטים בסדרה** - גם אלו שכבר נוצרו וגם אלו שעתידים להיווצר.

## מילון מונחים

- **Recurring_Item**: פריט מחזורי - הלוואה, פירעון או הפקדה שנוצרו עם הגדרות מחזוריות
- **Series**: סדרה - קבוצת פריטים מחזוריים שנוצרו מאותה הגדרה מקורית
- **Original_Item**: הפריט המקורי שנוצר ידנית על ידי המשתמש והוא הבסיס לסדרה
- **Generated_Item**: פריט שנוצר אוטומטית על ידי ה-Scheduler כחלק מסדרה מחזורית
- **Future_Item**: פריט בסדרה שתאריך הביצוע שלו עדיין לא הגיע
- **Past_Item**: פריט בסדרה שתאריך הביצוע שלו כבר עבר
- **Edit_Dialog**: חלון עריכה המאפשר שינוי פרמטרים של פריט מחזורי
- **History_View**: תצוגת היסטוריה המציגה את כל הפריטים בסדרה
- **Recurring_Day**: יום בחודש שבו מתבצע הפריט המחזורי (1-31)
- **Recurring_Months**: מספר החודשים הנותרים שבהם ייווצרו פריטים נוספים
- **Recurring_Amount**: הסכום של כל פריט בסדרה המחזורית
- **Series_Count**: סך כל הפריטים בסדרה (recurring_loan_count, recurring_repayment_count, recurring_deposit_count)
- **Item_Number**: מספר הפריט בסדרה (recurring_loan_number, recurring_repayment_number, recurring_deposit_number)
- **Scheduler**: רכיב המערכת היוצר אוטומטית פריטים מחזוריים חדשים

## דרישות

### דרישה 1: עריכת הלוואה מחזורית

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לערוך הלוואה מחזורית קיימת, כדי שאוכל לשנות פרמטרים מבלי למחוק ולהתחיל מחדש.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור עריכה בהלוואה מחזורית, THE Edit_Dialog SHALL פתח עם הפרמטרים הנוכחיים
2. THE Edit_Dialog SHALL הציג שדות לעריכת Recurring_Day, Recurring_Amount ו-Recurring_Months
3. WHEN המשתמש משנה Recurring_Day, THE System SHALL עדכן את השדה recurring_day ב**כל ההלוואות בסדרה**
4. WHEN המשתמש משנה Recurring_Amount, THE System SHALL עדכן את השדה amount ב**כל ההלוואות בסדרה**
5. WHEN המשתמש משנה Recurring_Months, THE System SHALL עדכן את השדה recurring_months בהלוואה המקורית
6. THE System SHALL עדכן את recurring_day ו-amount גם בהלוואות שכבר נוצרו (Past_Items)
7. THE System SHALL עדכן את recurring_day ו-amount גם בהלוואות עתידיות (Future_Items)
8. THE System SHALL שמור את loan_date, due_date ו-Item_Number ללא שינוי בכל ההלוואות

### דרישה 2: הצגת היסטוריית הלוואות מחזוריות

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לראות את כל ההלוואות בסדרה המחזורית, כדי שאוכל לעקוב אחר ההיסטוריה המלאה.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור היסטוריה בהלוואה מחזורית, THE History_View SHALL פתח
2. THE History_View SHALL הציג רשימה של כל ההלוואות בסדרה ממוינות לפי Item_Number
3. FOR EACH הלוואה בסדרה, THE History_View SHALL הציג Item_Number, תאריך מתן הלוואה, Recurring_Amount ומצב
4. THE History_View SHALL סמן Past_Items בצבע שונה מ-Future_Items
5. THE History_View SHALL הציג את Series_Count בכותרת (למשל: "היסטוריית הלוואות - 12 הלוואות בסדרה")
6. WHEN אין הלוואות נוספות בסדרה, THE History_View SHALL הציג הודעה מתאימה

### דרישה 3: עריכת פירעון מחזורי

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לערוך פירעון מחזורי קיים, כדי שאוכל לשנות פרמטרים מבלי למחוק ולהתחיל מחדש.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור עריכה בפירעון מחזורי, THE Edit_Dialog SHALL פתח עם הפרמטרים הנוכחיים
2. THE Edit_Dialog SHALL הציג שדות לעריכת Recurring_Day ו-Recurring_Amount
3. WHEN המשתמש משנה Recurring_Day, THE System SHALL עדכן את השדה recurring_day ב**כל הפירעונות בסדרה**
4. WHEN המשתמש משנה Recurring_Amount, THE System SHALL עדכן את השדה amount ב**כל הפירעונות בסדרה** וחשב מחדש את Series_Count
5. THE System SHALL חשב Series_Count חדש לפי הנוסחה: loan_amount / new_amount
6. THE System SHALL עדכן את recurring_day ו-amount גם בפירעונות שכבר נוצרו (Past_Items)
7. THE System SHALL עדכן את recurring_day ו-amount גם בפירעונות עתידיים (Future_Items)
8. THE System SHALL שמור את payment_date ו-Item_Number ללא שינוי בכל הפירעונות

### דרישה 4: הצגת היסטוריית פירעונים מחזוריים

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לראות את כל הפירעונים בסדרה המחזורית, כדי שאוכל לעקוב אחר ההיסטוריה המלאה.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור היסטוריה בפירעון מחזורי, THE History_View SHALL פתח
2. THE History_View SHALL הציג רשימה של כל הפירעונים בסדרה ממוינות לפי Item_Number
3. FOR EACH פירעון בסדרה, THE History_View SHALL הציג Item_Number, תאריך פירעון, Recurring_Amount ומצב
4. THE History_View SHALL סמן Past_Items בצבע שונה מ-Future_Items
5. THE History_View SHALL הציג את Series_Count בכותרת (למשל: "היסטוריית פירעונים - 5 פירעונים בסדרה")
6. WHEN אין פירעונים נוספים בסדרה, THE History_View SHALL הציג הודעה מתאימה

### דרישה 5: עריכת הפקדה מחזורית

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לערוך הפקדה מחזורית קיימת, כדי שאוכל לשנות פרמטרים מבלי למחוק ולהתחיל מחדש.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור עריכה בהפקדה מחזורית, THE Edit_Dialog SHALL פתח עם הפרמטרים הנוכחיים
2. THE Edit_Dialog SHALL הציג שדות לעריכת Recurring_Day, Recurring_Amount ו-Recurring_Months
3. WHEN המשתמש משנה Recurring_Day, THE System SHALL עדכן את השדה recurring_day ב**כל ההפקדות בסדרה**
4. WHEN המשתמש משנה Recurring_Amount, THE System SHALL עדכן את השדה amount ב**כל ההפקדות בסדרה**
5. WHEN המשתמש משנה Recurring_Months, THE System SHALL עדכן את השדה recurring_months בהפקדה המקורית
6. THE System SHALL עדכן את recurring_day ו-amount גם בהפקדות שכבר נוצרו (Past_Items)
7. THE System SHALL עדכן את recurring_day ו-amount גם בהפקדות עתידיות (Future_Items)
8. THE System SHALL שמור את deposit_date ו-Item_Number ללא שינוי בכל ההפקדות

### דרישה 6: הצגת היסטוריית הפקדות מחזוריות

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לראות את כל ההפקדות בסדרה המחזורית, כדי שאוכל לעקוב אחר ההיסטוריה המלאה.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור היסטוריה בהפקדה מחזורית, THE History_View SHALL הציג
2. THE History_View SHALL הציג רשימה של כל ההפקדות בסדרה ממוינות לפי Item_Number
3. FOR EACH הפקדה בסדרה, THE History_View SHALL הציג Item_Number, תאריך הפקדה, Recurring_Amount ומצב
4. THE History_View SHALL סמן Past_Items בצבע שונה מ-Future_Items
5. THE History_View SHALL הציג את Series_Count בכותרת (למשל: "היסטוריית הפקדות - 12 הפקדות בסדרה")
6. WHEN אין הפקדות נוספות בסדרה, THE History_View SHALL הציג הודעה מתאימה

### דרישה 7: זיהוי פריטים בסדרה

**סיפור משתמש:** כארכיטקט מערכת, אני רוצה שהמערכת תזהה נכון את כל הפריטים בסדרה, כדי שהעריכה וההיסטוריה יעבדו נכון.

#### קריטריוני קבלה

1. THE System SHALL זהה הלוואות באותה סדרה לפי borrower_id, Recurring_Amount, Recurring_Day ו-is_recurring
2. THE System SHALL זהה פירעונים באותה סדרה לפי loan_id, Recurring_Amount, Recurring_Day ו-is_recurring
3. THE System SHALL זהה הפקדות באותה סדרה לפי depositor_id, Recurring_Amount, Recurring_Day ו-recurring_months
4. THE System SHALL מיין פריטים בסדרה לפי Item_Number בסדר עולה
5. THE System SHALL חשב Series_Count מהפריט עם ה-Item_Number הגבוה ביותר בסדרה

### דרישה 8: אינטגרציה עם Scheduler

**סיפור משתמש:** כארכיטקט מערכת, אני רוצה שה-Scheduler ישתמש בפרמטרים המעודכנים, כדי שפריטים עתידיים ייווצרו עם הערכים החדשים.

#### קריטריוני קבלה

1. WHEN ה-Scheduler יוצר Future_Item חדש, THE System SHALL השתמש ב-Recurring_Day המעודכן מהפריט האחרון בסדרה
2. WHEN ה-Scheduler יוצר Future_Item חדש, THE System SHALL השתמש ב-Recurring_Amount המעודכן מהפריט האחרון בסדרה
3. WHEN ה-Scheduler יוצר Future_Item חדש, THE System SHALL השתמש ב-Recurring_Months המעודכן
4. THE System SHALL הפחית את Recurring_Months ב-1 אחרי יצירת כל Future_Item
5. WHEN Recurring_Months מגיע ל-0, THE Scheduler SHALL הפסיק ליצור פריטים נוספים
6. THE Scheduler SHALL זהה את הפריט האחרון בסדרה (עם ה-Item_Number הגבוה ביותר) ויקרא ממנו את הפרמטרים המעודכנים

### דרישה 9: ולידציה ושגיאות

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה שהמערכת תמנע שגיאות בעריכה, כדי שלא אוכל להזין ערכים לא תקינים.

#### קריטריוני קבלה

1. WHEN המשתמש מזין Recurring_Day קטן מ-1 או גדול מ-31, THE System SHALL הציג הודעת שגיאה
2. WHEN המשתמש מזין Recurring_Amount קטן או שווה ל-0, THE System SHALL הציג הודעת שגיאה
3. WHEN המשתמש מזין Recurring_Months קטן מ-0, THE System SHALL הציג הודעת שגיאה
4. WHEN המשתמש מנסה לערוך פריט שאינו Original_Item, THE System SHALL הציג הודעת שגיאה
5. IF שגיאה מתרחשת בשמירה, THEN THE System SHALL הציג הודעת שגיאה ולא ישנה את הנתונים

### דרישה 10: ממשק משתמש ונגישות

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה ממשק ברור ונוח, כדי שאוכל לערוך פריטים מחזוריים בקלות.

#### קריטריוני קבלה

1. THE Edit_Dialog SHALL השתמש ברכיבי Material-UI עקביים עם שאר המערכת
2. THE Edit_Dialog SHALL תמוך בכיוון RTL לעברית
3. THE History_View SHALL תמוך בגלילה כאשר יש הרבה פריטים בסדרה
4. THE System SHALL הציג אינדיקטור טעינה בזמן שמירת שינויים
5. WHEN שינויים נשמרו בהצלחה, THE System SHALL הציג הודעת אישור למשתמש
6. THE Edit_Dialog SHALL כלול כפתורי "שמור" ו-"ביטול" ברורים

### דרישה 11: שמירת שלמות נתונים

**סיפור משתמש:** כארכיטקט מערכת, אני רוצה ששינויים יעדכנו את כל הפריטים בסדרה, אבל ישמרו על תאריכים ומספרים סידוריים.

#### קריטריוני קבלה

1. THE System SHALL עדכן את amount ו-recurring_day ב**כל הפריטים בסדרה** (גם Past_Items וגם Future_Items)
2. THE System SHALL **לא** ישנה את loan_date, due_date, payment_date או deposit_date של אף פריט
3. THE System SHALL **לא** ישנה את Item_Number של אף פריט בסדרה
4. THE System SHALL **לא** ישנה את Series_Count של אף פריט בסדרה
5. THE System SHALL שמור על סטטוס (status) של כל פריט ללא שינוי
6. WHEN עורכים פריט מחזורי, THE System SHALL עדכן את recurring_day, amount ו-recurring_months בכל הפריטים הרלוונטיים בסדרה

### דרישה 12: עדכון פריטים קיימים בסדרה

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה ששינויים שאני עושה יחולו גם על הלוואות/פירעונות/הפקדות שכבר נוצרו, כדי שכל הסדרה תהיה עקבית.

#### קריטריוני קבלה

1. WHEN המשתמש משנה Recurring_Amount, THE System SHALL עדכן את amount בכל הפריטים בסדרה (Past_Items ו-Future_Items)
2. WHEN המשתמש משנה Recurring_Day, THE System SHALL עדכן את recurring_day בכל הפריטים בסדרה
3. THE System SHALL זהה את כל הפריטים בסדרה לפי borrower_id/depositor_id/loan_id ו-Item_Number
4. THE System SHALL עדכן פריטים בודדים בטרנזקציה אחת כדי למנוע מצב לא עקבי
5. WHEN עדכון נכשל, THE System SHALL בצע rollback ולא ישנה אף פריט בסדרה
6. THE System SHALL הציג הודעה למשתמש המציינת כמה פריטים עודכנו (למשל: "עודכנו 5 הלוואות בסדרה")
7. THE System SHALL שמור log של השינויים שבוצעו לכל פריט בסדרה

### דרישה 13: אזהרה לפני עדכון פריטים קיימים

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לקבל אזהרה לפני שהמערכת משנה פריטים שכבר נוצרו, כדי שאהיה מודע להשפעה.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על "שמור" ב-Edit_Dialog, THE System SHALL הציג חלון אישור
2. THE חלון אישור SHALL הציג את מספר הפריטים שיעודכנו (למשל: "פעולה זו תעדכן 5 הלוואות קיימות ו-7 הלוואות עתידיות")
3. THE חלון אישור SHALL הציג את השינויים המדויקים (למשל: "סכום: 400 ₪ → 500 ₪, יום גבייה: 5 → 10")
4. THE חלון אישור SHALL כלול כפתורי "אישור" ו-"ביטול"
5. WHEN המשתמש לוחץ על "אישור", THE System SHALL בצע את העדכון
6. WHEN המשתמש לוחץ על "ביטול", THE System SHALL חזור ל-Edit_Dialog מבלי לשמור
7. THE System SHALL לא יבצע שינויים עד שהמשתמש אישר בחלון האישור

### דרישה 14: תמיכה בביטול עריכה

**סיפור משתמש:** כמנהל גמ"ח, אני רוצה לבטל שינויים שעשיתי, כדי שאוכל לחזור למצב המקורי אם טעיתי.

#### קריטריוני קבלה

1. WHEN המשתמש לוחץ על כפתור "ביטול" ב-Edit_Dialog, THE System SHALL סגור את החלון מבלי לשמור שינויים
2. WHEN המשתמש לוחץ על X או מחוץ ל-Edit_Dialog, THE System SHALL סגור את החלון מבלי לשמור שינויים
3. THE System SHALL לא ישנה נתונים עד שהמשתמש לוחץ על "שמור"
4. WHEN המשתמש פותח מחדש את Edit_Dialog אחרי ביטול, THE System SHALL הציג את הערכים המקוריים

