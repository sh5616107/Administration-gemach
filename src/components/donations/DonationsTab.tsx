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
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  Search as SearchIcon,
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
  address: string
  email: string
  notes: string
}

interface Donation {
  id: number
  donor_id: number
  amount: number
  donation_date: string
  notes: string
  donor_name?: string
  donor_email?: string
}

interface SearchResult {
  id: number
  first_name: string
  last_name: string
  phone: string
}

const emptyDonor: Donor = {
  first_name: '',
  last_name: '',
  phone: '',
  address: '',
  email: '',
  notes: '',
}

export default function DonationsTab() {
  const { settings } = useSettings()
  const [donations, setDonations] = useState<Donation[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [formData, setFormData] = useState<Donor & { amount: number; donation_date: string }>({
    ...emptyDonor,
    amount: 0,
    donation_date: new Date().toISOString().split('T')[0],
  })
  const [editingDonation, setEditingDonation] = useState<Donation | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editAmount, setEditAmount] = useState(0)
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' })

  useEffect(() => {
    loadDonations()
  }, [])

  // חיפוש אוטומטי - דרופדאון
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.trim()) {
        try {
          const searchPattern = `%${searchTerm}%`
          const data = await db.query(`
            SELECT DISTINCT id, first_name, last_name, phone
            FROM donors
            WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
            LIMIT 10
          `, [searchPattern, searchPattern, searchPattern])
          setSearchResults(data as SearchResult[])
        } catch (error) {
          console.error('Error searching:', error)
        }
      } else {
        setSearchResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleSelectDonor = async (donor: SearchResult) => {
    // טען את פרטי התורם המלאים
    const full = await db.get('SELECT * FROM donors WHERE id = ?', [donor.id]) as Donor
    if (full) {
      setFormData({
        ...full,
        amount: formData.amount,
        donation_date: formData.donation_date,
      })
    }
    setSearchTerm('')
    setSearchResults([])
  }

  const loadDonations = async () => {
    try {
      const data = await db.query(`
        SELECT d.*, dn.first_name || ' ' || dn.last_name as donor_name, dn.email as donor_email
        FROM donations d
        JOIN donors dn ON d.donor_id = dn.id
        ORDER BY d.donation_date DESC
      `)
      setDonations(data as Donation[])
    } catch (error) {
      console.error('Error loading donations:', error)
    }
  }

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.amount) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה', severity: 'error' })
      return
    }

    // בדיקת כפילויות - טלפון (אם הוזן)
    if (formData.phone) {
      const existingDonors = await db.query('SELECT * FROM donors WHERE phone = ?', [formData.phone]) as any[]
      if (existingDonors.length > 0) {
        const existing = existingDonors[0]
        // אם זה לא אותו תורם (לפי שם), הצג שגיאה
        if (existing.first_name !== formData.first_name || existing.last_name !== formData.last_name) {
          setSnackbar({ open: true, message: `טלפון זה כבר קיים במערכת עבור: ${existing.first_name} ${existing.last_name}`, severity: 'error' })
          return
        }
      }
    }

    try {
      // Create or find donor
      let donorId: number

      const existingDonor = await db.get(
        'SELECT id FROM donors WHERE first_name = ? AND last_name = ?',
        [formData.first_name, formData.last_name]
      ) as { id: number } | null

      if (existingDonor) {
        donorId = existingDonor.id
        // Update email if provided
        if (formData.email) {
          await db.run('UPDATE donors SET email = ? WHERE id = ?', [formData.email, donorId])
        }
      } else {
        const result = await db.run(
          'INSERT INTO donors (first_name, last_name, phone, address, email, notes) VALUES (?, ?, ?, ?, ?, ?)',
          [formData.first_name, formData.last_name, formData.phone, formData.address, formData.email, formData.notes]
        )
        donorId = result.lastInsertRowid
      }

      // Create donation
      await db.run(
        'INSERT INTO donations (donor_id, amount, donation_date, notes, payment_method, payment_details) VALUES (?, ?, ?, ?, ?, ?)',
        [donorId, formData.amount, formData.donation_date, formData.notes, paymentMethod.payment_method, JSON.stringify(paymentMethod)]
      )

      setSnackbar({ open: true, message: 'התרומה נוספה בהצלחה', severity: 'success' })
      loadDonations()
      setFormData({
        ...emptyDonor,
        amount: 0,
        donation_date: new Date().toISOString().split('T')[0],
      })
      setPaymentMethod({ payment_method: '' })
    } catch (error) {
      console.error('Error saving donation:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleDelete = async (id: number) => {
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
      {/* Stats */}
      <Card sx={{ mb: 3, bgcolor: 'secondary.light', color: 'white' }}>
        <CardContent sx={{ textAlign: 'center' }}>
          <Typography variant="h6">סה"כ תרומות</Typography>
          <Typography variant="h3" fontWeight={700}>
            {formatCurrency(totalDonations)}
          </Typography>
          <Typography variant="body2">{donations.length} תרומות</Typography>
        </CardContent>
      </Card>

      {/* Search */}
      <Card sx={{ mb: 3, overflow: 'visible' }}>
        <CardContent sx={{ overflow: 'visible' }}>
          <Box sx={{ position: 'relative' }}>
            <TextField
              fullWidth
              placeholder="חיפוש תורם קיים לפי שם, טלפון..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
            {/* תוצאות חיפוש */}
            {searchTerm.trim() && searchResults.length > 0 && (
              <Box sx={{ 
                position: 'absolute', 
                zIndex: 1000, 
                bgcolor: 'background.paper', 
                boxShadow: 3, 
                borderRadius: 1,
                mt: 1,
                maxHeight: 200,
                overflow: 'auto',
                left: 0,
                right: 0
              }}>
                {searchResults.map((d) => (
                  <Box
                    key={d.id}
                    onClick={() => handleSelectDonor(d)}
                    sx={{ 
                      p: 1.5, 
                      cursor: 'pointer', 
                      '&:hover': { bgcolor: 'action.hover' },
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}
                  >
                    <Typography variant="body2">{d.first_name} {d.last_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{d.phone}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {searchTerm.trim() && searchResults.length === 0 && (
              <Box sx={{ 
                position: 'absolute', 
                zIndex: 1000, 
                bgcolor: 'background.paper', 
                boxShadow: 3, 
                borderRadius: 1,
                mt: 1,
                p: 2,
                left: 0,
                right: 0
              }}>
                <Typography variant="body2" color="text.secondary">לא נמצאו תורמים - ניתן להוסיף חדש</Typography>
              </Box>
            )}
          </Box>
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
              <TextField
                fullWidth
                label="שם פרטי *"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="שם משפחה *"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="טלפון"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="מייל"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="example@email.com"
              />
            </Grid>
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
    </Box>
  )
}
