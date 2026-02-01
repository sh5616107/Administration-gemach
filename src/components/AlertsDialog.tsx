import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Chip,
  Box,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material'
import {
  Warning as WarningIcon,
  Event as EventIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  OpenInNew as OpenIcon,
  AccountBalanceWallet as DepositIcon,
  Notifications as NotificationsIcon,
  Celebration as CelebrationIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { loansService, repaymentsService, db } from '../services/database'
import { useSettings } from '../hooks/useSettings'
import { formatDisplayDate } from '../utils/dateUtils'
import { createRecurringDeposit, createRecurringLoan, activatePlannedLoans } from '../services/scheduler'

interface Alert {
  type: 'overdue' | 'recurring' | 'auto_repayment' | 'recurring_deposit' | 'info'
  title: string
  message: string
  loanId?: number
  borrowerId?: number
  depositId?: number
  amount?: number
  key: string // unique key for tracking read status
}

interface AlertsDialogProps {
  open: boolean
  onClose: () => void
  onAlertCountChange?: (count: number) => void
}

interface SnackbarState {
  open: boolean
  message: string
  severity: 'success' | 'error'
}

// Store read alerts in localStorage
const READ_ALERTS_KEY = 'gemach_read_alerts'
const CONFIRMED_REPAYMENTS_KEY = 'gemach_confirmed_repayments'

const getReadAlerts = (): Set<string> => {
  try {
    const stored = localStorage.getItem(READ_ALERTS_KEY)
    const alerts = stored ? new Set(JSON.parse(stored)) : new Set()
    
    // ניקוי התראות ישנות (מעל 7 ימים)
    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const cleaned = new Set<string>()
    alerts.forEach((alertKey: string) => {
      // נסה לחלץ תאריך מה-key (פורמט: type-id-YYYY-MM-DD)
      const parts = alertKey.split('-')
      const dateStr = parts[parts.length - 1]
      
      // אם יש תאריך תקין, בדוק אם הוא לא ישן מדי
      if (dateStr && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const alertDate = new Date(dateStr)
        if (alertDate >= sevenDaysAgo) {
          cleaned.add(alertKey)
        }
      } else {
        // אם אין תאריך או שהוא לא תקין, שמור את ההתראה
        cleaned.add(alertKey)
      }
    })
    
    // שמור את הרשימה המנוקה
    if (cleaned.size !== alerts.size) {
      saveReadAlerts(cleaned)
    }
    
    return cleaned
  } catch {
    return new Set()
  }
}

const saveReadAlerts = (alerts: Set<string>) => {
  try {
    localStorage.setItem(READ_ALERTS_KEY, JSON.stringify([...alerts]))
  } catch (e) {
    console.error('Error saving read alerts:', e)
  }
}

const getConfirmedRepayments = (): Set<string> => {
  try {
    const stored = localStorage.getItem(CONFIRMED_REPAYMENTS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
  } catch {
    return new Set()
  }
}

const saveConfirmedRepayments = (repayments: Set<string>) => {
  try {
    localStorage.setItem(CONFIRMED_REPAYMENTS_KEY, JSON.stringify([...repayments]))
  } catch (e) {
    console.error('Error saving confirmed repayments:', e)
  }
}

export default function AlertsDialog({ open, onClose, onAlertCountChange }: AlertsDialogProps) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [readAlerts, setReadAlerts] = useState<Set<string>>(getReadAlerts())
  const [confirmedRepayments, setConfirmedRepayments] = useState<Set<string>>(getConfirmedRepayments())
  const [initialized, setInitialized] = useState(false)
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' })

  useEffect(() => {
    if (open) {
      checkAlerts()
    }
  }, [open])

  useEffect(() => {
    // Update parent with unread count only after alerts are loaded
    if (initialized && alerts.length > 0) {
      // Don't count confirmed repayments as unread
      const unreadCount = alerts.filter(a => 
        !readAlerts.has(a.key) && 
        !(a.type === 'auto_repayment' && confirmedRepayments.has(a.key))
      ).length
      onAlertCountChange?.(unreadCount)
    }
  }, [alerts, readAlerts, confirmedRepayments, onAlertCountChange, initialized])

  const checkAlerts = async () => {
    const newAlerts: Alert[] = []
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const day = today.getDate()
    
    // Get last day of current month
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()

    // First, activate any planned loans that have reached their date
    console.log('[ALERTS] Activating planned loans...')
    const activated = await activatePlannedLoans()
    console.log('[ALERTS] Activated planned loans:', activated)
    
    // Auto-create recurring loans
    console.log('[ALERTS] Auto-creating recurring loans...')
    await autoCreateRecurringLoans()
    console.log('[ALERTS] Recurring loans auto-creation completed')

    // Check overdue loans
    const overdueLoans = await loansService.getOverdue()
    overdueLoans.forEach((loan: any) => {
      newAlerts.push({
        type: 'overdue',
        title: 'הלוואה באיחור',
        message: `${loan.borrower_name} - יתרה: ₪${loan.remaining?.toLocaleString()} (תאריך פירעון: ${formatDisplayDate(loan.due_date, settings.date_format)})`,
        loanId: loan.id,
        borrowerId: loan.borrower_id,
        key: `overdue-${loan.id}-${loan.due_date}`,
      })
    })

    // Check recurring loans due today
    const allLoans = await loansService.getAll() as any[]
    
    // Check for loans that were activated today (planned -> active)
    // Only show alert if the loan was originally planned (created before today)
    allLoans.forEach((loan: any) => {
      if (loan.loan_date === todayStr && loan.status === 'active') {
        // Check if loan was created before today (meaning it was planned)
        const createdDate = loan.created_at?.split('T')[0]
        if (createdDate && createdDate < todayStr) {
          newAlerts.push({
            type: 'info',
            title: 'הלוואה מתוכננת הופעלה',
            message: `${loan.borrower_name} - סכום: ₪${loan.amount?.toLocaleString()}`,
            loanId: loan.id,
            borrowerId: loan.borrower_id,
            key: `planned-activated-${loan.id}-${todayStr}`,
          })
        }
      }
    })
    
    allLoans.forEach((loan: any) => {
      // Check for newly created recurring loans today (for info alert)
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      if (loan.is_recurring && loan.loan_date === todayStr && loan.recurring_loan_number > 1) {
        // This is a newly created recurring loan - show info alert
        newAlerts.push({
          type: 'info',
          title: 'הלוואה מחזורית נוצרה',
          message: `${loan.borrower_name} - הלוואה ${loan.recurring_loan_number}/${loan.recurring_loan_count} - סכום: ₪${loan.amount?.toLocaleString()}`,
          loanId: loan.id,
          borrowerId: loan.borrower_id,
          key: `recurring-created-${loan.id}-${todayStr}`,
        })
      }
      
      // Auto repayment check - handle short months
      const repaymentDay = loan.repayment_day || 1
      const effectiveRepaymentDay = Math.min(repaymentDay, lastDayOfMonth)
      
      if (loan.auto_repayment && effectiveRepaymentDay === day && (loan.remaining || 0) > 0) {
        const repaymentAmount = Math.min(loan.repayment_amount || 0, loan.remaining || 0)
        if (repaymentAmount > 0) {
          newAlerts.push({
            type: 'auto_repayment',
            title: 'פירעון מחזורי להיום',
            message: `${loan.borrower_name} - סכום: ₪${repaymentAmount.toLocaleString()} (יתרה: ₪${loan.remaining?.toLocaleString()})`,
            loanId: loan.id,
            borrowerId: loan.borrower_id,
            amount: repaymentAmount,
            key: `repayment-${loan.id}-${todayStr}`,
          })
        }
      }
    })

    // Check recurring deposits due today
    try {
      const deposits = await db.query(`
        SELECT d.*, dp.first_name || ' ' || dp.last_name as depositor_name
        FROM deposits d
        JOIN depositors dp ON d.depositor_id = dp.id
        WHERE d.is_recurring = 1 AND d.status = 'active'
      `) as any[]
      
      // Get last day of current month
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      
      deposits.forEach((deposit: any) => {
        // בדיקה: רק הפקדות עם recurring_months > 0 צריכות ליצור התראות
        if (!deposit.recurring_months || deposit.recurring_months <= 0) {
          return
        }
        
        // בדיקה: אם ההפקדה נוצרה היום, לא צריך התראה
        if (deposit.deposit_date === todayStr) {
          return
        }
        
        const recurringDay = deposit.recurring_day || new Date(deposit.deposit_date).getDate()
        // If recurring day is greater than last day of month, use last day
        const effectiveDay = Math.min(recurringDay, lastDayOfMonth)
        
        if (effectiveDay === day) {
          newAlerts.push({
            type: 'recurring_deposit',
            title: 'הפקדה מחזורית להיום',
            message: `${deposit.depositor_name} - סכום: ₪${deposit.amount?.toLocaleString()}`,
            depositId: deposit.id,
            amount: deposit.amount,
            key: `recurring-deposit-${deposit.id}-${todayStr}`,
          })
        }
      })
    } catch (error) {
      console.error('Error checking recurring deposits:', error)
    }

    setAlerts(newAlerts)
    setInitialized(true)
  }

  const handleGoToLoan = (alert: Alert) => {
    onClose()
    if (alert.type === 'recurring_deposit' && alert.depositId) {
      navigate('/donations')
    } else if (alert.borrowerId) {
      navigate(`/loans?borrower=${alert.borrowerId}`)
    }
  }

  const handleMarkAsRead = (alert: Alert) => {
    // אם זו התראת פירעון מחזורי שלא אושרה - לא מאפשרים לסמן כנקרא
    if (alert.type === 'auto_repayment' && !confirmedRepayments.has(alert.key)) {
      window.alert('יש לאשר את הפירעון לפני סימון כנקרא')
      return
    }
    
    const newReadAlerts = new Set(readAlerts)
    newReadAlerts.add(alert.key)
    setReadAlerts(newReadAlerts)
    saveReadAlerts(newReadAlerts)
    
    // Update parent immediately
    const newUnreadCount = alerts.filter(a => 
      !newReadAlerts.has(a.key) && 
      !(a.type === 'auto_repayment' && confirmedRepayments.has(a.key))
    ).length
    onAlertCountChange?.(newUnreadCount)
  }

  const handleMarkAllAsRead = () => {
    // מסמנים רק התראות שאינן פירעון מחזורי שלא אושר
    const newReadAlerts = new Set(readAlerts)
    alerts.forEach(a => {
      if (a.type !== 'auto_repayment' || confirmedRepayments.has(a.key)) {
        newReadAlerts.add(a.key)
      }
    })
    setReadAlerts(newReadAlerts)
    saveReadAlerts(newReadAlerts)
    
    // Update parent immediately
    const newUnreadCount = alerts.filter(a => 
      !newReadAlerts.has(a.key) && 
      !(a.type === 'auto_repayment' && confirmedRepayments.has(a.key))
    ).length
    onAlertCountChange?.(newUnreadCount)
  }

  const handleConfirmRepayment = async (alert: Alert) => {
    if (!alert.loanId || !alert.amount) return
    
    if (!confirm(`האם לאשר פירעון של ₪${alert.amount.toLocaleString()}?`)) return
    
    try {
      // קבלת פרטי ההלוואה לחישוב מספרים מחזוריים
      const loan = await loansService.getById(alert.loanId) as any
      
      let isRecurring = 0
      let recurringRepaymentNumber: number | undefined
      let recurringRepaymentCount: number | undefined
      
      if (loan && loan.auto_repayment === 1 && loan.repayment_amount && loan.repayment_amount > 0) {
        isRecurring = 1
        
        // מחשבים כמה פירעונות כבר היו
        const existingRepayments = await repaymentsService.getByLoan(alert.loanId)
        recurringRepaymentNumber = existingRepayments.length + 1
        
        // אם יש כבר פירעון קודם עם מספר מחזורי - משתמשים באותו ספירה
        const firstRecurringRepayment = existingRepayments.find(r => r.recurring_repayment_count && r.recurring_repayment_count > 0)
        
        if (firstRecurringRepayment && firstRecurringRepayment.recurring_repayment_count) {
          // משתמשים בספירה מהפירעון הקיים (שכבר עודכנה אם שינו את הסכום)
          recurringRepaymentCount = firstRecurringRepayment.recurring_repayment_count
          console.log(`[ALERT] Using existing count from repayments: ${recurringRepaymentCount}`)
        } else {
          // זה הפירעון הראשון - מחשבים את הספירה
          recurringRepaymentCount = Math.ceil(loan.amount / loan.repayment_amount)
          console.log(`[ALERT] First recurring repayment, calculated count: ${recurringRepaymentCount}`)
        }
        
        console.log(`[ALERT] Creating recurring repayment ${recurringRepaymentNumber}/${recurringRepaymentCount}`)
      }
      
      await repaymentsService.create({
        loan_id: alert.loanId,
        amount: alert.amount,
        payment_date: new Date().toISOString().split('T')[0],
        notes: 'פירעון מחזורי אוטומטי',
        is_recurring: isRecurring,
        recurring_repayment_number: recurringRepaymentNumber,
        recurring_repayment_count: recurringRepaymentCount,
      })
      
      // סימון הפירעון כמאושר (לא מסמנים כנקרא!)
      const newConfirmedRepayments = new Set(confirmedRepayments)
      newConfirmedRepayments.add(alert.key)
      setConfirmedRepayments(newConfirmedRepayments)
      saveConfirmedRepayments(newConfirmedRepayments)
      
      // עדכון מונה התראות
      const newUnreadCount = alerts.filter(a => 
        !readAlerts.has(a.key) && 
        !(a.type === 'auto_repayment' && newConfirmedRepayments.has(a.key))
      ).length
      onAlertCountChange?.(newUnreadCount)
      
      // רענון רשימת ההתראות
      checkAlerts()
    } catch (error) {
      console.error('Error confirming repayment:', error)
    }
  }

  // Auto-create recurring loans that are due today
  const autoCreateRecurringLoans = async () => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const day = today.getDate()
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    
    try {
      const allLoans = await loansService.getAll() as any[]
      
      for (const loan of allLoans) {
        // Skip if not recurring or no more loans to create
        if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
        
        const recurringDay = loan.recurring_day || 1
        const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
        
        // Check if today is the recurring day
        if (effectiveRecurringDay !== day) continue
        
        // Check if loan already created today
        const existingLoanToday = allLoans.find((l: any) => 
          l.borrower_id === loan.borrower_id && 
          l.amount === loan.amount && 
          l.loan_date === todayStr &&
          l.id !== loan.id
        )
        
        if (existingLoanToday) {
          console.log(`[AUTO-CREATE] Loan already exists for today: loan #${loan.id}`)
          continue
        }
        
        // Create the recurring loan
        console.log(`[AUTO-CREATE] Creating recurring loan from loan #${loan.id}`)
        const success = await createRecurringLoan(loan.id)
        
        if (success) {
          console.log(`[AUTO-CREATE] ✅ Successfully created recurring loan from #${loan.id}`)
        } else {
          console.error(`[AUTO-CREATE] ❌ Failed to create recurring loan from #${loan.id}`)
        }
      }
    } catch (error) {
      console.error('[AUTO-CREATE] Error in autoCreateRecurringLoans:', error)
    }
  }

  const handleConfirmRecurringDeposit = async (alert: Alert) => {
    if (!alert.depositId || !alert.amount) return
    
    if (!confirm(`האם ליצור הפקדה מחזורית חדשה של ₪${alert.amount.toLocaleString()}?`)) return
    
    try {
      await createRecurringDeposit(alert.depositId)
      
      // Mark as read
      handleMarkAsRead(alert)
      checkAlerts()
    } catch (error) {
      console.error('Error creating recurring deposit:', error)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'overdue':
        return <WarningIcon color="error" />
      case 'recurring':
        return <EventIcon color="primary" />
      case 'auto_repayment':
        return <EventIcon color="success" />
      case 'recurring_deposit':
        return <DepositIcon color="success" />
      default:
        return <InfoIcon color="info" />
    }
  }

  const getChipColor = (type: string) => {
    switch (type) {
      case 'overdue':
        return 'error'
      case 'recurring':
        return 'primary'
      case 'auto_repayment':
        return 'success'
      case 'recurring_deposit':
        return 'success'
      default:
        return 'default'
    }
  }

  const getChipLabel = (type: string) => {
    switch (type) {
      case 'overdue':
        return 'באיחור'
      case 'recurring':
        return 'מחזורית'
      case 'auto_repayment':
        return 'פירעון'
      case 'recurring_deposit':
        return 'הפקדה מחזורית'
      default:
        return 'מידע'
    }
  }

  const visibleAlerts = alerts.filter(alert => !readAlerts.has(alert.key))
  
  // פונקציה לבדיקה אם פירעון אושר
  const isRepaymentConfirmed = (alert: Alert) => {
    return alert.type === 'auto_repayment' && confirmedRepayments.has(alert.key)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationsIcon />
            התראות
            {visibleAlerts.length > 0 && (
              <Chip label={visibleAlerts.length} color="error" size="small" />
            )}
          </Box>
          {visibleAlerts.length > 0 && (
            <Button size="small" onClick={handleMarkAllAsRead}>
              סמן הכל כנקרא
            </Button>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {visibleAlerts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CelebrationIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
            <Typography color="text.secondary">
              אין התראות חדשות
            </Typography>
          </Box>
        ) : (
          <List>
            {visibleAlerts.map((alert, index) => {
              const confirmed = isRepaymentConfirmed(alert)
              
              return (
                <ListItem 
                  key={alert.key} 
                  divider
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'action.hover' },
                    bgcolor: confirmed ? 'success.light' : 'inherit',
                    opacity: confirmed ? 0.8 : 1,
                  }}
                  onClick={() => handleGoToLoan(alert)}
                >
                  <ListItemIcon>{getIcon(alert.type)}</ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {confirmed && <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />}
                        {confirmed ? 'פירעון נוצר בהצלחה' : alert.title}
                        <Chip
                          label={confirmed ? 'אושר' : getChipLabel(alert.type)}
                          color={confirmed ? 'success' : getChipColor(alert.type) as any}
                          size="small"
                        />
                      </Box>
                    }
                    secondary={alert.message}
                  />
                  <ListItemSecondaryAction>
                    {alert.type === 'auto_repayment' && !confirmed && (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={(e) => { e.stopPropagation(); handleConfirmRepayment(alert); }}
                        sx={{ mr: 1 }}
                      >
                        אשר
                      </Button>
                    )}

                    {alert.type === 'recurring_deposit' && (
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={(e) => { e.stopPropagation(); handleConfirmRecurringDeposit(alert); }}
                        sx={{ mr: 1 }}
                      >
                        צור הפקדה
                      </Button>
                    )}
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleMarkAsRead(alert); }}
                      title={confirmed ? 'סמן כנקרא' : (alert.type === 'auto_repayment' ? 'יש לאשר תחילה' : 'סמן כנקרא')}
                      disabled={alert.type === 'auto_repayment' && !confirmed}
                    >
                      <CheckIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleGoToLoan(alert); }}
                      title={alert.type === 'recurring_deposit' ? 'עבור להפקדות' : 'עבור להלוואה'}
                    >
                      <OpenIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              )
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Dialog>
  )
}

