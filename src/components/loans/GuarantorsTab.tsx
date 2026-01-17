import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  InputAdornment,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Link as LinkIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { guarantorsService, guarantorLoansService, loansService, repaymentsService, type GuarantorLoan } from '../../services/database'
import { useSettings } from '../../hooks/useSettings'
import { formatDisplayDate } from '../../utils/dateUtils'
import { openEmailWithDocument, createGuarantorDebtEmailData, type EmailProvider } from '../../services/documents'
import AmountInput from '../AmountInput'
import CrossCheckWarningDialog from '../CrossCheckWarningDialog'
import { checkNewGuarantor, type CrossCheckResult } from '../../services/crossCheck'

interface Guarantor {
  id?: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
  address: string
  email: string
  notes: string
  is_blacklisted: number
  total_guarantees?: number
}

const emptyGuarantor: Guarantor = {
  first_name: '',
  last_name: '',
  phone: '',
  id_number: '',
  address: '',
  email: '',
  notes: '',
  is_blacklisted: 0,
}

interface GuarantorLoanWithDetails extends GuarantorLoan {
  guarantor_name: string
  borrower_name: string
  remaining: number
}

export default function GuarantorsTab() {
  const { settings } = useSettings()
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [formData, setFormData] = useState<Guarantor>(emptyGuarantor)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  
  // Guarantor loans state
  const [guarantorLoans, setGuarantorLoans] = useState<GuarantorLoanWithDetails[]>([])
  const [repaymentDialogOpen, setRepaymentDialogOpen] = useState(false)
  const [selectedGuarantorLoan, setSelectedGuarantorLoan] = useState<GuarantorLoanWithDetails | null>(null)
  const [repaymentAmount, setRepaymentAmount] = useState('')

  // Cross-check warning states
  const [crossCheckWarnings, setCrossCheckWarnings] = useState<CrossCheckResult[]>([])
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false)

  const riskThreshold = parseInt(settings.risk_threshold) || 50000

  useEffect(() => {
    loadGuarantors()
    loadGuarantorLoans()
  }, [])

  const loadGuarantorLoans = async () => {
    try {
      const data = await guarantorLoansService.getAllWithDetails()
      setGuarantorLoans(data)
    } catch (error) {
      console.error('Error loading guarantor loans:', error)
    }
  }

  const loadGuarantors = async () => {
    try {
      const data = await guarantorsService.getAll() as Guarantor[]
      // Load total guarantees for each guarantor
      const withTotals = await Promise.all(
        data.map(async (g) => ({
          ...g,
          total_guarantees: g.id ? await guarantorsService.getTotalGuarantees(g.id) : 0,
        }))
      )
      setGuarantors(withTotals)
    } catch (error) {
      console.error('Error loading guarantors:', error)
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadGuarantors()
      return
    }
    try {
      const results = await guarantorsService.search(searchTerm) as Guarantor[]
      const withTotals = await Promise.all(
        results.map(async (g) => ({
          ...g,
          total_guarantees: g.id ? await guarantorsService.getTotalGuarantees(g.id) : 0,
        }))
      )
      setGuarantors(withTotals)
    } catch (error) {
      console.error('Error searching:', error)
    }
  }

  const handleEdit = (guarantor: Guarantor) => {
    setEditingId(guarantor.id || null)
    setFormData(guarantor)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setFormData(emptyGuarantor)
  }

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה', severity: 'error' })
      return
    }

    // בדיקת כפילויות - טלפון
    const allGuarantors = await guarantorsService.getAll() as Guarantor[]
    const duplicatePhone = allGuarantors.find(g => 
      g.phone === formData.phone && g.id !== editingId
    )
    if (duplicatePhone) {
      setSnackbar({ open: true, message: `טלפון זה כבר קיים במערכת עבור: ${duplicatePhone.first_name} ${duplicatePhone.last_name}`, severity: 'error' })
      return
    }

    // בדיקת כפילויות - מספר זהות (אם הוזן)
    if (formData.id_number) {
      const duplicateId = allGuarantors.find(g => 
        g.id_number === formData.id_number && g.id !== editingId
      )
      if (duplicateId) {
        setSnackbar({ open: true, message: `מספר זהות זה כבר קיים במערכת עבור: ${duplicateId.first_name} ${duplicateId.last_name}`, severity: 'error' })
        return
      }
    }

    // Cross-check: בדיקה אם קיים לווה עם אותם פרטים (רק ביצירת ערב חדש)
    if (!editingId) {
      const warnings = await checkNewGuarantor(formData.phone, formData.id_number)
      if (warnings.length > 0) {
        setCrossCheckWarnings(warnings)
        setCrossCheckDialogOpen(true)
        return
      }
    }

    await doSave()
  }

  const doSave = async () => {
    try {
      if (editingId) {
        await guarantorsService.update(editingId, formData)
        setSnackbar({ open: true, message: 'הערב עודכן בהצלחה', severity: 'success' })
      } else {
        await guarantorsService.create(formData)
        setSnackbar({ open: true, message: 'הערב נוסף בהצלחה', severity: 'success' })
      }
      loadGuarantors()
      handleCancelEdit()
    } catch (error) {
      console.error('Error saving guarantor:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleCrossCheckContinue = () => {
    setCrossCheckDialogOpen(false)
    setCrossCheckWarnings([])
    doSave()
  }

  const handleCrossCheckCancel = () => {
    setCrossCheckDialogOpen(false)
    setCrossCheckWarnings([])
  }

  const handleDelete = async (id: number) => {
    // בדיקה אם יש לערב הלוואת ערב פעילה
    const activeGuarantorLoans = guarantorLoans.filter(
      gl => gl.guarantor_id === id && gl.status === 'active'
    )
    
    if (activeGuarantorLoans.length > 0) {
      setSnackbar({ 
        open: true, 
        message: 'לא ניתן למחוק ערב שיש לו הלוואה פעילה. יש למחוק קודם את ההלוואה.', 
        severity: 'error' 
      })
      return
    }

    try {
      // בדיקה אם הערב מקושר להלוואות רגילות כערב
      const allLoans = await loansService.getAll()
      const loansWithThisGuarantor = allLoans.filter(
        l => (l.guarantor1_id === id || l.guarantor2_id === id) && l.status === 'active'
      )
      
      // הודעת אישור מותאמת
      let confirmMessage = 'האם למחוק את הערב?'
      if (loansWithThisGuarantor.length > 0) {
        confirmMessage = `שים לב: ערב זה משמש כערב ב-${loansWithThisGuarantor.length} הלוואות פעילות.\nהמחיקה תסיר אותו מהלוואות אלו.\n\nהאם להמשיך?`
      }
      
      if (!confirm(confirmMessage)) return
      
      // עדכון ההלוואות - הסרת הערב מהן
      for (const loan of loansWithThisGuarantor) {
        const updates: Partial<typeof loan> = {}
        if (loan.guarantor1_id === id) {
          updates.guarantor1_id = loan.guarantor2_id || undefined
          updates.guarantor2_id = undefined
        } else if (loan.guarantor2_id === id) {
          updates.guarantor2_id = undefined
        }
        await loansService.update(loan.id, updates)
      }

      await guarantorsService.delete(id)
      setSnackbar({ open: true, message: 'הערב נמחק', severity: 'success' })
      loadGuarantors()
    } catch (error) {
      console.error('Error deleting guarantor:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  // Guarantor loan functions
  const handleOpenRepayment = (loan: GuarantorLoanWithDetails) => {
    setSelectedGuarantorLoan(loan)
    setRepaymentAmount(String(loan.remaining))
    setRepaymentDialogOpen(true)
  }

  const handleAddRepayment = async () => {
    if (!selectedGuarantorLoan || !repaymentAmount) return
    
    const amount = parseFloat(repaymentAmount)
    if (amount <= 0 || amount > selectedGuarantorLoan.remaining) {
      setSnackbar({ open: true, message: 'סכום לא תקין', severity: 'error' })
      return
    }

    try {
      await guarantorLoansService.addRepayment(
        selectedGuarantorLoan.id,
        amount,
        new Date().toISOString().split('T')[0]
      )
      setSnackbar({ open: true, message: 'התשלום נרשם בהצלחה', severity: 'success' })
      setRepaymentDialogOpen(false)
      loadGuarantorLoans()
    } catch (error) {
      console.error('Error adding repayment:', error)
      setSnackbar({ open: true, message: 'שגיאה ברישום התשלום', severity: 'error' })
    }
  }

  const handleDeleteGuarantorLoan = async (id: number) => {
    if (!confirm('האם למחוק את הלוואת הערב?')) return

    try {
      const glToDelete = guarantorLoans.find(gl => gl.id === id)
      if (!glToDelete) return

      // בדיקה אם יש ערב נוסף על אותה הלוואה מקורית
      const otherGuarantorLoans = guarantorLoans.filter(
        gl => gl.original_loan_id === glToDelete.original_loan_id && gl.id !== id && gl.status === 'active'
      )

      if (otherGuarantorLoans.length > 0) {
        // יש ערב נוסף - מעבירים את היתרה אליו
        const otherGL = otherGuarantorLoans[0]
        const remainingAmount = glToDelete.remaining
        await guarantorLoansService.update(otherGL.id, {
          amount: otherGL.amount + remainingAmount
        })
        setSnackbar({ 
          open: true, 
          message: `הלוואת הערב נמחקה והסכום הועבר לערב ${otherGL.guarantor_name}`, 
          severity: 'success' 
        })
      } else {
        // אין ערב נוסף - מחזירים את ההלוואה המקורית לסטטוס "באיחור"
        const originalLoan = await loansService.getById(glToDelete.original_loan_id)
        if (originalLoan && originalLoan.status === 'transferred') {
          await loansService.update(glToDelete.original_loan_id, { 
            status: 'overdue',
            notes: (originalLoan.notes || '') + `\n[${new Date().toISOString().split('T')[0]}] הוחזר מערב לסטטוס באיחור`
          })
          setSnackbar({ 
            open: true, 
            message: 'הלוואת הערב נמחקה וההלוואה המקורית הוחזרה לסטטוס באיחור', 
            severity: 'success' 
          })
        } else {
          setSnackbar({ open: true, message: 'הלוואת הערב נמחקה', severity: 'success' })
        }
      }

      await guarantorLoansService.delete(id)
      loadGuarantorLoans()
      loadGuarantors()
    } catch (error) {
      console.error('Error deleting guarantor loan:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleSendDebtEmail = async (gl: GuarantorLoanWithDetails) => {
    // Get guarantor details
    const guarantor = await guarantorsService.getById(gl.guarantor_id)
    if (!guarantor?.email) {
      setSnackbar({ open: true, message: 'לערב אין כתובת מייל', severity: 'error' })
      return
    }

    // Get original loan details
    const originalLoan = await loansService.getById(gl.original_loan_id)
    
    const emailData = createGuarantorDebtEmailData({
      gemachName: settings.gemach_name || 'גמ"ח שלי',
      guarantorName: gl.guarantor_name,
      guarantorEmail: guarantor.email,
      borrowerName: gl.borrower_name,
      originalAmount: originalLoan?.amount || 0,
      guarantorAmount: gl.amount,
      guarantorRemaining: gl.remaining,
      dueDate: gl.due_date,
      monthlyPayments: gl.monthly_payments,
      gemachLogo: settings.gemach_logo,
      dateFormat: settings.date_format
    })

    const provider = (settings.email_provider || 'gmail') as EmailProvider
    const result = await openEmailWithDocument(emailData, provider)
    
    setSnackbar({
      open: true,
      message: result.message,
      severity: result.success ? 'success' : 'error'
    })
  }

  // Check if original loan was repaid and delete guarantor loans
  const checkOriginalLoanRepaid = async (originalLoanId: number) => {
    const loan = await loansService.getById(originalLoanId)
    if (loan && loan.remaining === 0) {
      await guarantorLoansService.deleteByOriginalLoan(originalLoanId)
      loadGuarantorLoans()
      return true
    }
    return false
  }

  const getStatus = (guarantor: Guarantor) => {
    if (guarantor.is_blacklisted) {
      return { label: '🚫 חסום', color: 'error' as const }
    }
    if ((guarantor.total_guarantees || 0) > riskThreshold) {
      return { label: '⚠️ בסיכון גבוה', color: 'warning' as const }
    }
    return { label: '✅ פעיל', color: 'success' as const }
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const stats = {
    total: guarantors.length,
    active: guarantors.filter(g => !g.is_blacklisted && (g.total_guarantees || 0) <= riskThreshold).length,
    highRisk: guarantors.filter(g => !g.is_blacklisted && (g.total_guarantees || 0) > riskThreshold).length,
    totalGuarantees: guarantors.reduce((sum, g) => sum + (g.total_guarantees || 0), 0),
  }

  return (
    <Box>
      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="primary">{stats.total}</Typography>
              <Typography variant="body2">סה"כ ערבים</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main">{stats.active}</Typography>
              <Typography variant="body2">ערבים פעילים</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main">{stats.highRisk}</Typography>
              <Typography variant="body2">בסיכון גבוה</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="info.main">{formatCurrency(stats.totalGuarantees)}</Typography>
              <Typography variant="body2">ערבויות פעילות</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add Form */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {editingId ? 'עריכת ערב' : 'הוספת ערב חדש'}
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="שם פרטי *"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="שם משפחה *"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="טלפון *"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="מספר זהות"
                value={formData.id_number}
                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="כתובת"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="אימייל"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="הערות"
                multiline
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave}>
              {editingId ? 'עדכן ערב' : 'הוסף ערב'}
            </Button>
            {editingId && (
              <Button variant="outlined" onClick={handleCancelEdit}>
                ביטול
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="חיפוש ערב לפי שם, טלפון, מ.ז..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            הסבר סטטוסים: ✅ פעיל - ערב רגיל | ⚠️ בסיכון גבוה - מעל {formatCurrency(riskThreshold)} ערבויות | 🚫 חסום - ברשימה שחורה
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>שם</TableCell>
                  <TableCell>טלפון</TableCell>
                  <TableCell align="center">סכום ערבויות</TableCell>
                  <TableCell align="center">סטטוס</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guarantors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין ערבים</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  guarantors.map((guarantor) => {
                    const status = getStatus(guarantor)
                    return (
                      <TableRow key={guarantor.id} hover>
                        <TableCell>
                          {guarantor.first_name} {guarantor.last_name}
                        </TableCell>
                        <TableCell>{guarantor.phone}</TableCell>
                        <TableCell align="center">
                          {formatCurrency(guarantor.total_guarantees || 0)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={status.label} color={status.color} size="small" />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton size="small" onClick={() => handleEdit(guarantor)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => guarantor.id && handleDelete(guarantor.id)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Guarantor Loans Section */}
      {guarantorLoans.length > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PaymentIcon color="warning" />
              הלוואות שהועברו לערבים ({guarantorLoans.filter(gl => gl.status === 'active').length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              הלוואות אלו נוצרו כאשר לווה לא פרע את חובו והחוב הועבר לערב. אם הלווה המקורי יפרע את החוב, ההלוואה תימחק אוטומטית.
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'warning.light' }}>
                    <TableCell>ערב</TableCell>
                    <TableCell>לווה מקורי</TableCell>
                    <TableCell align="center">סכום</TableCell>
                    <TableCell align="center">שולם</TableCell>
                    <TableCell align="center">יתרה</TableCell>
                    <TableCell align="center">תאריך פירעון</TableCell>
                    <TableCell align="center">סטטוס</TableCell>
                    <TableCell align="center">פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {guarantorLoans.map((gl) => (
                    <TableRow key={gl.id} hover>
                      <TableCell>{gl.guarantor_name}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LinkIcon fontSize="small" color="action" />
                          {gl.borrower_name}
                        </Box>
                      </TableCell>
                      <TableCell align="center">{formatCurrency(gl.amount)}</TableCell>
                      <TableCell align="center" sx={{ color: 'success.main' }}>
                        {formatCurrency(gl.total_repaid || 0)}
                      </TableCell>
                      <TableCell align="center" sx={{ color: gl.remaining > 0 ? 'error.main' : 'success.main' }}>
                        {formatCurrency(gl.remaining)}
                      </TableCell>
                      <TableCell align="center">
                        {gl.due_date ? formatDisplayDate(gl.due_date, settings.date_format) : 
                         gl.monthly_payments ? `${gl.monthly_payments} תשלומים` : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={gl.status === 'paid' ? 'נפרע' : 'פעיל'} 
                          color={gl.status === 'paid' ? 'success' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell align="center">
                        {gl.status === 'active' && (
                          <>
                            <IconButton 
                              size="small" 
                              color="primary" 
                              onClick={() => handleOpenRepayment(gl)}
                              title="רשום תשלום"
                            >
                              <PaymentIcon />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              color="secondary" 
                              onClick={() => handleSendDebtEmail(gl)}
                              title="שלח הודעת חוב במייל"
                            >
                              <EmailIcon />
                            </IconButton>
                          </>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteGuarantorLoan(gl.id)}
                          title="מחק"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Repayment Dialog */}
      <Dialog open={repaymentDialogOpen} onClose={() => setRepaymentDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>רישום תשלום מערב</DialogTitle>
        <DialogContent>
          {selectedGuarantorLoan && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                ערב: <strong>{selectedGuarantorLoan.guarantor_name}</strong>
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                יתרה לתשלום: <strong>{formatCurrency(selectedGuarantorLoan.remaining)}</strong>
              </Typography>
              <Divider sx={{ my: 2 }} />
              <AmountInput
                fullWidth
                label="סכום לתשלום"
                value={parseFloat(repaymentAmount) || 0}
                onChange={(value) => setRepaymentAmount(String(value))}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRepaymentDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleAddRepayment}>רשום תשלום</Button>
        </DialogActions>
      </Dialog>

      {/* Cross-Check Warning Dialog */}
      <CrossCheckWarningDialog
        open={crossCheckDialogOpen}
        onClose={handleCrossCheckCancel}
        onContinue={handleCrossCheckContinue}
        warnings={crossCheckWarnings}
        title="אזהרה - יצירת ערב"
      />

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
