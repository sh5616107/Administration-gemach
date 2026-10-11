# תוכנית יישום: השלמת מערכת ריבוי קופות (Multi-Fund)

## סקירה

השלמת אינטגרציית FundSelector בדפים הראשיים של המערכת. הרכיב `FundSelector` כבר קיים ועובד, ומוסתר אוטומטית כשיש רק קופה אחת.

---

## Task 1: LoansTab.tsx — אינטגרציית בחירת קופה בטופס הלוואה

**קובץ**: `c:\proyecys\gemach system\src\components\loans\LoansTab.tsx`

### מצב נוכחי (מהקוד שנקרא)
- שורה 27: `import FundSelector from '../funds/FundSelector'` - ה-import כבר קיים ✅
- שורה 42: `const [selectedFundId, setSelectedFundId] = useState<string>('')` - state קיים ✅
- FundSelector עדיין **לא מוצג** בטופס
- לא מאותחל `selectedFundId` עם קופת ברירת מחדל
- לא מעביר `fund_id` ל-`loansService.create()` / `update()`

### שינויים נדרשים

**1. אתחול selectedFundId מקופת ברירת מחדל (קרוב לשורה 125)**

לפני:
```typescript
  const handleNewLoan = () => {
    setSelectedLoan(null)
    setSelectedFundId('')
    // Calculate default due date based on settings
```

אחרי:
```typescript
  const handleNewLoan = async () => {
    setSelectedLoan(null)
    
    // אתחול קופת ברירת מחדל
    try {
      const { fundsService } = await import('../../services/database')
      const defaultFund = await fundsService.getDefault()
      setSelectedFundId(defaultFund.id)
    } catch (error) {
      console.error('Error loading default fund:', error)
      setSelectedFundId('')
    }
    
    // Calculate default due date based on settings
```

**2. הצבת selectedFundId בעריכת הלוואה קיימת (קרוב לשורה 143)**

לפני:
```typescript
  const handleSelectLoan = (loan: Loan) => {
    setSelectedLoan(loan)
    setFormData(loan)
    setSelectedFundId(loan.fund_id || '')
  }
```

אחרי — הקוד כבר תקין ✅ (שורה 143 כוללת `setSelectedFundId(loan.fund_id || '')`)

**3. הוספת FundSelector לטופס (קרוב לשורה 400-450, לאחר שדה loan_type)**

חפש את הקוד:
```typescript
          <FormControl fullWidth>
            <InputLabel>סוג הלוואה</InputLabel>
            <Select
              value={formData.loan_type}
              label="סוג הלוואה"
              onChange={(e) => setFormData({ ...formData, loan_type: e.target.value as 'flexible' | 'fixed' })}
            >
              <MenuItem value="flexible">גמישה</MenuItem>
              <MenuItem value="fixed">קבועה</MenuItem>
            </Select>
          </FormControl>
```

הוסף **מיד אחריו**:
```typescript
          {/* בחירת קופה */}
          <FundSelector 
            value={selectedFundId} 
            onChange={setSelectedFundId}
            required={false}
          />
```

**4. העברת fund_id ל-create/update בשמירת הלוואה (קרוב לשורה 180-220)**

בתוך `handleSave`, לפני קריאה ל-`loansService.create()`:

לפני:
```typescript
        const loanData: any = {
          ...formData,
          recurring_loan_number: recurringLoanNumber,
          recurring_loan_count: recurringLoanCount,
          recurring_series_id: formData.is_recurring === 1 ? crypto.randomUUID() : undefined,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        }
```

אחרי:
```typescript
        const loanData: any = {
          ...formData,
          fund_id: selectedFundId || undefined, // העברת הקופה שנבחרה
          recurring_loan_number: recurringLoanNumber,
          recurring_loan_count: recurringLoanCount,
          recurring_series_id: formData.is_recurring === 1 ? crypto.randomUUID() : undefined,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        }
```

בעדכון הלוואה קיימת (קרוב לשורה 162-180):

לפני:
```typescript
        await loansService.update(selectedLoan.id, {
          ...formData,
          recurring_loan_number: recurringLoanNumber,
          recurring_loan_count: recurringLoanCount,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        })
```

