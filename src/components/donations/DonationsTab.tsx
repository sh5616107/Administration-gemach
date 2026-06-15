import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { useSettings } from '../../hooks/useSettings'
import { db } from '../../services/database'
import { generateDonationReceipt, openEmailWithDocument, createDonationEmailData, EmailProvider } from '../../services/documents'
import { formatDisplayDate, toHebrewDate } from '../../utils/dateUtils'
import PaymentMethodSelect, { PaymentMethodData, getPaymentMethodLabel } from '../PaymentMethodSelect'
import AmountInput from '../AmountInput'

interface Donor {
  id?: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
}

interface Donation {
  id: string
  donor_id: number
  amount: number
  donation_date: string
  notes: string
  donor_name?: string
  donor_email?: string
}

interface DonationsTabProps {
  selectedDonor?: Donor | null
  onSelectDonor?: (donor: Donor | null) => void
}

export default function DonationsTab({ selectedDonor, onSelectDonor }: DonationsTabProps = {}) {
  const { settings } = useSettings()
  const [donations, setDonations] = useState<Donation[]>([])
  const [donors, setDonors] = useState<Donor[]>([])
  const [formData, setFormData] = useState<{ amount: number; donation_date: string; notes: string }>({
    amount: 0,
    donation_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [editingDonation, setEditingDonation] = useState<Donation | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editAmount, setEditAmount] = useState(0)
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })

  useEffect(() => {
    loadDonors()
  }, [])

  useEffect(() => {
    loadDonors()
  }, [])

  useEffect(() => {
    if (selectedDonor) {
      loadDonations()
    } else {
      setDonations([])
    }
  }, [selectedDonor])

  const loadDonors = async () => {
    try {
      const data = await db.query('SELECT * FROM donors ORDER BY last_name, first_name') as Donor[]
      setDonors(data)
    } catch (error) {
      console.error('Error loading donors:', error)
    }
  }

  const loadDonations = async () => {
    if (!selectedDonor?.id) {
      setDonations([])
      return
    }
    
    try {
      const data = await db.query(`
        SELECT 
          d.*,
          dn.first_name || ' ' || dn.last_name as donor_name,
          dn.email as donor_email
        FROM donations d
        JOIN donors dn ON d.donor_id = dn.id
        WHERE d.donor_id = ${selectedDonor.id}
        ORDER BY d.donation_date DESC
      `)
      
      setDonations(data as Donation[])
    } catch (error) {
      console.error('Error loading donations:', error)
      setDonations([])
    }
  }

  const handleSave = async () => {
    if (!selectedDonor) {
      setSnackbar({ open: true, message: 'נא לבחור תורם תחילה', severity: 'error' })
      return
    }
    
    if (!formData.amount) {
      setSnackbar({ open: true, message: 'נא למלא סכום', severity: 'error' })
      return
    }

    try {
      // Create donation
      await db.run(
        'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?)',
        [selectedDonor.id, formData.amount, formData.donation_date, formData.notes, paymentMethod.payment_method, JSON.stringify(paymentMethod)]
      )

      setSnackbar({ open: true, message: 'התרומה נוספה בהצלחה', severity: 'success' })
      loadDonations()
      setFormData({
        amount: 0,
        donation_date: new Date().toISOString().split('T')[0],
        notes: '',
      })
      setPaymentMethod({ payment_method: '' })
    } catch (error) {
      console.error('Error saving donation:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('האם למחוק את התרומה?')) return

    try {
      await db.run('DELETE FROM donations WHERE id = ?', [id])
      setSnackbar({ open: true, message: 'התרומה נמחקה', severity: 'success' })
      loadDonations()
    } catch (error) {
      console.error('Error deleting donation:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleEdit = (donation: Donation) => {
    setEditingDonation(donation)
    setEditAmount(donation.amount)
    setEditDate(donation.donation_date)
    setEditNotes(donation.notes || '')
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingDonation) return

    try {
      await db.run(
        'UPDATE donations SET amount = ?, donation_date = ?, notes = ? WHERE id = ?',
        [editAmount, editDate, editNotes, editingDonation.id]
      )
      setSnackbar({ open: true, message: 'התרומה עודכנה בהצלחה', severity: 'success' })
      setEditDialogOpen(false)
      setEditingDonation(null)
      loadDonations()
    } catch (error) {
      console.error('Error updating donation:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון', severity: 'error' })
    }
  }

  const handleGenerateReceipt = (donation: Donation) => {
    generateDonationReceipt({
      gemachName: settings.gemach_name,
      gemachLogo: settings.gemach_logo,
      donorName: donation.donor_name || '',
      amount: donation.amount,
      donationDate: donation.donation_date,
      receiptNumber: donation.id,
      dateFormat: settings.date_format,
    })
  }

  const handleSendEmail = async (donation: Donation) => {
    if (!donation.donor_email) {
      setSnackbar({ open: true, message: 'לתורם זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    const emailData = createDonationEmailData({
      gemachName: settings.gemach_name || 'גמ"ח',
      donorName: donation.donor_name || '',
      donorEmail: donation.donor_email,
      amount: donation.amount,
      donationDate: donation.donation_date,
      receiptNumber: donation.id,
      gemachLogo: settings.gemach_logo,
      dateFormat: settings.date_format,
    })
    
    const provider = (settings.email_provider || 'gmail') as EmailProvider
    const result = await openEmailWithDocument(emailData, provider)
    setSnackbar({ 
      open: true, 
      message: result.message, 
      severity: result.success ? 'success' : 'error' 
    })
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0)

  return (
    <Box>
      {/* Donor Selection */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            בחירת תורם
          </Typography>
          <Autocomplete
            options={donors}
            getOptionLabel={(option) => `${option.first_name} ${option.last_name} - ${option.phone}`}
            value={selectedDonor}
            onChange={(_, newValue) => onSelectDonor?.(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="חפש ובחר תורם"
                placeholder="הקלד שם או טלפון..."
              />
            )}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            noOptionsText="לא נמצאו תורמים - הוסף תורם בטאב תורמים"
          />
        </CardContent>
      </Card>

      {!selectedDonor ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              בחר תורם מהרשימה למעלה או עבור לטאב "ניהול תורמים" להוספת תורם חדש
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Selected Donor Info */}
          <Card sx={{ mb: 3, bgcolor: 'secondary.light', color: 'white' }}>
            <CardContent>
              <Typography variant="h6">
                תורם נבחר: {selectedDonor.first_name} {selectedDonor.last_name}
              </Typography>
              <Typography variant="body2">
                טלפון: {selectedDonor.phone} | מ.ז.: {selectedDonor.id_number || '-'}
              </Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>
                סה"כ תרם: {formatCurrency(totalDonations)}
              </Typography>
              <Typography variant="body2">{donations.length} תרומות</Typography>
            </CardContent>
          </Card>

          {/* Add Form */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                תרומה חדשה
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={3}>
                  <AmountInput
                    fullWidth
                    label="סכום התרומה *"
                    value={formData.amount || 0}
                    onChange={(value) => setFormData({ ...formData, amount: value })}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    label="תאריך"
                    type="date"
                    value={formData.donation_date}
                    onChange={(e) => setFormData({ ...formData, donation_date: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText={settings.date_format === 'combined' && formData.donation_date ? `📅 ${toHebrewDate(formData.donation_date)}` : ''}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="הערות"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </Grid>
                {settings.show_payment_method === 'yes' && (
                  <Grid item xs={12} md={3}>
                    <PaymentMethodSelect
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      label="אמצעי תשלום"
                    />
                  </Grid>
                )}
              </Grid>
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave}>
                  הוסף תרומה
                </Button>
              </Box>
            </CardContent>
          </Card>

      {/* Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            רשימת תרומות
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>תורם</TableCell>
                  <TableCell align="center">סכום</TableCell>
                  <TableCell align="center">תאריך</TableCell>
                  <TableCell>הערות</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {donations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין תרומות</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  donations.map((donation) => (
                    <TableRow key={donation.id} hover>
                      <TableCell>{donation.donor_name}</TableCell>
                      <TableCell align="center">{formatCurrency(donation.amount)}</TableCell>
                      <TableCell align="center">{formatDisplayDate(donation.donation_date, settings.date_format)}</TableCell>
                      <TableCell>{donation.notes || '-'}</TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleGenerateReceipt(donation)}
                          title="הפק קבלה"
                        >
                          <ReceiptIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={() => handleSendEmail(donation)}
                          title={donation.donor_email ? 'שלח קבלה במייל' : 'לתורם לא הוזנה כתובת מייל'}
                          disabled={!donation.donor_email}
                        >
                          <EmailIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleEdit(donation)}
                          title="ערוך"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(donation.id)}
                          title="מחק"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
        <DialogTitle>עריכת תרומה</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="תורם"
              value={editingDonation?.donor_name || ''}
              disabled
              sx={{ mb: 2 }}
            />
            <AmountInput
              fullWidth
              label="סכום"
              value={editAmount || 0}
              onChange={(value) => setEditAmount(value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="תאריך"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="הערות"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSaveEdit}>
            שמור
          </Button>
        </DialogActions>
      </Dialog>
        </>
      )}
    </Box>
  )
}
