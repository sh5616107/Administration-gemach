import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Description as DocIcon,
  Email as EmailIcon,
  History as HistoryIcon,
  Autorenew as AutorenewIcon,
  EditNote as EditNoteIcon,
} from '@mui/icons-material'
import { db, depositWithdrawalsService, type DepositWithdrawal } from '../../services/database'
import { generateDepositDocument, openEmailWithDocument, createDepositEmailData, EmailProvider } from '../../services/documents'
import { useSettings } from '../../hooks/useSettings'
import { formatDisplayDate, toHebrewDate } from '../../utils/dateUtils'
import PaymentMethodSelect, { PaymentMethodData } from '../PaymentMethodSelect'
import AmountInput from '../AmountInput'
import { EditRecurringDialog } from '../recurring/EditRecurringDialog'

interface Depositor {
  id: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
  email?: string
}

interface Deposit {
  id: number
  depositor_id: number
  amount: number
  deposit_date: string
  period_type: string
  due_date: string
  is_recurring: number
  recurring_day?: number
  recurring_months?: number
  recurring_deposit_number?: number
  recurring_deposit_count?: number
  notes: string
  status: string
  withdrawal_date?: string
  withdrawn_amount?: number
  withdrawal_payment_method?: string
  withdrawal_payment_details?: string
}

interface DepositsTabProps {
  selectedDepositor: Depositor | null
  onSelectDepositor?: (depositor: Depositor | null) => void
  initialDepositId?: number | null
}

