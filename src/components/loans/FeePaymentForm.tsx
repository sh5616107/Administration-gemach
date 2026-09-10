import { useState, useEffect } from 'react'
import {
  Box,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Drawer,
  Typography,
  IconButton,
  Divider,
  Snackbar,
  Alert,
  Autocomplete,
} from '@mui/material'
import { Save as SaveIcon, Close as CloseIcon } from '@mui/icons-material'
import { borrowersService, loansService } from '../../services/database'
import type { Borrower, Loan } from '../../services/database'
import type { FeePayment, FeeType, FeeStatus, CreateFeePaymentInput, UpdateFeePaymentInput } from '../../types/feePayments'
import {
  createFeePayment,
  updateFeePayment,
  getFeePaymentById,
} from '../../services/feePaymentsService'
import PaymentMethodSelect, { PaymentMethodData, PaymentMethodType } from '../PaymentMethodSelect'
import AmountInput from '../AmountInput'

interface FeePaymentFormProps {
  feePayment?: FeePayment | null
  borrowerId?: string // אם קוראים מתוך כרטיס לווה
  loanId?: string // אם קוראים מתוך כרטיס הלוואה
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

const feeTypes: { value: FeeType; label: string }[] = [
  { value: 'processing', label: 'עמלת טיפול' },
  { value: 'guarantor_check', label: 'עמלת בדיקת ערבים' },
  { value: 'membership', label: 'דמי חבר' },
  { value: 'other', label: 'אחר' },
]

const feeStatuses: { value: FeeStatus; label: string }[] = [
  { value: 'paid', label: 'שולם' },
  { value: 'pending', label: 'ממתין לתשלום' },
  { value: 'waived', label: 'בוטל (פטור)' },
  { value: 'cancelled', label: 'בוטל (הוחזר)' },
]

export default function FeePaymentForm({
  feePayment,
  borrowerId: initialBorrowerId,
  loanId: initialLoanId,
  open,
  onClose,
  onSaved,
}: FeePaymentFormProps) {
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [borrowerLoans, setBorrowerLoans] = useState<Loan[]>([])
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null)
  
  const [formData, setFormData] = useState({
    fee_type: 'processing' as FeeType,
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    status: 'paid' as FeeStatus,
    note: '',
  })
  
  const [paymentMethodData, setPaymentMethodData] = useState<PaymentMethodData>({
    payment_method: 'cash' as PaymentMethodType,
  })
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [loading, setLoading] = useState(false)

  // טעינת לווים
  useEffect(() => {
    borrowersService.getAll().then(setBorrowers)
  }, [])

  // טעינת נתוני עמלה קיימת לעריכה
  useEffect(() => {
    if (feePayment && open) {
      setFormData({
        fee_type: feePayment.fee_type,
        amount: String(feePayment.amount),
        payment_date: feePayment.payment_date,
        status: feePayment.status,
        note: feePayment.note || '',
      })
      
      setPaymentMethodData({
        payment_method: feePayment.payment_method as PaymentMethodType,
      })
      
      // טעינת הלווה והלוואה
      if (feePayment.borrower_id) {
        borrowersService.getById(feePayment.borrower_id).then(setSelectedBorrower)
      }
      if (feePayment.loan_id) {
        loansService.getById(feePayment.loan_id).then(setSelectedLoan)
      }
    } else if (!feePayment && open) {
      // מצב הוספה חדשה
      resetForm()
      
      // אם יש borrowerId התחלתי
      if (initialBorrowerId) {
        borrowersService.getById(initialBorrowerId).then(b => {
          if (b) {
            setSelectedBorrower(b)
            loadBorrowerLoans(initialBorrowerId)
          }
        })
      }
      
      // אם יש loanId התחלתי
      if (initialLoanId) {
        loansService.getById(initialLoanId).then(l => {
          if (l) {
            setSelectedLoan(l)
            borrowersService.getById(l.borrower_id).then(setSelectedBorrower)
          }
        })
      }
    }
  }, [feePayment, open, initialBorrowerId, initialLoanId])

  // טעינת הלוואות כשמשתנה הלווה
  useEffect(() => {
    if (selectedBorrower) {
      loadBorrowerLoans(selectedBorrower.id)
    } else {
      setBorrowerLoans([])
      setSelectedLoan(null)
    }
  }, [selectedBorrower])

  const loadBorrowerLoans = async (borrowerId: string) => {
    const loans = await loansService.getByBorrower(borrowerId)
    setBorrowerLoans(loans)
  }

  const resetForm = () => {
    setFormData({
      fee_type: 'processing',
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      status: 'paid',
      note: '',
    })
    setPaymentMethodData({ payment_method: 'cash' })
    setSelectedBorrower(null)
    setSelectedLoan(null)
  }