אחרי:
```typescript
        await loansService.update(selectedLoan.id, {
          ...formData,
          fund_id: selectedFundId || undefined,
          recurring_loan_number: recurringLoanNumber,
          recurring_loan_count: recurringLoanCount,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        })
```

### אימות
- **הרץ**: `npm run tauri:dev`
- **בדוק**:
  1. פתח מסך Loans
  2. לחץ "הלוואה חדשה"
  3. וודא שמופיע FundSelector בטופס (אם יש >1 קופות במערכת)
  4. בחר קופה ושמור
  5. פתח הלוואה לעריכה - וודא שהקופה הנכונה מוצגת
  6. בדוק שהלוואה נשמרת עם `fund_id` נכון ב-database

---

## Task 2: Donations.tsx — אינטגרציית בחירת קופה בתרומות

**קובץ**: `c:\proyecys\gemach system\src\pages\Donations.tsx`

### מצב נוכחי
- שורה 40: `import FundSelector from '../components/funds/FundSelector'` ✅
- שורה 68: `const [selectedFundId, setSelectedFundId] = useState<string>('')` ✅ (בטופס תרומה)
- FundSelector עדיין **לא מוצג** בדיאלוג
- לא מאותחל `selectedFundId` עם קופת ברירת מחדל
- לא כולל `fund_id` ב-INSERT/UPDATE queries
- **חסר פילטר קופה** ברשימת התרומות (כמו שיש ב-Deposits)

### שינויים נדרשים

**1. הוספת state לפילטר קופה (קרוב לשורה 80-90)**

לפני:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
  });
```

אחרי:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
  });
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all'); // פילטר קופה
  const [activeFunds, setActiveFunds] = useState<any[]>([]); // רשימת קופות פעילות
```

**2. טעינת קופות פעילות (בתוך useEffect הראשון, קרוב לשורה 94)**

לפני:
```typescript
  useEffect(() => {
    loadDonors();
  }, []);
```

אחרי:
```typescript
  useEffect(() => {
    loadDonors();
    loadActiveFunds();
  }, []);

  const loadActiveFunds = async () => {
    try {
      const { fundsService } = await import('../services/database');
      const funds = await fundsService.getActive();
      setActiveFunds(funds);
    } catch (error) {
      console.error('Error loading funds:', error);
    }
  };
```

**3. אתחול selectedFundId בפתיחת תרומה חדשה (קרוב לשורה 197)**

לפני:
```typescript
  const handleOpenNewDonation = () => {
    setActiveDonation(null);
    setDonationForm({
      amount: 0,
      donation_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setSelectedFundId('');
    setPaymentMethod({ payment_method: '' });
    setDonationDialogOpen(true);
  };
```

אחרי:
```typescript
  const handleOpenNewDonation = async () => {
    setActiveDonation(null);
    setDonationForm({
      amount: 0,
      donation_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    
    // אתחול קופת ברירת מחדל
    try {
      const { fundsService } = await import('../services/database');
      const defaultFund = await fundsService.getDefault();
      setSelectedFundId(defaultFund.id);
    } catch (error) {
      console.error('Error loading default fund:', error);
      setSelectedFundId('');
    }
    
    setPaymentMethod({ payment_method: '' });
    setDonationDialogOpen(true);
  };
```

**4. הצבת fund_id בעריכת תרומה (קרוב לשורה 207)**

לפני:
```typescript
  const handleOpenDonation = (donation: Donation) => {
    setActiveDonation(donation);
    setDonationForm({
      amount: donation.amount,
      donation_date: donation.donation_date,
      notes: donation.notes || '',
    });
    
    if (donation.payment_details) {
      try {
        setPaymentMethod(JSON.parse(donation.payment_details));
      } catch {
        setPaymentMethod({ payment_method: (donation.payment_method || '') as import('../components/PaymentMethodSelect').PaymentMethodType });
      }
    }
    
    setDonationDialogOpen(true);
  };
```

