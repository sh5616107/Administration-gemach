import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material'

interface ExpectedFundsBreakdown {
  loansWithDueDate: Array<{
    id: number
    borrower_name: string
    amount: number
    due_date: string
    period: 'week' | 'month' | 'threeMonths'
  }>
  loansWithAutoRepayment: Array<{
    id: number
    borrower_name: string
    monthly_amount: number
    remaining: number
    period: 'week' | 'month' | 'threeMonths'
    expected_amount: number
  }>
  recurringDeposits: Array<{
    id: number
    depositor_name: string
    amount: number
    next_dates: string[]
    period: 'week' | 'month' | 'threeMonths'
    total_amount: number
  }>
  recurringLoansDeduction: Array<{
    id: number
    borrower_name: string
    amount: number
    future_dates: string[]
    period: 'week' | 'month' | 'threeMonths'
    total_deduction: number
  }>
  totals: {
    week: { income: number; deduction: number; net: number }
    month: { income: number; deduction: number; net: number }
    threeMonths: { income: number; deduction: number; net: number }
  }
}

interface ExpectedFundsDialogProps {
  open: boolean
  onClose: () => void
  breakdown: ExpectedFundsBreakdown
  formatCurrency: (amount: number) => string
  formatDisplayDate: (date: string, format: string) => string
  dateFormat: string
}

