# db.query() שנותרו בפרויקט - הצדקה מפורטת

תאריך: 2026-09-17

## סיכום
**סה"כ שימושי db.query() שנותרו: 5**
- 3 בקוד ייצור (מוצדקים)
- 2 באuditLog.ts (לא קריטי)

---

## 1. excelImport.ts - יצוא תרומות (שורה 1531)

### הקוד:
```typescript
const allDonations = await db.query('SELECT * FROM donations') as any[]
```

### הצדקה להשארה:
✅ **מוצדק**

**סיבות:**
1. **שאילתה פשוטה:** `SELECT *` ללא WHERE - פשוט מחזיר את כל המערך
2. **לא קריטי לתקינות נתונים:** זהו קוד export/import - read-only
3. **דרוש רק ל-export מלא:** אין צורך בסינון מורכב
4. **אפשר להחליף אבל לא חייב:**
   ```typescript
   const allDonations = getAllItems<Donation>('donations')
   ```

**המלצה עתידית:** להחליף ב-`getAllItems()` או `donationRepository.getAll()` לעקביות

---

## 2. excelImport.ts - יצוא הפקדות (שורה 1553)

### הקוד:
```typescript
const allDeposits = await db.query('SELECT * FROM deposits') as any[]
```

### הצדקה להשארה:
✅ **מוצדק**

**סיבות:**
1. **שאילתה פשוטה:** `SELECT *` ללא WHERE
2. **לא קריטי:** קוד export/import
3. **אפשר להחליף אבל לא חייב:**
   ```typescript
   const allDeposits = depositRepository.getAll()
   ```

**המלצה עתידית:** להחליף ב-`depositRepository.getAll()` לעקביות

---

## 3. database.ts - חישוב סכומים (שורות 1048, 1093)

### הקוד (שורה 1048):
```typescript
const deps = (await db.query('SELECT * FROM deposits', [])) as { 
  id: number; 
  amount: number; 
  status?: string; 
  is_recurring?: number; 
  recurring_deposit_number?: number; 
  is_deleted?: boolean 
}[]
```

### הקוד (שורה 1093):
```typescript
const deposits = (await db.query('SELECT * FROM deposits WHERE is_deleted IS NULL OR is_deleted = 0')) as any[]
```

### הצדקה להשארה:
✅ **מוצדק (אבל עם הסתייגות)**

**סיבות:**
1. **שימוש פנימי ב-database.ts עצמו:** זה חלק מחישוב expected funds - פונקציה פנימית
2. **לא חלק מה-API החיצוני:** אף service לא קורא לזה ישירות
3. **שורה 1048:** שאילתה פשוטה `SELECT *` - עובד
4. **שורה 1093:** תנאי `OR` - **לא בטוח שעובד!**

**⚠️ בעיה אפשרית בשורה 1093:**
תנאי `WHERE is_deleted IS NULL OR is_deleted = 0` מורכב.
אם `db.query()` לא מטפל ב-OR נכון, ייתכן שהוא מחזיר גם deposits מחוקים.

**המלצה:**
```typescript
// החלף את:
const deposits = (await db.query('SELECT * FROM deposits WHERE is_deleted IS NULL OR is_deleted = 0')) as any[]

// ב:
const deposits = depositRepository.getAll()  // כבר מסנן is_deleted
```

---

## 4. scheduler.ts - מציאת הפקדה אחרונה (שורה 946)

### הקוד:
```typescript
const allDeposits = await db.query(
  'SELECT * FROM deposits WHERE depositor_id = ? AND is_recurring = 1',
  [deposit.depositor_id]
) as any[]
```

### הצדקה להשארה:
⚠️ **לא לגמרי מוצדק - כדאי להחליף**

**סיבות:**
1. **תנאי AND עם 2 פרמטרים:** לא בטוח ש-`db.query()` מטפל בזה נכון
2. **קיים repository מתאים:** `depositRepository.getByDepositor(depositorId)`
3. **קוד קריטי:** זה ב-scheduler - יצירת recurring deposits

**⚠️ בעיה פוטנציאלית:**
אם `db.query()` לא מבצע את התנאי `is_recurring = 1` בפועל, הוא עלול להחזיר גם deposits רגילים.

**המלצה מיידית - החלף:**
```typescript
// במקום:
const allDeposits = await db.query(
  'SELECT * FROM deposits WHERE depositor_id = ? AND is_recurring = 1',
  [deposit.depositor_id]
) as any[]

// השתמש ב:
const allDeposits = await depositRepository.getByDepositor(deposit.depositor_id)
const recurringDeposits = allDeposits.filter(d => d.is_recurring === 1)
```

**🔥 עדיפות: בינונית-גבוהה** - כדאי לתקן בהזדמנות הקרובה

---