  const handleSave = async () => {
    // ולידציות
    if (!selectedBorrower) {
      setSnackbar({ open: true, message: 'יש לבחור לווה', severity: 'error' })
      return
    }
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      setSnackbar({ open: true, message: 'יש להזין סכום תקין', severity: 'error' })
      return
    }
    
    if (!formData.payment_date) {
      setSnackbar({ open: true, message: 'יש להזין תאריך תשלום', severity: 'error' })
      return
    }

    setLoading(true)
    
    try {
      if (feePayment) {
        // עדכון עמלה קיימת
        const updateInput: UpdateFeePaymentInput = {
          fee_type: formData.fee_type,
          amount: parseFloat(formData.amount),
          payment_date: formData.payment_date,
          payment_method: paymentMethodData.payment_method as any,
          status: formData.status,
          note: formData.note || null,
        }
        
        await updateFeePayment(feePayment.id, updateInput)
        setSnackbar({ open: true, message: 'העמלה עודכנה בהצלחה', severity: 'success' })
      } else {
        // יצירת עמלה חדשה
        const createInput: CreateFeePaymentInput = {
          borrower_id: selectedBorrower.id,
          loan_id: selectedLoan?.id || null,
          fee_type: formData.fee_type,
          amount: parseFloat(formData.amount),
          payment_date: formData.payment_date,
          payment_method: paymentMethodData.payment_method as any,
          status: formData.status,
          note: formData.note || null,
        }
        
        await createFeePayment(createInput)
        setSnackbar({ open: true, message: 'העמלה נוספה בהצלחה', severity: 'success' })
      }
      
      if (onSaved) onSaved()
      onClose()
    } catch (error: any) {
      console.error('Error saving fee payment:', error)
      setSnackbar({ open: true, message: error.message || 'שגיאה בשמירה', severity: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      onClose()
    }
  }

  return (
    <>
      <Drawer
        anchor="left"
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 600 } }
        }}
      >
        {/* כותרת */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">
            {feePayment ? 'עריכת תשלום עמלה' : 'רישום תשלום עמלה חדש'}
          </Typography>
          <IconButton onClick={handleClose} disabled={loading}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* תוכן */}
        <Box sx={{ p: 3, flexGrow: 1, overflow: 'auto' }}>
          <Grid container spacing={2}>
            {/* בחירת לווה */}
            <Grid item xs={12}>
              <Autocomplete
                options={borrowers}
                getOptionLabel={(b) => `${b.first_name} ${b.last_name} - ${b.phone}`}
                value={selectedBorrower}
                onChange={(_, newValue) => setSelectedBorrower(newValue)}
                disabled={!!feePayment || !!initialBorrowerId}
                renderInput={(params) => (
                  <TextField {...params} label="לווה *" size="small" />
                )}
              />
            </Grid>

            {/* בחירת הלוואה (אופציונלי) */}
            <Grid item xs={12}>
              <Autocomplete
                options={borrowerLoans}
                getOptionLabel={(l) => `הלוואה #${String(l.loan_number || l.id)} - ₪${l.amount.toLocaleString()}`}
                value={selectedLoan}
                onChange={(_, newValue) => setSelectedLoan(newValue)}
                disabled={!selectedBorrower || !!initialLoanId}
                renderInput={(params) => (
                  <TextField {...params} label="הלוואה (אופציונלי)" size="small" />
                )}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                השאר ריק אם העמלה אינה קשורה להלוואה ספציפית
              </Typography>
            </Grid>

            {/* סוג עמלה */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>סוג עמלה *</InputLabel>
                <Select
                  value={formData.fee_type}
                  label="סוג עמלה *"
                  onChange={(e) => setFormData({ ...formData, fee_type: e.target.value as FeeType })}
                >
                  {feeTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* סטטוס */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>סטטוס *</InputLabel>
                <Select
                  value={formData.status}
                  label="סטטוס *"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as FeeStatus })}
                >
                  {feeStatuses.map((status) => (
                    <MenuItem key={status.value} value={status.value}>
                      {status.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* סכום */}
            <Grid item xs={12}>
              <AmountInput
                label="סכום *"
                value={formData.amount}
                onChange={(value) => setFormData({ ...formData, amount: String(value) })}
                size="small"
              />
            </Grid>

            {/* תאריך תשלום */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="תאריך תשלום *"
                type="date"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* אמצעי תשלום */}
            <Grid item xs={12}>
              <PaymentMethodSelect
                value={paymentMethodData}
                onChange={setPaymentMethodData}
                label="אמצעי תשלום *"
              />
            </Grid>

            {/* הערה */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="הערה"
                multiline
                rows={3}
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="הערות נוספות על התשלום (אופציונלי)"
              />
            </Grid>
          </Grid>
        </Box>

        <Divider />

        {/* כפתורי פעולה */}
        <Box sx={{ p: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button onClick={handleClose} disabled={loading}>
            ביטול
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'שומר...' : 'שמור'}
          </Button>
        </Box>
      </Drawer>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
