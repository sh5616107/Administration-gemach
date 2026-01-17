import { useState, useEffect } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Autocomplete,
  Collapse,
} from '@mui/material'
import { getAllBanks, getBankBranches, Bank, BankBranch } from '../utils/bankBranches'

// סוגי אמצעי תשלום
export type PaymentMethodType = 'cash' | 'credit' | 'transfer' | 'check' | 'other' | ''

export interface PaymentMethodData {
  payment_method: PaymentMethodType
  // פרטי צ'ק
  check_number?: string
  check_bank?: string
  check_branch?: string
  check_account?: string
  check_date?: string
  // פרטי העברה
  transfer_bank?: string
  transfer_branch?: string
  transfer_account?: string
  transfer_reference?: string
  // פרטי אשראי
  credit_last4?: string
  credit_approval?: string
  // אחר
  other_details?: string
}

interface PaymentMethodSelectProps {
  value: PaymentMethodData
  onChange: (data: PaymentMethodData) => void
  label?: string
}

const paymentMethods = [
  { value: 'cash', label: 'מזומן' },
  { value: 'credit', label: 'אשראי' },
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'check', label: "צ'ק" },
  { value: 'other', label: 'אחר' },
]

export const getPaymentMethodLabel = (method: PaymentMethodType): string => {
  return paymentMethods.find(m => m.value === method)?.label || method || '-'
}

export default function PaymentMethodSelect({ value, onChange, label = 'אמצעי תשלום' }: PaymentMethodSelectProps) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [branches, setBranches] = useState<BankBranch[]>([])
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null)

  // טעינת בנקים
  useEffect(() => {
    getAllBanks().then(setBanks)
  }, [])

  // עדכון סניפים כשמשתנה הבנק
  useEffect(() => {
    if (selectedBank) {
      getBankBranches(selectedBank.code).then(setBranches)
    } else {
      setBranches([])
    }
  }, [selectedBank])

  const handleMethodChange = (method: PaymentMethodType) => {
    onChange({
      ...value,
      payment_method: method,
      // איפוס שדות ספציפיים
      check_number: '',
      check_bank: '',
      check_branch: '',
      check_account: '',
      check_date: '',
      transfer_bank: '',
      transfer_branch: '',
      transfer_account: '',
      transfer_reference: '',
      credit_last4: '',
      credit_approval: '',
      other_details: '',
    })
    setSelectedBank(null)
  }

  const handleBankChange = (bank: Bank | null, fieldPrefix: 'check' | 'transfer') => {
    setSelectedBank(bank)
    onChange({
      ...value,
      [`${fieldPrefix}_bank`]: bank?.name || '',
      [`${fieldPrefix}_branch`]: '',
    })
  }

  return (
    <Box>
      <FormControl fullWidth size="small">
        <InputLabel>{label}</InputLabel>
        <Select
          value={value.payment_method || ''}
          label={label}
          onChange={(e) => handleMethodChange(e.target.value as PaymentMethodType)}
        >
          <MenuItem value="">לא צוין</MenuItem>
          {paymentMethods.map((m) => (
            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* פרטי צ'ק */}
      <Collapse in={value.payment_method === 'check'}>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="מספר צ'ק"
              value={value.check_number || ''}
              onChange={(e) => onChange({ ...value, check_number: e.target.value })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="תאריך פירעון"
              type="date"
              value={value.check_date || ''}
              onChange={(e) => onChange({ ...value, check_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6}>
            <Autocomplete
              size="small"
              options={banks}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              value={selectedBank}
              onChange={(_, newValue) => handleBankChange(newValue, 'check')}
              renderInput={(params) => <TextField {...params} label="בנק" />}
            />
          </Grid>
          <Grid item xs={6}>
            <Autocomplete
              size="small"
              options={branches}
              getOptionLabel={(option) => `${option.branchCode} - ${option.branchName}`}
              onChange={(_, newValue) => onChange({ ...value, check_branch: newValue?.branchCode || '' })}
              renderInput={(params) => <TextField {...params} label="סניף" />}
              disabled={!selectedBank}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              size="small"
              label="מספר חשבון"
              value={value.check_account || ''}
              onChange={(e) => onChange({ ...value, check_account: e.target.value })}
            />
          </Grid>
        </Grid>
      </Collapse>

      {/* פרטי העברה */}
      <Collapse in={value.payment_method === 'transfer'}>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <Autocomplete
              size="small"
              options={banks}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              value={selectedBank}
              onChange={(_, newValue) => handleBankChange(newValue, 'transfer')}
              renderInput={(params) => <TextField {...params} label="בנק" />}
            />
          </Grid>
          <Grid item xs={6}>
            <Autocomplete
              size="small"
              options={branches}
              getOptionLabel={(option) => `${option.branchCode} - ${option.branchName}`}
              onChange={(_, newValue) => onChange({ ...value, transfer_branch: newValue?.branchCode || '' })}
              renderInput={(params) => <TextField {...params} label="סניף" />}
              disabled={!selectedBank}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="מספר חשבון"
              value={value.transfer_account || ''}
              onChange={(e) => onChange({ ...value, transfer_account: e.target.value })}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="אסמכתא"
              value={value.transfer_reference || ''}
              onChange={(e) => onChange({ ...value, transfer_reference: e.target.value })}
            />
          </Grid>
        </Grid>
      </Collapse>

      {/* פרטי אשראי */}
      <Collapse in={value.payment_method === 'credit'}>
        <Grid container spacing={1} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="4 ספרות אחרונות"
              value={value.credit_last4 || ''}
              onChange={(e) => onChange({ ...value, credit_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputProps={{ maxLength: 4 }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              size="small"
              label="מספר אישור"
              value={value.credit_approval || ''}
              onChange={(e) => onChange({ ...value, credit_approval: e.target.value })}
            />
          </Grid>
        </Grid>
      </Collapse>

      {/* אחר */}
      <Collapse in={value.payment_method === 'other'}>
        <TextField
          fullWidth
          size="small"
          label="פרטים"
          value={value.other_details || ''}
          onChange={(e) => onChange({ ...value, other_details: e.target.value })}
          sx={{ mt: 1 }}
        />
      </Collapse>
    </Box>
  )
}