אחרי:
```typescript
  const handleOpenDonation = (donation: Donation) => {
    setActiveDonation(donation);
    setDonationForm({
      amount: donation.amount,
      donation_date: donation.donation_date,
      notes: donation.notes || '',
    });
    
    // טעינת קופה מהתרומה הקיימת
    setSelectedFundId((donation as any).fund_id || '');
    
    if (donation.payment_details) {
      try {
        setPaymentMethod(JSON.parse(donation.payment_details));
      } catch {
        setPaymentMethod({ payment_method: (donation.payment_method || '') as import('../components/PaymentMethodSelect').PaymentMethodType });
      }
    }
    
    setDonationDialogOpen(true);
  };
```

**5. הוספת FundSelector לדיאלוג תרומה (בתוך Drawer, קרוב לשורות 650-750, בין amount ל-date)**

חפש את הקוד:
```typescript
              <AmountInput
                value={donationForm.amount}
                onChange={(val) => setDonationForm({ ...donationForm, amount: val })}
                label="סכום התרומה"
                required
              />

              <TextField
                fullWidth
                label="תאריך תרומה"
                type="date"
```

הוסף **בין שני השדות**:
```typescript
              <AmountInput
                value={donationForm.amount}
                onChange={(val) => setDonationForm({ ...donationForm, amount: val })}
                label="סכום התרומה"
                required
              />

              {/* בחירת קופה */}
              <FundSelector 
                value={selectedFundId} 
                onChange={setSelectedFundId}
                required={false}
              />

              <TextField
                fullWidth
                label="תאריך תרומה"
                type="date"
```

**6. עדכון INSERT query (קרוב לשורה 245-265)**

לפני:
```typescript
        const insertFields = ['donor_id', 'amount', 'donation_date', 'notes', 'payment_method', 'payment_details'];
        const insertPlaceholders = ['?', '?', '?', '?', '?', '?'];
        const insertValues: any[] = [
          selectedDonor.id,
          donationForm.amount,
          donationForm.donation_date,
          donationForm.notes,
          paymentMethod.payment_method,
          JSON.stringify(paymentMethod)
        ];
        
        // הוספת fund_id אם נבחר
        if (selectedFundId) {
          insertFields.push('fund_id');
          insertPlaceholders.push('?');
          insertValues.push(selectedFundId);
        }
```

**הערה**: הקוד הזה כבר נכתב נכון ב-Donations.tsx (שורות 245-265) ✅

**7. עדכון UPDATE query (קרוב לשורה 230-245)**

לפני:
```typescript
        const updateFields = [
          'amount = ?',
          'donation_date = ?',
          'notes = ?',
          'payment_method = ?',
          'payment_details = ?'
        ];
        const updateValues: any[] = [
          donationForm.amount,
          donationForm.donation_date,
          donationForm.notes,
          paymentMethod.payment_method,
          JSON.stringify(paymentMethod)
        ];
        
        // הוספת fund_id אם נבחר
        if (selectedFundId) {
          updateFields.push('fund_id = ?');
          updateValues.push(selectedFundId);
        }
```

**הערה**: הקוד הזה כבר נכתב נכון ב-Donations.tsx (שורות 230-245) ✅

**8. הוספת פילטר קופה בממשק (קרוב לשורות 500-550, בתוך Collapse של Filters)**

חפש את סוף פאנל הסינון (אחרי הכפתור "נקה סינון"):
```typescript
                    <Grid item xs={12} sm={6} md={3}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                      >
                        נקה סינון
                      </Button>
                    </Grid>
```

הוסף **לפניו**:
```typescript
                    {/* פילטר קופה - מוצג רק אם יש יותר מקופה אחת */}
                    {activeFunds.length > 1 && (
                      <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>קופה</InputLabel>
                          <Select
                            value={selectedFundFilter}
                            label="קופה"
                            onChange={(e) => setSelectedFundFilter(e.target.value)}
                          >
                            <MenuItem value="all">כל הקופות</MenuItem>
                            {activeFunds.map((fund) => (
                              <MenuItem key={fund.id} value={fund.id}>
                                {fund.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
```

**9. עדכון filteredDonations כדי לכלול סינון לפי קופה (קרוב לשורה 181)**

