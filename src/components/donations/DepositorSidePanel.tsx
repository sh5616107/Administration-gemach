import { Drawer, Box, IconButton, Divider } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import DepositorForm from './DepositorForm';
import AttachmentsSection from '../attachments/AttachmentsSection';

interface Depositor {
  id?: number
  first_name: string
  last_name: string
  id_number: string
  phone: string
  address: string
  email: string
  notes: string
  created_at?: string
}

interface DepositorSidePanelProps {
  open: boolean;
  depositor: Depositor | null;
  onClose: () => void;
  onSaved: (depositorId: string) => void;
}

/**
 * Side drawer for creating/editing a depositor using the DepositorForm component
 */
export default function DepositorSidePanel({ open, depositor, onClose, onSaved }: DepositorSidePanelProps) {
  const handleSaved = (depositorId: string) => {
    onSaved(depositorId);
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
      <DepositorForm depositor={depositor} onSaved={handleSaved} />

      {depositor?.id != null && (
        <>
          <Divider sx={{ my: 2 }} />
          <AttachmentsSection entityType="depositor" entityId={String(depositor.id)} />
        </>
      )}
    </Drawer>
  );
}
