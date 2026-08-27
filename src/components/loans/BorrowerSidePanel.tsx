import { Drawer, Box, IconButton, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import type { Borrower } from '../../services/database';
import BorrowerForm from './BorrowerForm';
import AttachmentsSection from '../attachments/AttachmentsSection';

interface BorrowerSidePanelProps {
  open: boolean;
  borrower: Borrower | null; // null = creating a new borrower
  onClose: () => void;
  onSaved: (borrowerId: string) => void;
}

/**
 * Side drawer for creating/editing a borrower using the BorrowerForm component
 */
export default function BorrowerSidePanel({ open, borrower, onClose, onSaved }: BorrowerSidePanelProps) {
  const handleSaved = (borrowerId: string) => {
    onSaved(borrowerId);
    onClose();
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 500 },
          p: 3,
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <IconButton onClick={onClose} aria-label="סגור">
          <CloseIcon />
        </IconButton>
      </Box>
      <BorrowerForm borrower={borrower} onSaved={handleSaved} />

      {borrower?.id && (
        <>
          <Divider sx={{ my: 2 }} />
          <AttachmentsSection entityType="borrower" entityId={borrower.id} />
        </>
      )}
    </Drawer>
  );
}
