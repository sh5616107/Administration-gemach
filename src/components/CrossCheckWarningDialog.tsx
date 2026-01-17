import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material'
import { Warning as WarningIcon } from '@mui/icons-material'
import type { CrossCheckResult } from '../services/crossCheck'

interface CrossCheckWarningDialogProps {
  open: boolean
  onClose: () => void
  onContinue: () => void
  warnings: CrossCheckResult[]
  title?: string
}

export default function CrossCheckWarningDialog({
  open,
  onClose,
  onContinue,
  warnings,
  title = 'אזהרה',
}: CrossCheckWarningDialogProps) {
  if (warnings.length === 0) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {warnings.map((warning, index) => (
            <Alert 
              key={index} 
              severity={warning.type === 'error' ? 'error' : 'warning'}
            >
              <Typography variant="body1" fontWeight="bold">
                {warning.message}
              </Typography>
              {warning.details && (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {warning.details}
                </Typography>
              )}
            </Alert>
          ))}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          האם להמשיך בכל זאת?
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          ביטול
        </Button>
        <Button onClick={onContinue} variant="contained" color="warning">
          המשך בכל זאת
        </Button>
      </DialogActions>
    </Dialog>
  )
}