export default function DepositsTab({ selectedDepositor, onSelectDepositor, initialDepositId }: DepositsTabProps) {
  const { settings } = useSettings()
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [depositors, setDepositors] = useState<Depositor[]>([])
  const [formData, setFormData] = useState({
    amount: 0,
    deposit_date: new Date().toISOString().split('T')[0],
    period_type: 'flexible',
    due_date: '',
    is_recurring: 0,
    recurring_day: new Date().getDate(),
    recurring_months: 0,
    notes: '',
  })
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editAmount, setEditAmount] = useState(0)
  const [editDate, setEditDate] = useState('')
  const [editPeriodType, setEditPeriodType] = useState('flexible')
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editIsRecurring, setEditIsRecurring] = useState(0)
  const [editRecurringDay, setEditRecurringDay] = useState(1)
  const [editRecurringMonths, setEditRecurringMonths] = useState(0)
  const [editWithdrawalDate, setEditWithdrawalDate] = useState('')
  const [editWithdrawnAmount, setEditWithdrawnAmount] = useState(0)
  const [editWithdrawalPaymentMethod, setEditWithdrawalPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false)
  const [withdrawingDeposit, setWithdrawingDeposit] = useState<Deposit | null>(null)
  const [withdrawPaymentMethod, setWithdrawPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })
  const [withdrawAmount, setWithdrawAmount] = useState(0)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [selectedDepositForHistory, setSelectedDepositForHistory] = useState<Deposit | null>(null)
  const [withdrawalHistory, setWithdrawalHistory] = useState<DepositWithdrawal[]>([])

  // Recurring items dialogs
  const [editRecurringDialogOpen, setEditRecurringDialogOpen] = useState(false)
  const [selectedRecurringDepositId, setSelectedRecurringDepositId] = useState<number | null>(null)

  useEffect(() => {
    loadDepositors()
  }, [])

  useEffect(() => {
    if (selectedDepositor) {
      loadDeposits()
    } else {
      setDeposits([])
    }
  }, [selectedDepositor])

  // Handle initial deposit selection
  useEffect(() => {
    const loadDepositById = async () => {
      if (initialDepositId && depositors.length > 0) {
        try {
          const allDeposits = await db.query('SELECT * FROM deposits') as Deposit[]
          const deposit = allDeposits.find(d => d.id === initialDepositId)
          if (deposit) {
            // Find and select the depositor
            const depositor = depositors.find(d => d.id === deposit.depositor_id)
            if (depositor && onSelectDepositor) {
              onSelectDepositor(depositor)
              // Wait for deposits to load, then scroll to the deposit
              setTimeout(() => {
                const depositElement = document.getElementById(`deposit-${initialDepositId}`)
                if (depositElement) {
                  depositElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  depositElement.style.backgroundColor = '#fff3cd'
                  setTimeout(() => {
                    depositElement.style.backgroundColor = ''
                  }, 2000)
                }
              }, 300)
            }
          }
        } catch (error) {
          console.error('Error loading deposit:', error)
        }
      }
    }
    loadDepositById()
  }, [initialDepositId, depositors, onSelectDepositor])

  const loadDepositors = async () => {
    try {
      const deps = await db.query('SELECT * FROM depositors') as Depositor[]
      setDepositors(deps.sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ))
    } catch (error) {
      console.error('Error loading depositors:', error)
    }
  }

  const loadDeposits = async () => {
    if (!selectedDepositor) return
    try {
      const data = await db.query(`
        SELECT * FROM deposits WHERE depositor_id = ? ORDER BY deposit_date DESC
      `, [selectedDepositor.id]) as Deposit[]
      
      // חישוב סכום נמשך מההיסטוריה לכל הפקדה
      const depositsWithWithdrawals = await Promise.all(
        data.map(async (deposit) => {
          const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
          const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
          return {
            ...deposit,
            withdrawn_amount: totalWithdrawn
          }
        })
      )
      
      setDeposits(depositsWithWithdrawals)
    } catch (error) {
      console.error('Error loading deposits:', error)
    }
  }

  // חישוב תאריך ההפקדה הראשונה בהפקדה מחזורית
  const calculateFirstRecurringDepositDate = (recurringDay: number): string => {
    const today = new Date()
    const currentDay = today.getDate()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    
    // בדיקה אם היום קיים בחודש הנוכחי
    const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const effectiveDayThisMonth = Math.min(recurringDay, lastDayOfCurrentMonth)
    
    // אם היום בחודש עוד לא הגיע (והוא קיים בחודש הנוכחי) - ההפקדה תהיה החודש
    if (effectiveDayThisMonth > currentDay) {
      return `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(effectiveDayThisMonth).padStart(2, '0')}`
    }
    
    // אם היום בחודש כבר עבר או שווה - ההפקדה תהיה בחודש הבא
    // טיפול בחודשים קצרים (למשל 31 בפברואר)
    const nextMonth = currentMonth + 1
    const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear
    const adjustedMonth = nextMonth > 11 ? 0 : nextMonth
    const lastDayOfNextMonth = new Date(nextYear, adjustedMonth + 1, 0).getDate()
    const effectiveDay = Math.min(recurringDay, lastDayOfNextMonth)
    return `${nextYear}-${String(adjustedMonth + 1).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`
  }

  const handleSave = async () => {
    if (!selectedDepositor) {
      setSnackbar({ open: true, message: 'נא לבחור מפקיד תחילה', severity: 'error' })
      return
    }
    if (!formData.amount) {
      setSnackbar({ open: true, message: 'נא להזין סכום', severity: 'error' })
      return
    }

    // ולידציה: תאריך סיום לא יכול להיות לפני תאריך ההפקדה
    if (formData.period_type === 'fixed' && formData.due_date && formData.due_date < formData.deposit_date) {
      setSnackbar({ open: true, message: 'תאריך סיום לא יכול להיות לפני תאריך ההפקדה', severity: 'error' })
      return
    }

    try {
      // חישוב recurring_deposit_count מ-recurring_months
      const recurringDepositNumber = formData.is_recurring ? 1 : undefined
      const recurringDepositCount = formData.is_recurring && formData.recurring_months > 0 
        ? formData.recurring_months + 1 
        : undefined
      
      // חישוב סטטוס: אם תאריך ההפקדה בעתיד - מתוכננת, אחרת - פעילה
      const today = new Date().toISOString().split('T')[0]
      const status = formData.deposit_date > today ? 'planned' : 'active'
      
      await db.run(
        'INSERT INTO deposits (depositor_id, amount, deposit_date, period_type, due_date, is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count, notes, status, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          selectedDepositor.id, 
          formData.amount, 
          formData.deposit_date, 
          formData.period_type, 
          formData.due_date, 
          formData.is_recurring, 
          formData.is_recurring ? formData.recurring_day : null, 
          formData.is_recurring ? formData.recurring_months : null,
          recurringDepositNumber,
          recurringDepositCount,
          formData.notes, 
          status,  // סטטוס מחושב
          paymentMethod.payment_method, 
          JSON.stringify(paymentMethod)
        ]
      )

      setSnackbar({ open: true, message: 'ההפקדה נוספה בהצלחה', severity: 'success' })
      loadDeposits()
      setFormData({
        amount: 0,
        deposit_date: new Date().toISOString().split('T')[0],
        period_type: 'flexible',
        due_date: '',
        is_recurring: 0,
        recurring_day: new Date().getDate(),
        recurring_months: 0,
        notes: '',
      })
      setPaymentMethod({ payment_method: '' })
    } catch (error) {
      console.error('Error saving deposit:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleWithdraw = async (deposit: Deposit) => {
    // חישוב היתרה הזמינה למשיכה מההיסטוריה
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
    const alreadyWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    const availableToWithdraw = deposit.amount - alreadyWithdrawn
    
    if (availableToWithdraw <= 0) {
      setSnackbar({ open: true, message: 'כל הסכום כבר נמשך', severity: 'error' })
      return
    }

    setWithdrawingDeposit(deposit)
    setWithdrawPaymentMethod({ payment_method: '' })
    setWithdrawAmount(availableToWithdraw) // ברירת מחדל: כל היתרה
    setWithdrawDialogOpen(true)
  }

  const handleConfirmWithdraw = async () => {
    if (!withdrawingDeposit) return

    // ולידציה - חישוב מחדש מההיסטוריה
    const withdrawals = await depositWithdrawalsService.getByDeposit(withdrawingDeposit.id)
    const alreadyWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
    const availableToWithdraw = withdrawingDeposit.amount - alreadyWithdrawn
    
    if (withdrawAmount <= 0) {
      setSnackbar({ open: true, message: 'נא להזין סכום למשיכה', severity: 'error' })
      return
    }
    
    if (withdrawAmount > availableToWithdraw) {
      setSnackbar({ open: true, message: `לא ניתן למשוך יותר מ-${formatCurrency(availableToWithdraw)}`, severity: 'error' })
      return
    }

    try {
      const withdrawalDate = new Date().toISOString().split('T')[0]
      
      // יצירת רשומת משיכה חדשה
      await depositWithdrawalsService.create({
        deposit_id: withdrawingDeposit.id,
        amount: withdrawAmount,
        withdrawal_date: withdrawalDate,
        payment_method: withdrawPaymentMethod.payment_method,
        payment_details: JSON.stringify(withdrawPaymentMethod),
        notes: ''
      })
      
      // עדכון סטטוס ההפקדה
      const totalWithdrawn = alreadyWithdrawn + withdrawAmount
      const newStatus = totalWithdrawn >= withdrawingDeposit.amount ? 'withdrawn' : 'active'
      
      await db.run(
        'UPDATE deposits SET status = ? WHERE id = ?', 
        [newStatus, withdrawingDeposit.id]
      )
      
      const message = newStatus === 'withdrawn' 
        ? 'המשיכה בוצעה - ההפקדה נסגרה' 
        : `נמשכו ${formatCurrency(withdrawAmount)} - נותרו ${formatCurrency(withdrawingDeposit.amount - totalWithdrawn)}`
      
      setSnackbar({ open: true, message, severity: 'success' })
      setWithdrawDialogOpen(false)
      setWithdrawingDeposit(null)
      loadDeposits()
    } catch (error) {
      console.error('Error withdrawing:', error)
      setSnackbar({ open: true, message: 'שגיאה במשיכה', severity: 'error' })
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('האם למחוק את ההפקדה?')) return

    try {
      await db.run('DELETE FROM deposits WHERE id = ?', [id])
      setSnackbar({ open: true, message: 'ההפקדה נמחקה', severity: 'success' })
      loadDeposits()
    } catch (error) {
      console.error('Error deleting deposit:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleEdit = (deposit: Deposit) => {
    setEditingDeposit(deposit)
    setEditAmount(deposit.amount)
    setEditDate(deposit.deposit_date)
    setEditPeriodType(deposit.period_type)
    setEditDueDate(deposit.due_date || '')
    setEditNotes(deposit.notes || '')
    // פרטי מחזוריות
    setEditIsRecurring(deposit.is_recurring || 0)
    setEditRecurringDay(deposit.recurring_day || new Date(deposit.deposit_date).getDate())
    setEditRecurringMonths(deposit.recurring_months || 0)
    // פרטי משיכה
    setEditWithdrawalDate(deposit.withdrawal_date || '')
    setEditWithdrawnAmount(deposit.withdrawn_amount || deposit.amount)
    if (deposit.withdrawal_payment_details) {
      try {
        setEditWithdrawalPaymentMethod(JSON.parse(deposit.withdrawal_payment_details) as PaymentMethodData)
      } catch {
        setEditWithdrawalPaymentMethod({ payment_method: (deposit.withdrawal_payment_method || '') as PaymentMethodData['payment_method'] })
      }
    } else {
      setEditWithdrawalPaymentMethod({ payment_method: (deposit.withdrawal_payment_method || '') as PaymentMethodData['payment_method'] })
    }
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingDeposit) return

    try {
      // אם יש משיכה - לא לאפשר לשנות סכום הפקדה מקורי
      const hasWithdrawal = editingDeposit.status === 'withdrawn' || (editingDeposit.withdrawn_amount && editingDeposit.withdrawn_amount > 0)
      const finalAmount = hasWithdrawal ? editingDeposit.amount : editAmount

      // חישוב recurring_deposit_count מ-recurring_months
      const recurringDepositNumber = editingDeposit.recurring_deposit_number || (editIsRecurring ? 1 : undefined)
      const recurringDepositCount = editIsRecurring && editRecurringMonths > 0 
        ? editRecurringMonths + (recurringDepositNumber || 1)
        : undefined

      // עדכון פרטי הפקדה בסיסיים + מחזוריות
      await db.run(
        'UPDATE deposits SET amount = ?, deposit_date = ?, period_type = ?, due_date = ?, is_recurring = ?, recurring_day = ?, recurring_months = ?, recurring_deposit_number = ?, recurring_deposit_count = ?, notes = ? WHERE id = ?',
        [
          finalAmount, 
          editDate, 
          editPeriodType, 
          editDueDate, 
          editIsRecurring,
          editIsRecurring ? editRecurringDay : null,
          editIsRecurring ? editRecurringMonths : null,
          recurringDepositNumber,
          recurringDepositCount,
          editNotes, 
          editingDeposit.id
        ]
      )

      // אם יש פרטי משיכה לעדכן
      if (editWithdrawalDate) {
        // חישוב סטטוס חדש
        const newStatus = editWithdrawnAmount >= editingDeposit.amount ? 'withdrawn' : 'active'
        
        await db.run(
          'UPDATE deposits SET status = ?, withdrawal_date = ?, withdrawn_amount = ?, withdrawal_payment_method = ?, withdrawal_payment_details = ? WHERE id = ?',
          [newStatus, editWithdrawalDate, editWithdrawnAmount, editWithdrawalPaymentMethod.payment_method, JSON.stringify(editWithdrawalPaymentMethod), editingDeposit.id]
        )
      }

      setSnackbar({ open: true, message: 'ההפקדה עודכנה בהצלחה', severity: 'success' })
      setEditDialogOpen(false)
      setEditingDeposit(null)
      loadDeposits()
    } catch (error) {
      console.error('Error updating deposit:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון', severity: 'error' })
    }
  }

  const handleGenerateDocument = async (deposit: Deposit) => {
    if (!selectedDepositor) return
    
    // טעינת היסטוריית משיכות
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
    
    generateDepositDocument({
      gemachName: settings.gemach_name || 'גמ"ח שלי',
      gemachLogo: settings.gemach_logo,
      depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
      amount: deposit.amount,
      depositDate: deposit.deposit_date,
      periodType: deposit.period_type,
      dueDate: deposit.due_date,
      dateFormat: settings.date_format,
      customText: settings.deposit_document_text,
      isRecurring: deposit.is_recurring === 1,
      recurringDepositNumber: deposit.recurring_deposit_number,
      recurringDepositCount: deposit.recurring_deposit_count,
      withdrawals: withdrawals.map(w => ({
        amount: w.amount,
        withdrawal_date: w.withdrawal_date
      }))
    })
  }

  const handleSendEmail = async (deposit: Deposit) => {
    if (!selectedDepositor) return
    
    if (!selectedDepositor.email) {
      setSnackbar({ open: true, message: 'למפקיד זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    // טעינת היסטוריית משיכות
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
    
    const emailData = createDepositEmailData({
      gemachName: settings.gemach_name || 'גמ"ח',
      depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
      depositorEmail: selectedDepositor.email,
      amount: deposit.amount,
      depositDate: deposit.deposit_date,
      periodType: deposit.period_type,
      dueDate: deposit.due_date,
      gemachLogo: settings.gemach_logo,
      dateFormat: settings.date_format,
      withdrawals: withdrawals.map(w => ({
        amount: w.amount,
        withdrawal_date: w.withdrawal_date
      }))
    })
    
    const provider = (settings.email_provider || 'gmail') as EmailProvider
    const result = await openEmailWithDocument(emailData, provider)
    setSnackbar({ 
      open: true, 
      message: result.message, 
      severity: result.success ? 'success' : 'error' 
    })
  }

  const handleShowHistory = async (deposit: Deposit) => {
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
    setWithdrawalHistory(withdrawals)
    setSelectedDepositForHistory(deposit)
    setHistoryDialogOpen(true)
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const activeDeposits = deposits.filter(d => d.status === 'active' || (d.amount - (d.withdrawn_amount || 0)) > 0)
  const totalActive = activeDeposits.reduce((sum, d) => {
    // חישוב סכום בפועל להפקדה מחזורית
    let depositAmount = d.amount
    if (d.is_recurring === 1 && d.recurring_deposit_number) {
      // הפקדה מחזורית - מכפילים בכמות ההפקדות שכבר בוצעו
      depositAmount = d.amount * d.recurring_deposit_number
    }
    return sum + (depositAmount - (d.withdrawn_amount || 0))
  }, 0)

  return (
    <Box>
      {/* Depositor Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            בחירת מפקיד
          </Typography>
          <Autocomplete
            options={depositors}
            getOptionLabel={(option) => `${option.first_name} ${option.last_name} - ${option.phone}`}
            value={selectedDepositor}
            onChange={(_, newValue) => onSelectDepositor?.(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="חפש ובחר מפקיד"
                placeholder="הקלד שם או טלפון..."
              />
            )}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            noOptionsText="לא נמצאו מפקידים - הוסף מפקיד בטאב מפקידים"
          />
        </CardContent>
      </Card>

      {!selectedDepositor ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              בחר מפקיד מהרשימה למעלה או עבור לטאב "מפקידים" להוספת מפקיד חדש
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Selected Depositor Info */}
          <Card sx={{ mb: 3, bgcolor: 'primary.light', color: 'white' }}>
            <CardContent>
              <Typography variant="h6">
                מפקיד נבחר: {selectedDepositor.first_name} {selectedDepositor.last_name}
              </Typography>
              <Typography variant="body2">
                טלפון: {selectedDepositor.phone} | מ.ז.: {selectedDepositor.id_number || '-'}
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                סה"כ הפקדות פעילות: {formatCurrency(totalActive)} ({activeDeposits.length} הפקדות)
              </Typography>
            </CardContent>
          </Card>

      {/* Add Form */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            הפקדה חדשה
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <AmountInput
                fullWidth
                label="סכום ההפקדה *"
                value={formData.amount || 0}
                onChange={(value) => setFormData({ ...formData, amount: value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="תאריך הפקדה"
                type="date"
                value={formData.deposit_date}
                onChange={(e) => setFormData({ ...formData, deposit_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText={settings.date_format === 'combined' && formData.deposit_date ? `📅 ${toHebrewDate(formData.deposit_date)}` : ''}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>סוג תקופה</InputLabel>
                <Select
                  value={formData.period_type}
                  label="סוג תקופה"
                  onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
                >
                  <MenuItem value="flexible">גמישה</MenuItem>
                  <MenuItem value="fixed">קבועה</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {formData.period_type === 'fixed' && (
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="תאריך סיום"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText={settings.date_format === 'combined' && formData.due_date ? `📅 ${toHebrewDate(formData.due_date)}` : ''}
                />
              </Grid>
            )}
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.is_recurring === 1}
                    onChange={(e) => {
                      const isChecked = e.target.checked
                      if (isChecked) {
                        // כשמפעילים הפקדה מחזורית, מאתחלים את recurring_day ליום הנוכחי
                        const today = new Date()
                        const currentDay = today.getDate()
                        const firstDepositDate = calculateFirstRecurringDepositDate(currentDay)
                        setFormData({ ...formData, is_recurring: 1, recurring_day: currentDay, deposit_date: firstDepositDate })
                      } else {
                        setFormData({ ...formData, is_recurring: 0, deposit_date: new Date().toISOString().split('T')[0] })
                      }
                    }}
                  />
                }
                label="הפקדה מחזורית"
              />
            </Grid>
            {formData.is_recurring === 1 && (
              <>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="יום בחודש להפקדה"
                    type="number"
                    value={formData.recurring_day}
                    onChange={(e) => {
                      const day = Math.min(31, Math.max(1, parseInt(e.target.value) || 1))
                      const firstDepositDate = calculateFirstRecurringDepositDate(day)
                      setFormData({ ...formData, recurring_day: day, deposit_date: firstDepositDate })
                    }}
                    inputProps={{ min: 1, max: 31 }}
                    helperText="1-31"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    ההפקדה הראשונה תיווצר ב-{formatDisplayDate(formData.deposit_date, settings.date_format)}
                    {formData.deposit_date > new Date().toISOString().split('T')[0] && ' (מתוכננת)'}
                  </Alert>
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="סה״כ הפקדות"
                    type="number"
                    value={formData.recurring_months + 1}
                    onChange={(e) => {
                      const total = Math.max(1, parseInt(e.target.value) || 1)
                      setFormData({ ...formData, recurring_months: total - 1 })
                    }}
                    inputProps={{ min: 1 }}
                    helperText="כולל הפקדה ראשונה"
                  />
                </Grid>
              </>
            )}
            {settings.show_payment_method === 'yes' && (
              <Grid item xs={12} md={6}>
                <PaymentMethodSelect
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  label="אמצעי תשלום"
                />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="הערות"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave}>
              הוסף הפקדה
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            היסטוריית הפקדות
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell align="center">סכום</TableCell>
                  <TableCell align="center">נמשך</TableCell>
                  <TableCell align="center">יתרה</TableCell>
                  <TableCell align="center">תאריך הפקדה</TableCell>
                  <TableCell align="center">סוג</TableCell>
                  <TableCell align="center">מחזורית</TableCell>
                  <TableCell align="center">סטטוס</TableCell>
                  <TableCell align="center">תאריך משיכה</TableCell>
                  <TableCell>הערות</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deposits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין הפקדות למפקיד זה</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  deposits.map((deposit) => {
                    const withdrawn = deposit.withdrawn_amount || 0
                    // חישוב סכום בפועל להפקדה מחזורית
                    let depositAmount = deposit.amount
                    if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
                      depositAmount = deposit.amount * deposit.recurring_deposit_number
                    }
                    const remaining = depositAmount - withdrawn
                    return (
                    <TableRow 
                      key={deposit.id}
                      id={`deposit-${deposit.id}`}
                      hover
                      sx={{ bgcolor: deposit.status === 'withdrawn' ? 'grey.100' : undefined }}
                    >
                      <TableCell align="center">
                        {deposit.is_recurring === 1 && deposit.recurring_deposit_number ? (
                          <Box>
                            <Typography variant="body2">{formatCurrency(depositAmount)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              ({formatCurrency(deposit.amount)} × {deposit.recurring_deposit_number})
                            </Typography>
                          </Box>
                        ) : (
                          formatCurrency(deposit.amount)
                        )}
                      </TableCell>
                      <TableCell align="center" sx={{ color: withdrawn > 0 ? 'warning.main' : 'text.secondary' }}>
                        {withdrawn > 0 ? formatCurrency(withdrawn) : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ color: remaining > 0 ? 'success.main' : 'text.secondary', fontWeight: remaining > 0 ? 'bold' : 'normal' }}>
                        {formatCurrency(remaining)}
                      </TableCell>
                      <TableCell align="center">{formatDisplayDate(deposit.deposit_date, settings.date_format)}</TableCell>
                      <TableCell align="center">
                        {deposit.period_type === 'flexible' ? 'גמישה' : 'קבועה'}
                      </TableCell>
                      <TableCell align="center">
                        {deposit.is_recurring === 1 ? (
                          deposit.recurring_deposit_number && deposit.recurring_deposit_count ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AutorenewIcon sx={{ fontSize: 16 }} />
                              {deposit.recurring_deposit_number}/{deposit.recurring_deposit_count}
                            </Box>
                          ) : (
                            deposit.recurring_months !== undefined && deposit.recurring_months >= 0 ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AutorenewIcon sx={{ fontSize: 16 }} />
                                1/{deposit.recurring_months + 1}
                              </Box>
                            ) : <AutorenewIcon sx={{ fontSize: 16 }} />
                          )
                        ) : '-'}
                      </TableCell>
                      <TableCell align="center">
                        {deposit.status === 'planned' ? (
                          <Typography color="info.main" fontWeight="bold">מתוכננת</Typography>
                        ) : deposit.status === 'active' ? (
                          remaining === deposit.amount ? (
                            <Typography color="success.main" fontWeight="bold">פעילה</Typography>
                          ) : (
                            <Typography color="warning.main" fontWeight="bold">חלקית</Typography>
                          )
                        ) : (
                          <Typography color="text.secondary">נמשכה</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {deposit.withdrawal_date ? formatDisplayDate(deposit.withdrawal_date, settings.date_format) : '-'}
                      </TableCell>
                      <TableCell>{deposit.notes || '-'}</TableCell>
                      <TableCell align="center">
                        {withdrawn > 0 && (
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => handleShowHistory(deposit)}
                            title="היסטוריית משיכות"
                          >
                            <HistoryIcon />
                          </IconButton>
                        )}
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleGenerateDocument(deposit)}
                          title="הפק שטר"
                        >
                          <DocIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleSendEmail(deposit)}
                          title={selectedDepositor?.email ? 'שלח שטר במייל' : 'למפקיד לא הוזנה כתובת מייל'}
                          disabled={!selectedDepositor?.email}
                        >
                          <EmailIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleEdit(deposit)}
                          title="ערוך"
                        >
                          <EditIcon />
                        </IconButton>
                        {deposit.is_recurring === 1 && deposit.recurring_deposit_number === 1 && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => {
                              setSelectedRecurringDepositId(deposit.id);
                              setEditRecurringDialogOpen(true);
                            }}
                            title="נהל הפקדה מחזורית"
                          >
                            <AutorenewIcon />
                          </IconButton>
                        )}
                        {remaining > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleWithdraw(deposit)}
                            sx={{ mx: 1 }}
                          >
                            משיכה
                          </Button>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(deposit.id)}
                          title="מחק"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>עריכת הפקדה</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {/* פרטי הפקדה */}
            <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>פרטי הפקדה</Typography>
            <AmountInput
              fullWidth
              label="סכום"
              value={editAmount || 0}
              onChange={(value) => setEditAmount(value)}
              sx={{ mb: 2 }}
              disabled={editingDeposit?.status === 'withdrawn' || (editingDeposit?.withdrawn_amount !== undefined && editingDeposit.withdrawn_amount > 0)}
            />
            {(editingDeposit?.status === 'withdrawn' || (editingDeposit?.withdrawn_amount !== undefined && editingDeposit.withdrawn_amount > 0)) && (
              <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 2, mt: -1 }}>
                לא ניתן לשנות סכום הפקדה שבוצעה ממנה משיכה
              </Typography>
            )}
            <TextField
              fullWidth
              label="תאריך הפקדה"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>סוג תקופה</InputLabel>
              <Select
                value={editPeriodType}
                label="סוג תקופה"
                onChange={(e) => setEditPeriodType(e.target.value)}
              >
                <MenuItem value="flexible">גמישה</MenuItem>
                <MenuItem value="fixed">קבועה</MenuItem>
              </Select>
            </FormControl>
            {editPeriodType === 'fixed' && (
              <TextField
                fullWidth
                label="תאריך סיום"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            )}
            <TextField
              fullWidth
              label="הערות"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              sx={{ mb: 2 }}
            />

            {/* פרטי מחזוריות - מוצג רק אם ההפקדה מחזורית */}
            {editIsRecurring === 1 && (
              <>
                <Typography variant="subtitle2" color="secondary" sx={{ mb: 1, mt: 2, borderTop: '1px solid #eee', pt: 2 }}>
                  הגדרות מחזוריות
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={true}
                      disabled
                    />
                  }
                  label="הפקדה מחזורית"
                  sx={{ mb: 2 }}
                />
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="יום בחודש להפקדה"
                      type="number"
                      value={editRecurringDay}
                      onChange={(e) => setEditRecurringDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                      inputProps={{ min: 1, max: 31 }}
                      helperText="1-31"
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      label="סה״כ הפקדות"
                      type="number"
                      value={editRecurringMonths + 1}
                      onChange={(e) => {
                        const total = Math.max(1, parseInt(e.target.value) || 1)
                        setEditRecurringMonths(total - 1)
                      }}
                      inputProps={{ min: 1 }}
                      helperText="כולל הפקדה ראשונה"
                    />
                  </Grid>
                </Grid>
              </>
            )}

            {/* פרטי משיכה - רק אם יש משיכה */}
            {(editingDeposit?.withdrawal_date || editingDeposit?.withdrawn_amount) && (
              <>
                <Typography variant="subtitle2" color="warning.main" sx={{ mb: 1, mt: 2, borderTop: '1px solid #eee', pt: 2 }}>
                  פרטי משיכה
                </Typography>
                <TextField
                  fullWidth
                  label="תאריך משיכה"
                  type="date"
                  value={editWithdrawalDate}
                  onChange={(e) => setEditWithdrawalDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ mb: 2 }}
                />
                <AmountInput
                  fullWidth
                  label="סכום שנמשך"
                  value={editWithdrawnAmount || 0}
                  onChange={(value) => setEditWithdrawnAmount(Math.min(value, editingDeposit?.amount || value))}
                  sx={{ mb: 2 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, mt: -1 }}>
                  מקסימום: {formatCurrency(editingDeposit?.amount || 0)}
                </Typography>
                {settings.show_payment_method === 'yes' && (
                  <PaymentMethodSelect
                    value={editWithdrawalPaymentMethod}
                    onChange={setEditWithdrawalPaymentMethod}
                    label="אמצעי תשלום למשיכה"
                  />
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSaveEdit}>
            שמור
          </Button>
        </DialogActions>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onClose={() => setWithdrawDialogOpen(false)}>
        <DialogTitle>משיכת הפקדה</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {withdrawingDeposit && (
              <>
                <Typography sx={{ mb: 1 }}>
                  סכום הפקדה: {formatCurrency(withdrawingDeposit.amount)}
                </Typography>
                {(withdrawingDeposit.withdrawn_amount || 0) > 0 && (
                  <Typography sx={{ mb: 1 }} color="warning.main">
                    כבר נמשך: {formatCurrency(withdrawingDeposit.withdrawn_amount || 0)}
                  </Typography>
                )}
                <Typography sx={{ mb: 2 }} color="success.main" fontWeight="bold">
                  זמין למשיכה: {formatCurrency(withdrawingDeposit.amount - (withdrawingDeposit.withdrawn_amount || 0))}
                </Typography>
                
                <AmountInput
                  fullWidth
                  label="סכום למשיכה"
                  value={withdrawAmount}
                  onChange={(value) => setWithdrawAmount(Math.min(value, withdrawingDeposit.amount - (withdrawingDeposit.withdrawn_amount || 0)))}
                  sx={{ mb: 2 }}
                />
                
                {settings.show_payment_method === 'yes' && (
                  <PaymentMethodSelect
                    value={withdrawPaymentMethod}
                    onChange={setWithdrawPaymentMethod}
                    label="אמצעי תשלום למשיכה"
                  />
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmWithdraw}>
            בצע משיכה
          </Button>
        </DialogActions>
      </Dialog>

      {/* Withdrawal History Dialog */}
      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          היסטוריית משיכות - הפקדה #{selectedDepositForHistory?.id}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {selectedDepositForHistory && (
              <>
                <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="body1">
                    <strong>סכום הפקדה מקורי:</strong> {formatCurrency(selectedDepositForHistory.amount)}
                  </Typography>
                  <Typography variant="body1" color="warning.main">
                    <strong>סה"כ נמשך:</strong> {formatCurrency(selectedDepositForHistory.withdrawn_amount || 0)}
                  </Typography>
                  <Typography variant="body1" color="success.main">
                    <strong>יתרה נוכחית:</strong> {formatCurrency(selectedDepositForHistory.amount - (selectedDepositForHistory.withdrawn_amount || 0))}
                  </Typography>
                </Box>

                {withdrawalHistory.length === 0 ? (
                  <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    אין משיכות להפקדה זו
                  </Typography>
                ) : (
                  <TableContainer component={Paper} variant="outlined">
                    <Table>
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'warning.light' }}>
                          <TableCell align="center"><strong>#</strong></TableCell>
                          <TableCell align="center"><strong>תאריך משיכה</strong></TableCell>
                          <TableCell align="center"><strong>סכום</strong></TableCell>
                          <TableCell align="center"><strong>אמצעי תשלום</strong></TableCell>
                          <TableCell><strong>הערות</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {withdrawalHistory.map((withdrawal, index) => (
                          <TableRow key={withdrawal.id} hover>
                            <TableCell align="center">{index + 1}</TableCell>
                            <TableCell align="center">
                              {formatDisplayDate(withdrawal.withdrawal_date, settings.date_format)}
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                              {formatCurrency(withdrawal.amount)}
                            </TableCell>
                            <TableCell align="center">
                              {withdrawal.payment_method === 'cash' && '💵 מזומן'}
                              {withdrawal.payment_method === 'credit' && '💳 אשראי'}
                              {withdrawal.payment_method === 'transfer' && '🏦 העברה'}
                              {withdrawal.payment_method === 'check' && '📝 צ׳ק'}
                              {withdrawal.payment_method === 'other' && '📋 אחר'}
                              {!withdrawal.payment_method && '-'}
                            </TableCell>
                            <TableCell>{withdrawal.notes || '-'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow sx={{ bgcolor: 'grey.100' }}>
                          <TableCell colSpan={2} align="center"><strong>סה"כ</strong></TableCell>
                          <TableCell align="center" sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'warning.main' }}>
                            {formatCurrency(withdrawalHistory.reduce((sum, w) => sum + w.amount, 0))}
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>
        </>
      )}

      {/* Edit Recurring Dialog */}
      {selectedRecurringDepositId && (
        <EditRecurringDialog
          open={editRecurringDialogOpen}
          onClose={() => setEditRecurringDialogOpen(false)}
          itemType="deposit"
          itemId={selectedRecurringDepositId}
          onSuccess={() => {
            setSnackbar({ open: true, message: 'הפקדה מחזורית עודכנה בהצלחה', severity: 'success' })
            loadDeposits()
          }}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  )
}
