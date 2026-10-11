import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  Stack,
} from '@mui/material'
import { SwapHoriz as TransferIcon } from '@mui/icons-material'
import FundSelector from './FundSelector'
import AmountInput from '../AmountInput'
import { fundsService, statsService } from '../../services/database'

interface TransferFundsDialogProps {
  open: boolean
  onClose: () => void
  onTransferred: () => void
}

export default function TransferFundsDialog({ open, onClose, onTransferred }: TransferFundsDialogProps) {
  const [sourceFundId, setSourceFundId] = useState<string>('')
  const [targetFundId, setTargetFundId] = useState<string>('')
  const [amount, setAmount] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')
  const [availableCash, setAvailableCash] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>('')

  // טעינת כסף זמין בקופת המקור
  useEffect(() => {
    if (sourceFundId) {
      loadSourceFundBalance()
    } else {
      setAvailableCash(0)
    }
  }, [sourceFundId])

  const loadSourceFundBalance = async () => {
    try {
      const stats = await statsService.getStatsByFund(sourceFundId)
      setAvailableCash(stats.availableCash)
    } catch (error) {
      console.error('Error loading fund balance:', error)
      setAvailableCash(0)
    }
  }

  const handleTransfer = async () => {
    setError('')

    // ולידציות
    if (!sourceFundId || !targetFundId) {
      setError('יש לבחור קופת מקור וקופת יעד')
      return
    }

    if (sourceFundId === targetFundId) {
      setError('קופת המקור והיעד חייבות להיות שונות')
      return
    }

    if (amount <= 0) {
      setError('הסכום חייב להיות גדול מאפס')
      return
    }

    if (amount > availableCash) {
      setError(`הסכום גדול מהכסף הזמין בקופה (${availableCash.toLocaleString('he-IL')} ₪)`)
      return
    }

    setIsSubmitting(true)

    try {
      const { depositsService, depositWithdrawalsService } = await import('../../services/database')
      
      // יצירת משיכה מקופת המקור
      const sourceFund = await fundsService.getById(sourceFundId)
      const withdrawal = await depositWithdrawalsService.create({
        deposit_id: '', // משיכה ללא הפקדה ספציפית - העברה בין קופות
        withdrawal_date: new Date().toISOString().split('T')[0],
        amount,
        notes: `העברה לקופה: ${(await fundsService.getById(targetFundId)).name}${notes ? ` - ${notes}` : ''}`,
        payment_method: 'transfer',
        payment_details: JSON.stringify({ 
          payment_method: 'transfer',
          from_fund: sourceFundId,
          to_fund: targetFundId,
        }),
      })

      // יצירת הפקדה לקופת היעד
      await depositsService.create({
        depositor_id: '', // הפקדה ללא מפקיד - העברה בין קופות
        fund_id: targetFundId,
        amount,
        deposit_date: new Date().toISOString().split('T')[0],
        period_type: 'flexible',
        due_date: null,
        is_recurring: 0,
        recurring_day: null,
        recurring_months: null,
        recurring_deposit_number: null,
        recurring_deposit_count: null,
        notes: `העברה מקופה: ${sourceFund.name}${notes ? ` - ${notes}` : ''}`,
        status: 'active',
      })

      onTransferred()
      handleClose()
    } catch (error) {
      console.error('Error transferring funds:', error)
      setError(error instanceof Error ? error.message : 'שגיאה בהעברת הכסף')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSourceFundId('')
    setTargetFundId('')
    setAmount(0)
    setNotes('')
    setError('')
    setAvailableCash(0)
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TransferIcon />
          <span>העברת כסף בין קופות</span>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <FundSelector
            value={sourceFundId}
            onChange={setSourceFundId}
            label="מקופה (מקור) *"
            required
          />

          {sourceFundId && (
            <Alert severity="info">
              כסף זמין בקופת המקור: <strong>{availableCash.toLocaleString('he-IL')} ₪</strong>
            </Alert>
          )}

          <FundSelector
            value={targetFundId}
            onChange={setTargetFundId}
            label="לקופה (יעד) *"
            required
            excludeFundId={sourceFundId} // לא להציג את קופת המקור
          />

          <AmountInput
            fullWidth
            label="סכום להעברה *"
            value={amount}
            onChange={setAmount}
            required
          />

          <TextField
            fullWidth
            label="הערות"
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="סיבת ההעברה (אופציונלי)"
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button
          onClick={handleTransfer}
          variant="contained"
          disabled={isSubmitting || !sourceFundId || !targetFundId || amount <= 0}
          startIcon={<TransferIcon />}
        >
          {isSubmitting ? 'מעביר...' : 'העבר כסף'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
