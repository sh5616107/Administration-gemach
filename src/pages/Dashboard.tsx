import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material'
import {
  Search as SearchIcon,
  AccountBalance as LoanIcon,
  AccountBalanceWallet as DepositIcon,
  VolunteerActivism as DonationIcon,
  AccountBalanceWallet as MoneyIcon,
  Description as ReportIcon,
  DeleteForever as ClearIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  ListAlt as ListIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { statsService, borrowersService, loansService, db, waitlistService, attachmentsService } from '../services/database'
import { clearEntireArchive } from '../services/attachmentsStorage'
import { generateBorrowerReport, openEmailWithDocument, createBorrowerReportEmailData, EmailProvider } from '../services/documents'
import { useSettings } from '../hooks/useSettings'
import { getDocumentLayout } from '../utils/documentLayoutHelper'
import ItemsListDialog from '../components/ItemsListDialog'

interface DashboardStats {
  activeLoans: { count: number; total: number }
  plannedLoans: { count: number; total: number }
  deposits: { count: number; total: number }
  donations: { count: number; total: number }
  gemachExpenses: number
}

interface WaitlistStats {
  total: number
  waiting: number
  totalRequested: number
  urgent: number
}

interface ActiveBorrower {
  id: string  // UUID
  first_name: string
  last_name: string
  email?: string
  loan_count: number
  total_debt: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const borrowerReportLayout = getDocumentLayout(settings.document_layouts, 'borrowerReport')
  const { t } = useTranslation()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null)
  const [activeBorrowers, setActiveBorrowers] = useState<ActiveBorrower[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ActiveBorrower[]>([])
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  
  // Dialog states for interactive cards
  const [activeLoansDialogOpen, setActiveLoansDialogOpen] = useState(false)
  const [scheduledLoansDialogOpen, setScheduledLoansDialogOpen] = useState(false)
  const [depositsDialogOpen, setDepositsDialogOpen] = useState(false)
  const [activeLoans, setActiveLoans] = useState<any[]>([])
  const [scheduledLoans, setScheduledLoans] = useState<any[]>([])
  const [deposits, setDeposits] = useState<any[]>([])
  const [dialogLoading, setDialogLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

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

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    try {
      const results = await borrowersService.search(searchTerm) as any[]
      setSearchResults(results.map(r => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        loan_count: 0,
        total_debt: 0
      })))
    } catch (error) {
      console.error('Error searching:', error)
    }
  }

  const handleClearAll = async () => {
    if (clearConfirmText !== 'מחק הכל') return
    
    try {
      // Clear all tables
      await db.run('DELETE FROM repayments')
      await db.run('DELETE FROM loans')
      await db.run('DELETE FROM borrowers')
      await db.run('DELETE FROM guarantors')
      await db.run('DELETE FROM donations')
      await db.run('DELETE FROM donors')
      await db.run('DELETE FROM depositWithdrawals')
      await db.run('DELETE FROM deposits')
      await db.run('DELETE FROM depositors')
      await db.run('DELETE FROM blacklist')
      await db.run('DELETE FROM waitlist')
      await db.run('DELETE FROM expenses')
      await db.run('DELETE FROM guarantorLoanRepayments')
      await db.run('DELETE FROM guarantorLoans')

      // Attachments: cleared separately from the DELETE FROM chain above,
      // since attachmentsService doesn't go through the SQL-string shim
      // (see database.ts) — this was previously missing entirely, so
      // "delete all" left every attached document (both the DB records
      // and the physical files in the archive) behind.
      const allAttachments = await attachmentsService.getAllIncludingDeleted()
      if (allAttachments.length > 0) {
        await attachmentsService.hardDeleteMany(allAttachments.map(a => a.id))
      }
      await clearEntireArchive()
      
      setClearConfirmOpen(false)
      setClearConfirmText('')
      setSnackbar({ open: true, message: 'כל הנתונים נמחקו בהצלחה', severity: 'success' })
      loadData()
    } catch (error) {
      console.error('Error clearing data:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקת הנתונים', severity: 'error' })
    }
  }

  const handleGenerateBorrowerReport = async (borrower: ActiveBorrower) => {
    try {
      const { repaymentsService } = await import('../services/database')
      const loans = await loansService.getByBorrower(borrower.id) as any[]
      const activeLoans = loans.filter(l => (l.remaining || 0) > 0)
      
      // טעינת פירעונות לכל הלוואה
      const loansWithRepayments = await Promise.all(
        activeLoans.map(async (loan, index) => {
          const repayments = loan.id ? await repaymentsService.getByLoan(loan.id) : []
          return {
            id: index + 1, // Use sequential number instead of UUID
            amount: loan.amount,
            loanDate: loan.loan_date,
            remaining: loan.remaining || 0,
            status: loan.status,
            isRecurring: loan.is_recurring === 1,
            recurringLoanNumber: loan.recurring_loan_number,
            recurringLoanCount: loan.recurring_loan_count,
            repayments: repayments.map((r: any) => ({
              amount: r.amount,
              payment_date: r.payment_date,
              isRecurring: r.is_recurring === 1,
              recurringRepaymentNumber: r.recurring_repayment_number,
              recurringRepaymentCount: r.recurring_repayment_count,
              notes: r.notes // הוספת שדה notes
            }))
          }
        })
      )
      
      // קבלת הוצאות ששולמו ע"י הלווה
      const borrowerExpenses = await statsService.getExpensesByBorrower(borrower.id)
      
      await generateBorrowerReport({
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        borrowerName: `${borrower.first_name} ${borrower.last_name}`,
        loans: loansWithRepayments,
        expenses: borrowerExpenses.map((e: any, index: number) => ({
          id: index + 1, // Use sequential number for expenses too
          description: e.description,
          amount: e.amount,
          expense_date: e.expense_date,
          category: e.category
        })),
        totalDebt: borrower.total_debt,
        repaymentsOrder: settings.report_repayments_order,
      }, borrowerReportLayout)
      setSnackbar({ open: true, message: 'הדו"ח הופק בהצלחה', severity: 'success' })
    } catch (error) {
      console.error('Error generating report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת הדו"ח', severity: 'error' })
    }
  }

  // Fetch functions for dialogs
  const fetchActiveLoans = async () => {
    setDialogLoading(true)
    try {
      // שימוש בפונקציה המרכזית המשותפת
      const active = await loansService.getActiveLoansForExistingBorrowers()
      
      console.log('📋 Active loans dialog:', active.length)
      setActiveLoans(active)
    } catch (error) {
      console.error('Error fetching active loans:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הלוואות פעילות', severity: 'error' })
    } finally {
      setDialogLoading(false)
    }
  }

  const fetchScheduledLoans = async () => {
    setDialogLoading(true)
    try {
      const allLoans = await loansService.getAll() as any[]
      const borrowers = await borrowersService.getAll()
      const existingBorrowerIds = new Set(borrowers.map(b => b.id))
      
      const scheduled = allLoans
        .filter(l => 
          l.status === 'planned' &&
          existingBorrowerIds.has(l.borrower_id)
        )
        .sort((a, b) => new Date(a.loan_date).getTime() - new Date(b.loan_date).getTime())
      setScheduledLoans(scheduled)
    } catch (error) {
      console.error('Error fetching scheduled loans:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הלוואות מתוכננות', severity: 'error' })
    } finally {
      setDialogLoading(false)
    }
  }

  const fetchDeposits = async () => {
    setDialogLoading(true)
    try {
      const allDeposits = await db.query('SELECT * FROM deposits ORDER BY deposit_date DESC') as any[]
      const depositors = await db.query('SELECT * FROM depositors') as any[]
      const depositsWithNames = allDeposits.map(d => ({
        ...d,
        depositor_name: depositors.find((dep: any) => dep.id === d.depositor_id)
          ? `${depositors.find((dep: any) => dep.id === d.depositor_id)?.first_name || ''} ${depositors.find((dep: any) => dep.id === d.depositor_id)?.last_name || ''}`.trim()
          : 'לא ידוע'
      }))
      setDeposits(depositsWithNames)
    } catch (error) {
      console.error('Error fetching deposits:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הפקדות', severity: 'error' })
    } finally {
      setDialogLoading(false)
    }
  }

  const handleSendBorrowerReportEmail = async (borrower: ActiveBorrower) => {
    if (!borrower.email) {
      setSnackbar({ open: true, message: 'ללווה זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    try {
      const loans = await loansService.getByBorrower(borrower.id) as any[]
      const activeLoans = loans.filter(l => (l.remaining || 0) > 0)
      
      const emailData = createBorrowerReportEmailData({
        gemachName: settings.gemach_name || 'גמ"ח',
        borrowerName: `${borrower.first_name} ${borrower.last_name}`,
        borrowerEmail: borrower.email,
        totalDebt: borrower.total_debt,
        loans: activeLoans.map(l => ({
          id: l.id,
          amount: l.amount,
          loanDate: l.loan_date,
          remaining: l.remaining || 0,
          status: l.status
        })),
      }, borrowerReportLayout)
      
      const provider = (settings.email_provider || 'gmail') as EmailProvider
      const result = await openEmailWithDocument(emailData, provider)
      setSnackbar({ 
        open: true, 
        message: result.message, 
        severity: result.success ? 'success' : 'error' 
      })
    } catch (error) {
      console.error('Error sending email:', error)
      setSnackbar({ open: true, message: 'שגיאה בשליחת המייל', severity: 'error' })
    }
  }

  // Click handlers for interactive cards
  const handleActiveLoansClick = () => {
    fetchActiveLoans()
    setActiveLoansDialogOpen(true)
  }

  const handleScheduledLoansClick = () => {
    fetchScheduledLoans()
    setScheduledLoansDialogOpen(true)
  }

  const handleDepositsClick = () => {
    fetchDeposits()
    setDepositsDialogOpen(true)
  }

  const handleDonationsClick = () => {
    navigate('/donations?tab=0')
  }

  // Navigation handlers from dialogs
  const handleLoanItemClick = (loan: any) => {
    navigate(`/loans?tab=0&borrower=${loan.borrower_id}`)
    setActiveLoansDialogOpen(false)
    setScheduledLoansDialogOpen(false)
  }

  const handleDepositItemClick = (deposit: any) => {
    navigate(`/deposits?depositor=${deposit.depositor_id}&deposit=${deposit.id}`)
    setDepositsDialogOpen(false)
  }

  // Column definitions for dialogs
  const activeLoansColumns = [
    {
      id: 'borrower_name',
      label: 'שם לווה',
      align: 'right' as const,
    },
    {
      id: 'amount',
      label: 'סכום הלוואה',
      align: 'center' as const,
      format: (loan: any) => formatCurrency(loan.amount),
      sortValue: (loan: any) => loan.amount,
    },
    {
      id: 'remaining',
      label: 'יתרה',
      align: 'center' as const,
      format: (loan: any) => formatCurrency(loan.remaining || 0),
      sortValue: (loan: any) => loan.remaining || 0,
    },
    {
      id: 'loan_date',
      label: 'תאריך',
      align: 'center' as const,
      format: (loan: any) => new Date(loan.loan_date).toLocaleDateString('he-IL'),
      sortValue: (loan: any) => new Date(loan.loan_date).getTime(),
    },
  ]

  const scheduledLoansColumns = [
    {
      id: 'borrower_name',
      label: 'שם לווה',
      align: 'right' as const,
    },
    {
      id: 'amount',
      label: 'סכום',
      align: 'center' as const,
      format: (loan: any) => formatCurrency(loan.amount),
      sortValue: (loan: any) => loan.amount,
    },
    {
      id: 'loan_date',
      label: 'תאריך מתוכנן',
      align: 'center' as const,
      format: (loan: any) => new Date(loan.loan_date).toLocaleDateString('he-IL'),
      sortValue: (loan: any) => new Date(loan.loan_date).getTime(),
    },
  ]

  const depositsColumns = [
    {
      id: 'depositor_name',
      label: 'שם מפקיד',
      align: 'right' as const,
    },
    {
      id: 'amount',
      label: 'סכום',
      align: 'center' as const,
      format: (deposit: any) => formatCurrency(deposit.amount),
      sortValue: (deposit: any) => deposit.amount,
    },
    {
      id: 'deposit_date',
      label: 'תאריך',
      align: 'center' as const,
      format: (deposit: any) => new Date(deposit.deposit_date).toLocaleDateString('he-IL'),
      sortValue: (deposit: any) => new Date(deposit.deposit_date).getTime(),
    },
  ]

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    const formatted = new Intl.NumberFormat('he-IL', {
      minimumFractionDigits: 0,
    }).format(amount)
    
    // מציגים את סימן המטבע בהתאם להגדרה
    const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪'
    return `${formatted} ${currencySymbol}`
  }

  const availableCash = stats
    ? (stats.donations.total + stats.deposits.total) - stats.activeLoans.total - (stats.gemachExpenses || 0)
    : 0

  return (
    <Box>
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card 
            sx={{ 
              bgcolor: 'primary.main', 
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              }
            }}
            onClick={handleActiveLoansClick}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <LoanIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">{t('dashboard.activeLoans')}</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {stats?.activeLoans.count || 0}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {formatCurrency(stats?.activeLoans.total || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card 
            sx={{ 
              bgcolor: 'info.main', 
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              }
            }}
            onClick={handleScheduledLoansClick}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <LoanIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2" noWrap>{t('dashboard.plannedLoans')}</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {stats?.plannedLoans.count || 0}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }} noWrap>
                {formatCurrency(stats?.plannedLoans.total || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {settings.show_waitlist_tab !== 'no' && (
          <Grid item xs={12} sm={6} md={2.4}>
            <Card 
              sx={{ 
                bgcolor: 'warning.main', 
                color: 'white', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                }
              }}
              onClick={() => navigate('/loans?tab=2')}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ListIcon sx={{ mr: 0.5, fontSize: 20 }} />
                  <Typography variant="subtitle2">{t('dashboard.waitlist')}</Typography>
                </Box>
                <Typography variant="h4" fontWeight={700}>
                  {waitlistStats?.waiting || 0}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  {formatCurrency(waitlistStats?.totalRequested || 0)}
                </Typography>
                {(waitlistStats?.urgent || 0) > 0 && (
                  <Chip 
                    label={`${waitlistStats?.urgent} ${t('dashboard.urgent')}`} 
                    size="small" 
                    sx={{ mt: 1, bgcolor: 'error.main', color: 'white' }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={settings.show_waitlist_tab !== 'no' ? 2.4 : 3}>
          <Card 
            sx={{ 
              bgcolor: 'success.main', 
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              }
            }}
            onClick={handleDepositsClick}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DepositIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">{t('dashboard.deposits')}</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {stats?.deposits.count || 0}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {formatCurrency(stats?.deposits.total || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={settings.show_waitlist_tab !== 'no' ? 2.4 : 3}>
          <Card 
            sx={{ 
              bgcolor: 'secondary.main', 
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: 4,
              }
            }}
            onClick={handleDonationsClick}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DonationIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">{t('dashboard.donations')}</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {stats?.donations.count || 0}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {formatCurrency(stats?.donations.total || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Available Cash Card */}
      <Card sx={{ mb: 4, bgcolor: availableCash >= 0 ? 'success.light' : 'error.light' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="h6">כסף זמין</Typography>
              <Typography variant="h3" fontWeight={700}>
                {formatCurrency(availableCash)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                (תרומות + פקדונות) - הלוואות פעילות - הוצאות הגמ"ח
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Box sx={{ mb: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<LoanIcon />}
          onClick={() => navigate('/loans?tab=0&action=add')}
          size="large"
        >
          הלוואה חדשה
        </Button>
        <Button
          variant="contained"
          color="success"
          startIcon={<DepositIcon />}
          onClick={() => navigate('/deposits?tab=1')}
          size="large"
        >
          הפקדה חדשה
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<DonationIcon />}
          onClick={() => navigate('/donations?tab=1')}
          size="large"
        >
          תרומה חדשה
        </Button>
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => setSearchOpen(true)}
          size="large"
        >
          {t('dashboard.searchBorrower')}
        </Button>
        <Button
          variant="outlined"
          startIcon={<ReportIcon />}
          onClick={() => navigate('/tools')}
          size="large"
        >
          {t('dashboard.generateReport')}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<ClearIcon />}
          onClick={() => setClearConfirmOpen(true)}
          size="large"
        >
          {t('dashboard.clearAll')}
        </Button>
      </Box>

      {/* Active Borrowers Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('dashboard.activeBorrowers')}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>{t('dashboard.name')}</TableCell>
                  <TableCell align="center">{t('dashboard.loanCount')}</TableCell>
                  <TableCell align="center">{t('dashboard.totalDebt')}</TableCell>
                  <TableCell align="center">{t('common.status')}</TableCell>
                  <TableCell align="center">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeBorrowers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">{t('dashboard.noActiveBorrowers')}</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  activeBorrowers.map((borrower) => (
                    <TableRow key={borrower.id} hover>
                      <TableCell>
                        {borrower.first_name} {borrower.last_name}
                      </TableCell>
                      <TableCell align="center">{borrower.loan_count}</TableCell>
                      <TableCell align="center">{formatCurrency(borrower.total_debt)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={t('dashboard.active')}
                          color="success"
                          size="small"
                          icon={<CheckIcon />}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/loans?borrower=${borrower.id}`)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleGenerateBorrowerReport(borrower)}
                          title="הפק דוח"
                        >
                          <ReportIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleSendBorrowerReportEmail(borrower)}
                          title={borrower.email ? 'שלח דוח במייל' : 'ללווה לא הוזנה כתובת מייל'}
                          disabled={!borrower.email}
                        >
                          <EmailIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {activeBorrowers.length > 0 && (
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell colSpan={2}>
                      <strong>{t('dashboard.total')}</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>
                        {formatCurrency(
                          activeBorrowers.reduce((sum, b) => sum + b.total_debt, 0)
                        )}
                      </strong>
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Search Dialog */}
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('dashboard.searchBorrower')}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            placeholder={t('dashboard.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ mt: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          {searchResults.length > 0 && (
            <Box sx={{ mt: 2 }}>
              {searchResults.map((result) => (
                <Box
                  key={result.id}
                  sx={{
                    p: 2,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    mb: 1,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'grey.50' },
                  }}
                  onClick={() => {
                    setSearchOpen(false)
                    navigate(`/loans?borrower=${result.id}`)
                  }}
                >
                  <Typography fontWeight={500}>
                    {result.first_name} {result.last_name}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchOpen(false)}>{t('common.close')}</Button>
          <Button variant="contained" onClick={handleSearch}>
            {t('common.search')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Confirm Dialog */}
      <Dialog open={clearConfirmOpen} onClose={() => { setClearConfirmOpen(false); setClearConfirmText(''); }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          {t('dashboard.clearAllConfirm')}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            {t('dashboard.clearAllConfirm')}
          </Typography>
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            {t('dashboard.clearAllWarning')}
          </Typography>
          <TextField
            fullWidth
            label={t('dashboard.clearAllConfirmText')}
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            error={clearConfirmText !== '' && clearConfirmText !== 'מחק הכל'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setClearConfirmOpen(false); setClearConfirmText(''); }}>{t('common.cancel')}</Button>
          <Button 
            color="error" 
            variant="contained" 
            onClick={handleClearAll}
            disabled={clearConfirmText !== 'מחק הכל'}
          >
            {t('dashboard.clearAll')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Interactive Dialogs */}
      <ItemsListDialog
        open={activeLoansDialogOpen}
        onClose={() => setActiveLoansDialogOpen(false)}
        title={t('dashboard.activeLoans')}
        items={activeLoans}
        columns={activeLoansColumns}
        onItemClick={handleLoanItemClick}
        loading={dialogLoading}
        emptyMessage={t('dashboard.noActiveLoans')}
      />

      <ItemsListDialog
        open={scheduledLoansDialogOpen}
        onClose={() => setScheduledLoansDialogOpen(false)}
        title={t('dashboard.plannedLoans')}
        items={scheduledLoans}
        columns={scheduledLoansColumns}
        onItemClick={handleLoanItemClick}
        loading={dialogLoading}
        emptyMessage={t('dashboard.noPlannedLoans')}
      />

      <ItemsListDialog
        open={depositsDialogOpen}
        onClose={() => setDepositsDialogOpen(false)}
        title={t('dashboard.deposits')}
        items={deposits}
        columns={depositsColumns}
        onItemClick={handleDepositItemClick}
        loading={dialogLoading}
        emptyMessage={t('dashboard.noDeposits')}
      />
    </Box>
  )
}
