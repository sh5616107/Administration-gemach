import { Card, CardContent, Box, Typography, Chip, Stack } from '@mui/material';
import type { Loan } from '../../services/database';
import { getLoanDueDate, formatDueDate } from '../../utils/loanDueDate';

interface LoanCardProps {
  loan: Loan;
  fundName?: string;      // מוצג רק כשיש יותר מקופה אחת
  borrowerName?: string;  // מוצג ברשימות שאינן מסוננות לפי לווה
  onClick?: () => void;
  recurringRepaymentInfo?: {
    number: number;
    count: number;
  };
  lastRepaymentDate?: string; // YYYY-MM-DD, להלוואות עם פירעון אוטומטי (לחישוב פירעון הבא)
}

export default function LoanCard({ loan, fundName, borrowerName, onClick, recurringRepaymentInfo, lastRepaymentDate }: LoanCardProps) {
  const balance = loan.amount - (loan.total_repaid ?? 0);
  const isPaid = balance <= 0;
  const due = getLoanDueDate({ ...loan, remaining: balance }, { lastRepaymentDate });
  const dueStatus = due.status;
  
  const borderColor =
    dueStatus === 'overdue' ? 'error.main' :
    dueStatus === 'due-soon' ? 'warning.main' :
    undefined;
  
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
        borderColor,
        borderWidth: borderColor ? 2 : 1,
        ...(onClick ? { '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' } } : {}),
      }}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            הלוואה #{loan.loan_number} • ניתנה: {new Date(loan.loan_date).toLocaleDateString('he-IL')}
            {borrowerName ? ` • ${borrowerName}` : ''}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {fundName ? <Chip label={`קופה: ${fundName}`} variant="outlined" size="small" /> : null}
            {loan.is_recurring ? <Chip label="מחזורית" color="info" size="small" /> : null}
            {dueStatus === 'overdue' ? <Chip label="באיחור" color="error" size="small" /> : null}
            {recurringRepaymentInfo && (
              <Chip
                label={`${recurringRepaymentInfo.number}/${recurringRepaymentInfo.count}`}
                color={dueStatus === 'overdue' ? 'error' : dueStatus === 'due-soon' ? 'warning' : 'success'}
                size="small"
              />
            )}
          </Stack>
        </Stack>

        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">סכום הלוואה</Typography>
            <Typography>₪{loan.amount.toLocaleString()}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">שולם</Typography>
            <Typography>₪{(loan.total_repaid ?? 0).toLocaleString()}</Typography>
          </Box>
        </Stack>

        {due.date ? (
          <Typography
            variant="body2"
            sx={{
              mb: 1,
              fontWeight: dueStatus === 'overdue' || dueStatus === 'due-soon' ? 600 : 400,
              color:
                dueStatus === 'overdue' ? 'error.main' :
                dueStatus === 'due-soon' ? 'warning.main' :
                'text.primary',
            }}
          >
            {due.kind === 'recurring' ? 'פירעון הבא' : 'פירעון'}: {formatDueDate(due.date)}
          </Typography>
        ) : !isPaid && ['active', 'overdue', 'planned'].includes(loan.status) ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            פירעון: לא נקבע
          </Typography>
        ) : null}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">יתרה: ₪{balance.toLocaleString()}</Typography>
          <Chip label={isPaid ? 'נפרעה' : 'פעילה'} color={isPaid ? 'success' : 'primary'} size="small" />
        </Box>
      </CardContent>
    </Card>
  );
}
