import { Card, CardContent, Box, Typography, Chip, Stack } from '@mui/material';
import type { Loan } from '../../services/database';

interface LoanCardProps {
  loan: Loan;
  onClick: () => void;
}

/**
 * Minimal LoanCard so UnifiedLoansPage compiles and renders something
 * reasonable today. This still needs the full treatment from the design
 * doc / feedback: status background colors (overdue/due-soon/paid),
 * recurring badge, and the 4 hover action buttons (repay / receipt /
 * email / edit). Wire those in here once LoanCardService exists.
 */
export default function LoanCard({ loan, onClick }: LoanCardProps) {
  const balance = loan.amount - (loan.paid_amount ?? 0);
  const isPaid = balance <= 0;

  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {new Date(loan.loan_date).toLocaleDateString('he-IL')}
          </Typography>
          {loan.is_recurring ? <Chip label="מחזורית" color="info" size="small" /> : null}
        </Stack>

        <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">סכום הלוואה</Typography>
            <Typography>₪{loan.amount.toLocaleString()}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">שולם</Typography>
            <Typography>₪{(loan.paid_amount ?? 0).toLocaleString()}</Typography>
          </Box>
        </Stack>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">יתרה: ₪{balance.toLocaleString()}</Typography>
          <Chip label={isPaid ? 'נפרעה' : 'פעילה'} color={isPaid ? 'success' : 'primary'} size="small" />
        </Box>
      </CardContent>
    </Card>
  );
}