// Export function to get unread alert count (for use in Layout)
export async function getUnreadAlertCount(): Promise<number> {
  console.log('[ALERT COUNT] Starting getUnreadAlertCount')
  const readAlerts = getReadAlerts()
  const confirmedRepayments = getConfirmedRepayments()
  console.log('[ALERT COUNT] Read alerts:', [...readAlerts])
  console.log('[ALERT COUNT] Confirmed repayments:', [...confirmedRepayments])
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  let count = 0

  try {
    // First, activate any planned loans that have reached their date
    await activatePlannedLoans()
    
    // Auto-create recurring loans
    console.log('[ALERT COUNT] Auto-creating recurring loans...')
    const autoCreateRecurringLoans = async () => {
      const allLoansForCreate = await loansService.getAll() as any[]
      
      for (const loan of allLoansForCreate) {
        if (!loan.is_recurring || loan.recurring_months <= 0 || loan.status !== 'active') continue
        
        const recurringDay = loan.recurring_day || 1
        const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
        
        if (effectiveRecurringDay !== day) continue
        
        const existingLoanToday = allLoansForCreate.find((l: any) => 
          l.borrower_id === loan.borrower_id && 
          l.amount === loan.amount && 
          l.loan_date === todayStr &&
          l.id !== loan.id
        )
        
        if (!existingLoanToday) {
          console.log(`[ALERT COUNT] Creating recurring loan from loan #${loan.id}`)
          await createRecurringLoan(loan.id)
        }
      }
    }
    await autoCreateRecurringLoans()
    console.log('[ALERT COUNT] Recurring loans auto-creation completed')
    
    const overdueLoans = await loansService.getOverdue()
    console.log('[ALERT COUNT] Overdue loans:', overdueLoans.length)
    overdueLoans.forEach((loan: any) => {
      const key = `overdue-${loan.id}-${loan.due_date}`
      if (!readAlerts.has(key)) {
        count++
        console.log('[ALERT COUNT] Unread overdue:', key)
      }
    })

    const allLoans = await loansService.getAll() as any[]
    console.log('[ALERT COUNT] All loans:', allLoans.length)
    
    // Check for loans activated today
    allLoans.forEach((loan: any) => {
      if (loan.loan_date === todayStr && loan.status === 'active') {
        // Check if loan was created before today (meaning it was planned)
        const createdDate = loan.created_at?.split('T')[0]
        if (createdDate && createdDate < todayStr) {
          const key = `planned-activated-${loan.id}-${todayStr}`
          if (!readAlerts.has(key)) {
            count++
            console.log('[ALERT COUNT] Unread planned-activated:', key)
          }
        }
      }
    })
    
    allLoans.forEach((loan: any) => {
      // Check for newly created recurring loans today
      if (loan.is_recurring && loan.loan_date === todayStr && loan.recurring_loan_number > 1) {
        const key = `recurring-created-${loan.id}-${todayStr}`
        if (!readAlerts.has(key)) {
          count++
          console.log('[ALERT COUNT] Unread recurring loan created:', key)
        }
      }
      
      const repaymentDay = loan.repayment_day || 1
      const effectiveRepaymentDay = Math.min(repaymentDay, lastDayOfMonth)
      
      if (loan.auto_repayment && effectiveRepaymentDay === day && (loan.remaining || 0) > 0) {
        const key = `repayment-${loan.id}-${todayStr}`
        // לא סופרים פירעונים מאושרים כלא נקראו
        if (!readAlerts.has(key) && !confirmedRepayments.has(key)) {
          count++
          console.log('[ALERT COUNT] Unread repayment:', key)
        }
      }
    })
    
    // Check recurring deposits
    const deposits = await db.query(`
      SELECT d.*, dp.first_name || ' ' || dp.last_name as depositor_name
      FROM deposits d
      JOIN depositors dp ON d.depositor_id = dp.id
      WHERE d.is_recurring = 1 AND d.status = 'active'
    `) as any[]
    
    deposits.forEach((deposit: any) => {
      // בדיקה: רק הפקדות עם recurring_months > 0 צריכות ליצור התראות
      if (!deposit.recurring_months || deposit.recurring_months <= 0) {
        return
      }
      
      // בדיקה: אם ההפקדה נוצרה היום, לא צריך התראה
      if (deposit.deposit_date === todayStr) {
        return
      }
      
      const recurringDay = deposit.recurring_day || new Date(deposit.deposit_date).getDate()
      const effectiveDay = Math.min(recurringDay, lastDayOfMonth)
      
      if (effectiveDay === day) {
        const key = `recurring-deposit-${deposit.id}-${todayStr}`
        if (!readAlerts.has(key)) {
          count++
          console.log('[ALERT COUNT] Unread recurring deposit:', key)
        }
      }
    })
    
    console.log('[ALERT COUNT] Total unread count:', count)
  } catch (error) {
    console.error('[ALERT COUNT] Error getting alert count:', error)
  }

  return count
}
