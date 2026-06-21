import { Drawer, Box, IconButton, Typography, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import DepositsTab from './DepositsTab';

interface Deposit {
  id: number;
  depositor_id: number;
  amount: number;
  deposit_date: string;
  period_type: string;
  due_date: string;
  is_recurring: number;
  recurring_day?: number;
  recurring_months?: number;
  recurring_deposit_number?: number;
  recurring_deposit_count?: number;
  notes: string;
  status: string;
}

interface Depositor {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  id_number: string;
}

interface DepositSidePanelProps {
  open: boolean;
  deposit: Deposit | null;
  depositor: Depositor | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Side drawer for creating/editing a deposit using the DepositsTab component
 */
export default function DepositSidePanel({ open, deposit, depositor, onClose, onSaved }: DepositSidePanelProps) {
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
          {deposit ? 'עריכת הפקדה' : 'הפקדה חדשה'}
        </Typography>
        <IconButton onClick={onClose} aria-label="סגור">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />
      
      {/* Show the DepositsTab - hide depositor selection, show table only when editing */}
      <DepositsTab 
        selectedDepositor={depositor}
        initialDepositId={deposit?.id || null}
        hideDepositorSelection={true}
        hideDepositsTable={!deposit}
      />
    </Drawer>
  );
}
