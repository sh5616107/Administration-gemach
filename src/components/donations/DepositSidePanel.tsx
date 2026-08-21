import { useState, useEffect } from 'react';
import { 
  Drawer, 
  Box, 
  IconButton, 
  Typography, 
  Divider,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Snackbar,
  Alert,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { db } from '../../services/database';
import AmountInput from '../AmountInput';
import PaymentMethodSelect, { PaymentMethodData } from '../PaymentMethodSelect';

interface Deposit {
  id: number;
  depositor_id: number;
  amount: number;
  deposit_date: string;
  period_type: string;
  due_date: string;
  is_recurring: number;
  recurring_day?: number;
  recurring_months?: number;
  recurring_deposit_number?: number;
  recurring_deposit_count?: number;
  notes: string;
  status: string;
}

interface Depositor {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  id_number: string;
}

interface DepositSidePanelProps {
  open: boolean;
  deposit: Deposit | null;
  depositor: Depositor | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Side drawer for creating/editing a deposit with a direct form (no dialog)
 */
export default function DepositSidePanel({ open, deposit, depositor, onClose, onSaved }: DepositSidePanelProps) {
  const [formData, setFormData] = useState({
    amount: 0,
    deposit_date: new Date().toISOString().split('T')[0],
    period_type: 'flexible',
    due_date: '',
    notes: '',
    is_recurring: false,
    // Total number of deposits in the recurring series (including this first one)
    recurring_total: 2,
  });
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  // Load deposit data when editing
  useEffect(() => {
    if (deposit && open) {
      console.log('📝 Loading deposit for edit:', deposit);
      setFormData({
        amount: deposit.amount,
        deposit_date: deposit.deposit_date,
        period_type: deposit.period_type,
        due_date: deposit.due_date || '',
        notes: deposit.notes || '',
        is_recurring: deposit.is_recurring === 1,
        recurring_total: deposit.recurring_deposit_count || 2,
      });
    } else if (!deposit && open) {
      // Reset for new deposit
      setFormData({
        amount: 0,
        deposit_date: new Date().toISOString().split('T')[0],
        period_type: 'flexible',
        due_date: '',
        notes: '',
        is_recurring: false,
        recurring_total: 2,
      });
    }
  }, [deposit, open]);
  
  const handleSave = async () => {
    if (!depositor) return;
    
    if (formData.amount <= 0) {
      setSnackbar({ open: true, message: 'נא להזין סכום תקין', severity: 'error' });
      return;
    }

    if (!deposit?.id && formData.is_recurring && formData.recurring_total < 2) {
      setSnackbar({ open: true, message: 'הפקדה מחזורית חייבת לכלול לפחות 2 הפקדות', severity: 'error' });
      return;
    }
    
    try {
      if (deposit?.id) {
        // Update existing deposit
        await db.run(
          `UPDATE deposits SET 
            amount = ?, 
            deposit_date = ?, 
            period_type = ?, 
            due_date = ?,
            notes = ?
          WHERE id = ?`,
          [
            formData.amount,
            formData.deposit_date,
            formData.period_type,
            formData.due_date || null,
            formData.notes,
            deposit.id
          ]
        );
        setSnackbar({ open: true, message: 'ההפקדה עודכנה בהצלחה', severity: 'success' });
      } else {
        // Create new deposit
        const isRecurring = formData.is_recurring;
        const recurringDay = isRecurring ? new Date(formData.deposit_date).getDate() : null;
        // recurring_months = כמה הפקדות נוספות ייווצרו אוטומטית אחרי זו הראשונה
        const recurringMonths = isRecurring ? formData.recurring_total - 1 : null;
        const recurringDepositNumber = isRecurring ? 1 : null;
        const recurringDepositCount = isRecurring ? formData.recurring_total : null;

        await db.run(
          `INSERT INTO deposits (
            depositor_id, amount, deposit_date, period_type, due_date, 
            is_recurring, recurring_day, recurring_months, recurring_deposit_number, recurring_deposit_count,
            notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            depositor.id,
            formData.amount,
            formData.deposit_date,
            formData.period_type,
            formData.due_date || null,
            isRecurring ? 1 : 0,
            recurringDay,
            recurringMonths,
            recurringDepositNumber,
            recurringDepositCount,
            formData.notes,
            'active'
          ]
        );
        setSnackbar({ open: true, message: isRecurring ? 'ההפקדה המחזורית נוספה בהצלחה' : 'ההפקדה נוספה בהצלחה', severity: 'success' });
      }
      
      setTimeout(() => {
        onSaved();
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error saving deposit:', error);
      setSnackbar({ open: true, message: 'שגיאה בשמירת ההפקדה', severity: 'error' });
    }
  };

  return (
    <>
      <Drawer
        anchor="left"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: { xs: '100%', md: '70%', lg: '60%' },
            p: 3,
          }
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {deposit ? 'עריכת הפקדה' : 'הפקדה חדשה'}
          </Typography>
          <IconButton onClick={onClose} aria-label="סגור">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 3 }} />
        
        {depositor && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="primary">
              מפקיד: {depositor.first_name} {depositor.last_name}
            </Typography>
          </Box>
        )}
        
        <Stack spacing={3}>
          <AmountInput
            label="סכום ההפקדה *"
            value={formData.amount}
            onChange={(value) => setFormData({ ...formData, amount: value })}
          />
          
          <TextField
            label="תאריך הפקדה"
            type="date"
            value={formData.deposit_date}
            onChange={(e) => setFormData({ ...formData, deposit_date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          
          <FormControl fullWidth>
            <InputLabel>סוג הפקדה</InputLabel>
            <Select
              value={formData.period_type}
              label="סוג הפקדה"
              onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
            >
              <MenuItem value="flexible">גמישה</MenuItem>
              <MenuItem value="fixed">קבועה</MenuItem>
            </Select>
          </FormControl>
          
          {formData.period_type === 'fixed' && (
            <TextField
              label="תאריך פירעון"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          )}

          {/* Recurring deposit option - only available when creating a new deposit */}
          {!deposit && (
            <>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                  />
                }
                label="הפקדה מחזורית"
              />

              {formData.is_recurring && (
                <TextField
                  label="מספר הפקדות בסדרה"
                  type="number"
                  value={formData.recurring_total}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setFormData({ ...formData, recurring_total: isNaN(value) ? 2 : value });
                  }}
                  inputProps={{ min: 2 }}
                  helperText={`הפקדה זו תהיה מספר 1 מתוך ${formData.recurring_total || 2}. ההפקדות הבאות ייווצרו אוטומטית מדי חודש באותו יום בחודש (${new Date(formData.deposit_date).getDate()}).`}
                  error={formData.recurring_total < 2}
                  fullWidth
                />
              )}
            </>
          )}

          {/* Info note when editing a deposit that is part of a recurring series */}
          {deposit && deposit.is_recurring === 1 && (
            <Alert severity="info">
              הפקדה זו היא חלק מסדרה מחזורית (מס' {deposit.recurring_deposit_number ?? '?'} מתוך {deposit.recurring_deposit_count ?? '?'}).
              לא ניתן לשנות כאן את פרטי המחזוריות (סכום, יום בחודש, מספר חודשים) או לסיים את הסדרה מוקדם.
              {deposit.recurring_deposit_number === 1
                ? ' לשם כך יש להשתמש בכפתור "נהל הפקדה מחזורית" (אייקון החץ המסתובב) שמופיע על כרטיס הפקדה זו.'
                : ' לשם כך יש להשתמש בכפתור "נהל הפקדה מחזורית" שמופיע על כרטיס ההפקדה הראשונה בסדרה (מס\' 1).'}
            </Alert>
          )}
          
          <TextField
            label="הערות"
            multiline
            rows={4}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            fullWidth
          />
          
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
            <Button onClick={onClose}>
              ביטול
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSave}
              disabled={formData.amount <= 0}
            >
              {deposit ? 'שמור' : 'הוסף הפקדה'}
            </Button>
          </Box>
        </Stack>
      </Drawer>
      
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </>
  );
}
