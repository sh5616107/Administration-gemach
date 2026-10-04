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
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Stack,
  Autocomplete,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon,
  Link as LinkIcon,
  Email as EmailIcon,
  History as HistoryIcon,
  Description as DescriptionIcon,
  AccountBalance as RefundIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { guarantorsService, guarantorLoansService, guarantorLoanRepaymentsService, guarantorRefundsService, loansService, repaymentsService, borrowersService, type Guarantor, type GuarantorLoan } from '../../services/database'
import { useSettings } from '../../hooks/useSettings'
import { formatDisplayDate } from '../../utils/dateUtils'
import { confirmAction, confirmDeleteMessage } from '../../utils/confirmDialog'
import { openEmailWithDocument, createGuarantorDebtEmailData, generateGuarantorStatement, type EmailProvider, type GuarantorStatementData } from '../../services/documents'
import AmountInput from '../AmountInput'
import CrossCheckWarningDialog from '../CrossCheckWarningDialog'
import { checkNewGuarantor, type CrossCheckResult } from '../../services/crossCheck'
import { GuarantorRefundDialog } from '../GuarantorRefundDialog'
import AttachmentsSection from '../attachments/AttachmentsSection'
import logger from '../../utils/logger'
import LoanCard from './LoanCard'
import type { Loan } from '../../services/database'