לפני:
```typescript
  const filteredDonations = useMemo(() => {
    return donations.filter(donation => {
      if (filters.dateFrom && donation.donation_date < filters.dateFrom) return false;
      if (filters.dateTo && donation.donation_date > filters.dateTo) return false;
      if (filters.amountFrom && donation.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && donation.amount > parseFloat(filters.amountTo)) return false;
      return true;
    });
  }, [donations, filters]);
```

אחרי:
```typescript
  const filteredDonations = useMemo(() => {
    return donations.filter(donation => {
      if (filters.dateFrom && donation.donation_date < filters.dateFrom) return false;
      if (filters.dateTo && donation.donation_date > filters.dateTo) return false;
      if (filters.amountFrom && donation.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && donation.amount > parseFloat(filters.amountTo)) return false;
      
      // סינון לפי קופה
      if (selectedFundFilter !== 'all' && (donation as any).fund_id !== selectedFundFilter) return false;
      
      return true;
    });
  }, [donations, filters, selectedFundFilter]);
```

**10. עדכון hasActiveFilters (קרוב לשורה 194)**

לפני:
```typescript
  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo;
```

אחרי:
```typescript
  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo || (selectedFundFilter !== 'all' && activeFunds.length > 1);
```

**11. עדכון clearFilters (קרוב לשורה 196)**

לפני:
```typescript
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
    });
  };
```

אחרי:
```typescript
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
    });
    setSelectedFundFilter('all');
  };
```

### הוספת Imports נדרשים
בראש הקובץ (קרוב לשורה 17-27), הוסף:
```typescript
import {
  // ... קיימים
  FormControl,  // אם לא קיים
  InputLabel,   // אם לא קיים
  Select,       // אם לא קיים
  MenuItem,     // אם לא קיים
} from '@mui/material';
```

### אימות
- **הרץ**: `npm run tauri:dev`
- **בדוק**:
  1. פתח מסך Donations
  2. לחץ "תרומה חדשה"
  3. וודא שמופיע FundSelector (אם יש >1 קופות)
  4. בחר קופה ושמור
  5. פתח תרומה לעריכה - וודא שהקופה הנכונה מוצגת
  6. אם יש >1 קופות - וודא שמופיע פילטר קופה בפאנל הסינון
  7. נסה לסנן לפי קופה ספציפית

---

## Task 3: Deposits.tsx — אינטגרציית בחירת קופה בהפקדות

**קובץ**: `c:\proyecys\gemach system\src\pages\Deposits.tsx`

### מצב נוכחי
- שורה 49: `import FundSelector from '../components/funds/FundSelector'` ✅
- FundSelector עדיין **לא מוצג** ב-DepositSidePanel
- לא מאותחל `selectedFundId` עם קופת ברירת מחדל
- לא כולל `fund_id` ב-INSERT/UPDATE queries
- **חסר פילטר קופה** ברשימת ההפקדות (כמו ב-Donations)

### שינויים נדרשים

**הערה**: הפקדות משתמשות ב-DepositSidePanel נפרד — צריך לעדכן גם את הקובץ `src/components/donations/DepositSidePanel.tsx`.

**שינויים ב-Deposits.tsx:**

**1. הוספת state לפילטר קופה ורשימת קופות (קרוב לשורה 100-120)**

לפני:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'withdrawn',
    periodType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });
```

אחרי:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'withdrawn',
    periodType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all'); // פילטר קופה
  const [activeFunds, setActiveFunds] = useState<any[]>([]); // רשימת קופות פעילות
```

**2. טעינת קופות פעילות (בתוך useEffect הראשון)**

לפני:
```typescript
  useEffect(() => {
    loadDepositors();
  }, []);
```

אחרי:
```typescript
  useEffect(() => {
    loadDepositors();
    loadActiveFunds();
  }, []);

  const loadActiveFunds = async () => {
    try {
      const { fundsService } = await import('../services/database');
      const funds = await fundsService.getActive();
      setActiveFunds(funds);
    } catch (error) {
      console.error('Error loading funds:', error);
    }
  };
```

**3. הוספת פילטר קופה בממשק (בתוך Collapse של Filters, דומה ל-Donations)**

