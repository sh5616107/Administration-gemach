/**
 * Confirm Update Dialog Component
 * 
 * Shows a summary of changes before applying them to all items in a series.
 * Displays number of items affected and exact changes.
 * 
 * Feature: recurring-items-management
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Typography,
  Box,
  Divider,
  CircularProgress
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { UpdateSummary } from '../../services/recurringItemsService'
import WarningIcon from '@mui/icons-material/Warning'

export interface ConfirmUpdateDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  changes: UpdateSummary
  loading?: boolean
}

export function ConfirmUpdateDialog({
  open,
  onClose,
  onConfirm,
  changes,
  loading = false
}: ConfirmUpdateDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog 
      open={open} 
      onClose={loading ? undefined : onClose} 
      maxWidth="sm" 
      fullWidth
      dir="rtl"
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningIcon color="warning" />
          {t('recurring.confirmTitle', 'אישור עדכון')}
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('recurring.confirmWarning', 'השינויים ישפיעו על הלוואות עתידיות בלבד. הלוואות שכבר נוצרו לא ישתנו.')}
        </Alert>

        {/* Summary of future impact */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {t('recurring.futureImpact', 'השפעה על הלוואות עתידיות:')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('recurring.futureItems', 'הלוואות עתידיות')}: {changes.futureItems}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            {t('recurring.existingNotAffected', 'הלוואות שכבר נוצרו ({count}) לא ישתנו', { count: changes.pastItems })}
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* List of changes */}
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            {t('recurring.changes', 'שינויים:')}
          </Typography>
          {changes.changes.map((change, index) => (
            <Box key={index} sx={{ mb: 1 }}>
              <Typography variant="body2">
                <strong>{change.field}:</strong>{' '}
                <span style={{ textDecoration: 'line-through', color: '#999' }}>
                  {change.oldValue}
                </span>
                {' → '}
                <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>
                  {change.newValue}
                </span>
              </Typography>
            </Box>
          ))}
        </Box>

        {changes.changes.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('recurring.noChanges', 'אין שינויים לביצוע')}
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {t('common.cancel', 'ביטול')}
        </Button>
        <Button 
          onClick={onConfirm} 
          variant="contained" 
          color="warning"
          disabled={loading || changes.changes.length === 0}
        >
          {loading ? <CircularProgress size={24} /> : t('common.confirm', 'אישור')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
