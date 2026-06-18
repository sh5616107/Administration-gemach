import { Box, Drawer, IconButton, Typography, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Borrower } from '../services/database';

interface BorrowerSidePanelProps {
  open: boolean;
  borrower: Borrower | null; // null = creating a new borrower
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Side panel for creating/editing a borrower. Used both from "הוסף לווה
 * חדש" (no borrower selected yet) and "ערוך פרטים" (editing the selected
 * borrower). Either way this stays a Drawer — never a route navigation —
 * so the user's place in the app isn't lost.
 */
export default function BorrowerSidePanel({ open, borrower, onClose, onSaved }: BorrowerSidePanelProps) {
  const isNew = borrower === null;

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: '78%', md: '420px' },
          maxWidth: '100%',
          p: 3,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6">{isNew ? 'הוספת לווה חדש' : 'עריכת פרטי לווה'}</Typography>
        <IconButton onClick={onClose} aria-label="סגירה">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />

      {/* TODO: full borrower form (name, phone, id number, address, email, notes) */}
      <Typography color="text.secondary">
        {isNew ? 'טופס הוספת לווה — יש למלא כאן.' : `טופס עריכת ${borrower?.first_name} ${borrower?.last_name} — יש למלא כאן.`}
      </Typography>

      {/* Save handler placeholder — call onSaved() then onClose() after a successful save */}
    </Drawer>
  );
}
