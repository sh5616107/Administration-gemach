import { useState, useEffect } from 'react'
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
  Savings as DepositIcon,
  VolunteerActivism as DonationIcon,
  AttachMoney as MoneyIcon,
  Description as ReportIcon,
  DeleteForever as ClearIcon,
  Edit as EditIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { statsService, borrowersService, loansService, db, waitlistService } from '../services/database'
import { generateBorrowerReport, openEmailWithDocument, createBorrowerReportEmailData, EmailProvider } from '../services/documents'
import { useSettings } from '../hooks/useSettings'

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
  id: number
  first_name: string
  last_name: string
  email?: string
  loan_count: number
  total_debt: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [waitlistStats, setWaitlistStats] = useState<WaitlistStats | null>(null)
  const [activeBorrowers, setActiveBorrowers] = useState<ActiveBorrower[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<ActiveBorrower[]>([])
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })

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
      await db.run('DELETE FROM deposits')
      await db.run('DELETE FROM depositors')
      await db.run('DELETE FROM blacklist')
      await db.run('DELETE FROM waitlist')
      await db.run('DELETE FROM expenses')
      await db.run('DELETE FROM guarantorLoans')
      
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
      const loans = await loansService.getByBorrower(borrower.id) as any[]
      const activeLoans = loans.filter(l => (l.remaining || 0) > 0)
      
      // קבלת הוצאות ששולמו ע"י הלווה
      const borrowerExpenses = await statsService.getExpensesByBorrower(borrower.id)
      
      generateBorrowerReport({
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        borrowerName: `${borrower.first_name} ${borrower.last_name}`,
        loans: activeLoans.map(l => ({
          id: l.id,
          amount: l.amount,
          loanDate: l.loan_date,
          remaining: l.remaining || 0,
          status: l.status
        })),
        expenses: borrowerExpenses.map((e: any) => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          expense_date: e.expense_date,
          category: e.category
        })),
        totalDebt: borrower.total_debt
      })
      setSnackbar({ open: true, message: 'הדו"ח הופק בהצלחה', severity: 'success' })
    } catch (error) {
      console.error('Error generating report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת הדו"ח', severity: 'error' })
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
      })
      
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

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const availableCash = stats
    ? (stats.donations.total + stats.deposits.total) - stats.activeLoans.total - (stats.gemachExpenses || 0)
    : 0

  return (
    <Box>
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <LoanIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">הלוואות פעילות</Typography>
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
          <Card sx={{ bgcolor: 'info.main', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <LoanIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">הלוואות מתוכננות</Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {stats?.plannedLoans.count || 0}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {formatCurrency(stats?.plannedLoans.total || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {settings.show_waitlist_tab !== 'no' && (
          <Grid item xs={12} sm={6} md={2.4}>
            <Card 
              sx={{ bgcolor: 'warning.main', color: 'white', cursor: 'pointer' }}
              onClick={() => navigate('/loans?tab=3')}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">📋 תור בקשות</Typography>
                </Box>
                <Typography variant="h4" fontWeight={700}>
                  {waitlistStats?.waiting || 0}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  {formatCurrency(waitlistStats?.totalRequested || 0)}
                </Typography>
                {(waitlistStats?.urgent || 0) > 0 && (
                  <Chip 
                    label={`${waitlistStats?.urgent} דחופות`} 
                    size="small" 
                    sx={{ mt: 1, bgcolor: 'error.main', color: 'white' }}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={settings.show_waitlist_tab !== 'no' ? 2.4 : 3}>
          <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DepositIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">הפקדות</Typography>
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
          <Card sx={{ bgcolor: 'secondary.main', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DonationIcon sx={{ mr: 1 }} />
                <Typography variant="subtitle2">תרומות</Typography>
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
            <MoneyIcon sx={{ fontSize: 40, mr: 2 }} />
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
          startIcon={<SearchIcon />}
          onClick={() => setSearchOpen(true)}
        >
          חיפוש לווה
        </Button>
        <Button
          variant="outlined"
          startIcon={<ReportIcon />}
          onClick={() => navigate('/tools')}
        >
          הפקת דו"ח
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<ClearIcon />}
          onClick={() => setClearConfirmOpen(true)}
        >
          נקה הכל
        </Button>
      </Box>

      {/* Active Borrowers Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            לווים פעילים
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>שם</TableCell>
                  <TableCell align="center">מספר הלוואות</TableCell>
                  <TableCell align="center">סך חוב</TableCell>
                  <TableCell align="center">סטטוס</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeBorrowers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין לווים פעילים</Typography>
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
                          label="פעיל"
                          color="success"
                          size="small"
                          icon={<span>✅</span>}
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
                      <strong>סה"כ</strong>
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
        <DialogTitle>חיפוש לווה</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            placeholder="חיפוש לפי שם, טלפון, מ.ז., עיר..."
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
          <Button onClick={() => setSearchOpen(false)}>סגור</Button>
          <Button variant="contained" onClick={handleSearch}>
            חפש
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Confirm Dialog */}
      <Dialog open={clearConfirmOpen} onClose={() => { setClearConfirmOpen(false); setClearConfirmText(''); }}>
        <DialogTitle>⚠️ אישור מחיקת כל הנתונים</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            האם אתה בטוח שברצונך למחוק את כל הנתונים? פעולה זו אינה ניתנת לביטול!
          </Typography>
          <Typography variant="body2" color="error" sx={{ mb: 2 }}>
            כל הלווים, ההלוואות, התרומות וההפקדות יימחקו לצמיתות.
          </Typography>
          <TextField
            fullWidth
            label='הקלד "מחק הכל" לאישור'
            value={clearConfirmText}
            onChange={(e) => setClearConfirmText(e.target.value)}
            error={clearConfirmText !== '' && clearConfirmText !== 'מחק הכל'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setClearConfirmOpen(false); setClearConfirmText(''); }}>ביטול</Button>
          <Button 
            color="error" 
            variant="contained" 
            onClick={handleClearAll}
            disabled={clearConfirmText !== 'מחק הכל'}
          >
            מחק הכל
          </Button>
        </DialogActions>
      </Dialog>

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
