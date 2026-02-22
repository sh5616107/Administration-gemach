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
  Chip,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Description as DocIcon,
  Email as EmailIcon,
} from '@mui/icons-material'
import { db } from '../../services/database'
import { generateDonorReport, openEmailWithDocument, createDonorReportEmailData, EmailProvider } from '../../services/documents'
import { useSettings } from '../../hooks/useSettings'

interface Donor {
  id: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
  address: string
  email: string
  notes: string
  created_at: string
  total_donations?: number
  donation_count?: number
}

const emptyDonor = {
  first_name: '',
  last_name: '',
  phone: '',
  id_number: '',
  address: '',
  email: '',
  notes: '',
}

interface DonorsTabProps {
  onSelectDonor: (donor: Donor) => void
  selectedDonorId?: number
}

export default function DonorsTab({ onSelectDonor, selectedDonorId }: DonorsTabProps) {
  const { settings } = useSettings()
  const [donors, setDonors] = useState<Donor[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState(emptyDonor)
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })

  useEffect(() => {
    loadDonors()
  }, [])

  const loadDonors = async () => {
    try {
      const dnrs = await db.query('SELECT * FROM donors') as Donor[]
      // חישוב סה"כ תרומות לכל תורם
      const donations = await db.query('SELECT * FROM donations') as any[]
      
      const donorsWithStats = dnrs.map(dnr => {
        const donorDonations = donations.filter(d => d.donor_id === dnr.id)
        return {
          ...dnr,
          total_donations: donorDonations.reduce((sum, d) => sum + (d.amount || 0), 0),
          donation_count: donorDonations.length,
        }
      })
      
      setDonors(donorsWithStats.sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ))
    } catch (error) {
      console.error('Error loading donors:', error)
    }
  }

  const filteredDonors = donors.filter(d => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      d.first_name?.toLowerCase().includes(term) ||
      d.last_name?.toLowerCase().includes(term) ||
      d.phone?.includes(searchTerm) ||
      d.id_number?.includes(searchTerm)
    )
  })

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה (שם פרטי, שם משפחה, טלפון)', severity: 'error' })
      return
    }

    // בדיקת כפילויות
    const existing = donors.find(d => d.phone === formData.phone)
    if (existing) {
      setSnackbar({ open: true, message: `תורם עם טלפון זה כבר קיים: ${existing.first_name} ${existing.last_name}`, severity: 'error' })
      return
    }

    try {
      await db.run(
        'INSERT INTO donors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [formData.first_name, formData.last_name, formData.phone, formData.id_number, formData.address, formData.email, formData.notes]
      )
      setSnackbar({ open: true, message: 'התורם נוסף בהצלחה', severity: 'success' })
      setFormData(emptyDonor)
      loadDonors()
    } catch (error) {
      console.error('Error saving donor:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleEdit = (donor: Donor) => {
    setEditingDonor(donor)
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingDonor) return

    try {
      await db.run(
        'UPDATE donors SET first_name = ?, last_name = ?, phone = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
        [editingDonor.first_name, editingDonor.last_name, editingDonor.phone, editingDonor.id_number, editingDonor.address, editingDonor.email, editingDonor.notes, editingDonor.id]
      )
      setSnackbar({ open: true, message: 'התורם עודכן בהצלחה', severity: 'success' })
      setEditDialogOpen(false)
      setEditingDonor(null)
      loadDonors()
    } catch (error) {
      console.error('Error updating donor:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון', severity: 'error' })
    }
  }

  const handleDelete = async (donor: Donor) => {
    // בדיקה אם יש תרומות
    if (donor.donation_count && donor.donation_count > 0) {
      setSnackbar({ open: true, message: 'לא ניתן למחוק תורם עם תרומות קיימות', severity: 'error' })
      return
    }

    if (!confirm(`האם למחוק את התורם ${donor.first_name} ${donor.last_name}?`)) return

    try {
      await db.run('DELETE FROM donors WHERE id = ?', [donor.id])
      setSnackbar({ open: true, message: 'התורם נמחק בהצלחה', severity: 'success' })
      loadDonors()
    } catch (error) {
      console.error('Error deleting donor:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleGenerateReport = async (donor: Donor) => {
    try {
      const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [donor.id]) as any[]
      
      const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0)
      
      generateDonorReport({
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        donorName: `${donor.first_name} ${donor.last_name}`,
        donorPhone: donor.phone,
        donorIdNumber: donor.id_number,
        donations: donations.sort((a, b) => new Date(b.donation_date).getTime() - new Date(a.donation_date).getTime()),
        totalDonations,
        dateFormat: settings.date_format,
      })
    } catch (error) {
      console.error('Error generating report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת דו"ח', severity: 'error' })
    }
  }

  const handleSendReportEmail = async (donor: Donor) => {
    if (!donor.email) {
      setSnackbar({ open: true, message: 'לתורם זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    try {
      const donations = await db.query('SELECT * FROM donations WHERE donor_id = ?', [donor.id]) as any[]
      
      const emailData = createDonorReportEmailData({
        gemachName: settings.gemach_name || 'גמ"ח',
        donorName: `${donor.first_name} ${donor.last_name}`,
        donorEmail: donor.email,
        totalDonations: donations.reduce((sum, d) => sum + (d.amount || 0), 0),
        donations: donations.map(d => ({
          id: d.id,
          amount: d.amount,
          donation_date: d.donation_date,
          notes: d.notes
        })),
      })
      
      const provider = (settings.email_provider || 'gmail') as EmailProvider
      const result = await openEmailWithDocument(emailData, provider)
      setSnackbar({ 
        open: true, 
        message: result.message, 
        severity: result.success ? 'success' : 'error' 
      })
    } catch (error) {
      console.error('Error sending email:', error)
      setSnackbar({ open: true, message: 'שגיאה בשליחת המייל', severity: 'error' })
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <Box>
      {/* Add Form */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            הוספת תורם חדש
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
                label="טלפון *"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="מספר זהות"
                value={formData.id_number}
                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="כתובת"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="אימייל"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="הערות"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleSave}>
              הוסף תורם
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="חיפוש תורם לפי שם, טלפון, מ.ז..."
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
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            רשימת תורמים ({filteredDonors.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            לחץ על שורה כדי לבחור תורם ולראות את התרומות שלו
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>שם</TableCell>
                  <TableCell>טלפון</TableCell>
                  <TableCell>מ.ז.</TableCell>
                  <TableCell align="center">מספר תרומות</TableCell>
                  <TableCell align="center">סה"כ תרם</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDonors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין תורמים</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDonors.map((donor) => (
                    <TableRow
                      key={donor.id}
                      hover
                      selected={selectedDonorId === donor.id}
                      onClick={() => onSelectDonor(donor)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography fontWeight={selectedDonorId === donor.id ? 'bold' : 'normal'}>
                          {donor.first_name} {donor.last_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{donor.phone}</TableCell>
                      <TableCell>{donor.id_number || '-'}</TableCell>
                      <TableCell align="center">
                        {donor.donation_count ? (
                          <Chip 
                            label={donor.donation_count} 
                            color="primary" 
                            size="small" 
                          />
                        ) : (
                          <Typography color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {donor.total_donations ? formatCurrency(donor.total_donations) : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => { e.stopPropagation(); handleGenerateReport(donor); }}
                          title="הפק דוח"
                        >
                          <DocIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={(e) => { e.stopPropagation(); handleSendReportEmail(donor); }}
                          title={donor.email ? 'שלח דוח במייל' : 'לתורם לא הוזנה כתובת מייל'}
                          disabled={!donor.email}
                        >
                          <EmailIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={(e) => { e.stopPropagation(); handleEdit(donor); }}
                          title="ערוך"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => { e.stopPropagation(); handleDelete(donor); }}
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
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>עריכת תורם</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="שם פרטי"
                  value={editingDonor?.first_name || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="שם משפחה"
                  value={editingDonor?.last_name || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="טלפון"
                  value={editingDonor?.phone || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="מספר זהות"
                  value={editingDonor?.id_number || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, id_number: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="כתובת"
                  value={editingDonor?.address || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, address: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="אימייל"
                  value={editingDonor?.email || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, email: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="הערות"
                  value={editingDonor?.notes || ''}
                  onChange={(e) => setEditingDonor(prev => prev ? { ...prev, notes: e.target.value } : null)}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" onClick={handleSaveEdit}>שמור</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
