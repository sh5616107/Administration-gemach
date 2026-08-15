import { useState, useEffect } from 'react'
import {
  Box,
  TextField,
  Button,
  Grid,
  Typography,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Save as SaveIcon,
  Warning as WarningIcon,
  Description as ReportIcon,
} from '@mui/icons-material'
import { db, depositWithdrawalsService } from '../../services/database'
import { useSettings } from '../../hooks/useSettings'
import { generateDepositorReport, openEmailWithDocument, createDepositorReportEmailData, EmailProvider } from '../../services/documents'

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

const emptyDepositor: Omit<Depositor, 'id' | 'created_at'> = {
  first_name: '',
  last_name: '',
  id_number: '',
  phone: '',
  address: '',
  email: '',
  notes: '',
}

interface DepositorFormProps {
  depositor?: Depositor | null
  onSaved?: (depositorId: string) => void
}

export default function DepositorForm({ depositor, onSaved }: DepositorFormProps) {
  const { settings } = useSettings()
  const [formData, setFormData] = useState<Omit<Depositor, 'id' | 'created_at'>>(emptyDepositor)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [duplicateNameDialog, setDuplicateNameDialog] = useState<{ open: boolean; existingDepositor: Depositor | null }>({ 
    open: false, 
    existingDepositor: null 
  })

  // Israeli ID validation (Luhn algorithm variant)
  const validateIsraeliId = (id: string): boolean => {
    if (!id || id.length !== 9) return false
    const digits = id.padStart(9, '0').split('').map(Number)
    const sum = digits.reduce((acc, digit, i) => {
      let val = digit * ((i % 2) + 1)
      if (val > 9) val -= 9
      return acc + val
    }, 0)
    return sum % 10 === 0
  }

  useEffect(() => {
    if (depositor) {
      setFormData(depositor)
    } else {
      setFormData(emptyDepositor)
    }
  }, [depositor])

  // Phone validation - only numbers allowed
  const handlePhoneChange = (value: string) => {
    const numbersOnly = value.replace(/[^0-9-]/g, '')
    setFormData({ ...formData, phone: numbersOnly })
  }

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה (שם פרטי, שם משפחה, טלפון)', severity: 'error' })
      return
    }

    // Validate Israeli ID if provided
    if (formData.id_number && !validateIsraeliId(formData.id_number)) {
      setSnackbar({ open: true, message: 'מספר זהות לא תקין', severity: 'error' })
      return
    }

    // בדיקת כפילויות - טלפון
    const allDepositors = await db.query('SELECT * FROM depositors') as Depositor[]
    const duplicatePhone = allDepositors.find(d =>
      d.phone === formData.phone && d.id !== depositor?.id
    )
    if (duplicatePhone) {
      setSnackbar({ 
        open: true, 
        message: `מפקיד עם טלפון זה כבר קיים: ${duplicatePhone.first_name} ${duplicatePhone.last_name}`, 
        severity: 'error' 
      })
      return
    }

    // בדיקת כפילויות - מספר זהות (אם הוזן)
    if (formData.id_number) {
      const duplicateId = allDepositors.find(d =>
        d.id_number === formData.id_number && d.id !== depositor?.id
      )
      if (duplicateId) {
        setSnackbar({ 
          open: true, 
          message: `מספר זהות זה כבר קיים במערכת עבור: ${duplicateId.first_name} ${duplicateId.last_name}`, 
          severity: 'error' 
        })
        return
      }
    }

    // בדיקת כפילויות - שם (אזהרה בלבד, לא חוסם)
    if (!depositor?.id) {
      const duplicateName = allDepositors.find(d =>
        d.first_name.toLowerCase() === formData.first_name.toLowerCase() &&
        d.last_name.toLowerCase() === formData.last_name.toLowerCase()
      )
      if (duplicateName) {
        setDuplicateNameDialog({ open: true, existingDepositor: duplicateName })
        return
      }
    }

    await doSave()
  }

  const doSave = async () => {
    try {
      let savedDepositorId: string;
      if (depositor?.id) {
        await db.run(
          'UPDATE depositors SET first_name = ?, last_name = ?, phone = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
          [formData.first_name, formData.last_name, formData.phone, formData.id_number, formData.address, formData.email, formData.notes, depositor.id]
        )
        savedDepositorId = depositor.id.toString();
        setSnackbar({ open: true, message: 'המפקיד עודכן בהצלחה', severity: 'success' })
      } else {
        const result = await db.run(
          'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [formData.first_name, formData.last_name, formData.phone, formData.id_number, formData.address, formData.email, formData.notes]
        )
        savedDepositorId = result.lastInsertRowid.toString();
        setSnackbar({ open: true, message: 'המפקיד נוסף בהצלחה', severity: 'success' })
      }
      if (onSaved) onSaved(savedDepositorId)
      setFormData(emptyDepositor)
    } catch (error) {
      console.error('Error saving depositor:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleConfirmDuplicateName = async () => {
    setDuplicateNameDialog({ open: false, existingDepositor: null })
    await doSave()
  }

  const handleGenerateReport = async () => {
    if (!depositor?.id) return

    try {
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id]) as any[]
      
      // טעינת היסטוריית משיכות לכל הפקדה
      const depositsWithWithdrawals = await Promise.all(
        deposits.map(async (deposit) => {
          const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
          const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
          
          // חישוב סכום בפועל להפקדה מחזורית
          let depositAmount = deposit.amount
          if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
            depositAmount = deposit.amount * deposit.recurring_deposit_number
          }
          
          return {
            ...deposit,
            withdrawals,
            withdrawn_amount: totalWithdrawn,
            remaining: depositAmount - totalWithdrawn
          }
        })
      )
      
      const activeDeposits = depositsWithWithdrawals.filter(d => d.remaining > 0)
      const totalActive = activeDeposits.reduce((sum, d) => sum + d.remaining, 0)
      const totalWithdrawn = depositsWithWithdrawals.reduce((sum, d) => sum + (d.withdrawn_amount || 0), 0)
      
      await generateDepositorReport({
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        depositorName: `${depositor.first_name} ${depositor.last_name}`,
        depositorPhone: depositor.phone,
        depositorIdNumber: depositor.id_number,
        deposits: depositsWithWithdrawals.sort((a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime()),
        totalActive,
        totalWithdrawn,
        dateFormat: settings.date_format,
      })

      setSnackbar({ open: true, message: 'הדוח הופק בהצלחה', severity: 'success' })
    } catch (error) {
      console.error('Error generating report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת הדוח', severity: 'error' })
    }
  }

  const handleDelete = async () => {
    if (!depositor?.id) return

    // בדיקה אם יש הפקדות פעילות למפקיד
    try {
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id]) as any[]
      
      let hasActive = false
      for (const deposit of deposits) {
        let depositAmount = deposit.amount
        if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
          depositAmount = deposit.amount * deposit.recurring_deposit_number
        }
        
        const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
        const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
        
        if (depositAmount - totalWithdrawn > 0) {
          hasActive = true
          break
        }
      }
      
      if (hasActive) {
        setSnackbar({ open: true, message: 'לא ניתן למחוק מפקיד עם הפקדות פעילות', severity: 'error' })
        return
      }
    } catch (error) {
      console.error('Error checking deposits:', error)
    }

    if (!confirm('האם למחוק את המפקיד?')) return

    try {
      // מחיקת כל ההפקדות של המפקיד
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id]) as any[]
      for (const dep of deposits) {
        await db.run('DELETE FROM deposits WHERE id = ?', [dep.id])
      }
      // מחיקת המפקיד
      await db.run('DELETE FROM depositors WHERE id = ?', [depositor.id])
      setSnackbar({ open: true, message: 'המפקיד נמחק', severity: 'success' })
      if (onSaved) onSaved('') // empty string = depositor was deleted
      setFormData(emptyDepositor)
    } catch (error) {
      console.error('Error deleting depositor:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 3 }}>
        {depositor ? 'עריכת מפקיד' : 'הוספת מפקיד חדש'}
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="שם פרטי *"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="שם משפחה *"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="מספר זהות"
            value={formData.id_number}
            onChange={(e) => setFormData({ ...formData, id_number: e.target.value.replace(/\D/g, '').slice(0, 9) })}
            error={formData.id_number !== '' && !validateIsraeliId(formData.id_number)}
            helperText={formData.id_number && !validateIsraeliId(formData.id_number) ? 'מספר זהות לא תקין' : ''}
            inputProps={{ maxLength: 9, inputMode: 'numeric' }}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="טלפון *"
            value={formData.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            inputProps={{ inputMode: 'numeric' }}
            placeholder="050-1234567"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="כתובת"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="אימייל"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="הערות"
            multiline
            rows={3}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSave}
        >
          {depositor ? 'עדכן מפקיד' : 'שמור מפקיד'}
        </Button>
        {depositor && (
          <>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<ReportIcon />}
              onClick={handleGenerateReport}
            >
              הפק דוח
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDelete}
            >
              מחק מפקיד
            </Button>
          </>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Duplicate Name Warning Dialog */}
      <Dialog open={duplicateNameDialog.open} onClose={() => setDuplicateNameDialog({ open: false, existingDepositor: null })}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          שים לב - שם כפול
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            כבר קיים מפקיד בשם "{formData.first_name} {formData.last_name}" במערכת:
          </Typography>
          {duplicateNameDialog.existingDepositor && (
            <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>טלפון:</strong> {duplicateNameDialog.existingDepositor.phone}
              </Typography>
              {duplicateNameDialog.existingDepositor.address && (
                <Typography variant="body2">
                  <strong>כתובת:</strong> {duplicateNameDialog.existingDepositor.address}
                </Typography>
              )}
              {duplicateNameDialog.existingDepositor.id_number && (
                <Typography variant="body2">
                  <strong>מ.ז.:</strong> {duplicateNameDialog.existingDepositor.id_number}
                </Typography>
              )}
            </Box>
          )}
          <Typography sx={{ mt: 2 }}>
            האם אתה בטוח שברצונך ליצור מפקיד נוסף עם אותו שם?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateNameDialog({ open: false, existingDepositor: null })}>
            ביטול
          </Button>
          <Button variant="contained" color="warning" onClick={handleConfirmDuplicateName}>
            כן, צור מפקיד חדש
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