חפש את סוף פאנל הסינון ב-Deposits.tsx והוסף לפני הכפתור "נקה סינון":
```typescript
                    {/* פילטר קופה - מוצג רק אם יש יותר מקופה אחת */}
                    {activeFunds.length > 1 && (
                      <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>קופה</InputLabel>
                          <Select
                            value={selectedFundFilter}
                            label="קופה"
                            onChange={(e) => setSelectedFundFilter(e.target.value)}
                          >
                            <MenuItem value="all">כל הקופות</MenuItem>
                            {activeFunds.map((fund) => (
                              <MenuItem key={fund.id} value={fund.id}>
                                {fund.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
```

**4. עדכון filteredDeposits (דומה ל-Donations)**

חפש את `filteredDeposits` והוסף סינון לפי קופה:
```typescript
  const filteredDeposits = useMemo(() => {
    return deposits.filter(deposit => {
      // ... סינונים קיימים ...
      
      // סינון לפי קופה
      if (selectedFundFilter !== 'all' && (deposit as any).fund_id !== selectedFundFilter) return false;
      
      return true;
    });
  }, [deposits, filters, selectedFundFilter]);
```

**5. עדכון hasActiveFilters ו-clearFilters**

הוסף `selectedFundFilter` ל-hasActiveFilters ול-clearFilters (דומה ל-Donations).

**שינויים ב-DepositSidePanel.tsx:**

**קובץ**: `c:\proyecys\gemach system\src\components\donations\DepositSidePanel.tsx`

**1. הוספת props לקבלת/עדכון selectedFundId**

בהתחלת הקובץ, עדכן את ה-interface:
```typescript
interface DepositSidePanelProps {
  // ... props קיימים
  selectedFundId: string
  onFundChange: (fundId: string) => void
}
```

**2. import FundSelector**
```typescript
import FundSelector from '../funds/FundSelector'
```

**3. אתחול selectedFundId בהפקדה חדשה**

בתוך useEffect שטוען הפקדה קיימת או מאתחל חדשה, הוסף:
```typescript
  useEffect(() => {
    const initForm = async () => {
      if (deposit) {
        // הפקדה קיימת - טען את fund_id
        onFundChange((deposit as any).fund_id || '')
        // ... טעינת שאר הנתונים
      } else {
        // הפקדה חדשה - קופת ברירת מחדל
        try {
          const { fundsService } = await import('../../services/database')
          const defaultFund = await fundsService.getDefault()
          onFundChange(defaultFund.id)
        } catch (error) {
          console.error('Error loading default fund:', error)
          onFundChange('')
        }
      }
    }
    initForm()
  }, [deposit])
```

**4. הוספת FundSelector לטופס**

בתוך הטופס, אחרי שדה amount ולפני deposit_date:
```typescript
          <AmountInput
            value={formData.amount}
            onChange={(val) => setFormData({ ...formData, amount: val })}
            label="סכום ההפקדה"
            required
          />

          {/* בחירת קופה */}
          <FundSelector 
            value={selectedFundId} 
            onChange={onFundChange}
            required={false}
          />

          <TextField
            fullWidth
            label="תאריך הפקדה"
            type="date"
```

**5. עדכון INSERT/UPDATE queries**

בתוך `handleSave`, הוסף `fund_id` ל-INSERT ול-UPDATE (דומה ל-Donations).

**6. עדכון הקריאה מ-Deposits.tsx**

חפש את `<DepositSidePanel>` ב-Deposits.tsx והעבר props:
```typescript
      <DepositSidePanel
        open={depositPanelOpen}
        deposit={activeDeposit}
        depositorId={selectedDepositor?.id || ''}
        onClose={() => setDepositPanelOpen(false)}
        onSaved={handleDepositSaved}
        selectedFundId={selectedFundId}
        onFundChange={setSelectedFundId}
      />
```

**7. הוספת state ב-Deposits.tsx**

ליד state אחרים:
```typescript
  const [selectedFundId, setSelectedFundId] = useState<string>('')
```

### אימות
- **הרץ**: `npm run tauri:dev`
- **בדוק**:
  1. פתח מסך Deposits
  2. לחץ "הפקדה חדשה"
  3. וודא שמופיע FundSelector (אם יש >1 קופות)
  4. בחר קופה ושמור
  5. פתח הפקדה לעריכה - וודא שהקופה הנכונה מוצגת
  6. אם יש >1 קופות - וודא שמופיע פילטר קופה בפאנל הסינון
  7. נסה לסנן לפי קופה ספציפית

