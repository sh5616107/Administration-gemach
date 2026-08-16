import { Drawer, Box, IconButton, Typography, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Loan } from '../../services/database';
import LoansTab from './LoansTab';

interface LoanSidePanelProps {
  open: boolean;
  loan: Loan | null; // null = creating a new loan
  borrowerId: string;
  waitlistEntryId?: string | null; // ID של בקשה מתור ההלוואות
  onClose: () => void;
  onSaved: () => void; // refresh list after save
}

/**
 * Side drawer for creating/editing a loan using the LoansTab component
 * Shows only the form part, not the borrower selection or loans table
 */
export default function LoanSidePanel({ open, loan, borrowerId, waitlistEntryId, onClose, onSaved }: LoanSidePanelProps) {
  const handleSaved = () => {
    onSaved();
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', md: '70%', lg: '60%' },
          p: 3,
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {loan ? 'עריכת הלוואה' : 'הלוואה חדשה'}
        </Typography>
        <IconButton onClick={onClose} aria-label="סגור">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />
      {/* Pass the borrower ID, loan ID, and waitlist ID to LoansTab so it shows only the form */}
      <LoansTab 
        initialBorrowerId={borrowerId} 
        initialLoanId={loan?.id || null}
        initialWaitlistId={waitlistEntryId || null}
        hideLoansTable={true}
        hideHeader={true}
        onSaved={handleSaved}
      />
    </Drawer>
  );
}