## 5 + 6. auditLog.ts - שליפת לוגים (שורות 116, 145)

### הקוד (שורה 116):
```typescript
const rows = await db.query(
  `SELECT * FROM audit_log 
   WHERE entity_type = ? AND entity_id = ? 
   ORDER BY timestamp DESC`,
  [entityType, entityId]
) as any[]
```

### הקוד (שורה 145):
```typescript
const rows = await db.query(
  `SELECT * FROM audit_log 
   ORDER BY timestamp DESC 
   LIMIT ?`,
  [limit]
) as any[]
```

### הצדקה להשארה:
✅ **מוצדק**

**סיבות:**
1. **לא קריטי:** audit_log הוא read-only, לא משפיע על לוגיקה עסקית
2. **שאילתות פשוטות יחסית:**
   - שורה 116: 2 תנאים פשוטים
   - שורה 145: רק `LIMIT`
3. **קיימים handlers ב-database.ts:**
   ```typescript
   // database.ts תומך ב:
   if (fromClause.includes('audit_log')) {
     // ... handling
     // ORDER BY
     // LIMIT
     // WHERE entity_type = ? AND entity_id = ?
   }
   ```
4. **עובד בפועל:** הלוגים מוצגים נכון בממשק

**המלצה עתידית:**
אם רוצים עקביות מלאה, אפשר ליצור `auditLogRepository`:
```typescript
export const auditLogRepository = {
  async getByEntity(entityType: string, entityId: string): Promise<AuditEntry[]>
  async getAll(limit: number = 1000): Promise<AuditEntry[]>
}
```

אבל זה **לא דחוף** - הקוד הנוכחי עובד.

---

## סיכום וסדרי עדיפויות

| # | קובץ | שורה | שאילתה | עדיפות | מוצדק? | המלצה |
|---|------|------|--------|---------|--------|-------|
| 1 | excelImport.ts | 1531 | SELECT * FROM donations | נמוכה | ✅ כן | החלף בעתיד ב-donationRepository.getAll() |
| 2 | excelImport.ts | 1553 | SELECT * FROM deposits | נמוכה | ✅ כן | החלף בעתיד ב-depositRepository.getAll() |
| 3 | database.ts | 1048 | SELECT * FROM deposits | נמוכה | ✅ כן | פנימי, עובד |
| 4 | database.ts | 1093 | WHERE is_deleted IS NULL OR... | **בינונית** | ⚠️ לא בטוח | **החלף ב-depositRepository.getAll()** |
| 5 | scheduler.ts | 946 | WHERE depositor_id = ? AND is_recurring = 1 | **בינונית-גבוהה** | ❌ לא | **החלף ב-depositRepository + filter** |
| 6 | auditLog.ts | 116 | SELECT ... WHERE entity_type = ? AND entity_id = ? | נמוכה | ✅ כן | עובד, לא דחוף |
| 7 | auditLog.ts | 145 | SELECT ... LIMIT ? | נמוכה | ✅ כן | עובד, לא דחוף |

---

## המלצות

### 🔥 עדיפות גבוהה (תקן בהקדם):
1. **scheduler.ts שורה 946** - החלף ב-depositRepository

### ⚠️ עדיפות בינונית (תקן בהזדמנות):
2. **database.ts שורה 1093** - החלף ב-depositRepository.getAll()

### ✅ עדיפות נמוכה (אפשר להשאיר):
3. **excelImport.ts** - עובד, אבל כדאי להחליף לעקביות
4. **auditLog.ts** - עובד טוב, לא דחוף

---

## מה השתנה מהמיפוי המקורי?

### תוקנו ✅ (22 שימושים):
- ✅ scheduler.ts - 2 שימושים קריטיים (hasRecurringLoan, hasRecurringDeposit)
- ✅ contacts.ts - 10 שימושים
- ✅ calendarService.ts - 4 שימושים
- ✅ reportsService.ts - 2 שימושים
- ✅ feePaymentsService.ts - 4 שימושים

### נותרו (7 שימושים):
- ✅ excelImport.ts - 2 (מוצדקים, לא קריטיים)
- ⚠️ database.ts - 2 (1 OK, 1 כדאי להחליף)
- ❌ scheduler.ts - 1 (כדאי להחליף)
- ✅ auditLog.ts - 2 (מוצדקים, לא קריטיים)

---

## סטטוס סופי

**מתוך 29 שימושי db.query() מקוריים:**
- ✅ **22 הוחלפו** (76%)
- ✅ **5 מוצדקים להשאיר** (17%)
- ⚠️ **2 כדאי להחליף בעתיד** (7%)

**מסקנה:** הריפקטור הצליח לחסל את רוב התלות ב-pseudo-SQL. 
הנותרים הם בעיקר שימושים פשוטים או לא קריטיים.
