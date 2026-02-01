/**
 * ConvertDepositDialog - דיאלוג המרת הפקדה לתרומה
 * 
 * מאפשר למשתמש להמיר הפקדה פעילה לתרומה.
 * ההפקדה תסומן כנמשכה ותיווצר תרומה חדשה באותו סכום.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Box,
  Typography,
  Divider,
  CircularProgress
} from '@mui/material'
import { convertDepositToDonation } from '../../services/contacts'

interface ConvertDepositDialogProps {
  open: boolean
  onClose: () => void
  deposit: {
    id: number
    amount: number
    deposit_date: string
    depositor_name: string
    notes?: string
  } | null
  contactPhone: string
  onSuccess: () => void
}

export default function ConvertDepositDialog({
  open,
  onClose,
  deposit,
  contactPhone,
  onSuccess
}: ConvertDepositDialogProps) {
  const { t } = useTranslation()
  const [isConverting, setIsConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConvert = async () => {
    if (!deposit) return

    setIsConverting(true)
    setError(null)

    try {
      await convertDepositToDonation(deposit.id, contactPhone)
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('contacts.convertDeposit.error'))
    } finally {
      setIsConverting(false)
    }
  }

  if (!deposit) return null

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('contacts.convertDeposit.title')}</DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('contacts.convertDeposit.description')}
        </Typography>

        {/* פרטי ההפקדה */}
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.convertDeposit.depositAmount')}
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              ₪{deposit.amount.toLocaleString()}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.convertDeposit.depositDate')}
            </Typography>
            <Typography variant="body2">
              {new Date(deposit.deposit_date).toLocaleDateString('he-IL')}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {t('contacts.convertDeposit.depositor')}
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {deposit.depositor_name}
            </Typography>
          </Box>

          {deposit.notes && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {t('contacts.convertDeposit.notes')}:
              </Typography>
              <Typography variant="body2">{deposit.notes}</Typography>
            </>
          )}
        </Box>

        {/* הסבר על ההמרה */}
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('contacts.convertDeposit.explanation')}
        </Alert>

        {/* שגיאה */}
        {error && (
          <Alert severity="error">
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          disabled={isConverting}
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={handleConvert}
          variant="contained"
          disabled={isConverting}
          startIcon={isConverting ? <CircularProgress size={20} /> : null}
        >
          {isConverting ? t('common.converting') : t('contacts.convertDeposit.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