---

## Task 4: Dashboard.tsx — הצגת פירוט לפי קופה

**קובץ**: `c:\proyecys\gemach system\src\pages\Dashboard.tsx`

### מצב נוכחי
- `statsService.getDashboardStats()` כבר מחזיר `byFund` array (לפי האפיון)
- Dashboard עדיין לא מציג את הפירוט לפי קופה

### שינויים נדרשים

**1. הוספת state לקופות (קרוב לשורה 50-60)**

```typescript
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null)
  const [activeBorrowers, setActiveBorrowers] = useState<ActiveBorrower[]>([])
  const [fundStats, setFundStats] = useState<Array<{
    fundId: string
    fundName: string
    activeLoans: { count: number; total: number }
    plannedLoans: { count: number; total: number }
    availableCash: number
  }>>([])
```

**2. עדכון loadData לטעינת נתוני קופות (קרוב לשורה 100-110)**

לפני:
```typescript
  const loadData = async () => {
    try {
      const [dashboardStats, waitlistData, borrowers] = await Promise.all([
        statsService.getDashboardStats(),
        waitlistService.getStats(),
        statsService.getActiveBorrowers(),
      ])
      setStats(dashboardStats)
      setWaitlistStats(waitlistData)
      setActiveBorrowers(borrowers as ActiveBorrower[])
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
  }
```

אחרי:
```typescript
  const loadData = async () => {
    try {
      const [dashboardStats, waitlistData, borrowers] = await Promise.all([
        statsService.getDashboardStats(),
        waitlistService.getStats(),
        statsService.getActiveBorrowers(),
      ])
      setStats(dashboardStats)
      setWaitlistStats(waitlistData)
      setActiveBorrowers(borrowers as ActiveBorrower[])
      setFundStats((dashboardStats as any).byFund || [])
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    }
  }
```

**3. הוספת section "פירוט לפי קופה" (לפני "Active Borrowers Table", קרוב לשורה 450-550)**

חפש את:
```typescript
      {/* Active Borrowers Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('dashboard.activeBorrowers')}
          </Typography>
```

הוסף **לפניו**:
```typescript
      {/* פירוט לפי קופה - מוצג רק אם יש יותר מקופה אחת */}
      {fundStats.length > 1 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
            פירוט לפי קופה
          </Typography>
          <Grid container spacing={3}>
            {fundStats.map((fund) => (
              <Grid item xs={12} sm={6} md={4} key={fund.fundId}>
                <Card sx={{ height: '100%', borderRight: '4px solid', borderColor: 'primary.main' }}>
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} color="primary" sx={{ mb: 2 }}>
                      {fund.fundName}
                    </Typography>
                    
                    <Stack spacing={1.5}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          הלוואות פעילות:
                        </Typography>
                        <Box sx={{ textAlign: 'left' }}>
                          <Typography variant="body1" fontWeight={500}>
                            {fund.activeLoans.count}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(fund.activeLoans.total)}
                          </Typography>
                        </Box>
                      </Box>

                      <Divider />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                          כסף זמין:
                        </Typography>
                        <Typography 
                          variant="h6" 
                          fontWeight={700}
                          color={fund.availableCash >= 0 ? 'success.main' : 'error.main'}
                        >
                          {formatCurrency(fund.availableCash)}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Active Borrowers Table */}
```

**4. הוספת Imports נדרשים**

בראש הקובץ, וודא שיש:
```typescript
import {
  // ... קיימים
  Divider,  // אם לא קיים
  Stack,    // אם לא קיים
} from '@mui/material'
```

### אימות
- **הרץ**: `npm run tauri:dev`
- **בדוק**:
  1. פתח Dashboard
  2. אם יש יותר מקופה אחת במערכת - וודא שמופיע section "פירוט לפי קופה"
  3. כל קופה צריכה להציג:
     - שם הקופה
     - מספר הלוואות פעילות וסכום
     - כסף זמין (בצבע ירוק/אדום)
  4. אם יש רק קופה אחת - הסעקשן לא אמור להופיע

