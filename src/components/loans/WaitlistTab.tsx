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
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  DragIndicator as DragIcon,
  TrendingUp as TrendingUpIcon,
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
  id: number
  first_name: string
  last_name: string
}

interface SortableRowProps {
  entry: WaitlistEntry & { borrower_name: string }
  index: number
  onEdit: (entry: WaitlistEntry) => void
  onDelete: (id: number) => void
  onApprove: (entry: WaitlistEntry & { borrower_name: string }) => void
  onReject: (id: number) => void
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
      const { loansService, repaymentsService, db } = await import('../../services/database')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const oneWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      const oneMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      const threeMonths = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
      
      const allLoans = await loansService.getAll()
      const activeLoans = allLoans.filter(l => l.status === 'active')
      
      let weekFunds = 0
      let monthFunds = 0
      let threeMonthsFunds = 0
      
      // חישוב כסף מהלוואות פעילות
      for (const loan of activeLoans) {
        const remaining = loan.remaining || 0
        if (remaining <= 0) continue
        
        // רק הלוואות עם פירעון מחזורי או תאריך פירעון קבוע
        if (loan.auto_repayment === 1 && loan.repayment_amount && loan.repayment_day) {
          // הלוואות עם פירעון מחזורי
          const monthlyAmount = loan.repayment_amount
          
          // בדיקת תקינות
          if (monthlyAmount <= 0) {
            console.warn(`Invalid repayment_amount for loan ${loan.id}: ${monthlyAmount}`)
            continue
          }
          
          // חישוב כמה פירעונים צפויים בכל תקופה
          const paymentsInWeek = Math.min(1, Math.ceil(7 / 30)) // בערך 0-1 פירעונים
          const paymentsInMonth = 1 // פירעון אחד בחודש
          const paymentsInThreeMonths = 3 // 3 פירעונים ב-3 חודשים
          
          weekFunds += Math.min(paymentsInWeek * monthlyAmount, remaining)
          monthFunds += Math.min(paymentsInMonth * monthlyAmount, remaining)
          threeMonthsFunds += Math.min(paymentsInThreeMonths * monthlyAmount, remaining)
        }
        else if (loan.due_date) {
          // הלוואות עם תאריך פירעון קבוע
          const dueDate = new Date(loan.due_date)
          
          // בדיקת תקינות תאריך
          if (isNaN(dueDate.getTime())) {
            console.warn(`Invalid due_date for loan ${loan.id}: ${loan.due_date}`)
            continue
          }
          
          dueDate.setHours(0, 0, 0, 0)
          
          // רק אם תאריך הפירעון בטווח הזמן - נוסיף את כל היתרה
          if (dueDate <= threeMonths) {
            threeMonthsFunds += remaining
            if (dueDate <= oneMonth) {
              monthFunds += remaining
              if (dueDate <= oneWeek) {
                weekFunds += remaining
              }
            }
          }
        }
        // הלוואות גמישות - לא מחשבים כי אין ודאות מתי יפרעו
      }
      
      // חישוב כסף מהפקדות מחזוריות
      const recurringDeposits = await db.query(
        'SELECT * FROM deposits WHERE is_recurring = 1 AND status = ?', 
        ['active']
      ) as any[]
      
      for (const deposit of recurringDeposits) {
        const amount = deposit.amount || 0
        const recurringDay = deposit.recurring_day || 1
        const recurringMonths = deposit.recurring_months || 1
        
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
        const nextDeposits: Date[] = []
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
          nextDeposits.push(new Date(currentDate))
          currentDate.setMonth(currentDate.getMonth() + recurringMonths)
        }
        
        // חשב כמה הפקדות בכל טווח
        for (const depositDate of nextDeposits) {
          if (depositDate <= oneWeek) {
            weekFunds += amount
          }
          if (depositDate <= oneMonth) {
            monthFunds += amount
          }
          if (depositDate <= threeMonths) {
            threeMonthsFunds += amount
          }
        }
      }
      
      // גריעת הלוואות מחזוריות קיימות שטרם נוצרו
      // (הלוואות מחזוריות שמחויבות לעתיד אבל עדיין לא נוצרו במערכת)
      const recurringLoans = allLoans.filter(l => 
        l.is_recurring === 1 && 
        l.recurring_loan_number && 
        l.recurring_loan_count &&
        l.recurring_loan_number < l.recurring_loan_count
      )
      
      for (const loan of recurringLoans) {
        const currentNumber = loan.recurring_loan_number || 0
        const totalCount = loan.recurring_loan_count || 0
        const remainingLoans = totalCount - currentNumber
        const loanAmount = loan.amount
        
        // בדיקות תקינות
        if (loanAmount <= 0) {
          console.warn(`Invalid amount for recurring loan ${loan.id}: ${loanAmount}`)
          continue
        }
        
        if (remainingLoans <= 0) {
          console.warn(`Invalid remaining loans for loan ${loan.id}: ${remainingLoans}`)
          continue
        }
        
        // חישוב מתי ההלוואות הבאות צפויות להיווצר
        if (loan.recurring_day && loan.recurring_months) {
          const recurringMonths = loan.recurring_months || 1
          
          if (recurringMonths <= 0) {
            console.warn(`Invalid recurring_months for loan ${loan.id}: ${recurringMonths}`)
            continue
          }
          
          // התחל מתאריך ההלוואה הנוכחית, לא מההלוואה הראשונה
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
              threeMonthsFunds -= loanAmount
              if (futureDate <= oneMonth) {
                monthFunds -= loanAmount
                if (futureDate <= oneWeek) {
                  weekFunds -= loanAmount
                }
              }
            }
          }
        }
      }
      
      setExpectedFunds({ week: weekFunds, month: monthFunds, threeMonths: threeMonthsFunds })
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
      
      // הפקדות מחזוריות
      const recurringDeposits = await db.query(
        'SELECT * FROM deposits WHERE is_recurring = 1 AND status = ?', 
        ['active']
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

  const handleDelete = async (id: number) => {
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
    // Navigate to loans tab with this borrower and waitlist entry pre-selected
    window.location.href = `/loans?tab=2&borrower=${entry.borrower_id}&waitlist=${entry.id}`
  }

  const handleReject = async (id: number) => {
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

  const waitingEntries = waitlist.filter(e => e.status === 'waiting')
  const totalRequested = waitingEntries.reduce((sum, e) => sum + e.requested_amount, 0)

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
              onClick={() => {
                prepareExpectedFundsBreakdown()
                setExpectedFundsDialogOpen(true)
              }}
            >
              📊 הצג פירוט מלא
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
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>מיקום</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>שם לווה</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>סכום מבוקש</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>תאריך בקשה</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>סוג הלוואה</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>תקופה</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>עדיפות</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>סטטוס</TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>פעולות</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {waitlist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    <Typography color="textSecondary">אין בקשות בתור</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={waitlist.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {waitlist.map((entry, index) => (
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
