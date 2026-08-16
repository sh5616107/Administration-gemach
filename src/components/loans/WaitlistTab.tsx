import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Button,
  Typography,
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
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Alert,
  Snackbar,
  TableSortLabel,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  DragIndicator as DragIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { borrowersService, waitlistService, type WaitlistEntry, statsService } from '../../services/database'
import { formatDisplayDate } from '../../utils/dateUtils'
import { useSettings } from '../../hooks/useSettings'
import AmountInput from '../AmountInput'
import ExpectedFundsDialog from './ExpectedFundsDialog'

interface Borrower {
  id: string  // UUID
  first_name: string
  last_name: string
}

interface SortableRowProps {
  entry: WaitlistEntry & { borrower_name: string }
  index: number
  onEdit: (entry: WaitlistEntry) => void
  onDelete: (id: string) => void
  onApprove: (entry: WaitlistEntry & { borrower_name: string }) => void
  onReject: (id: string) => void
  formatCurrency: (amount: number) => string
  formatDisplayDate: (date: string, format: string) => string
  dateFormat: string
}

function SortableRow({
  entry,
  index,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  formatCurrency,
  formatDisplayDate,
  dateFormat,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isDragging ? '#f5f5f5' : 'inherit',
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting': return 'info'
      case 'processing': return 'warning'
      case 'approved': return 'success'
      case 'rejected': return 'error'
      default: return 'default'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'waiting': return 'ממתין'
      case 'processing': return 'בטיפול'
      case 'approved': return 'אושר'
      case 'rejected': return 'נדחה'
      default: return status
    }
  }

  const getPriorityColor = (priority: string) => {
    return priority === 'urgent' ? 'error' : 'default'
  }

  const getPriorityLabel = (priority: string) => {
    return priority === 'urgent' ? 'דחוף' : 'רגיל'
  }

  return (
    <TableRow ref={setNodeRef} style={style} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
      <TableCell align="center">
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <IconButton size="small" {...attributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
            <DragIcon fontSize="small" />
          </IconButton>
          <Chip label={entry.position} color="primary" size="small" />
        </Box>
      </TableCell>
      <TableCell>{entry.borrower_name}</TableCell>
      <TableCell align="right">{formatCurrency(entry.requested_amount)}</TableCell>
      <TableCell align="center">{formatDisplayDate(entry.request_date, dateFormat)}</TableCell>
      <TableCell align="center">
        {entry.loan_type === 'fixed' ? 'קבועה' : 'גמישה'}
      </TableCell>
      <TableCell align="center">
        {entry.requested_months ? `${entry.requested_months} חודשים` : '-'}
      </TableCell>
      <TableCell align="center">
        <Chip 
          label={getPriorityLabel(entry.priority)} 
          color={getPriorityColor(entry.priority) as any}
          size="small" 
        />
      </TableCell>
      <TableCell align="center">
        <Chip 
          label={getStatusLabel(entry.status)} 
          color={getStatusColor(entry.status) as any}
          size="small" 
        />
      </TableCell>
      <TableCell align="center">
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(entry.status === 'waiting' || entry.status === 'processing') && (
            <>
              <IconButton
                size="small"
                color="success"
                onClick={() => onApprove(entry)}
                title="אשר הלוואה"
              >
                <ApproveIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                onClick={() => onReject(entry.id)}
                title="דחה בקשה"
              >
                <RejectIcon fontSize="small" />
              </IconButton>
            </>
          )}
          <IconButton
            size="small"
            onClick={() => onEdit(entry)}
            title="ערוך"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => onDelete(entry.id)}
            title="מחק"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </TableCell>
    </TableRow>
  )
}