---

## Task 5: UnifiedLoansPage.tsx — פילטר קופה בדף הלוואות מאוחד

**קובץ**: `c:\proyecys\gemach system\src\pages\UnifiedLoansPage.tsx`

### מצב נוכחי
- דף הלוואות מאוחד עם borrower profile + loans as cards
- אין פילטר קופה

### שינויים נדרשים

**1. הוספת state לפילטר קופה ורשימת קופות (קרוב לשורה 100-120)**

לפני:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'paid',
    loanType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });
```

אחרי:
```typescript
  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'paid',
    loanType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all'); // פילטר קופה
  const [activeFunds, setActiveFunds] = useState<any[]>([]); // רשימת קופות פעילות
```

**2. טעינת קופות פעילות (בתוך useEffect הראשון)**

לפני:
```typescript
  useEffect(() => {
    loadBorrowers();
  }, []);
```

אחרי:
```typescript
  useEffect(() => {
    loadBorrowers();
    loadActiveFunds();
  }, []);

  const loadActiveFunds = async () => {
    try {
      const { fundsService } = await import('../services/database');
      const funds = await fundsService.getActive();
      setActiveFunds(funds);
    } catch (error) {
      console.error('Error loading funds:', error);
    }
  };
```

**3. הוספת פילטר קופה בממשק (בתוך Collapse של Filters)**

חפש את סוף פאנל הסינון ב-UnifiedLoansPage.tsx והוסף לפני הכפתור "נקה סינון":
```typescript
                    {/* פילטר קופה - מוצג רק אם יש יותר מקופה אחת */}
                    {activeFunds.length > 1 && (
                      <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>קופה</InputLabel>
                          <Select
                            value={selectedFundFilter}
                            label="קופה"
                            onChange={(e) => setSelectedFundFilter(e.target.value)}
                          >
                            <MenuItem value="all">כל הקופות</MenuItem>
                            {activeFunds.map((fund) => (
                              <MenuItem key={fund.id} value={fund.id}>
                                {fund.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
```

**4. עדכון filteredLoans (קרוב לשורה 250-280)**

לפני:
```typescript
  const filteredLoans = useMemo(() => {
    return loans.filter(loan => {
      const balance = loan.amount - (loan.total_repaid ?? 0);
      const isPaid = balance <= 0;

      // Date filter
      if (filters.dateFrom && loan.loan_date < filters.dateFrom) return false;
      if (filters.dateTo && loan.loan_date > filters.dateTo) return false;

      // Amount filter
      if (filters.amountFrom && loan.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && loan.amount > parseFloat(filters.amountTo)) return false;

      // Status filter
      if (filters.status === 'active' && isPaid) return false;
      if (filters.status === 'paid' && !isPaid) return false;

      // Loan type filter
      if (filters.loanType !== 'all' && loan.loan_type !== filters.loanType) return false;

      // Recurring filter
      if (filters.isRecurring === 'yes' && loan.is_recurring !== 1) return false;
      if (filters.isRecurring === 'no' && loan.is_recurring === 1) return false;

      return true;
    });
  }, [loans, filters]);
```

אחרי:
```typescript
  const filteredLoans = useMemo(() => {
    return loans.filter(loan => {
      const balance = loan.amount - (loan.total_repaid ?? 0);
      const isPaid = balance <= 0;

      // Date filter
      if (filters.dateFrom && loan.loan_date < filters.dateFrom) return false;
      if (filters.dateTo && loan.loan_date > filters.dateTo) return false;

      // Amount filter
      if (filters.amountFrom && loan.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && loan.amount > parseFloat(filters.amountTo)) return false;

      // Status filter
      if (filters.status === 'active' && isPaid) return false;
      if (filters.status === 'paid' && !isPaid) return false;

      // Loan type filter
      if (filters.loanType !== 'all' && loan.loan_type !== filters.loanType) return false;

      // Recurring filter
      if (filters.isRecurring === 'yes' && loan.is_recurring !== 1) return false;
      if (filters.isRecurring === 'no' && loan.is_recurring === 1) return false;

      // סינון לפי קופה
      if (selectedFundFilter !== 'all' && loan.fund_id !== selectedFundFilter) return false;

      return true;
    });
  }, [loans, filters, selectedFundFilter]);
```

**5. עדכון hasActiveFilters**

לפני:
```typescript
  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo || 
    filters.status !== 'all' || filters.loanType !== 'all' || filters.isRecurring !== 'all';
```

אחרי:
```typescript
  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo || 
    filters.status !== 'all' || filters.loanType !== 'all' || filters.isRecurring !== 'all' ||
    (selectedFundFilter !== 'all' && activeFunds.length > 1);
```

**6. עדכון clearFilters**

לפני:
```typescript
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
      status: 'all',
      loanType: 'all',
      isRecurring: 'all',
    });
  };
```

אחרי:
```typescript
  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
      status: 'all',
      loanType: 'all',
      isRecurring: 'all',
    });
    setSelectedFundFilter('all');
  };