export default function ExpectedFundsDialog({
  open,
  onClose,
  breakdown,
  formatCurrency,
  formatDisplayDate,
  dateFormat,
}: ExpectedFundsDialogProps) {
  const getPeriodLabel = (period: 'week' | 'month' | 'threeMonths') => {
    switch (period) {
      case 'week':
        return 'שבוע'
      case 'month':
        return 'חודש'
      case 'threeMonths':
        return '3 חודשים'
    }
  }

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    color: 'success' | 'info' | 'warning',
    period: 'week' | 'month' | 'threeMonths'
  ) => {
    if (!breakdown) return null
    
    const loansWithDueDate = (breakdown.loansWithDueDate || []).filter(l => l.period === period)
    const loansWithAutoRepayment = (breakdown.loansWithAutoRepayment || []).filter(l => l.period === period)
    const deposits = (breakdown.recurringDeposits || []).filter(d => d.period === period)
    const deductions = (breakdown.recurringLoansDeduction || []).filter(d => d.period === period)

    const hasData =
      loansWithDueDate.length > 0 ||
      loansWithAutoRepayment.length > 0 ||
      deposits.length > 0 ||
      deductions.length > 0

    if (!hasData) return null

    return (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {icon}
          <Typography variant="h6">{title}</Typography>
          <Chip
            label={formatCurrency(breakdown.totals[period].net)}
            color={breakdown.totals[period].net >= 0 ? 'success' : 'error'}
            sx={{ ml: 'auto' }}
          />
        </Box>

        {/* הלוואות עם תאריך פירעון */}
        {loansWithDueDate.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="success.main" sx={{ mb: 1 }}>
              💰 הלוואות שיפרעו ({loansWithDueDate.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'success.50' }}>
                    <TableCell>לווה</TableCell>
                    <TableCell align="center">תאריך פירעון</TableCell>
                    <TableCell align="center">סכום</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loansWithDueDate.map(loan => (
                    <TableRow key={loan.id}>
                      <TableCell>{loan.borrower_name}</TableCell>
                      <TableCell align="center">
                        {formatDisplayDate(loan.due_date, dateFormat)}
                      </TableCell>
                      <TableCell align="center">{formatCurrency(loan.amount)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'success.100' }}>
                    <TableCell colSpan={2}>
                      <strong>סה"כ</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>
                        {formatCurrency(loansWithDueDate.reduce((sum, l) => sum + l.amount, 0))}
                      </strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* הלוואות עם פירעון מחזורי */}
        {loansWithAutoRepayment.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="info.main" sx={{ mb: 1 }}>
              🔄 פירעונים מחזוריים ({loansWithAutoRepayment.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'info.50' }}>
                    <TableCell>לווה</TableCell>
                    <TableCell align="center">פירעון חודשי</TableCell>
                    <TableCell align="center">צפי</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loansWithAutoRepayment.map(loan => (
                    <TableRow key={loan.id}>
                      <TableCell>{loan.borrower_name}</TableCell>
                      <TableCell align="center">
                        {formatCurrency(loan.monthly_amount)}
                      </TableCell>
                      <TableCell align="center">
                        {formatCurrency(loan.expected_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'info.100' }}>
                    <TableCell colSpan={2}>
                      <strong>סה"כ</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>
                        {formatCurrency(
                          loansWithAutoRepayment.reduce((sum, l) => sum + l.expected_amount, 0)
                        )}
                      </strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* הפקדות מחזוריות */}
        {deposits.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="primary.main" sx={{ mb: 1 }}>
              📥 הפקדות מחזוריות ({deposits.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.50' }}>
                    <TableCell>מפקיד</TableCell>
                    <TableCell align="center">תאריכים</TableCell>
                    <TableCell align="center">סה"כ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deposits.map(deposit => (
                    <TableRow key={deposit.id}>
                      <TableCell>{deposit.depositor_name}</TableCell>
                      <TableCell align="center">
                        {deposit.next_dates.map(d => formatDisplayDate(d, dateFormat)).join(', ')}
                      </TableCell>
                      <TableCell align="center">
                        {formatCurrency(deposit.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'primary.100' }}>
                    <TableCell colSpan={2}>
                      <strong>סה"כ</strong>
                    </TableCell>
                    <TableCell align="center">
                      <strong>
                        {formatCurrency(deposits.reduce((sum, d) => sum + d.total_amount, 0))}
                      </strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* הלוואות מחזוריות - גריעה */}
        {deductions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>
              ➖ הלוואות מחזוריות מחויבות ({deductions.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'error.50' }}>
                    <TableCell>לווה</TableCell>
                    <TableCell align="center">תאריכים עתידיים</TableCell>
                    <TableCell align="center">גריעה</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deductions.map(deduction => (
                    <TableRow key={deduction.id}>
                      <TableCell>{deduction.borrower_name}</TableCell>
                      <TableCell align="center">
                        {deduction.future_dates
                          .map(d => formatDisplayDate(d, dateFormat))
                          .join(', ')}
                      </TableCell>
                      <TableCell align="center" sx={{ color: 'error.main' }}>
                        -{formatCurrency(deduction.total_deduction)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'error.100' }}>
                    <TableCell colSpan={2}>
                      <strong>סה"כ גריעה</strong>
                    </TableCell>
                    <TableCell align="center" sx={{ color: 'error.main' }}>
                      <strong>
                        -
                        {formatCurrency(
                          deductions.reduce((sum, d) => sum + d.total_deduction, 0)
                        )}
                      </strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* סיכום */}
        <Box sx={{ bgcolor: color + '.50', p: 2, borderRadius: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>הכנסות צפויות:</Typography>
            <Typography color="success.main">
              <TrendingUpIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
              {formatCurrency(breakdown.totals[period].income)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography>גריעות (הלוואות מחויבות):</Typography>
            <Typography color="error.main">
              <TrendingDownIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: 0.5 }} />
              {formatCurrency(breakdown.totals[period].deduction)}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="h6">סה"כ נטו:</Typography>
            <Typography
              variant="h6"
              color={breakdown.totals[period].net >= 0 ? 'success.main' : 'error.main'}
            >
              {formatCurrency(breakdown.totals[period].net)}
            </Typography>
          </Box>
        </Box>
      </Box>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalendarIcon />
          פירוט חישוב כסף עתיד להשתחרר
        </Box>
      </DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            החישוב כולל רק הלוואות עם תאריך פירעון קבוע או פירעון מחזורי. הלוואות גמישות לא
            נכללות כי אין ודאות מתי יפרעו.
          </Typography>
        </Alert>

        {renderSection('שבוע קדימה', <CalendarIcon color="success" />, 'success', 'week')}
        {renderSection('חודש קדימה', <CalendarIcon color="info" />, 'info', 'month')}
        {renderSection(
          '3 חודשים קדימה',
          <CalendarIcon color="warning" />,
          'warning',
          'threeMonths'
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
    </Dialog>
  )
}
