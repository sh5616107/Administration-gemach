import { Card, CardContent, Box, Typography, Chip, Stack } from '@mui/material';
import type { Loan } from '../../services/database';

interface LoanCardProps {
  loan: Loan;
  onClick: () => void;
  recurringRepaymentInfo?: {
    number: number;
    count: number;
    nextDueDate?: string; // ISO date string
  };
}

type DueStatus = 'overdue' | 'due-soon' | 'ok' | null;

function getDueStatus(nextDueDate?: string): DueStatus {
  if (!nextDueDate) return null;
  const due = new Date(nextDueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'due-soon';
  return 'ok';
}

export default function LoanCard({ loan, onClick, recurringRepaymentInfo }: LoanCardProps) {
  const balance = loan.amount - (loan.total_repaid ?? 0);
  const isPaid = balance <= 0;
  const dueStatus = getDueStatus(recurringRepaymentInfo?.nextDueDate);
  
  const borderColor =
    dueStatus === 'overdue' ? 'error.main' :
    dueStatus === 'due-soon' ? 'warning.main' :
    undefined;
  
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        borderColor,
        borderWidth: borderColor ? 2 : 1,
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' },
      }}
    >
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            הלוואה #{loan.loan_number} • {new Date(loan.loan_date).toLocaleDateString('he-IL')}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            {loan.is_recurring ? <Chip label="מחזורית" color="info" size="small" /> : null}
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

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">יתרה: ₪{balance.toLocaleString()}</Typography>
          <Chip label={isPaid ? 'נפרעה' : 'פעילה'} color={isPaid ? 'success' : 'primary'} size="small" />
        </Box>
      </CardContent>
    </Card>
  );
}