```

### הוספת Imports נדרשים
בראש הקובץ, וודא שיש:
```typescript
import {
  // ... קיימים
  FormControl,  // אם לא קיים
  InputLabel,   // אם לא קיים
  Select,       // אם לא קיים
  MenuItem,     // אם לא קיים
} from '@mui/material';
```

### אימות
- **הרץ**: `npm run tauri:dev`
- **בדוק**:
  1. פתח מסך Loans (UnifiedLoansPage)
  2. בחר לווה עם הלוואות
  3. אם יש >1 קופות - וודא שמופיע פילטר קופה בפאנל הסינון
  4. נסה לסנן לפי קופה ספציפית
  5. וודא שמוצגות רק הלוואות מהקופה שנבחרה

---

## אסטרטגיית בדיקה כוללת

לאחר השלמת כל 5 ה-Tasks:

1. **צור קופה נוספת** (אם אין):
   - פתח Settings → Funds
   - צור קופה חדשה בשם "קופת בדיקה"

2. **בדוק יצירה עם בחירת קופה**:
   - צור הלוואה חדשה ובחר "קופת בדיקה"
   - צור תרומה חדשה ובחר "קופת בדיקה"
   - צור הפקדה חדשה ובחר "קופת בדיקה"

3. **בדוק עריכה**:
   - פתח כל פריט לעריכה
   - וודא שהקופה הנכונה מוצגת ב-FundSelector

4. **בדוק פילטרים**:
   - ב-Donations: סנן לפי "קופת בדיקה" - וודא שמוצגות רק תרומות מהקופה
   - ב-Deposits: סנן לפי "קופת בדיקה" - וודא שמוצגות רק הפקדות מהקופה
   - ב-UnifiedLoansPage: סנן לפי "קופת בדיקה" - וודא שמוצגות רק הלוואות מהקופה

5. **בדוק Dashboard**:
   - פתח Dashboard
   - וודא שמופיע section "פירוט לפי קופה"
   - וודא שכל קופה מציגה נתונים נכונים

6. **בדוק עם קופה אחת**:
   - השבת את "קופת בדיקה" (Settings → Funds → Deactivate)
   - וודא שכל ה-FundSelectors נעלמים (הרכיב מוסתר אוטומטית)
   - וודא שכל הפילטרים נעלמים
   - וודא שה-section "פירוט לפי קופה" ב-Dashboard נעלם

7. **הרץ בדיקות**:
   ```bash
   npm test
   ```
   וודא שכל הבדיקות עוברות.

---

## סיכום

תוכנית זו משלימה את אינטגרציית מערכת ריבוי הקופות ב-5 דפים עיקריים:
1. ✅ LoansTab.tsx - הוספת FundSelector לטופס הלוואה
2. ✅ Donations.tsx - הוספת FundSelector + פילטר קופה
3. ✅ Deposits.tsx - הוספת FundSelector + פילטר קופה
4. ✅ Dashboard.tsx - הצגת פירוט לפי קופה
5. ✅ UnifiedLoansPage.tsx - פילטר קופה

כל השינויים מבוססים על קריאת הקוד הקיים ומתאימים לסגנון ולמבנה של הפרויקט.
