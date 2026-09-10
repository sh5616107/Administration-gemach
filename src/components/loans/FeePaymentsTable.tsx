import { useState } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Typography,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material'
import type { FeePaymentWithDetails, FeeType, FeeStatus } from '../../types/feePayments'
import { deleteFeePayment } from '../../services/feePaymentsService'
import { getPaymentMethodLabel } from '../PaymentMethodSelect'

interface FeePaymentsTableProps {
  fees: FeePaymentWithDetails[]
  onEdit?: (fee: FeePaymentWithDetails) => void
  onDelete?: () => void
  onGenerateReceipt?: (fee: FeePaymentWithDetails) => void
  showBorrowerName?: boolean // להציג עמודת שם לווה (במקרה של דוח כללי)
  showLoanNumber?: boolean // להציג עמודת מספר הלוואה
}

// תרגום סוגי עמלה
const getFeeTypeLabel = (type: FeeType): string => {
  const labels: Record<FeeType, string> = {
    processing: 'עמלת טיפול',
    guarantor_check: 'בדיקת ערבים',
    membership: 'דמי חבר',
    other: 'אחר',
  }
  return labels[type] || type
}

// תרגום סטטוס
const getFeeStatusLabel = (status: FeeStatus): string => {
  const labels: Record<FeeStatus, string> = {
    paid: 'שולם',
    pending: 'ממתין',
    waived: 'פטור',
    cancelled: 'בוטל',
  }
  return labels[status] || status
}

// צבע chip לפי סטטוס
const getStatusColor = (status: FeeStatus): 'success' | 'warning' | 'info' | 'error' => {
  const colors: Record<FeeStatus, 'success' | 'warning' | 'info' | 'error'> = {
    paid: 'success',
    pending: 'warning',
    waived: 'info',
    cancelled: 'error',
  }
  return colors[status] || 'default' as any
}

export default function FeePaymentsTable({
  fees,
  onEdit,
  onDelete,
  onGenerateReceipt,
  showBorrowerName = false,
  showLoanNumber = true,
}: FeePaymentsTableProps) {
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    fee: FeePaymentWithDetails | null
  }>({ open: false, fee: null })
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDeleteClick = (fee: FeePaymentWithDetails) => {
    setDeleteDialog({ open: true, fee })
    setDeleteReason('')
  }

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.fee) return

    // בדיקה: אם יש קבלה ואין הסבר
    const needsReason =
      (deleteDialog.fee.status === 'paid' || deleteDialog.fee.status === 'waived') &&
      deleteDialog.fee.receipt_number &&
      !deleteReason.trim()

    if (needsReason) {
      alert('יש להזין הסבר למחיקת תשלום עם קבלה')
      return
    }

    setDeleting(true)
    try {
      await deleteFeePayment(deleteDialog.fee.id, deleteReason || undefined)
      setDeleteDialog({ open: false, fee: null })
      if (onDelete) onDelete()
    } catch (error: any) {
      alert(error.message || 'שגיאה במחיקה')
    } finally {
      setDeleting(false)
    }
  }

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('he-IL')
  }

  if (fees.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          לא נמצאו עמלות
        </Typography>
      </Box>
    )
  }

  const totalPaid = fees
    .filter((f) => f.status === 'paid')
    .reduce((sum, f) => sum + f.amount, 0)

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>תאריך</TableCell>
              {showBorrowerName && <TableCell>לווה</TableCell>}
              {showLoanNumber && <TableCell>הלוואה</TableCell>}
              <TableCell>סוג עמלה</TableCell>
              <TableCell align="right">סכום</TableCell>
              <TableCell>אמצעי תשלום</TableCell>
              <TableCell>סטטוס</TableCell>
              <TableCell>קבלה</TableCell>
              <TableCell>הערה</TableCell>
              <TableCell align="center">פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fees.map((fee) => (
              <TableRow key={fee.id} hover>
                <TableCell>{formatDate(fee.payment_date)}</TableCell>
                
                {showBorrowerName && (
                  <TableCell>{fee.borrower_name || '-'}</TableCell>
                )}
                
                {showLoanNumber && (
                  <TableCell>
                    {fee.loan_number ? `#${fee.loan_number}` : '-'}
                  </TableCell>
                )}
                
                <TableCell>{getFeeTypeLabel(fee.fee_type)}</TableCell>
                
                <TableCell align="right">
                  <Typography variant="body2" fontWeight="medium">
                    ₪{fee.amount.toLocaleString()}
                  </Typography>
                </TableCell>
                
                <TableCell>
                  <Typography variant="body2">
                    {getPaymentMethodLabel(fee.payment_method as any)}
                  </Typography>
                </TableCell>
                
                <TableCell>
                  <Chip
                    label={getFeeStatusLabel(fee.status)}
                    color={getStatusColor(fee.status)}
                    size="small"
                  />
                </TableCell>
                
                <TableCell>
                  {fee.receipt_number ? (
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      #{fee.receipt_number}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      -
                    </Typography>
                  )}
                </TableCell>
                
                <TableCell>
                  {fee.note ? (
                    <Tooltip title={fee.note}>
                      <Typography
                        variant="body2"
                        sx={{
                          maxWidth: 150,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fee.note}
                      </Typography>
                    </Tooltip>
                  ) : (
                    '-'
                  )}
                </TableCell>
                
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    {onGenerateReceipt && fee.status === 'paid' && (
                      <Tooltip title="הפק קבלה">
                        <IconButton
                          size="small"
                          onClick={() => onGenerateReceipt(fee)}
                          color="primary"
                        >
                          <ReceiptIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {onEdit && (
                      <Tooltip title="ערוך">
                        <IconButton
                          size="small"
                          onClick={() => onEdit(fee)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    <Tooltip title="מחק">
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(fee)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* סיכום */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', px: 2 }}>
        <Typography variant="body2" color="text.secondary">
          סה"כ עמלות: {fees.length}
        </Typography>
        <Typography variant="body2" fontWeight="bold">
          סה"כ ששולם: ₪{totalPaid.toLocaleString()}
        </Typography>
      </Box>

      {/* דיאלוג מחיקה */}
      <Dialog open={deleteDialog.open} onClose={() => !deleting && setDeleteDialog({ open: false, fee: null })}>
        <DialogTitle>אישור מחיקה</DialogTitle>
        <DialogContent>
          <DialogContentText>
            האם למחוק את תשלום העמלה?
          </DialogContentText>
          <DialogContentText sx={{ mt: 1, fontSize: '0.875rem' }}>
            <strong>סכום:</strong> ₪{deleteDialog.fee?.amount.toLocaleString()}<br />
            <strong>תאריך:</strong> {deleteDialog.fee && formatDate(deleteDialog.fee.payment_date)}<br />
            <strong>סוג:</strong> {deleteDialog.fee && getFeeTypeLabel(deleteDialog.fee.fee_type)}
          </DialogContentText>
          
          {deleteDialog.fee?.status === 'paid' && deleteDialog.fee.receipt_number && (
            <TextField
              fullWidth
              multiline
              rows={2}
              label="סיבת המחיקה (חובה)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              sx={{ mt: 2 }}
              placeholder="למה נדרשת מחיקת התשלום?"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, fee: null })} disabled={deleting}>
            ביטול
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting}>
            {deleting ? 'מוחק...' : 'מחק'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
