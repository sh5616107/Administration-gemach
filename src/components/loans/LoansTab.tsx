import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  Autocomplete,
  FormControl,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
} from '@mui/material'
import {
  Save as SaveIcon,
  Add as AddIcon,
  Payment as PaymentIcon,
  Description as DocIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { borrowersService, guarantorsService, loansService, repaymentsService, guarantorLoansService, blacklistService, waitlistService, type WaitlistEntry } from '../../services/database'
import { generateLoanDocument, openEmailWithDocument, createLoanEmailData, EmailProvider } from '../../services/documents'
import { useSettings } from '../../hooks/useSettings'
import { formatDisplayDate, toHebrewDate } from '../../utils/dateUtils'
import PaymentMethodSelect, { PaymentMethodData, getPaymentMethodLabel } from '../PaymentMethodSelect'
import AmountInput from '../AmountInput'
import CrossCheckWarningDialog from '../CrossCheckWarningDialog'
import { checkGuarantorForLoan, checkBorrowerForLoan, type CrossCheckResult } from '../../services/crossCheck'

interface Borrower {
  id: number
  first_name: string
  last_name: string
  email?: string
}

interface Guarantor {
  id: number
  first_name: string
  last_name: string
  is_blacklisted?: number
}

interface Loan {
  id?: number
  borrower_id: number
  amount: number
  loan_date: string
  loan_date_hebrew?: string
  loan_type: string
  due_date?: string
  due_date_hebrew?: string
  is_recurring: number
  recurring_months?: number
  recurring_day?: number
  auto_repayment: number
  repayment_amount?: number
  repayment_day?: number
  repayment_frequency?: string
  repayment_start_date?: string
  guarantor1_id?: number
  guarantor2_id?: number
  notes?: string
  status?: string
  total_repaid?: number
  remaining?: number
  borrower_name?: string
}

interface Repayment {
  id: number
  loan_id: number
  amount: number
  payment_date: string
  notes?: string
  payment_method?: string
  payment_details?: string
}

const emptyLoan: Loan = {
  borrower_id: 0,
  amount: 0,
  loan_date: new Date().toISOString().split('T')[0],
  loan_type: 'flexible',
  is_recurring: 0,
  auto_repayment: 0,
}

interface LoansTabProps {
  initialBorrowerId?: number | null
  initialWaitlistId?: number | null
}

export default function LoansTab({ initialBorrowerId, initialWaitlistId }: LoansTabProps) {
  const { settings } = useSettings()
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [borrowerLoans, setBorrowerLoans] = useState<Loan[]>([])
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null)
  const [formData, setFormData] = useState<Loan>(emptyLoan)
  const [repayments, setRepayments] = useState<Repayment[]>([])
  const [repaymentDialogOpen, setRepaymentDialogOpen] = useState(false)
  const [repaymentAmount, setRepaymentAmount] = useState(0)
  const [multiRepaymentDialogOpen, setMultiRepaymentDialogOpen] = useState(false)
  const [multiRepaymentAmount, setMultiRepaymentAmount] = useState(0)
  const [editRepaymentDialogOpen, setEditRepaymentDialogOpen] = useState(false)
  const [editingRepayment, setEditingRepayment] = useState<Repayment | null>(null)
  const [editRepaymentAmount, setEditRepaymentAmount] = useState(0)
  const [editRepaymentDate, setEditRepaymentDate] = useState('')
  const [editRepaymentNotes, setEditRepaymentNotes] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistEntry | null>(null)
  
  // Blacklist state
  const [blacklistedBorrowerIds, setBlacklistedBorrowerIds] = useState<number[]>([])
  
  // Payment method states
  const [loanPaymentMethod, setLoanPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })
  const [repaymentPaymentMethod, setRepaymentPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })
  const [editRepaymentPaymentMethod, setEditRepaymentPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })

  // Cross-check warning states
  const [crossCheckWarnings, setCrossCheckWarnings] = useState<CrossCheckResult[]>([])
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false)
  const [pendingGuarantorId, setPendingGuarantorId] = useState<{ field: 'guarantor1_id' | 'guarantor2_id', id: number } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  // Handle initial borrower selection from search
  useEffect(() => {
    if (initialBorrowerId && borrowers.length > 0) {
      const borrower = borrowers.find(b => b.id === initialBorrowerId)
      if (borrower) {
        setSelectedBorrower(borrower)
      }
    }
  }, [initialBorrowerId, borrowers])

  // Handle waitlist entry
  useEffect(() => {
    const loadWaitlistEntry = async () => {
      if (initialWaitlistId && borrowers.length > 0) {
        try {
          const entry = await waitlistService.getById(initialWaitlistId)
          if (entry) {
            setWaitlistEntry(entry)
            const borrower = borrowers.find(b => b.id === entry.borrower_id)
            if (borrower) {
              setSelectedBorrower(borrower)
              // Pre-fill form with waitlist data
              const defaultMonths = entry.requested_months || parseInt(settings.default_loan_months) || 12
              const today = new Date()
              const dueDate = new Date(today)
              dueDate.setMonth(dueDate.getMonth() + defaultMonths)
              
              setFormData({
                ...emptyLoan,
                borrower_id: borrower.id,
                amount: entry.requested_amount,
                loan_type: entry.loan_type,
                loan_date: today.toISOString().split('T')[0],
                due_date: entry.loan_type === 'fixed' ? dueDate.toISOString().split('T')[0] : undefined,
                notes: entry.notes || '',
              })
              setSnackbar({ 
                open: true, 
                message: `טעינת בקשה מהתור: ${borrower.first_name} ${borrower.last_name} - ${formatCurrency(entry.requested_amount)}`, 
                severity: 'success' 
              })
            }
          }
        } catch (error) {
          console.error('Error loading waitlist entry:', error)
        }
      }
    }
    loadWaitlistEntry()
  }, [initialWaitlistId, borrowers, settings.default_loan_months])

  useEffect(() => {
    if (selectedBorrower) {
      loadBorrowerLoans(selectedBorrower.id)
      setFormData(prev => ({ ...prev, borrower_id: selectedBorrower.id }))
    } else {
      setBorrowerLoans([])
      setSelectedLoan(null)
    }
  }, [selectedBorrower])

  useEffect(() => {
    if (selectedLoan?.id) {
      loadRepayments(selectedLoan.id)
      setFormData(selectedLoan)
    } else {
      setRepayments([])
      // Use default loan type from settings
      const defaultLoanType = settings.default_loan_type || 'flexible'
      const defaultMonths = parseInt(settings.default_loan_months) || 12
      const today = new Date()
      const dueDate = new Date(today)
      dueDate.setMonth(dueDate.getMonth() + defaultMonths)
      
      setFormData({ 
        ...emptyLoan, 
        borrower_id: selectedBorrower?.id || 0,
        loan_type: defaultLoanType,
        due_date: defaultLoanType === 'fixed' ? dueDate.toISOString().split('T')[0] : undefined
      })
    }
  }, [selectedLoan, settings.default_loan_type])

  const loadData = async () => {
    try {
      const [borrowersData, guarantorsData, blacklistedIds] = await Promise.all([
        borrowersService.getAll(),
        guarantorsService.getAll(),
        blacklistService.getBlacklistedBorrowerIds(),
      ])
      setBorrowers(borrowersData as Borrower[])
      setGuarantors(guarantorsData as Guarantor[])
      setBlacklistedBorrowerIds(blacklistedIds)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const loadBorrowerLoans = async (borrowerId: number) => {
    try {
      const loans = await loansService.getByBorrower(borrowerId)
      setBorrowerLoans(loans as Loan[])
    } catch (error) {
      console.error('Error loading loans:', error)
    }
  }

  const loadRepayments = async (loanId: number) => {
    try {
      const data = await repaymentsService.getByLoan(loanId)
      setRepayments(data as Repayment[])
    } catch (error) {
      console.error('Error loading repayments:', error)
    }
  }

  const handleNewLoan = () => {
    setSelectedLoan(null)
    // Calculate default due date based on settings
    const defaultMonths = parseInt(settings.default_loan_months) || 12
    const defaultLoanType = settings.default_loan_type || 'flexible'
    const today = new Date()
    const dueDate = new Date(today)
    dueDate.setMonth(dueDate.getMonth() + defaultMonths)
    
    console.log('handleNewLoan - default_loan_type from settings:', settings.default_loan_type)
    console.log('handleNewLoan - defaultLoanType:', defaultLoanType)
    
    setFormData({ 
      ...emptyLoan, 
      borrower_id: selectedBorrower?.id || 0,
      loan_date: today.toISOString().split('T')[0],
      loan_type: defaultLoanType,
      due_date: defaultLoanType === 'fixed' ? dueDate.toISOString().split('T')[0] : undefined
    })
  }

  const handleSelectLoan = (loan: Loan) => {
    setSelectedLoan(loan)
    setFormData(loan)
  }

  const handleSave = async () => {
    if (!formData.borrower_id || !formData.amount || !formData.loan_date) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה', severity: 'error' })
      return
    }

    // בדיקת רשימה שחורה - מניעת הלוואה חדשה ללווה ברשימה שחורה
    if (!selectedLoan && blacklistedBorrowerIds.includes(formData.borrower_id)) {
      setSnackbar({ open: true, message: '⛔ לא ניתן ליצור הלוואה ללווה שנמצא ברשימה השחורה', severity: 'error' })
      return
    }

    // ולידציה: תאריך פירעון לא יכול להיות לפני תאריך ההלוואה
    if (formData.loan_type === 'fixed' && formData.due_date && formData.due_date < formData.loan_date) {
      setSnackbar({ open: true, message: 'תאריך פירעון לא יכול להיות לפני תאריך ההלוואה', severity: 'error' })
      return
    }

    try {
      if (selectedLoan?.id) {
        await loansService.update(selectedLoan.id, {
          ...formData,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        })
        setSnackbar({ open: true, message: 'ההלוואה עודכנה בהצלחה', severity: 'success' })
      } else {
        const result = await loansService.create({
          ...formData,
          payment_method: loanPaymentMethod.payment_method,
          payment_details: JSON.stringify(loanPaymentMethod),
        })
        
        // If this loan was created from waitlist, approve the entry
        if (waitlistEntry) {
          await waitlistService.approveEntry(waitlistEntry.id, result.lastInsertRowid)
          setSnackbar({ open: true, message: '✅ ההלוואה נוספה בהצלחה והבקשה אושרה בתור', severity: 'success' })
          setWaitlistEntry(null)
        } else {
          setSnackbar({ open: true, message: 'ההלוואה נוספה בהצלחה', severity: 'success' })
        }
      }
      if (selectedBorrower) {
        loadBorrowerLoans(selectedBorrower.id)
      }
      handleNewLoan()
      setLoanPaymentMethod({ payment_method: '' })
    } catch (error) {
      console.error('Error saving loan:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleDeleteLoan = async (loanId: number) => {
    // בדיקה אם יש פירעונות להלוואה
    const loan = borrowerLoans.find(l => l.id === loanId)
    if (loan && (loan.total_repaid || 0) > 0) {
      setSnackbar({ open: true, message: 'לא ניתן למחוק הלוואה שיש לה פירעונות', severity: 'error' })
      return
    }
    
    if (!confirm('האם למחוק את ההלוואה?')) return
    try {
      await loansService.delete(loanId)
      setSnackbar({ open: true, message: 'ההלוואה נמחקה', severity: 'success' })
      if (selectedBorrower) {
        loadBorrowerLoans(selectedBorrower.id)
      }
      if (selectedLoan?.id === loanId) {
        handleNewLoan()
      }
    } catch (error) {
      console.error('Error deleting loan:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  // Helper function to update guarantor loans after borrower repayment
  const updateGuarantorLoansAfterRepayment = async (loanId: number, repaymentAmount: number): Promise<boolean> => {
    const guarantorLoans = await guarantorLoansService.getByOriginalLoan(loanId)
    if (guarantorLoans.length === 0) return false
    
    const updatedLoan = await loansService.getById(loanId)
    
    if (updatedLoan && updatedLoan.remaining === 0) {
      // Loan fully repaid - mark guarantor loans as paid and note refund if they paid
      for (const gl of guarantorLoans) {
        if ((gl.total_repaid || 0) > 0) {
          // Guarantor paid something - they deserve a refund
          await guarantorLoansService.update(gl.id, { 
            status: 'paid',
            notes: (gl.notes || '') + `\n[${new Date().toISOString().split('T')[0]}] הלווה פרע את החוב. מגיע החזר לערב: ${gl.total_repaid}₪`
          })
        } else {
          await guarantorLoansService.update(gl.id, { status: 'paid' })
        }
      }
      return true
    } else {
      // Partial payment - reduce guarantor loans proportionally
      const totalGuarantorAmount = guarantorLoans.reduce((sum, gl) => sum + gl.amount, 0)
      
      for (const gl of guarantorLoans) {
        const guarantorShare = gl.amount / totalGuarantorAmount
        const reduction = Math.round(repaymentAmount * guarantorShare)
        const newAmount = Math.max(gl.total_repaid || 0, gl.amount - reduction)
        
        if (newAmount <= (gl.total_repaid || 0)) {
          // Guarantor loan is fully covered
          if ((gl.total_repaid || 0) > newAmount) {
            // Guarantor overpaid - note refund
            const refund = (gl.total_repaid || 0) - newAmount
            await guarantorLoansService.update(gl.id, { 
              amount: gl.total_repaid || 0,
              status: 'paid',
              notes: (gl.notes || '') + `\n[${new Date().toISOString().split('T')[0]}] מגיע החזר לערב: ${refund}₪`
            })
          } else {
            await guarantorLoansService.update(gl.id, { 
              amount: gl.total_repaid || 0,
              status: 'paid' 
            })
          }
        } else {
          await guarantorLoansService.update(gl.id, { amount: newAmount })
        }
      }
      return true
    }
  }

  const handleAddRepayment = async () => {
    if (!selectedLoan?.id || repaymentAmount <= 0) return
    
    const remaining = selectedLoan.remaining || 0
    if (remaining <= 0) {
      setSnackbar({ open: true, message: 'ההלוואה כבר נפרעה במלואה', severity: 'error' })
      return
    }
    if (repaymentAmount > remaining) {
      setSnackbar({ open: true, message: 'סכום הפירעון גדול מיתרת ההלוואה', severity: 'error' })
      return
    }

    try {
      await repaymentsService.create({
        loan_id: selectedLoan.id,
        amount: repaymentAmount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: repaymentPaymentMethod.payment_method,
        payment_details: JSON.stringify(repaymentPaymentMethod),
      })
      
      // Update guarantor loans if exist
      const guarantorLoansUpdated = await updateGuarantorLoansAfterRepayment(selectedLoan.id, repaymentAmount)
      
      if (guarantorLoansUpdated) {
        const updatedLoan = await loansService.getById(selectedLoan.id)
        if (updatedLoan && updatedLoan.remaining === 0) {
          setSnackbar({ open: true, message: 'הפירעון נוסף בהצלחה. הלוואות הערבים סומנו כנפרעו (בדוק אם מגיע החזר לערבים)', severity: 'success' })
        } else {
          setSnackbar({ open: true, message: 'הפירעון נוסף בהצלחה. הלוואות הערבים עודכנו באופן יחסי', severity: 'success' })
        }
        setSelectedLoan(updatedLoan as Loan)
      } else {
        setSnackbar({ open: true, message: 'הפירעון נוסף בהצלחה', severity: 'success' })
        const updatedLoan = await loansService.getById(selectedLoan.id)
        if (updatedLoan) {
          setSelectedLoan(updatedLoan as Loan)
        }
      }
      
      setRepaymentDialogOpen(false)
      setRepaymentAmount(0)
      setRepaymentPaymentMethod({ payment_method: '' })
      loadRepayments(selectedLoan.id)
      if (selectedBorrower) {
        loadBorrowerLoans(selectedBorrower.id)
      }
    } catch (error) {
      console.error('Error adding repayment:', error)
      setSnackbar({ open: true, message: 'שגיאה בהוספת פירעון', severity: 'error' })
    }
  }

  const handleMultiRepayment = async () => {
    if (!selectedBorrower || multiRepaymentAmount <= 0) return
    
    const today = new Date().toISOString().split('T')[0]
    
    // Get only ACTIVE loans (not planned/future loans) that have remaining balance
    const activeLoans = borrowerLoans.filter(loan => 
      (loan.remaining || 0) > 0 && loan.loan_date <= today
    )
    
    if (activeLoans.length === 0) {
      setSnackbar({ open: true, message: 'אין הלוואות פעילות לפירעון', severity: 'error' })
      return
    }

    let remainingToDistribute = multiRepaymentAmount
    let guarantorLoansUpdated = false

    try {
      // Distribute payment across loans (oldest first)
      const sortedLoans = [...activeLoans].sort((a, b) => 
        new Date(a.loan_date).getTime() - new Date(b.loan_date).getTime()
      )

      for (const loan of sortedLoans) {
        if (remainingToDistribute <= 0) break
        
        const loanRemaining = loan.remaining || 0
        const paymentForThisLoan = Math.min(remainingToDistribute, loanRemaining)
        
        if (paymentForThisLoan > 0) {
          await repaymentsService.create({
            loan_id: loan.id!,
            amount: paymentForThisLoan,
            payment_date: today,
            notes: 'פירעון מרובה'
          })
          remainingToDistribute -= paymentForThisLoan
          
          // Update guarantor loans for this loan
          const result = await updateGuarantorLoansAfterRepayment(loan.id!, paymentForThisLoan)
          if (result) guarantorLoansUpdated = true
        }
      }

      let message = 'הפירעון המרובה בוצע בהצלחה'
      if (guarantorLoansUpdated) message += '. הלוואות הערבים עודכנו'
      if (remainingToDistribute > 0) message += ` (נותר ${formatCurrency(remainingToDistribute)} עודף)`
      
      setSnackbar({ open: true, message, severity: 'success' })
      setMultiRepaymentDialogOpen(false)
      setMultiRepaymentAmount(0)
      loadBorrowerLoans(selectedBorrower.id)
      if (selectedLoan?.id) {
        loadRepayments(selectedLoan.id)
        const updatedLoan = await loansService.getById(selectedLoan.id)
        if (updatedLoan) {
          setSelectedLoan(updatedLoan as Loan)
        }
      }
    } catch (error) {
      console.error('Error in multi-repayment:', error)
      setSnackbar({ open: true, message: 'שגיאה בפירעון מרובה', severity: 'error' })
    }
  }

  const handleEditRepayment = (repayment: Repayment) => {
    setEditingRepayment(repayment)
    setEditRepaymentAmount(repayment.amount)
    setEditRepaymentDate(repayment.payment_date)
    setEditRepaymentNotes(repayment.notes || '')
    // טעינת פרטי תשלום אם קיימים
    if (repayment.payment_details) {
      try {
        setEditRepaymentPaymentMethod(JSON.parse(repayment.payment_details))
      } catch {
        setEditRepaymentPaymentMethod({ payment_method: (repayment.payment_method || '') as any })
      }
    } else {
      setEditRepaymentPaymentMethod({ payment_method: (repayment.payment_method || '') as any })
    }
    setEditRepaymentDialogOpen(true)
  }

  const handleSaveEditRepayment = async () => {
    if (!editingRepayment || editRepaymentAmount <= 0) return

    try {
      await repaymentsService.update(editingRepayment.id, {
        amount: editRepaymentAmount,
        payment_date: editRepaymentDate,
        notes: editRepaymentNotes,
        payment_method: editRepaymentPaymentMethod.payment_method,
        payment_details: JSON.stringify(editRepaymentPaymentMethod),
      })
      setSnackbar({ open: true, message: 'הפירעון עודכן בהצלחה', severity: 'success' })
      setEditRepaymentDialogOpen(false)
      setEditingRepayment(null)
      if (selectedLoan?.id) {
        loadRepayments(selectedLoan.id)
        loadBorrowerLoans(selectedBorrower!.id)
        const updatedLoan = await loansService.getById(selectedLoan.id)
        if (updatedLoan) {
          setSelectedLoan(updatedLoan as Loan)
        }
      }
    } catch (error) {
      console.error('Error updating repayment:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון הפירעון', severity: 'error' })
    }
  }

  const handleDeleteRepayment = async (repaymentId: number) => {
    if (!confirm('האם למחוק את הפירעון?')) return

    try {
      await repaymentsService.delete(repaymentId)
      setSnackbar({ open: true, message: 'הפירעון נמחק', severity: 'success' })
      if (selectedLoan?.id) {
        loadRepayments(selectedLoan.id)
        loadBorrowerLoans(selectedBorrower!.id)
        const updatedLoan = await loansService.getById(selectedLoan.id)
        if (updatedLoan) {
          setSelectedLoan(updatedLoan as Loan)
        }
      }
    } catch (error) {
      console.error('Error deleting repayment:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקת הפירעון', severity: 'error' })
    }
  }

  const handleGenerateDocument = () => {
    if (!selectedLoan || !selectedBorrower) return
    
    const guarantor1 = guarantors.find(g => g.id === formData.guarantor1_id)
    const guarantor2 = guarantors.find(g => g.id === formData.guarantor2_id)
    
    generateLoanDocument({
      gemachName: settings.gemach_name,
      gemachLogo: settings.gemach_logo,
      borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
      amount: formData.amount,
      loanDate: formData.loan_date,
      dueDate: formData.due_date,
      loanType: formData.loan_type,
      guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
      guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      dateFormat: settings.date_format,
      customText: settings.loan_document_text,
    })
  }

  // הפקת שטר ישירות מהטבלה
  const handleGenerateDocumentForLoan = (loan: Loan) => {
    if (!selectedBorrower) return
    
    const guarantor1 = guarantors.find(g => g.id === loan.guarantor1_id)
    const guarantor2 = guarantors.find(g => g.id === loan.guarantor2_id)
    
    generateLoanDocument({
      gemachName: settings.gemach_name,
      gemachLogo: settings.gemach_logo,
      borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
      amount: loan.amount,
      loanDate: loan.loan_date,
      dueDate: loan.due_date,
      loanType: loan.loan_type,
      guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
      guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      dateFormat: settings.date_format,
      customText: settings.loan_document_text,
    })
  }

  const handleSendEmail = async () => {
    if (!selectedLoan || !selectedBorrower) return
    
    if (!selectedBorrower.email) {
      setSnackbar({ open: true, message: 'ללווה זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    const guarantor1 = guarantors.find(g => g.id === formData.guarantor1_id)
    const guarantor2 = guarantors.find(g => g.id === formData.guarantor2_id)
    
    const emailData = createLoanEmailData({
      gemachName: settings.gemach_name || 'גמ"ח',
      borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
      borrowerEmail: selectedBorrower.email,
      amount: formData.amount,
      loanDate: formData.loan_date,
      dueDate: formData.due_date,
      loanType: formData.loan_type,
      gemachLogo: settings.gemach_logo,
      guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
      guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      dateFormat: settings.date_format,
    })
    
    const provider = (settings.email_provider || 'gmail') as EmailProvider
    const result = await openEmailWithDocument(emailData, provider)
    setSnackbar({ 
      open: true, 
      message: result.message, 
      severity: result.success ? 'success' : 'error' 
    })
  }

  // שליחת מייל ישירות מהטבלה
  const handleSendEmailForLoan = async (loan: Loan) => {
    if (!selectedBorrower) return
    
    if (!selectedBorrower.email) {
      setSnackbar({ open: true, message: 'ללווה זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    const guarantor1 = guarantors.find(g => g.id === loan.guarantor1_id)
    const guarantor2 = guarantors.find(g => g.id === loan.guarantor2_id)
    
    const emailData = createLoanEmailData({
      gemachName: settings.gemach_name || 'גמ"ח',
      borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
      borrowerEmail: selectedBorrower.email,
      amount: loan.amount,
      loanDate: loan.loan_date,
      dueDate: loan.due_date,
      loanType: loan.loan_type,
      gemachLogo: settings.gemach_logo,
      guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
      guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      dateFormat: settings.date_format,
    })
    
    const provider = (settings.email_provider || 'gmail') as EmailProvider
    const result = await openEmailWithDocument(emailData, provider)
    setSnackbar({ 
      open: true, 
      message: result.message, 
      severity: result.success ? 'success' : 'error' 
    })
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // Cross-check handler for guarantor selection
  const handleGuarantorSelect = async (field: 'guarantor1_id' | 'guarantor2_id', guarantorId: number | undefined) => {
    if (!guarantorId) {
      setFormData({ ...formData, [field]: undefined })
      return
    }

    // Run cross-check
    const warnings = await checkGuarantorForLoan(guarantorId)
    
    if (warnings.length > 0) {
      setCrossCheckWarnings(warnings)
      setPendingGuarantorId({ field, id: guarantorId })
      setCrossCheckDialogOpen(true)
    } else {
      setFormData({ ...formData, [field]: guarantorId })
    }
  }

  const handleCrossCheckContinue = () => {
    if (pendingGuarantorId) {
      setFormData({ ...formData, [pendingGuarantorId.field]: pendingGuarantorId.id })
    }
    setCrossCheckDialogOpen(false)
    setPendingGuarantorId(null)
    setCrossCheckWarnings([])
  }

  const handleCrossCheckCancel = () => {
    setCrossCheckDialogOpen(false)
    setPendingGuarantorId(null)
    setCrossCheckWarnings([])
  }

  const getLoanStatus = (loan: Loan) => {
    const today = new Date().toISOString().split('T')[0]
    if (loan.status === 'transferred') {
      return { label: 'הועבר לערב', color: 'warning' as const }
    }
    if (loan.loan_date > today) {
      return { label: 'מתוכננת', color: 'info' as const }
    }
    if ((loan.remaining || 0) <= 0) {
      return { label: 'נפרעה', color: 'success' as const }
    }
    if (loan.due_date && loan.due_date < today) {
      return { label: 'באיחור', color: 'error' as const }
    }
    return { label: 'פעילה', color: 'primary' as const }
  }

  const canAddRepayment = selectedLoan && (selectedLoan.remaining || 0) > 0 && 
    selectedLoan.loan_date <= new Date().toISOString().split('T')[0]

  return (
    <Box>
      {/* Borrower Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={8}>
              <Autocomplete
                options={borrowers}
                getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                value={selectedBorrower}
                onChange={(_, value) => setSelectedBorrower(value)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props
                  const isBlacklisted = blacklistedBorrowerIds.includes(option.id)
                  return (
                    <Box component="li" key={key} {...otherProps} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{option.first_name} {option.last_name}</span>
                      {isBlacklisted && (
                        <Chip label="רשימה שחורה" size="small" color="error" sx={{ fontSize: '0.7rem', height: 20 }} />
                      )}
                    </Box>
                  )
                }}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="בחר לווה" 
                    placeholder="חפש לווה..."
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleNewLoan}
                disabled={!selectedBorrower || blacklistedBorrowerIds.includes(selectedBorrower?.id || 0)}
              >
                הלוואה חדשה
              </Button>
            </Grid>
          </Grid>
          {selectedBorrower && blacklistedBorrowerIds.includes(selectedBorrower.id) && (
            <Alert severity="error" sx={{ mt: 2 }}>
              ⛔ לווה זה נמצא ברשימה השחורה. ניתן לצפות בהלוואות קיימות אך לא ליצור הלוואה חדשה.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Loans Table */}
      {selectedBorrower && borrowerLoans.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                הלוואות של {selectedBorrower.first_name} {selectedBorrower.last_name} ({borrowerLoans.length})
              </Typography>
              {borrowerLoans.some(loan => (loan.remaining || 0) > 0 && loan.loan_date <= new Date().toISOString().split('T')[0]) && (
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<PaymentIcon />}
                  onClick={() => setMultiRepaymentDialogOpen(true)}
                >
                  פירעון מרובה
                </Button>
              )}
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>#</TableCell>
                    <TableCell>תאריך</TableCell>
                    <TableCell align="center">סכום</TableCell>
                    <TableCell align="center">שולם</TableCell>
                    <TableCell align="center">יתרה</TableCell>
                    <TableCell align="center">סטטוס</TableCell>
                    <TableCell align="center">פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {borrowerLoans.map((loan) => {
                    const status = getLoanStatus(loan)
                    const isSelected = selectedLoan?.id === loan.id
                    return (
                      <TableRow 
                        key={loan.id} 
                        hover 
                        selected={isSelected}
                        sx={{ cursor: 'pointer', bgcolor: isSelected ? 'action.selected' : undefined }}
                        onClick={() => handleSelectLoan(loan)}
                      >
                        <TableCell>{loan.id}</TableCell>
                        <TableCell>{formatDisplayDate(loan.loan_date, settings.date_format)}</TableCell>
                        <TableCell align="center">{formatCurrency(loan.amount)}</TableCell>
                        <TableCell align="center">{formatCurrency(loan.total_repaid || 0)}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                          {formatCurrency(loan.remaining || 0)}
                        </TableCell>
                        <TableCell align="center">
                          <Chip label={status.label} color={status.color} size="small" />
                        </TableCell>
                        <TableCell align="center">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSelectLoan(loan); }} title="עריכה">
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); handleGenerateDocumentForLoan(loan); }} title="הפק שטר">
                            <DocIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="secondary" onClick={(e) => { e.stopPropagation(); handleSendEmailForLoan(loan); }} title="שלח במייל">
                            <EmailIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteLoan(loan.id!); }} title="מחק">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Loan Form */}
      {selectedBorrower && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 3 }}>
              {selectedLoan ? `עריכת הלוואה #${selectedLoan.id}` : 'הלוואה חדשה'}
              {selectedLoan && (
                <Chip 
                  label={getLoanStatus(selectedLoan).label} 
                  color={getLoanStatus(selectedLoan).color} 
                  size="small" 
                  sx={{ ml: 2 }}
                />
              )}
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <AmountInput
                  fullWidth
                  label="סכום ההלוואה *"
                  value={formData.amount || 0}
                  onChange={(value) => setFormData({ ...formData, amount: value })}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="תאריך מתן ההלוואה *"
                  type="date"
                  value={formData.loan_date}
                  onChange={(e) => {
                    const newLoanDate = e.target.value
                    // עדכון תאריך פירעון אוטומטי אם סוג ההלוואה קבועה
                    if (formData.loan_type === 'fixed') {
                      const defaultMonths = parseInt(settings.default_loan_months) || 12
                      const dueDate = new Date(newLoanDate)
                      dueDate.setMonth(dueDate.getMonth() + defaultMonths)
                      setFormData({ ...formData, loan_date: newLoanDate, due_date: dueDate.toISOString().split('T')[0] })
                    } else {
                      setFormData({ ...formData, loan_date: newLoanDate })
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                  helperText={
                    formData.loan_date > new Date().toISOString().split('T')[0] 
                      ? '⏰ הלוואה מתוכננת' 
                      : (settings.date_format === 'combined' && formData.loan_date ? `📅 ${toHebrewDate(formData.loan_date)}` : '')
                  }
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>סוג הלוואה</InputLabel>
                  <Select
                    value={formData.loan_type}
                    label="סוג הלוואה"
                    onChange={(e) => {
                      const newType = e.target.value
                      if (newType === 'fixed' && !formData.due_date) {
                        // חישוב תאריך פירעון לפי ברירת מחדל
                        const defaultMonths = parseInt(settings.default_loan_months) || 12
                        const baseDate = formData.loan_date ? new Date(formData.loan_date) : new Date()
                        baseDate.setMonth(baseDate.getMonth() + defaultMonths)
                        setFormData({ ...formData, loan_type: newType, due_date: baseDate.toISOString().split('T')[0] })
                      } else {
                        setFormData({ ...formData, loan_type: newType })
                      }
                    }}
                  >
                    <MenuItem value="flexible">גמישה (ללא תאריך פירעון)</MenuItem>
                    <MenuItem value="fixed">קבועה (עם תאריך פירעון)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {formData.loan_type === 'fixed' && (
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="תאריך החזרה"
                    type="date"
                    value={formData.due_date || ''}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText={
                      formData.due_date && formData.loan_date && formData.due_date < formData.loan_date 
                        ? '⚠️ תאריך פירעון לא יכול להיות לפני תאריך ההלוואה' 
                        : (settings.date_format === 'combined' && formData.due_date ? `📅 ${toHebrewDate(formData.due_date)}` : '')
                    }
                    error={formData.due_date && formData.loan_date && formData.due_date < formData.loan_date ? true : false}
                  />
                </Grid>
              )}

              {/* Recurring Loan Section - לפני הערבים */}
              {settings.show_recurring_options !== 'no' && (
                <>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="primary" sx={{ mt: 1 }}>
                      🔄 הלוואה מחזורית
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.is_recurring === 1}
                          onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked ? 1 : 0 })}
                        />
                      }
                      label="הלוואה מחזורית"
                    />
                  </Grid>
                  
                  {formData.is_recurring === 1 && (
                    <>
                      <Grid item xs={12} md={3}>
                        <TextField
                          fullWidth
                          label="מספר חודשים"
                          type="number"
                          value={formData.recurring_months || ''}
                          onChange={(e) => setFormData({ ...formData, recurring_months: parseInt(e.target.value) || 0 })}
                          helperText="כמה חודשים ההלוואה תחזור"
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <TextField
                          fullWidth
                          label="יום בחודש"
                          type="number"
                          value={formData.recurring_day || ''}
                          onChange={(e) => setFormData({ ...formData, recurring_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
                          inputProps={{ min: 1, max: 31 }}
                          helperText="1-31"
                        />
                      </Grid>
                    </>
                  )}

                  {/* Auto Repayment Section */}
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" color="success.main" sx={{ mt: 1 }}>
                      💰 פירעון מחזורי
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={formData.auto_repayment === 1}
                          onChange={(e) => setFormData({ ...formData, auto_repayment: e.target.checked ? 1 : 0 })}
                        />
                      }
                      label="פירעון מחזורי"
                    />
                  </Grid>
                  
                  {formData.auto_repayment === 1 && (
                    <>
                      <Grid item xs={12} md={3}>
                        <AmountInput
                          fullWidth
                          label="סכום פירעון חודשי"
                          value={formData.repayment_amount || 0}
                          onChange={(value) => setFormData({ ...formData, repayment_amount: value })}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <TextField
                          fullWidth
                          label="תאריך תחילת פירעון"
                          type="date"
                          value={formData.repayment_start_date || ''}
                          onChange={(e) => setFormData({ ...formData, repayment_start_date: e.target.value })}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={12} md={3}>
                        <TextField
                          fullWidth
                          label="יום בחודש לפירעון"
                          type="number"
                          value={formData.repayment_day || ''}
                          onChange={(e) => setFormData({ ...formData, repayment_day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
                          inputProps={{ min: 1, max: 31 }}
                          helperText="1-31"
                        />
                      </Grid>
                    </>
                  )}
                </>
              )}

              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
              </Grid>

              {/* Guarantors */}
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={guarantors.filter(g => !g.is_blacklisted)}
                  getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                  value={guarantors.find(g => g.id === formData.guarantor1_id) || null}
                  onChange={(_, value) => handleGuarantorSelect('guarantor1_id', value?.id)}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderInput={(params) => (
                    <TextField {...params} label="ערב ראשון (אופציונלי)" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={guarantors.filter(g => !g.is_blacklisted)}
                  getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                  value={guarantors.find(g => g.id === formData.guarantor2_id) || null}
                  onChange={(_, value) => handleGuarantorSelect('guarantor2_id', value?.id)}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderInput={(params) => (
                    <TextField {...params} label="ערב שני (אופציונלי)" />
                  )}
                />
              </Grid>

              {/* Payment Method */}
              {settings.show_payment_method === 'yes' && (
                <Grid item xs={12} md={6}>
                  <PaymentMethodSelect
                    value={loanPaymentMethod}
                    onChange={setLoanPaymentMethod}
                    label="אמצעי תשלום (מתן ההלוואה)"
                  />
                </Grid>
              )}

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="הערות"
                  multiline
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </Grid>
            </Grid>

            {/* Action Buttons */}
            <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
                {selectedLoan ? 'עדכן הלוואה' : 'שמור הלוואה'}
              </Button>
              {selectedLoan && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<PaymentIcon />}
                    onClick={() => setRepaymentDialogOpen(true)}
                    disabled={!canAddRepayment}
                    color={canAddRepayment ? 'primary' : 'inherit'}
                  >
                    {canAddRepayment ? 'הוסף פירעון' : 'נפרעה במלואה'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<DocIcon />}
                    onClick={handleGenerateDocument}
                  >
                    הפק שטר
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<EmailIcon />}
                    onClick={handleSendEmail}
                    disabled={!selectedBorrower?.email}
                    title={selectedBorrower?.email ? 'שלח שטר במייל' : 'ללווה לא הוזנה כתובת מייל'}
                  >
                    שלח במייל
                  </Button>
                </>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Repayments Table */}
      {selectedLoan && repayments.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              היסטוריית פירעונות - הלוואה #{selectedLoan.id}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>תאריך</TableCell>
                    <TableCell align="center">סכום</TableCell>
                    {settings.show_payment_method === 'yes' && <TableCell align="center">אמצעי תשלום</TableCell>}
                    <TableCell>הערות</TableCell>
                    <TableCell align="center">פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {repayments.map((repayment) => (
                    <TableRow key={repayment.id}>
                      <TableCell>{formatDisplayDate(repayment.payment_date, settings.date_format)}</TableCell>
                      <TableCell align="center">{formatCurrency(repayment.amount)}</TableCell>
                      {settings.show_payment_method === 'yes' && <TableCell align="center">{getPaymentMethodLabel(repayment.payment_method as any) || '-'}</TableCell>}
                      <TableCell>{repayment.notes || '-'}</TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          color="primary"
                          onClick={() => handleEditRepayment(repayment)}
                          title="ערוך"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteRepayment(repayment.id)}
                          title="מחק"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'success.light' }}>
                    <TableCell><strong>סה"כ שולם</strong></TableCell>
                    <TableCell align="center"><strong>{formatCurrency(selectedLoan.total_repaid || 0)}</strong></TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {/* Repayment Dialog */}
      <Dialog open={repaymentDialogOpen} onClose={() => setRepaymentDialogOpen(false)}>
        <DialogTitle>הוספת פירעון - הלוואה #{selectedLoan?.id}</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography>סכום הלוואה: {formatCurrency(selectedLoan?.amount || 0)}</Typography>
            <Typography>שולם עד כה: {formatCurrency(selectedLoan?.total_repaid || 0)}</Typography>
            <Typography fontWeight="bold" color="primary">
              יתרה לתשלום: {formatCurrency(selectedLoan?.remaining || 0)}
            </Typography>
          </Box>
          <AmountInput
            fullWidth
            label="סכום הפירעון"
            value={repaymentAmount || 0}
            onChange={(value) => setRepaymentAmount(value)}
          />
          {settings.show_payment_method === 'yes' && (
            <Box sx={{ mt: 2 }}>
              <PaymentMethodSelect
                value={repaymentPaymentMethod}
                onChange={setRepaymentPaymentMethod}
                label="אמצעי תשלום"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRepaymentDialogOpen(false)}>ביטול</Button>
          <Button 
            variant="contained" 
            onClick={handleAddRepayment}
            disabled={repaymentAmount <= 0 || repaymentAmount > (selectedLoan?.remaining || 0)}
          >
            הוסף פירעון
          </Button>
        </DialogActions>
      </Dialog>

      {/* Multi-Repayment Dialog */}
      <Dialog open={multiRepaymentDialogOpen} onClose={() => setMultiRepaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>פירעון מרובה - {selectedBorrower?.first_name} {selectedBorrower?.last_name}</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>הלוואות פעילות (לא כולל מתוכננות):</Typography>
            {borrowerLoans.filter(loan => (loan.remaining || 0) > 0 && loan.loan_date <= new Date().toISOString().split('T')[0]).map(loan => (
              <Typography key={loan.id} variant="body2">
                הלוואה #{loan.id}: יתרה {formatCurrency(loan.remaining || 0)}
              </Typography>
            ))}
            {borrowerLoans.filter(loan => (loan.remaining || 0) > 0 && loan.loan_date > new Date().toISOString().split('T')[0]).length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                * יש {borrowerLoans.filter(loan => (loan.remaining || 0) > 0 && loan.loan_date > new Date().toISOString().split('T')[0]).length} הלוואות מתוכננות שלא ייכללו בפירעון
              </Typography>
            )}
            <Divider sx={{ my: 1 }} />
            <Typography fontWeight="bold" color="primary">
              סה"כ יתרה פעילה: {formatCurrency(borrowerLoans.filter(loan => loan.loan_date <= new Date().toISOString().split('T')[0]).reduce((sum, loan) => sum + (loan.remaining || 0), 0))}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            הסכום יחולק אוטומטית בין ההלוואות הפעילות (מהישנה לחדשה)
          </Typography>
          <AmountInput
            fullWidth
            label="סכום הפירעון הכולל"
            value={multiRepaymentAmount || 0}
            onChange={(value) => setMultiRepaymentAmount(value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMultiRepaymentDialogOpen(false)}>ביטול</Button>
          <Button 
            variant="contained" 
            onClick={handleMultiRepayment}
            disabled={multiRepaymentAmount <= 0}
          >
            בצע פירעון מרובה
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Repayment Dialog */}
      <Dialog open={editRepaymentDialogOpen} onClose={() => setEditRepaymentDialogOpen(false)}>
        <DialogTitle>עריכת פירעון</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <AmountInput
              fullWidth
              label="סכום"
              value={editRepaymentAmount || 0}
              onChange={(value) => setEditRepaymentAmount(value)}
            />
            <TextField
              fullWidth
              label="תאריך"
              type="date"
              value={editRepaymentDate}
              onChange={(e) => setEditRepaymentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              label="הערות"
              value={editRepaymentNotes}
              onChange={(e) => setEditRepaymentNotes(e.target.value)}
            />
            {settings.show_payment_method === 'yes' && (
              <PaymentMethodSelect
                value={editRepaymentPaymentMethod}
                onChange={setEditRepaymentPaymentMethod}
                label="אמצעי תשלום"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRepaymentDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSaveEditRepayment}>
            שמור
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cross-Check Warning Dialog */}
      <CrossCheckWarningDialog
        open={crossCheckDialogOpen}
        onClose={handleCrossCheckCancel}
        onContinue={handleCrossCheckContinue}
        warnings={crossCheckWarnings}
        title="אזהרה - בחירת ערב"
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
