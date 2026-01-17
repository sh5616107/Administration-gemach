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
} from '@mui/material'
import {
  Warning as WarningIcon,
  Event as EventIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  OpenInNew as OpenIcon,
  Savings as SavingsIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { loansService, repaymentsService, db } from '../services/database'
import { useSettings } from '../hooks/useSettings'
import { formatDisplayDate } from '../utils/dateUtils'
import { createRecurringDeposit, activatePlannedLoans } from '../services/scheduler'

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

// Store read alerts in localStorage
const READ_ALERTS_KEY = 'gemach_read_alerts'

const getReadAlerts = (): Set<string> => {
  try {
    const stored = localStorage.getItem(READ_ALERTS_KEY)
    return stored ? new Set(JSON.parse(stored)) : new Set()
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

export default function AlertsDialog({ open, onClose, onAlertCountChange }: AlertsDialogProps) {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [readAlerts, setReadAlerts] = useState<Set<string>>(getReadAlerts())
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (open) {
      checkAlerts()
    }
  }, [open])

  useEffect(() => {
    // Update parent with unread count only after alerts are loaded
    if (initialized && alerts.length > 0) {
      const unreadCount = alerts.filter(a => !readAlerts.has(a.key)).length
      onAlertCountChange?.(unreadCount)
    }
  }, [alerts, readAlerts, onAlertCountChange, initialized])

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
      // Recurring loan check - handle short months
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      if (loan.is_recurring && effectiveRecurringDay === day && loan.status === 'active') {
        newAlerts.push({
          type: 'recurring',
          title: 'הלוואה מחזורית להיום',
          message: `${loan.borrower_name} - סכום: ₪${loan.amount?.toLocaleString()}`,
          loanId: loan.id,
          borrowerId: loan.borrower_id,
          key: `recurring-${loan.id}-${todayStr}`,
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
    const newReadAlerts = new Set(readAlerts)
    newReadAlerts.add(alert.key)
    setReadAlerts(newReadAlerts)
    saveReadAlerts(newReadAlerts)
    
    // Update parent immediately
    const newUnreadCount = alerts.filter(a => !newReadAlerts.has(a.key)).length
    onAlertCountChange?.(newUnreadCount)
  }

  const handleMarkAllAsRead = () => {
    const newReadAlerts = new Set(readAlerts)
    alerts.forEach(a => newReadAlerts.add(a.key))
    setReadAlerts(newReadAlerts)
    saveReadAlerts(newReadAlerts)
    
    // Update parent immediately - all are read now
    onAlertCountChange?.(0)
  }

  const handleConfirmRepayment = async (alert: Alert) => {
    if (!alert.loanId || !alert.amount) return
    
    if (!confirm(`האם לאשר פירעון של ₪${alert.amount.toLocaleString()}?`)) return
    
    try {
      await repaymentsService.create({
        loan_id: alert.loanId,
        amount: alert.amount,
        payment_date: new Date().toISOString().split('T')[0],
        notes: 'פירעון מחזורי אוטומטי'
      })
      
      // Mark as read
      handleMarkAsRead(alert)
      checkAlerts()
    } catch (error) {
      console.error('Error confirming repayment:', error)
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
        return <SavingsIcon color="success" />
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            🔔 התראות
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
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            אין התראות חדשות 🎉
          </Typography>
        ) : (
          <List>
            {visibleAlerts.map((alert, index) => (
              <ListItem 
                key={alert.key} 
                divider
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
                onClick={() => handleGoToLoan(alert)}
              >
                <ListItemIcon>{getIcon(alert.type)}</ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {alert.title}
                      <Chip
                        label={getChipLabel(alert.type)}
                        color={getChipColor(alert.type) as any}
                        size="small"
                      />
                    </Box>
                  }
                  secondary={alert.message}
                />
                <ListItemSecondaryAction>
                  {alert.type === 'auto_repayment' && (
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
                    title="סמן כנקרא"
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
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
    </Dialog>
  )
}

// Export function to get unread alert count (for use in Layout)
export async function getUnreadAlertCount(): Promise<number> {
  console.log('[ALERT COUNT] Starting getUnreadAlertCount')
  const readAlerts = getReadAlerts()
  console.log('[ALERT COUNT] Read alerts:', [...readAlerts])
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const day = today.getDate()
  
  // Get last day of current month
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  
  let count = 0

  try {
    // First, activate any planned loans that have reached their date
    await activatePlannedLoans()
    
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
      // Handle short months
      const recurringDay = loan.recurring_day || 1
      const effectiveRecurringDay = Math.min(recurringDay, lastDayOfMonth)
      
      if (loan.is_recurring && effectiveRecurringDay === day && loan.status === 'active') {
        const key = `recurring-${loan.id}-${todayStr}`
        if (!readAlerts.has(key)) {
          count++
          console.log('[ALERT COUNT] Unread recurring:', key)
        }
      }
      
      const repaymentDay = loan.repayment_day || 1
      const effectiveRepaymentDay = Math.min(repaymentDay, lastDayOfMonth)
      
      if (loan.auto_repayment && effectiveRepaymentDay === day && (loan.remaining || 0) > 0) {
        const key = `repayment-${loan.id}-${todayStr}`
        if (!readAlerts.has(key)) {
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
