import { Box, Drawer, IconButton, Typography, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Loan } from '../services/database';

interface LoanSidePanelProps {
  open: boolean;
  loan: Loan | null; // null = creating a new loan
  borrowerId: number;
  onClose: () => void;
  onSaved: () => void; // refresh list after save
}

/**
 * Side panel (Drawer) that slides in from the side and covers only the
 * loans area (not the whole screen), keeping the borrower profile visible.
 *
 * NOTE: anchor="left" because the page is RTL — visually this opens from
 * the side where the loans list lives. Verify in-browser that this matches
 * the RTL layout direction configured in the MUI theme.
 */
export default function LoanSidePanel({ open, loan, borrowerId, onClose, onSaved }: LoanSidePanelProps) {
  const isNew = loan === null;

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      // Restrict the drawer to the loans column rather than the full viewport.
      // The 'container' + 'sx' approach below scopes it to the parent Paper
      // that wraps the loans area, when this component is rendered inside it.
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: '78%', md: '480px' },
          maxWidth: '100%',
          p: 3,
          boxShadow: 6,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{isNew ? 'הלוואה חדשה' : 'פרטי הלוואה'}</Typography>
        <IconButton onClick={onClose} aria-label="סגירה">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {/* TODO: Replace with full form / tabs (Overview, Repayments, Guarantors, Notes) */}
      <Box>
        {isNew ? (
          <Typography color="text.secondary">
            טופס הלוואה חדשה ללווה מספר {borrowerId} — יש למלא כאן.
          </Typography>
        ) : (
          <Typography color="text.secondary">
            עריכת הלוואה מספר {loan?.id} — יש למלא כאן את הטאבים (סקירה / פירעונות / ערבים / הערות).
          </Typography>
        )}
      </Box>

      {/* Save handler placeholder — call onSaved() then onClose() after a successful save */}
    </Drawer>
  );
}