const emptyGuarantor: Omit<Guarantor, 'id' | 'created_at'> = {
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
  const [formData, setFormData] = useState<Omit<Guarantor, 'id' | 'created_at'>>(emptyGuarantor)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [guarantorPanelOpen, setGuarantorPanelOpen] = useState(false)
  const [selectedGuarantor, setSelectedGuarantor] = useState<Guarantor | null>(null)
  const [guaranteedLoans, setGuaranteedLoans] = useState<Loan[]>([])
  const [loanDetailsOpen, setLoanDetailsOpen] = useState(false)
  const [selectedLoanDetails, setSelectedLoanDetails] = useState<Loan | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  
  // Guarantor loans state
  const [guarantorLoans, setGuarantorLoans] = useState<GuarantorLoanWithDetails[]>([])
  const [repaymentDialogOpen, setRepaymentDialogOpen] = useState(false)
  const [selectedGuarantorLoan, setSelectedGuarantorLoan] = useState<GuarantorLoanWithDetails | null>(null)
  const [repaymentAmount, setRepaymentAmount] = useState('')
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [repaymentHistory, setRepaymentHistory] = useState<any[]>([])
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)

  // Cross-check warning states
  const [crossCheckWarnings, setCrossCheckWarnings] = useState<CrossCheckResult[]>([])
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false)

  const riskThreshold = parseInt(settings.risk_threshold) || 50000

  useEffect(() => {
    loadGuarantors()
    loadGuarantorLoans()
  }, [])

  useEffect(() => {
    loadGuaranteedLoans()
  }, [selectedGuarantor?.id])

  const loadGuaranteedLoans = async () => {
    if (!selectedGuarantor?.id) {
      setGuaranteedLoans([])
      return
    }
    try {
      const allLoans = await loansService.getAll()
      setGuaranteedLoans(allLoans.filter(loan => loan.guarantor1_id === selectedGuarantor.id || loan.guarantor2_id === selectedGuarantor.id))
    } catch (error) {
      console.error('Error loading guaranteed loans:', error)
    }
  }

  const handleOpenLoanDetails = (loan: Loan) => {
    setSelectedLoanDetails(loan)
    setLoanDetailsOpen(true)
  }

  const isDueDateReached = (dueDate?: string) => {
    if (!dueDate) return false
    return dueDate <= new Date().toISOString().split('T')[0]
  }

  const loadGuarantorLoans = async () => {
    try {
      logger.info('[REFUND-UI] Loading guarantor loans and running refund sync')
      await guarantorLoansService.syncRefundNotes()
      const data = await guarantorLoansService.getAllWithDetails()
      const visibleData = []
      for (const guarantorLoan of data) {
        const repayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(guarantorLoan.id)
        const paidByGuarantor = repayments
          .filter(repayment => !repayment.source_repayment_id)
          .reduce((sum, repayment) => sum + repayment.amount, 0)

        if (paidByGuarantor <= 0) {
          logger.info(`[REFUND-UI] Hiding guarantorLoan=${guarantorLoan.id}; no guarantor payment, only borrower-synced repayments`)
          continue
        }

        visibleData.push(guarantorLoan)
      }

      logger.info(`[REFUND-UI] Loaded guarantor loans=${data.length}; visible on guarantor card=${visibleData.length}`)
      setGuarantorLoans(visibleData)
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
      setSelectedGuarantor(current => current ? (withTotals.find(g => g.id === current.id) || null) : null)
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
    setSelectedGuarantor(guarantor)
    setEditingId(guarantor.id || null)
    setFormData(guarantor)
    setGuarantorPanelOpen(true)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setFormData(emptyGuarantor)
    setGuarantorPanelOpen(false)
  }

  const handleNewGuarantor = () => {
    setSelectedGuarantor(null)
    setEditingId(null)
    setFormData(emptyGuarantor)
    setGuarantorPanelOpen(true)
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

  const handleDelete = async (id: string) => {
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
      
      if (!(await confirmAction(confirmDeleteMessage(confirmMessage)))) return
      
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

  const handleShowHistory = async (loan: GuarantorLoanWithDetails) => {
    setSelectedGuarantorLoan(loan)
    const history = await guarantorLoanRepaymentsService.getByGuarantorLoan(loan.id)
    setRepaymentHistory(history)
    setHistoryDialogOpen(true)
  }

  const handleOpenRefundDialog = (loan: GuarantorLoanWithDetails) => {
    setSelectedGuarantorLoan(loan)
    setRefundDialogOpen(true)
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

  const handleDeleteGuarantorLoan = async (id: string) => {
    if (!(await confirmAction(confirmDeleteMessage('האם למחוק את הלוואת הערב?')))) return

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
        if (originalLoan) {
          // תמיד מחזירים לסטטוס overdue, לא משנה מה הסטטוס הנוכחי
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
          setSnackbar({ open: true, message: 'הלוואת הערב נמחקה', severity: 'error' })
        }
      }

      // מחיקת הלוואת הערב - אחרי שעדכנו את ההלוואה המקורית
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
      gemachDocumentFrame: settings.gemach_document_frame,
      frameMarginTop: settings.gemach_frame_margin_top,
      frameMarginBottom: settings.gemach_frame_margin_bottom,
      frameMarginRight: settings.gemach_frame_margin_right,
      frameMarginLeft: settings.gemach_frame_margin_left,
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

  const handleGenerateGuarantorReport = async (guarantorId: string) => {
    try {
      // Get guarantor details
      const guarantor = await guarantorsService.getById(guarantorId)
      if (!guarantor) {
        setSnackbar({ open: true, message: 'ערב לא נמצא', severity: 'error' })
        return
      }
      
      // Get all guarantor loans for this guarantor (loans transferred to guarantor)
      const allGuarantorLoans = await guarantorLoansService.getByGuarantor(guarantorId)
      
      // Get all regular loans where this person is a guarantor
      const allLoans = await loansService.getAll()
      const regularLoansAsGuarantor = allLoans.filter(
        loan => ((loan.guarantor1_id && loan.guarantor1_id === guarantorId) || 
                 (loan.guarantor2_id && loan.guarantor2_id === guarantorId)) && 
                loan.status === 'active'
      )
      
      // Check if there's any data to show
      if (allGuarantorLoans.length === 0 && regularLoansAsGuarantor.length === 0) {
        setSnackbar({ open: true, message: 'לערב זה אין הלוואות', severity: 'success' })
        return
      }
      
      // Build guarantor loans data
      const guarantorLoansData = await Promise.all(allGuarantorLoans.map(async (gl) => {
        const originalLoan = await loansService.getById(gl.original_loan_id)
        const borrower = originalLoan ? await borrowersService.getById(originalLoan.borrower_id) : null
        const repayments = await guarantorLoanRepaymentsService.getByGuarantorLoan(gl.id)
        const refundMatch = gl.notes?.match(/מגיע החזר לערב: ([\d.]+)₪/)
        const refundDue = refundMatch ? parseInt(refundMatch[1], 10) : undefined
        
        return {
          borrowerName: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
          originalLoanAmount: originalLoan?.amount || 0,
          originalLoanDate: originalLoan?.loan_date || '',
          guarantorLoanAmount: gl.amount,
          totalPaid: gl.total_repaid || 0,
          remaining: gl.amount - (gl.total_repaid || 0),
          status: gl.status,
          repayments: repayments.map(r => ({
            amount: r.amount,
            payment_date: r.payment_date,
            notes: r.notes
          })),
          refundDue
        }
      }))
      
      // Build regular loans data
      const regularLoansData = await Promise.all(regularLoansAsGuarantor.map(async (loan) => {
        const borrower = await borrowersService.getById(loan.borrower_id)
        return {
          borrowerName: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע',
          loanAmount: loan.amount,
          loanDate: loan.loan_date,
          remaining: loan.remaining,
          status: loan.status,
          dueDate: loan.due_date
        }
      }))
      
      const statementData: GuarantorStatementData = {
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        guarantorName: `${guarantor.first_name} ${guarantor.last_name}`,
        guarantorPhone: guarantor.phone,
        guarantorEmail: guarantor.email,
        dateFormat: settings.date_format,
        guarantorLoans: guarantorLoansData.length > 0 ? guarantorLoansData : undefined,
        regularLoans: regularLoansData.length > 0 ? regularLoansData : undefined
      }
      
      await generateGuarantorStatement(statementData)
      
      setSnackbar({ 
        open: true, 
        message: 'הדוח הופק בהצלחה', 
        severity: 'success' 
      })
    } catch (error) {
      console.error('Error generating guarantor report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת הדוח', severity: 'error' })
    }
  }

  // Check if original loan was repaid and delete guarantor loans
  const checkOriginalLoanRepaid = async (originalLoanId: string) => {
    const loan = await loansService.getById(originalLoanId)
    if (loan && loan.remaining === 0) {
      await guarantorLoansService.deleteByOriginalLoan(originalLoanId)
      loadGuarantorLoans()
      return true
    }
    return false
  }

  const getStatus = (guarantor: Guarantor & { total_guarantees?: number }) => {
    if (guarantor.is_blacklisted) {
      return { label: 'חסום', color: 'error' as const, icon: <BlockIcon sx={{ fontSize: 16 }} /> }
    }
    if ((guarantor.total_guarantees || 0) > riskThreshold) {
      return { label: 'בסיכון גבוה', color: 'warning' as const, icon: <WarningIcon sx={{ fontSize: 16 }} /> }
    }
    return { label: 'פעיל', color: 'success' as const, icon: <CheckCircleIcon sx={{ fontSize: 16 }} /> }
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
    active: guarantors.filter(g => !g.is_blacklisted && ((g as any).total_guarantees || 0) <= riskThreshold).length,
    highRisk: guarantors.filter(g => !g.is_blacklisted && ((g as any).total_guarantees || 0) > riskThreshold).length,
    totalGuarantees: guarantors.reduce((sum, g) => sum + ((g as any).total_guarantees || 0), 0),
  }

  return (
    <Box>
      {/* Stats */}
      <Grid container spacing={2} sx={{ display: 'none' }}>
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

      {/* Unified guarantor screens: picker screen and selected-guarantor screen */}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              options={guarantors}
              value={selectedGuarantor}
              onChange={(_, value) => setSelectedGuarantor(value)}
              getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="חיפוש ערב לפי שם, טלפון, ת.ז... (או לחצו לרשימה המלאה)"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: selectedGuarantor ? (
                      <InputAdornment position="start"><IconButton size="small" onClick={() => setSelectedGuarantor(null)}>×</IconButton></InputAdornment>
                    ) : params.InputProps.startAdornment,
                  }}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1} sx={{ height: '100%' }}>
              {selectedGuarantor && (
                <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => handleEdit(selectedGuarantor)}>
                  ערוך פרטי ערב
                </Button>
              )}
              <Button fullWidth variant={selectedGuarantor ? 'outlined' : 'contained'} startIcon={<AddIcon />} onClick={handleNewGuarantor}>
                ערב חדש
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {!selectedGuarantor ? (
        <Box sx={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="h6" color="text.secondary">בחר ערב כדי להציג את הערבויות שלו</Typography>
        </Box>
      ) : (
        <Grid container spacing={4} alignItems="flex-start">
          <Grid item xs={12} md={8}>
            <Typography variant="h4" sx={{ mb: 3 }}>הערבויות של {selectedGuarantor.first_name} {selectedGuarantor.last_name}</Typography>
            {guaranteedLoans.length === 0 ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <Typography color="text.secondary">אין הלוואות שבהן הערב מוגדר כערב.</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {guaranteedLoans.map((loan) => (
                  <Grid item xs={12} sm={6} key={`selected-loan-${loan.id}`}>
                    <LoanCard loan={loan} onClick={() => handleOpenLoanDetails(loan)} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ p: 2, position: { md: 'sticky' }, top: 16 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>{selectedGuarantor.first_name} {selectedGuarantor.last_name}</Typography>
              <Stack spacing={1} sx={{ mb: 3 }}>
                <Typography variant="body1">☎ {selectedGuarantor.phone}</Typography>
                {selectedGuarantor.address && <Typography variant="body1">⌖ {selectedGuarantor.address}</Typography>}
                {selectedGuarantor.email && <Typography variant="body1">{selectedGuarantor.email}</Typography>}
              </Stack>
              <Grid container spacing={1}>
                <Grid item xs={6}><Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}><Typography variant="caption">סך הלוואות</Typography><Typography variant="h5">{formatCurrency(guaranteedLoans.reduce((sum, loan) => sum + loan.amount, 0))}</Typography></Card></Grid>
                <Grid item xs={6}><Card variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}><Typography variant="caption">חוב נוכחי</Typography><Typography variant="h5" color="error.main">{formatCurrency(guaranteedLoans.reduce((sum, loan) => sum + (loan.remaining ?? loan.amount - (loan.total_repaid || 0)), 0))}</Typography></Card></Grid>
              </Grid>
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Chip label={`פעילות: ${guaranteedLoans.filter(loan => (loan.remaining ?? loan.amount - (loan.total_repaid || 0)) > 0).length}`} color="primary" />
                <Chip label={`נפרעו: ${guaranteedLoans.filter(loan => (loan.remaining ?? loan.amount - (loan.total_repaid || 0)) <= 0).length}`} color="success" />
              </Stack>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Legacy inline editor: the unified flow uses the side panel below. */}
      <Card sx={{ mb: 3, display: 'none' }}>
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

          {editingId && (
            <>
              <Divider sx={{ my: 2 }} />
              <AttachmentsSection entityType="guarantor" entityId={editingId} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Search */}
      <Card sx={{ mb: 3, display: 'none' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleNewGuarantor}>
              ערב חדש
            </Button>
          </Box>
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

      {selectedGuarantor && (
        <Card sx={{ mb: 3, display: 'none' }}>
          <CardContent>
            <Button onClick={() => setSelectedGuarantor(null)} sx={{ mb: 2 }}>
              ← חזרה לרשימת הערבים
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="overline" color="text.secondary">פרטי הערב שנבחר</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {selectedGuarantor.first_name} {selectedGuarantor.last_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                  <Typography variant="body2">טלפון: {selectedGuarantor.phone}</Typography>
                  {selectedGuarantor.email && <Typography variant="body2">אימייל: {selectedGuarantor.email}</Typography>}
                  {selectedGuarantor.id_number && <Typography variant="body2">מ.ז.: {selectedGuarantor.id_number}</Typography>}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ textAlign: 'center', bgcolor: 'warning.50', px: 2, py: 1, borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">סה״כ ערבויות</Typography>
                  <Typography variant="h6" color="warning.dark">{formatCurrency((selectedGuarantor as any).total_guarantees || 0)}</Typography>
                </Box>
                <Button variant="outlined" startIcon={<EditIcon />} onClick={() => handleEdit(selectedGuarantor)}>עריכה</Button>
              </Box>
            </Box>
            {selectedGuarantor.address && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>כתובת: {selectedGuarantor.address}</Typography>}
            {selectedGuarantor.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{selectedGuarantor.notes}</Typography>}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card sx={{ display: 'none' }}>
        <CardContent>
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary" component="span">הסבר סטטוסים:</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
              <Typography variant="body2" color="text.secondary" component="span">פעיל - ערב רגיל</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              <Typography variant="body2" color="text.secondary" component="span">בסיכון גבוה - מעל {formatCurrency(riskThreshold)} ערבויות</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <BlockIcon sx={{ fontSize: 16, color: 'error.main' }} />
              <Typography variant="body2" color="text.secondary" component="span">חסום - ברשימה שחורה</Typography>
            </Box>
          </Box>
          {guarantors.length > 0 && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {guarantors.map((guarantor) => {
                const status = getStatus(guarantor)
                const isSelected = selectedGuarantor?.id === guarantor.id
                return (
                  <Grid item xs={12} sm={6} lg={4} key={`card-${guarantor.id}`}>
                    <Card
                      variant={isSelected ? 'elevation' : 'outlined'}
                      onClick={() => setSelectedGuarantor(guarantor)}
                      sx={{ height: '100%', cursor: 'pointer', border: isSelected ? 2 : undefined, borderColor: 'primary.main', '&:hover': { boxShadow: 3 } }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                          <Box>
                            <Typography variant="h6">{guarantor.first_name} {guarantor.last_name}</Typography>
                            <Typography variant="body2" color="text.secondary">{guarantor.phone}</Typography>
                          </Box>
                          <Chip label={status.label} color={status.color} size="small" />
                        </Box>
                        <Divider sx={{ my: 1.5 }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">ערבויות פעילות</Typography>
                          <Typography fontWeight="bold">{formatCurrency((guarantor as any).total_guarantees || 0)}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 1 }}>
                          <IconButton size="small" color="info" onClick={(e) => { e.stopPropagation(); guarantor.id && handleGenerateGuarantorReport(guarantor.id) }} title="הפק דוח"><DescriptionIcon /></IconButton>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEdit(guarantor) }} title="ערוך"><EditIcon /></IconButton>
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); guarantor.id && handleDelete(guarantor.id) }} title="מחק"><DeleteIcon /></IconButton>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                )
              })}
            </Grid>
          )}
          <TableContainer component={Paper} variant="outlined" sx={{ display: 'none' }}>
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
                      <TableRow
                        key={guarantor.id}
                        hover
                        selected={selectedGuarantor?.id === guarantor.id}
                        onClick={() => setSelectedGuarantor(guarantor)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>
                          {guarantor.first_name} {guarantor.last_name}
                        </TableCell>
                        <TableCell>{guarantor.phone}</TableCell>
                        <TableCell align="center">
                          {formatCurrency((guarantor as any).total_guarantees || 0)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={status.label} color={status.color} size="small" />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton 
                            size="small" 
                            color="info"
                            onClick={() => handleGenerateGuarantorReport(guarantor.id)}
                            title="הפק דוח ערב"
                          >
                            <DescriptionIcon />
                          </IconButton>
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

      {selectedGuarantor && (
        <Card sx={{ mt: 3, display: 'none' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">הלוואות שעליהן {selectedGuarantor.first_name} {selectedGuarantor.last_name} ערב</Typography>
              <Chip label={guaranteedLoans.length} color="primary" size="small" />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              בחר הלוואה כדי לפתוח את פרטיה, או השתמש בכפתור העריכה שעל הכרטיס.
            </Typography>
            {guaranteedLoans.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">אין הלוואות שבהן ערב זה מוגדר כערב.</Typography>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {guaranteedLoans.map((loan) => (
                  <Grid item xs={12} sm={6} key={loan.id}>
                    <LoanCard loan={loan} onClick={() => handleOpenLoanDetails(loan)} />
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>
      )}

      {/* Guarantor Loans Section */}
      {selectedGuarantor && guarantorLoans.some(gl => gl.guarantor_id === selectedGuarantor.id) && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <PaymentIcon color="warning" />
              הלוואות שהועברו לערבים ({guarantorLoans.filter(gl => gl.guarantor_id === selectedGuarantor.id).length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              הלוואות אלו נוצרו כאשר לווה לא פרע את חובו והחוב הועבר לערב. הרשומה נשארת כדי לעקוב אחר החוב של הלווה לערב, ותימחק אוטומטית רק כאשר הלווה המקורי יפרע את החוב.
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
              {guarantorLoans.filter(gl => gl.guarantor_id === selectedGuarantor.id).map((gl) => (
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
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', alignItems: 'center' }}>
                          <Chip 
                            label={gl.status === 'paid' ? 'נפרע' : 'פעיל'} 
                            color={gl.status === 'paid' ? 'success' : 'warning'} 
                            size="small" 
                          />
                          {gl.notes && gl.notes.includes('מגיע החזר לערב') && (
                            <Chip 
                              icon={<WarningIcon />}
                              label="מגיע החזר" 
                              color="error" 
                              size="small"
                              sx={{ fontWeight: 'bold' }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          color="warning" 
                          onClick={() => handleShowHistory(gl)}
                          title="היסטוריית תשלומים"
                        >
                          <HistoryIcon />
                        </IconButton>
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
                        {gl.notes && gl.notes.includes('מגיע החזר לערב') && (
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleOpenRefundDialog(gl)}
                            title="ניהול החזרים לערב"
                            sx={{ 
                              animation: 'pulse 2s infinite',
                              '@keyframes pulse': {
                                '0%, 100%': { opacity: 1 },
                                '50%': { opacity: 0.5 }
                              }
                            }}
                          >
                            <RefundIcon />
                          </IconButton>
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

      <Drawer
        anchor="left"
        open={guarantorPanelOpen}
        onClose={handleCancelEdit}
        PaperProps={{ sx: { width: { xs: '100%', sm: 500 }, p: 3 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{editingId ? 'עריכת ערב' : 'ערב חדש'}</Typography>
          <IconButton onClick={handleCancelEdit} aria-label="סגור"><CloseIcon /></IconButton>
        </Box>
        <Divider sx={{ mb: 3 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}><TextField fullWidth label="שם פרטי *" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="שם משפחה *" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="טלפון *" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></Grid>
          <Grid item xs={12} sm={6}><TextField fullWidth label="מספר זהות" value={formData.id_number} onChange={(e) => setFormData({ ...formData, id_number: e.target.value })} /></Grid>
          <Grid item xs={12}><TextField fullWidth label="כתובת" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} /></Grid>
          <Grid item xs={12}><TextField fullWidth label="אימייל" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></Grid>
          <Grid item xs={12}><TextField fullWidth label="הערות" multiline rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} /></Grid>
        </Grid>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
          <Button onClick={handleCancelEdit}>ביטול</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave}>{editingId ? 'עדכן ערב' : 'הוסף ערב'}</Button>
        </Box>
        {editingId && <><Divider sx={{ my: 3 }} /><AttachmentsSection entityType="guarantor" entityId={editingId} /></>}
      </Drawer>

      <Dialog open={loanDetailsOpen} onClose={() => setLoanDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>פרטי ערבות</DialogTitle>
        <DialogContent>
          {selectedLoanDetails && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">הלווה</Typography>
                <Typography variant="h6">{selectedLoanDetails.borrower_name || 'לא ידוע'}</Typography>
              </Box>
              <Divider />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">מספר הלוואה</Typography>
                  <Typography>#{selectedLoanDetails.loan_number}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">סכום ההלוואה</Typography>
                  <Typography>{formatCurrency(selectedLoanDetails.amount)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">תאריך פירעון</Typography>
                  <Typography>
                    {selectedLoanDetails.due_date
                      ? formatDisplayDate(selectedLoanDetails.due_date, settings.date_format)
                      : 'לא נקבע'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">סטטוס מועד הפירעון</Typography>
                  {selectedLoanDetails.due_date ? (
                    <Chip
                      label={isDueDateReached(selectedLoanDetails.due_date) ? 'מועד הפירעון הגיע' : 'מועד הפירעון טרם הגיע'}
                      color={isDueDateReached(selectedLoanDetails.due_date) ? 'error' : 'success'}
                    />
                  ) : (
                    <Chip label="לא נקבע תאריך פירעון" color="default" />
                  )}
                </Grid>
              </Grid>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLoanDetailsOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

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

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          היסטוריית תשלומים - {selectedGuarantorLoan?.guarantor_name}
        </DialogTitle>
        <DialogContent>
          {selectedGuarantorLoan && (
            <Box sx={{ pt: 1 }}>
              {/* Refund Alert */}
              {selectedGuarantorLoan.notes && selectedGuarantorLoan.notes.includes('מגיע החזר לערב') && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'error.light', borderRadius: 1, border: '2px solid', borderColor: 'error.main' }}>
                  <Typography variant="h6" color="error.dark" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningIcon /> שים לב: מגיע החזר לערב!
                  </Typography>
                  <Typography variant="body2" color="error.dark" sx={{ mt: 1, whiteSpace: 'pre-line' }}>
                    {selectedGuarantorLoan.notes.split('\n').filter(line => line.includes('מגיע החזר')).join('\n')}
                  </Typography>
                </Box>
              )}

              <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">סכום הלוואה מקורי</Typography>
                    <Typography variant="h6">{formatCurrency(selectedGuarantorLoan.amount)}</Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">סה"כ שולם</Typography>
                    <Typography variant="h6" color="success.main">
                      {formatCurrency(selectedGuarantorLoan.total_repaid || 0)}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">יתרה</Typography>
                    <Typography variant="h6" color={selectedGuarantorLoan.remaining > 0 ? 'error.main' : 'success.main'}>
                      {formatCurrency(selectedGuarantorLoan.remaining)}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              {repaymentHistory.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>תאריך</TableCell>
                        <TableCell align="center">סכום</TableCell>
                        <TableCell>אמצעי תשלום</TableCell>
                        <TableCell>הערות</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {repaymentHistory.map((rep) => (
                        <TableRow key={rep.id}>
                          <TableCell>{formatDisplayDate(rep.payment_date, settings.date_format)}</TableCell>
                          <TableCell align="center">
                            <Chip label={formatCurrency(rep.amount)} color="success" size="small" />
                          </TableCell>
                          <TableCell>
                            {rep.payment_method ? (
                              rep.payment_method === 'cash' ? 'מזומן' :
                              rep.payment_method === 'credit' ? 'אשראי' :
                              rep.payment_method === 'transfer' ? 'העברה' :
                              rep.payment_method === 'check' ? "צ'ק" : 'אחר'
                            ) : '-'}
                          </TableCell>
                          <TableCell>{rep.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">אין תשלומים עדיין</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>סגור</Button>
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

      {/* Guarantor Refund Dialog */}
      {selectedGuarantorLoan && (
        <GuarantorRefundDialog
          open={refundDialogOpen}
          onClose={() => setRefundDialogOpen(false)}
          guarantorLoan={selectedGuarantorLoan}
          onUpdate={() => {
            loadGuarantorLoans()
            loadGuarantors()
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
