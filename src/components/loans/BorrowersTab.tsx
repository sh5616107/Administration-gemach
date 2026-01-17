import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Grid,
  Typography,
  Autocomplete,
  InputAdornment,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import { Search as SearchIcon, Add as AddIcon, Save as SaveIcon } from '@mui/icons-material'
import { borrowersService, loansService, guarantorLoansService } from '../../services/database'
import { useSettings } from '../../hooks/useSettings'
import CrossCheckWarningDialog from '../CrossCheckWarningDialog'
import { checkNewBorrower, type CrossCheckResult } from '../../services/crossCheck'

interface Borrower {
  id?: number
  first_name: string
  last_name: string
  id_number: string
  city: string
  phone: string
  phone2: string
  address: string
  email: string
  notes: string
}

const emptyBorrower: Borrower = {
  first_name: '',
  last_name: '',
  id_number: '',
  city: '',
  phone: '',
  phone2: '',
  address: '',
  email: '',
  notes: '',
}

interface BorrowersTabProps {
  onBorrowerSelect?: (borrowerId: number) => void
}

export default function BorrowersTab({ onBorrowerSelect }: BorrowersTabProps) {
  const { settings } = useSettings()
  const [borrowers, setBorrowers] = useState<Borrower[]>([])
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null)
  const [formData, setFormData] = useState<Borrower>(emptyBorrower)
  const [searchTerm, setSearchTerm] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const [duplicateNameDialog, setDuplicateNameDialog] = useState<{ open: boolean; existingBorrower: Borrower | null }>({ open: false, existingBorrower: null })

  // Cross-check warning states
  const [crossCheckWarnings, setCrossCheckWarnings] = useState<CrossCheckResult[]>([])
  const [crossCheckDialogOpen, setCrossCheckDialogOpen] = useState(false)

  // Get field labels from settings
  const fieldLabels = settings.field_labels ? (() => { try { return JSON.parse(settings.field_labels) } catch { return {} } })() : {}
  const getLabel = (key: string, defaultLabel: string) => fieldLabels[key] || defaultLabel
  const idRequired = settings.id_required === 'required'

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
    loadBorrowers()
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchTerm.trim()) {
        try {
          const results = await borrowersService.search(searchTerm)
          setBorrowers(results as Borrower[])
        } catch (error) {
          console.error('Error searching:', error)
        }
      } else {
        loadBorrowers()
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const loadBorrowers = async () => {
    try {
      const data = await borrowersService.getAll()
      setBorrowers(data as Borrower[])
    } catch (error) {
      console.error('Error loading borrowers:', error)
    }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      loadBorrowers()
      return
    }
    try {
      const results = await borrowersService.search(searchTerm)
      setBorrowers(results as Borrower[])
    } catch (error) {
      console.error('Error searching:', error)
    }
  }

  const handleSelectBorrower = (borrower: Borrower | null) => {
    setSelectedBorrower(borrower)
    if (borrower) {
      setFormData(borrower)
      // עדכון הקומפוננטה האב על הלווה שנבחר
      if (borrower.id && onBorrowerSelect) {
        onBorrowerSelect(borrower.id)
      }
    } else {
      setFormData(emptyBorrower)
    }
  }

  const handleNewBorrower = () => {
    setSelectedBorrower(null)
    setFormData(emptyBorrower)
  }

  // Phone validation - only numbers allowed
  const handlePhoneChange = (field: 'phone' | 'phone2', value: string) => {
    const numbersOnly = value.replace(/[^0-9-]/g, '')
    setFormData({ ...formData, [field]: numbersOnly })
  }

  const handleSave = async () => {
    if (!formData.first_name || !formData.last_name || !formData.phone) {
      setSnackbar({ open: true, message: 'נא למלא שדות חובה', severity: 'error' })
      return
    }

    // Check if ID is required
    if (idRequired && !formData.id_number) {
      setSnackbar({ open: true, message: 'מספר זהות הוא שדה חובה', severity: 'error' })
      return
    }

    // Validate Israeli ID if provided
    if (formData.id_number && !validateIsraeliId(formData.id_number)) {
      setSnackbar({ open: true, message: 'מספר זהות לא תקין', severity: 'error' })
      return
    }

    // בדיקת כפילויות - טלפון
    const allBorrowers = await borrowersService.getAll() as Borrower[]
    const duplicatePhone = allBorrowers.find(b => 
      b.phone === formData.phone && b.id !== selectedBorrower?.id
    )
    if (duplicatePhone) {
      setSnackbar({ open: true, message: `טלפון זה כבר קיים במערכת עבור: ${duplicatePhone.first_name} ${duplicatePhone.last_name}`, severity: 'error' })
      return
    }

    // בדיקת כפילויות - מספר זהות (אם הוזן)
    if (formData.id_number) {
      const duplicateId = allBorrowers.find(b => 
        b.id_number === formData.id_number && b.id !== selectedBorrower?.id
      )
      if (duplicateId) {
        setSnackbar({ open: true, message: `מספר זהות זה כבר קיים במערכת עבור: ${duplicateId.first_name} ${duplicateId.last_name}`, severity: 'error' })
        return
      }
    }

    // בדיקת כפילויות - שם (אזהרה בלבד, לא חוסם)
    if (!selectedBorrower?.id) {
      const duplicateName = allBorrowers.find(b => 
        b.first_name.toLowerCase() === formData.first_name.toLowerCase() && 
        b.last_name.toLowerCase() === formData.last_name.toLowerCase()
      )
      if (duplicateName) {
        setDuplicateNameDialog({ open: true, existingBorrower: duplicateName })
        return
      }

      // Cross-check: בדיקה אם קיים ערב עם אותם פרטים
      const crossCheckWarningsResult = await checkNewBorrower(formData.phone, formData.id_number)
      if (crossCheckWarningsResult.length > 0) {
        setCrossCheckWarnings(crossCheckWarningsResult)
        setCrossCheckDialogOpen(true)
        return
      }
    }

    await doSave()
  }

  const doSave = async () => {
    try {
      if (selectedBorrower?.id) {
        await borrowersService.update(selectedBorrower.id, formData)
        setSnackbar({ open: true, message: 'הלווה עודכן בהצלחה', severity: 'success' })
      } else {
        await borrowersService.create(formData)
        setSnackbar({ open: true, message: 'הלווה נוסף בהצלחה', severity: 'success' })
      }
      loadBorrowers()
      handleNewBorrower()
    } catch (error) {
      console.error('Error saving borrower:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleCrossCheckContinue = () => {
    setCrossCheckDialogOpen(false)
    setCrossCheckWarnings([])
    doSave()
  }

  const handleCrossCheckCancel = () => {
    setCrossCheckDialogOpen(false)
    setCrossCheckWarnings([])
  }

  const handleConfirmDuplicateName = async () => {
    setDuplicateNameDialog({ open: false, existingBorrower: null })
    await doSave()
  }

  const handleDelete = async () => {
    if (!selectedBorrower?.id) return
    
    // בדיקה אם יש הלוואות פעילות ללווה
    try {
      const loans = await loansService.getByBorrower(selectedBorrower.id) as any[]
      const activeLoans = loans.filter(l => l.status === 'active' && (l.remaining || 0) > 0)
      if (activeLoans.length > 0) {
        setSnackbar({ open: true, message: `לא ניתן למחוק לווה עם ${activeLoans.length} הלוואות פעילות`, severity: 'error' })
        return
      }
      
      // בדיקה אם יש הלוואות שהועברו לערבים ועדיין פעילות
      const transferredLoans = loans.filter(l => l.status === 'transferred')
      for (const loan of transferredLoans) {
        const guarantorLoans = await guarantorLoansService.getByOriginalLoan(loan.id)
        const activeGuarantorLoans = guarantorLoans.filter(gl => gl.status === 'active')
        if (activeGuarantorLoans.length > 0) {
          setSnackbar({ open: true, message: 'לא ניתן למחוק לווה כאשר יש הלוואות שהועברו לערבים ועדיין פעילות', severity: 'error' })
          return
        }
      }
    } catch (error) {
      console.error('Error checking loans:', error)
    }
    
    if (!confirm('האם למחוק את הלווה?')) return

    try {
      await borrowersService.delete(selectedBorrower.id)
      setSnackbar({ open: true, message: 'הלווה נמחק', severity: 'success' })
      loadBorrowers()
      handleNewBorrower()
    } catch (error) {
      console.error('Error deleting borrower:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  return (
    <Box>
      {/* Search and Select */}
      <Card sx={{ mb: 3, overflow: 'visible' }}>
        <CardContent sx={{ overflow: 'visible' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={5} sx={{ position: 'relative' }}>
              <TextField
                fullWidth
                placeholder="חיפוש לפי שם, טלפון, מ.ז., עיר..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
              {/* תוצאות חיפוש */}
              {searchTerm.trim() && borrowers.length > 0 && (
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
                  {borrowers.map((b) => (
                    <Box
                      key={b.id}
                      onClick={() => {
                        handleSelectBorrower(b)
                        setSearchTerm('')
                      }}
                      sx={{ 
                        p: 1.5, 
                        cursor: 'pointer', 
                        '&:hover': { bgcolor: 'action.hover' },
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <Typography variant="body2">{b.first_name} {b.last_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{b.phone} | {b.city}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {searchTerm.trim() && borrowers.length === 0 && (
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
                  <Typography variant="body2" color="text.secondary">לא נמצאו תוצאות</Typography>
                </Box>
              )}
            </Grid>
            <Grid item xs={12} md={5}>
              <Autocomplete
                options={borrowers}
                getOptionLabel={(option) => `${option.first_name} ${option.last_name}`}
                value={selectedBorrower}
                onChange={(_, value) => handleSelectBorrower(value)}
                renderInput={(params) => (
                  <TextField {...params} placeholder="בחר לווה מהרשימה" />
                )}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleNewBorrower}
              >
                לווה חדש
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Borrower Form */}
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 3 }}>
            {selectedBorrower ? 'עריכת לווה' : 'הוספת לווה חדש'}
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={`${getLabel('borrower_first_name', 'שם פרטי')} *`}
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={`${getLabel('borrower_last_name', 'שם משפחה')} *`}
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={`${getLabel('borrower_id_number', 'מספר זהות')}${idRequired ? ' *' : ''}`}
                value={formData.id_number}
                onChange={(e) => setFormData({ ...formData, id_number: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                required={idRequired}
                error={(idRequired && !formData.id_number && formData.first_name !== '') || (formData.id_number !== '' && !validateIsraeliId(formData.id_number))}
                helperText={formData.id_number && !validateIsraeliId(formData.id_number) ? 'מספר זהות לא תקין' : (idRequired ? 'שדה חובה' : '')}
                inputProps={{ maxLength: 9, inputMode: 'numeric' }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={`${getLabel('borrower_phone', 'טלפון')} *`}
                value={formData.phone}
                onChange={(e) => handlePhoneChange('phone', e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
                placeholder="050-1234567"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={getLabel('borrower_phone2', 'טלפון נוסף')}
                value={formData.phone2}
                onChange={(e) => handlePhoneChange('phone2', e.target.value)}
                inputProps={{ inputMode: 'numeric' }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={getLabel('borrower_city', 'עיר')}
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
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
              {selectedBorrower ? 'עדכן לווה' : 'שמור לווה'}
            </Button>
            {selectedBorrower && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleDelete}
              >
                מחק לווה
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Duplicate Name Warning Dialog */}
      <Dialog open={duplicateNameDialog.open} onClose={() => setDuplicateNameDialog({ open: false, existingBorrower: null })}>
        <DialogTitle>⚠️ שים לב - שם כפול</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            כבר קיים לווה בשם "{formData.first_name} {formData.last_name}" במערכת:
          </Typography>
          {duplicateNameDialog.existingBorrower && (
            <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>טלפון:</strong> {duplicateNameDialog.existingBorrower.phone}
              </Typography>
              {duplicateNameDialog.existingBorrower.city && (
                <Typography variant="body2">
                  <strong>עיר:</strong> {duplicateNameDialog.existingBorrower.city}
                </Typography>
              )}
              {duplicateNameDialog.existingBorrower.id_number && (
                <Typography variant="body2">
                  <strong>מ.ז.:</strong> {duplicateNameDialog.existingBorrower.id_number}
                </Typography>
              )}
            </Box>
          )}
          <Typography sx={{ mt: 2 }}>
            האם אתה בטוח שברצונך ליצור לווה נוסף עם אותו שם?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDuplicateNameDialog({ open: false, existingBorrower: null })}>
            ביטול
          </Button>
          <Button variant="contained" color="warning" onClick={handleConfirmDuplicateName}>
            כן, צור לווה חדש
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cross-Check Warning Dialog */}
      <CrossCheckWarningDialog
        open={crossCheckDialogOpen}
        onClose={handleCrossCheckCancel}
        onContinue={handleCrossCheckContinue}
        warnings={crossCheckWarnings}
        title="אזהרה - יצירת לווה"
      />
    </Box>
  )
}