export default function WaitlistTab() {
  const { settings } = useSettings()
  const [waitlist, setWaitlist] = useState<(WaitlistEntry & { borrower_name: string })[]>([])
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<WaitlistEntry | null>(null)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [availableFunds, setAvailableFunds] = useState(0)
  const [expectedFunds, setExpectedFunds] = useState({ week: 0, month: 0, threeMonths: 0 })
  const [expectedFundsDialogOpen, setExpectedFundsDialogOpen] = useState(false)
  const [expectedFundsBreakdown, setExpectedFundsBreakdown] = useState<any>(null)
  const [orderBy, setOrderBy] = useState<string | null>(null)
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  
  // Form state
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [requestedAmount, setRequestedAmount] = useState(0)
  const [loanType, setLoanType] = useState<'fixed' | 'flexible'>('flexible')
  const [requestedMonths, setRequestedMonths] = useState(12)
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [waitlistData, borrowersData, stats] = await Promise.all([
        waitlistService.getAll(),
        borrowersService.getAll(),
        statsService.getDashboardStats(),
      ])
      
      // Calculate available funds
      const available = stats.donations.total + stats.deposits.total - stats.activeLoans.total - stats.gemachExpenses
      setAvailableFunds(available)
      
      // Calculate expected funds to be released
      await calculateExpectedFunds()
      
      // Enrich waitlist with borrower names
      const enriched = waitlistData.map(entry => {
        const borrower = borrowersData.find(b => b.id === entry.borrower_id)
        return {
          ...entry,
          borrower_name: borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע'
        }
      })
      
      setWaitlist(enriched)
      setBorrowers(borrowersData as Borrower[])
    } catch (error) {
      console.error('Error loading waitlist:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת נתונים', severity: 'error' })
    }
  }

  const calculateExpectedFunds = async () => {
    try {
      const { loansService, db } = await import('../../services/database')
      const { calculateExpectedFunds: calculate } = await import('../../services/expectedFundsCalculator')
      
      // טעינת נתונים
      const allLoans = await loansService.getAll()
      const recurringDeposits = await db.query(
        'SELECT * FROM deposits WHERE is_recurring = 1 AND status IN (?, ?)', 
        ['active', 'planned']
      ) as any[]
      
      // חישוב באמצעות הפונקציה המרכזית
      const result = calculate(allLoans as any[], recurringDeposits as any[])
      
      setExpectedFunds(result)
    } catch (error) {
      console.error('Error calculating expected funds:', error)
    }
  }

  const prepareExpectedFundsBreakdown = async () => {
    try {
      const { loansService, borrowersService, depositorsService, db } = await import('../../services/database')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const oneWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      const oneMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      const threeMonths = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
      
      const allLoans = await loansService.getAll()
      const activeLoans = allLoans.filter(l => l.status === 'active')
      const allBorrowers = await borrowersService.getAll()
      
      const loansWithDueDate: any[] = []
      const loansWithAutoRepayment: any[] = []
      const recurringDepositsBreakdown: any[] = []
      const recurringLoansDeduction: any[] = []
      
      // הלוואות עם תאריך פירעון
      for (const loan of activeLoans) {
        if (loan.due_date && !loan.auto_repayment) {
          const dueDate = new Date(loan.due_date)
          dueDate.setHours(0, 0, 0, 0)
          const borrower = allBorrowers.find(b => b.id === loan.borrower_id)
          const borrowerName = borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע'
          
          let period: 'week' | 'month' | 'threeMonths' | null = null
          if (dueDate <= oneWeek) period = 'week'
          else if (dueDate <= oneMonth) period = 'month'
          else if (dueDate <= threeMonths) period = 'threeMonths'
          
          if (period) {
            loansWithDueDate.push({
              id: loan.id,
              borrower_name: borrowerName,
              amount: loan.remaining || 0,
              due_date: loan.due_date,
              period
            })
          }
        }
      }
      
      // הלוואות עם פירעון מחזורי
      for (const loan of activeLoans) {
        if (loan.auto_repayment === 1 && loan.repayment_amount) {
          const borrower = allBorrowers.find(b => b.id === loan.borrower_id)
          const borrowerName = borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע'
          const monthlyAmount = loan.repayment_amount
          const remaining = loan.remaining || 0
          
          // שבוע
          loansWithAutoRepayment.push({
            id: loan.id,
            borrower_name: borrowerName,
            monthly_amount: monthlyAmount,
            remaining,
            period: 'week' as const,
            expected_amount: Math.min(Math.ceil(7 / 30) * monthlyAmount, remaining)
          })
          
          // חודש
          loansWithAutoRepayment.push({
            id: loan.id,
            borrower_name: borrowerName,
            monthly_amount: monthlyAmount,
            remaining,
            period: 'month' as const,
            expected_amount: Math.min(monthlyAmount, remaining)
          })
          
          // 3 חודשים
          loansWithAutoRepayment.push({
            id: loan.id,
            borrower_name: borrowerName,
            monthly_amount: monthlyAmount,
            remaining,
            period: 'threeMonths' as const,
            expected_amount: Math.min(3 * monthlyAmount, remaining)
          })
        }
      }
      
      // הפקדות מחזוריות (כולל מתוכננות)
      const recurringDeposits = await db.query(
        'SELECT * FROM deposits WHERE is_recurring = 1 AND status IN (?, ?)', 
        ['active', 'planned']
      ) as any[]
      
      const allDepositors = await depositorsService.getAll()
      
      for (const deposit of recurringDeposits) {
        const amount = deposit.amount || 0
        const recurringMonths = deposit.recurring_months || 1
        const depositor = allDepositors.find(d => d.id === deposit.depositor_id)
        const depositorName = depositor ? `${depositor.first_name} ${depositor.last_name}` : 'לא ידוע'
        
        // בדיקות תקינות
        if (amount <= 0) {
          console.warn(`Invalid amount for deposit ${deposit.id}: ${amount}`)
          continue
        }
        
        if (recurringMonths <= 0) {
          console.warn(`Invalid recurring_months for deposit ${deposit.id}: ${recurringMonths}`)
          continue
        }
        
        // חישוב תאריכי הפקדות עתידיות
        const nextDeposits: string[] = []
        let currentDate = new Date(deposit.deposit_date || today)
        
        // בדיקת תקינות תאריך
        if (isNaN(currentDate.getTime())) {
          console.warn(`Invalid deposit_date for deposit ${deposit.id}: ${deposit.deposit_date}`)
          continue
        }
        
        // מצא את ההפקדה הבאה
        let iterations = 0
        while (currentDate <= today && iterations < 100) {
          currentDate.setMonth(currentDate.getMonth() + recurringMonths)
          iterations++
        }
        
        if (iterations >= 100) {
          console.warn(`Too many iterations for deposit ${deposit.id}, skipping`)
          continue
        }
        
        // צור רשימה של הפקדות עתידיות עד 3 חודשים
        while (currentDate <= threeMonths && nextDeposits.length < 10) {
          nextDeposits.push(currentDate.toISOString().split('T')[0])
          currentDate = new Date(currentDate)
          currentDate.setMonth(currentDate.getMonth() + recurringMonths)
        }
        
        if (nextDeposits.length > 0) {
          const weekDates = nextDeposits.filter(d => new Date(d) <= oneWeek)
          const monthDates = nextDeposits.filter(d => new Date(d) <= oneMonth)
          
          if (weekDates.length > 0) {
            recurringDepositsBreakdown.push({
              id: deposit.id,
              depositor_name: depositorName,
              amount,
              next_dates: weekDates,
              period: 'week' as const,
              total_amount: weekDates.length * amount
            })
          }
          
          if (monthDates.length > 0) {
            recurringDepositsBreakdown.push({
              id: deposit.id,
              depositor_name: depositorName,
              amount,
              next_dates: monthDates,
              period: 'month' as const,
              total_amount: monthDates.length * amount
            })
          }
          
          recurringDepositsBreakdown.push({
            id: deposit.id,
            depositor_name: depositorName,
            amount,
            next_dates: nextDeposits,
            period: 'threeMonths' as const,
            total_amount: nextDeposits.length * amount
          })
        }
      }
      
      // הלוואות מחזוריות עתידיות - גריעה
      for (const loan of activeLoans) {
        if (loan.is_recurring === 1 && loan.recurring_loan_number && loan.recurring_loan_count &&
            loan.recurring_loan_number < loan.recurring_loan_count && loan.recurring_months) {
          const borrower = allBorrowers.find(b => b.id === loan.borrower_id)
          const borrowerName = borrower ? `${borrower.first_name} ${borrower.last_name}` : 'לא ידוע'
          const currentNumber = loan.recurring_loan_number || 0
          const remainingLoans = loan.recurring_loan_count - currentNumber
          const loanAmount = loan.amount
          const recurringMonths = loan.recurring_months
          
          // בדיקות תקינות
          if (loanAmount <= 0) {
            console.warn(`Invalid amount for recurring loan ${loan.id}: ${loanAmount}`)
            continue
          }
          
          if (remainingLoans <= 0) {
            console.warn(`Invalid remaining loans for loan ${loan.id}: ${remainingLoans}`)
            continue
          }
          
          if (recurringMonths <= 0) {
            console.warn(`Invalid recurring_months for loan ${loan.id}: ${recurringMonths}`)
            continue
          }
          
          const futureDates: string[] = []
          let futureDate = new Date(loan.loan_date)
          
          // בדיקת תקינות תאריך
          if (isNaN(futureDate.getTime())) {
            console.warn(`Invalid loan_date for loan ${loan.id}: ${loan.loan_date}`)
            continue
          }
          
          // קפוץ קדימה לפי מספר ההלוואות שכבר נוצרו
          for (let i = 0; i < currentNumber; i++) {
            futureDate.setMonth(futureDate.getMonth() + recurringMonths)
          }
          
          // עכשיו חשב את ההלוואות העתידיות
          for (let i = 1; i <= remainingLoans; i++) {
            futureDate = new Date(futureDate)
            futureDate.setMonth(futureDate.getMonth() + recurringMonths)
            if (futureDate <= threeMonths) {
              futureDates.push(futureDate.toISOString().split('T')[0])
            }
          }
          
          if (futureDates.length > 0) {
            const weekDates = futureDates.filter(d => new Date(d) <= oneWeek)
            const monthDates = futureDates.filter(d => new Date(d) <= oneMonth)
            
            if (weekDates.length > 0) {
              recurringLoansDeduction.push({
                id: loan.id,
                borrower_name: borrowerName,
                amount: loanAmount,
                future_dates: weekDates,
                period: 'week' as const,
                total_deduction: weekDates.length * loanAmount
              })
            }
            
            if (monthDates.length > 0) {
              recurringLoansDeduction.push({
                id: loan.id,
                borrower_name: borrowerName,
                amount: loanAmount,
                future_dates: monthDates,
                period: 'month' as const,
                total_deduction: monthDates.length * loanAmount
              })
            }
            
            recurringLoansDeduction.push({
              id: loan.id,
              borrower_name: borrowerName,
              amount: loanAmount,
              future_dates: futureDates,
              period: 'threeMonths' as const,
              total_deduction: futureDates.length * loanAmount
            })
          }
        }
      }
      
      // חישוב סיכומים
      const totals = {
        week: { income: 0, deduction: 0, net: 0 },
        month: { income: 0, deduction: 0, net: 0 },
        threeMonths: { income: 0, deduction: 0, net: 0 }
      }
      
      loansWithDueDate.forEach(l => {
        totals[l.period].income += l.amount
      })
      
      loansWithAutoRepayment.forEach(l => {
        totals[l.period].income += l.expected_amount
      })
      
      recurringDepositsBreakdown.forEach(d => {
        totals[d.period].income += d.total_amount
      })
      
      recurringLoansDeduction.forEach(d => {
        totals[d.period].deduction += d.total_deduction
      })
      
      totals.week.net = totals.week.income - totals.week.deduction
      totals.month.net = totals.month.income - totals.month.deduction
      totals.threeMonths.net = totals.threeMonths.income - totals.threeMonths.deduction
      
      setExpectedFundsBreakdown({
        loansWithDueDate,
        loansWithAutoRepayment,
        recurringDeposits: recurringDepositsBreakdown,
        recurringLoansDeduction,
        totals
      })
    } catch (error) {
      console.error('Error preparing breakdown:', error)
    }
  }

  const handleOpenDialog = (entry?: WaitlistEntry) => {
    if (entry) {
      setEditingEntry(entry)
      const borrower = borrowers.find(b => b.id === entry.borrower_id)
      setSelectedBorrower(borrower || null)
      setRequestedAmount(entry.requested_amount)
      setLoanType(entry.loan_type)
      setRequestedMonths(entry.requested_months || 12)
      setNotes(entry.notes || '')
      setPriority(entry.priority)
    } else {
      setEditingEntry(null)
      setSelectedBorrower(null)
      setRequestedAmount(0)
      setLoanType('flexible')
      setRequestedMonths(12)
      setNotes('')
      setPriority('normal')
    }
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingEntry(null)
  }

  const handleSave = async () => {
    if (!selectedBorrower || requestedAmount <= 0) {
      setSnackbar({ open: true, message: 'נא למלא את כל השדות החובה', severity: 'error' })
      return
    }

    try {
      if (editingEntry) {
        await waitlistService.update(editingEntry.id, {
          borrower_id: selectedBorrower.id,
          requested_amount: requestedAmount,
          loan_type: loanType,
          requested_months: requestedMonths,
          notes,
          priority,
        })
        setSnackbar({ open: true, message: 'הבקשה עודכנה בהצלחה', severity: 'success' })
      } else {
        await waitlistService.create({
          borrower_id: selectedBorrower.id,
          requested_amount: requestedAmount,
          request_date: new Date().toISOString().split('T')[0],
          loan_type: loanType,
          requested_months: requestedMonths,
          notes,
          priority,
          status: 'waiting',
        })
        setSnackbar({ open: true, message: 'הבקשה נוספה לתור בהצלחה', severity: 'success' })
      }
      handleCloseDialog()
      loadData()
    } catch (error) {
      console.error('Error saving waitlist entry:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק את הבקשה מהתור?')) return

    try {
      await waitlistService.delete(id)
      setSnackbar({ open: true, message: 'הבקשה נמחקה', severity: 'success' })
      loadData()
    } catch (error) {
      console.error('Error deleting entry:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleApprove = async (entry: WaitlistEntry & { borrower_name: string }) => {
    // ניווט לטאב הלוואות עם לווה ובקשת תור שנבחרו
    window.location.href = `/loans?tab=0&borrower=${entry.borrower_id}&waitlist=${entry.id}`
  }

  const handleReject = async (id: string) => {
    if (!confirm('האם לסמן את הבקשה כנדחתה?')) return

    try {
      await waitlistService.update(id, { status: 'rejected' })
      setSnackbar({ open: true, message: 'הבקשה סומנה כנדחתה', severity: 'success' })
      loadData()
    } catch (error) {
      console.error('Error rejecting entry:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון', severity: 'error' })
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = waitlist.findIndex(item => item.id === active.id)
    const newIndex = waitlist.findIndex(item => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Update local state immediately for smooth UX
    const newWaitlist = arrayMove(waitlist, oldIndex, newIndex)
    setWaitlist(newWaitlist)

    try {
      // Update position in database
      const entryId = active.id as number
      const newPosition = newIndex + 1
      await waitlistService.moveToPosition(entryId, newPosition)
      
      // Reload to ensure consistency
      loadData()
    } catch (error) {
      console.error('Error updating position:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון מיקום', severity: 'error' })
      // Reload on error to restore correct state
      loadData()
    }
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handleSort = (columnId: string) => {
    const isAsc = orderBy === columnId && order === 'asc'
    setOrder(isAsc ? 'desc' : 'asc')
    setOrderBy(columnId)
  }

  const getSortedWaitlist = () => {
    if (!orderBy) return waitlist

    return [...waitlist].sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (orderBy) {
        case 'position':
          aValue = a.position
          bValue = b.position
          break
        case 'borrower_name':
          aValue = a.borrower_name
          bValue = b.borrower_name
          break
        case 'requested_amount':
          aValue = a.requested_amount
          bValue = b.requested_amount
          break
        case 'request_date':
          aValue = new Date(a.request_date).getTime()
          bValue = new Date(b.request_date).getTime()
          break
        case 'loan_type':
          aValue = a.loan_type
          bValue = b.loan_type
          break
        case 'requested_months':
          aValue = a.requested_months || 0
          bValue = b.requested_months || 0
          break
        case 'priority':
          aValue = a.priority === 'urgent' ? 0 : 1
          bValue = b.priority === 'urgent' ? 0 : 1
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        default:
          return 0
      }

      // Handle null/undefined values
      if (aValue == null) return 1
      if (bValue == null) return -1

      // Compare values
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'he')
        return order === 'asc' ? comparison : -comparison
      }

      if (aValue < bValue) return order === 'asc' ? -1 : 1
      if (aValue > bValue) return order === 'asc' ? 1 : -1
      return 0
    })
  }

  const waitingEntries = waitlist.filter(e => e.status === 'waiting')
  const totalRequested = waitingEntries.reduce((sum, e) => sum + e.requested_amount, 0)
  const sortedWaitlist = getSortedWaitlist()

  return (
    <Box>
      {/* Statistics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                ממתינים בתור
              </Typography>
              <Typography variant="h4">
                {waitingEntries.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                סכום כולל מבוקש
              </Typography>
              <Typography variant="h4">
                {formatCurrency(totalRequested)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                כסף זמין
              </Typography>
              <Typography variant="h4" color={availableFunds >= 0 ? 'success.main' : 'error.main'}>
                {formatCurrency(availableFunds)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                בקשות דחופות
              </Typography>
              <Typography variant="h4" color="error">
                {waitingEntries.filter(e => e.priority === 'urgent').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Expected Funds Card */}
      <Card sx={{ mb: 3, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.200' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.primary' }}>
            <TrendingUpIcon /> כסף צפוי להשתחרר
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={4}>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                <Typography variant="body2" color="text.secondary">
                  בשבוע הקרוב
                </Typography>
                <Typography variant="h5" color="success.main" fontWeight={600}>
                  {formatCurrency(expectedFunds.week)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                <Typography variant="body2" color="text.secondary">
                  בחודש הקרוב
                </Typography>
                <Typography variant="h5" color="success.main" fontWeight={600}>
                  {formatCurrency(expectedFunds.month)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                <Typography variant="body2" color="text.secondary">
                  ב-3 חודשים
                </Typography>
                <Typography variant="h5" color="success.main" fontWeight={600}>
                  {formatCurrency(expectedFunds.threeMonths)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AssessmentIcon />}
              onClick={() => {
                prepareExpectedFundsBreakdown()
                setExpectedFundsDialogOpen(true)
              }}
            >
              הצג פירוט מלא
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            * כולל פירעון הלוואות פעילות והפקדות מחזוריות צפויות
          </Typography>
        </CardContent>
      </Card>

      {/* Add Button */}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          הוסף לתור
        </Button>
      </Box>

      {/* Waitlist Table */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'position'}
                    direction={orderBy === 'position' ? order : 'asc'}
                    onClick={() => handleSort('position')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'position' ? 1 : 0.3,
                      },
                    }}
                  >
                    מיקום
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'borrower_name'}
                    direction={orderBy === 'borrower_name' ? order : 'asc'}
                    onClick={() => handleSort('borrower_name')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'borrower_name' ? 1 : 0.3,
                      },
                    }}
                  >
                    שם לווה
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <TableSortLabel
                      active={orderBy === 'requested_amount'}
                      direction={orderBy === 'requested_amount' ? order : 'asc'}
                      onClick={() => handleSort('requested_amount')}
                      hideSortIcon={false}
                      sx={{
                        '& .MuiTableSortLabel-icon': {
                          opacity: orderBy === 'requested_amount' ? 1 : 0.3,
                          position: 'relative',
                          left: 'auto',
                          right: 'auto',
                          marginLeft: '4px',
                          marginRight: 0,
                        },
                      }}
                    >
                      סכום מבוקש
                    </TableSortLabel>
                  </Box>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'request_date'}
                    direction={orderBy === 'request_date' ? order : 'asc'}
                    onClick={() => handleSort('request_date')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'request_date' ? 1 : 0.3,
                      },
                    }}
                  >
                    תאריך בקשה
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'loan_type'}
                    direction={orderBy === 'loan_type' ? order : 'asc'}
                    onClick={() => handleSort('loan_type')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'loan_type' ? 1 : 0.3,
                      },
                    }}
                  >
                    סוג הלוואה
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'requested_months'}
                    direction={orderBy === 'requested_months' ? order : 'asc'}
                    onClick={() => handleSort('requested_months')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'requested_months' ? 1 : 0.3,
                      },
                    }}
                  >
                    תקופה
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'priority'}
                    direction={orderBy === 'priority' ? order : 'asc'}
                    onClick={() => handleSort('priority')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'priority' ? 1 : 0.3,
                      },
                    }}
                  >
                    עדיפות
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => handleSort('status')}
                    hideSortIcon={false}
                    sx={{
                      '& .MuiTableSortLabel-icon': {
                        opacity: orderBy === 'status' ? 1 : 0.3,
                      },
                    }}
                  >
                    סטטוס
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>פעולות</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedWaitlist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="textSecondary">אין בקשות בתור</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={sortedWaitlist.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortedWaitlist.map((entry, index) => (
                    <SortableRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                      onEdit={handleOpenDialog}
                      onDelete={handleDelete}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      formatCurrency={formatCurrency}
                      formatDisplayDate={formatDisplayDate}
                      dateFormat={settings.date_format}
                    />
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </DndContext>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingEntry ? 'עריכת בקשה' : 'הוספת בקשה לתור'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Autocomplete
                  options={borrowers}
                  getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                  value={selectedBorrower}
                  onChange={(_, value) => setSelectedBorrower(value)}
                  renderInput={(params) => (
                    <TextField {...params} label="לווה *" />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <AmountInput
                  label="סכום מבוקש *"
                  value={requestedAmount}
                  onChange={setRequestedAmount}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>סוג הלוואה</InputLabel>
                  <Select
                    value={loanType}
                    onChange={(e) => setLoanType(e.target.value as 'fixed' | 'flexible')}
                    label="סוג הלוואה"
                  >
                    <MenuItem value="flexible">גמישה</MenuItem>
                    <MenuItem value="fixed">קבועה</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="תקופה מבוקשת (חודשים)"
                  value={requestedMonths}
                  onChange={(e) => setRequestedMonths(parseInt(e.target.value) || 0)}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>עדיפות</InputLabel>
                  <Select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                    label="עדיפות"
                  >
                    <MenuItem value="normal">רגילה</MenuItem>
                    <MenuItem value="urgent">דחופה</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  label="הערות"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>ביטול</Button>
          <Button onClick={handleSave} variant="contained">
            {editingEntry ? 'עדכן' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Expected Funds Breakdown Dialog */}
      {expectedFundsBreakdown && (
        <ExpectedFundsDialog
          open={expectedFundsDialogOpen}
          onClose={() => setExpectedFundsDialogOpen(false)}
          breakdown={expectedFundsBreakdown}
          formatCurrency={formatCurrency}
          formatDisplayDate={formatDisplayDate}
          dateFormat={settings.date_format}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
