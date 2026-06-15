import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Grid,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  Check as CheckIcon,
} from '@mui/icons-material'
import { guarantorRefundsService, guarantorLoansService, type GuarantorRefund, type GuarantorLoan } from '../services/database'
import PaymentMethodSelect, { type PaymentMethodData } from './PaymentMethodSelect'
import { useTranslation } from 'react-i18next'

interface GuarantorRefundDialogProps {
  open: boolean
  onClose: () => void
  guarantorLoan: GuarantorLoan & { guarantor_name: string; borrower_name: string }
  onUpdate: () => void
}

export function GuarantorRefundDialog({ open, onClose, guarantorLoan: initialGuarantorLoan, onUpdate }: GuarantorRefundDialogProps) {
  const { t } = useTranslation()
  const [refunds, setRefunds] = useState<GuarantorRefund[]>([])
  const [guarantorLoan, setGuarantorLoan] = useState(initialGuarantorLoan)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    amount: '',
    refund_date: new Date().toISOString().split('T')[0],
    paymentMethod: {
      payment_method: 'cash' as const,
    } as PaymentMethodData,
    notes: ''
  })

  useEffect(() => {
    if (open) {
      loadRefunds()
      loadGuarantorLoan()
    }
  }, [open, initialGuarantorLoan.id])

  const loadGuarantorLoan = async () => {
    const updated = await guarantorLoansService.getById(initialGuarantorLoan.id)
    if (updated) {
      setGuarantorLoan({
        ...updated,
        guarantor_name: initialGuarantorLoan.guarantor_name,
        borrower_name: initialGuarantorLoan.borrower_name,
        remaining: updated.amount - (updated.total_repaid || 0)
      } as any)
    }
  }

  const loadRefunds = async () => {
    const data = await guarantorRefundsService.getByGuarantorLoan(initialGuarantorLoan.id)
    setRefunds(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const amount = parseFloat(formData.amount)
    if (isNaN(amount) || amount <= 0) {
      alert(t('invalidAmount') || 'סכום לא תקין')
      return
    }

    // בדיקה שלא עובר את הסכום שהערב שילם
    const currentTotal = await guarantorRefundsService.getTotalRefunded(guarantorLoan.id)
    const newTotal = editingId 
      ? currentTotal - (refunds.find(r => r.id === editingId)?.amount || 0) + amount
      : currentTotal + amount

    if (newTotal > guarantorLoan.total_repaid) {
      alert(`לא ניתן להחזיר יותר מהסכום ששילם הערב (${guarantorLoan.total_repaid.toLocaleString()} ₪)`)
      return
    }

    // המרת PaymentMethodData למחרוזת JSON
    const paymentDetails = JSON.stringify(formData.paymentMethod)

    try {
      if (editingId) {
        await guarantorRefundsService.update(editingId, {
          amount,
          refund_date: formData.refund_date,
          payment_method: formData.paymentMethod.payment_method,
          payment_details: paymentDetails,
          notes: formData.notes
        })
      } else {
        await guarantorRefundsService.create({
          guarantor_loan_id: initialGuarantorLoan.id,
          amount,
          refund_date: formData.refund_date,
          payment_method: formData.paymentMethod.payment_method,
          payment_details: paymentDetails,
          notes: formData.notes
        })
      }

      resetForm()
      await loadRefunds()
      await loadGuarantorLoan() // רענון נתוני ההלוואה
      onUpdate()
    } catch (error) {
      console.error('Error saving refund:', error)
      alert(t('errorSaving') || 'שגיאה בשמירה')
    }
  }

  const handleEdit = (refund: GuarantorRefund) => {
    setEditingId(refund.id)
    
    // ניסיון לפרסר את payment_details כ-JSON
    let paymentMethod: PaymentMethodData = { payment_method: 'cash' }
    if (refund.payment_details) {
      try {
        paymentMethod = JSON.parse(refund.payment_details)
      } catch {
        // אם זה לא JSON, זה כנראה מחרוזת רגילה מהגרסה הישנה
        paymentMethod = {
          payment_method: (refund.payment_method as any) || 'cash',
          other_details: refund.payment_details
        }
      }
    } else if (refund.payment_method) {
      paymentMethod = { payment_method: refund.payment_method as any }
    }
    
    setFormData({
      amount: refund.amount.toString(),
      refund_date: refund.refund_date,
      paymentMethod,
      notes: refund.notes || ''
    })
    setIsAdding(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete') || 'האם למחוק?')) return

    try {
      await guarantorRefundsService.delete(id)
      await loadRefunds()
      await loadGuarantorLoan() // רענון נתוני ההלוואה
      onUpdate()
    } catch (error) {
      console.error('Error deleting refund:', error)
      alert(t('errorDeleting') || 'שגיאה במחיקה')
    }
  }

  const resetForm = () => {
    setFormData({
      amount: '',
      refund_date: new Date().toISOString().split('T')[0],
      paymentMethod: { payment_method: 'cash' },
      notes: ''
    })
    setIsAdding(false)
    setEditingId(null)
  }

  const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0)
  const remainingToRefund = guarantorLoan.total_repaid - totalRefunded

  const formatPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'מזומן'
      case 'credit': return 'אשראי'
      case 'transfer': return 'העברה'
      case 'check': return "צ'ק"
      case 'other': return 'אחר'
      default: return '-'
    }
  }

  const getPaymentDetails = (refund: GuarantorRefund) => {
    if (!refund.payment_details) return '-'
    
    try {
      const data = JSON.parse(refund.payment_details) as PaymentMethodData
      const parts: string[] = []
      
      if (data.check_number) parts.push(`צ'ק ${data.check_number}`)
      if (data.credit_last4) parts.push(`*${data.credit_last4}`)
      if (data.transfer_reference) parts.push(`אסמכתא ${data.transfer_reference}`)
      if (data.other_details) parts.push(data.other_details)
      
      return parts.length > 0 ? parts.join(', ') : '-'
    } catch {
      return refund.payment_details
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            החזרים לערב - {guarantorLoan.guarantor_name}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            לווה: {guarantorLoan.borrower_name}
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">סכום שהערב שילם</Typography>
              <Typography variant="h6">{guarantorLoan.total_repaid.toLocaleString()} ₪</Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">הוחזר לערב</Typography>
              <Typography variant="h6" color="success.main">{totalRefunded.toLocaleString()} ₪</Typography>
            </Grid>
            <Grid item xs={4}>
              <Typography variant="body2" color="text.secondary">נותר להחזיר</Typography>
              <Typography variant="h6" color={remainingToRefund > 0 ? 'error.main' : 'success.main'}>
                {remainingToRefund.toLocaleString()} ₪
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {/* כפתור הוספה */}
          {!isAdding && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIsAdding(true)}
              fullWidth
              sx={{ mb: 2 }}
            >
              הוסף החזר
            </Button>
          )}

          {/* טופס הוספה/עריכה */}
          {isAdding && (
            <Paper sx={{ p: 3, mb: 3, bgcolor: 'grey.50' }} component="form" onSubmit={handleSubmit}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  {editingId ? 'עריכת החזר' : 'החזר חדש'}
                </Typography>
                <IconButton onClick={resetForm} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="סכום *"
                    type="number"
                    inputProps={{ step: '0.01' }}
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="תאריך החזר *"
                    type="date"
                    value={formData.refund_date}
                    onChange={(e) => setFormData({ ...formData, refund_date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    required
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  <PaymentMethodSelect
                    value={formData.paymentMethod}
                    onChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                  />
                </Grid>

                <Grid item xs={12} md={6}>
                  {/* שדה ריק לאיזון הגריד */}
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="הערות"
                    multiline
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </Grid>
              </Grid>

              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<CheckIcon />}
                  fullWidth
                >
                  {editingId ? 'עדכן' : 'הוסף'}
                </Button>
                <Button variant="outlined" onClick={resetForm}>
                  ביטול
                </Button>
              </Box>
            </Paper>
          )}

          {/* טבלת החזרים */}
          {refunds.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>תאריך</TableCell>
                    <TableCell>סכום</TableCell>
                    <TableCell>אמצעי תשלום</TableCell>
                    <TableCell>פרטי תשלום</TableCell>
                    <TableCell>הערות</TableCell>
                    <TableCell align="center">פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {refunds.map((refund) => (
                    <TableRow key={refund.id} hover>
                      <TableCell>{new Date(refund.refund_date).toLocaleDateString('he-IL')}</TableCell>
                      <TableCell>
                        <Chip label={`${refund.amount.toLocaleString()} ₪`} color="success" size="small" />
                      </TableCell>
                      <TableCell>
                        {refund.payment_method ? formatPaymentMethodLabel(refund.payment_method) : '-'}
                      </TableCell>
                      <TableCell>{getPaymentDetails(refund)}</TableCell>
                      <TableCell>{refund.notes || '-'}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleEdit(refund)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(refund.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                אין החזרים רשומים
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
    </Dialog>
  )
}
