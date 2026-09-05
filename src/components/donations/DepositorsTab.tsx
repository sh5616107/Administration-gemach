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
import { db, depositWithdrawalsService } from '../../services/database'
import { generateDepositorReport, openEmailWithDocument, createDepositorReportEmailData, EmailProvider } from '../../services/documents'
import { useSettings } from '../../hooks/useSettings'
import { getDocumentLayout } from '../../utils/documentLayoutHelper'
import { confirmAction } from '../../utils/confirmDialog'

interface Depositor {
  id: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
  address: string
  email: string
  notes: string
  created_at: string
  total_deposits?: number
  active_deposits?: number
}

const emptyDepositor = {
  first_name: '',
  last_name: '',
  phone: '',
  id_number: '',
  address: '',
  email: '',
  notes: '',
}

interface DepositorsTabProps {
  onSelectDepositor: (depositor: Depositor) => void
  selectedDepositorId?: number
}

export default function DepositorsTab({ onSelectDepositor, selectedDepositorId }: DepositorsTabProps) {
  const { settings } = useSettings()
  const depositorReportLayout = getDocumentLayout(settings.document_layouts, 'depositorReport')
  const [depositors, setDepositors] = useState<Depositor[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState(emptyDepositor)
  const [editingDepositor, setEditingDepositor] = useState<Depositor | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })

  useEffect(() => {
    loadDepositors()
  }, [])

  const loadDepositors = async () => {
    try {
      const deps = await db.query('SELECT * FROM depositors') as Depositor[]
      // חישוב סה"כ הפקדות לכל מפקיד
      const deposits = await db.query('SELECT * FROM deposits') as any[]
      
      const depositorsWithStats = await Promise.all(deps.map(async dep => {
        const depositorDeposits = deposits.filter(d => d.depositor_id === dep.id)
        
        // חישוב סה"כ הופקד (כולל הפקדות מחזוריות)
        let totalDeposited = 0
        let totalActive = 0
        
        for (const deposit of depositorDeposits) {
          // חישוב סכום בפועל להפקדה מחזורית
          let depositAmount = deposit.amount
          if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
            // הפקדה מחזורית - מכפילים בכמות ההפקדות שכבר בוצעו
            depositAmount = deposit.amount * deposit.recurring_deposit_number
          }
          
          totalDeposited += depositAmount
          
          // חישוב יתרה פעילה (מפחיתים משיכות)
          if (deposit.status === 'active' || deposit.status === 'planned') {
            const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
            const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)
            const remaining = depositAmount - totalWithdrawn
            if (remaining > 0) {
              totalActive += remaining
            }
          }
        }
        
        return {
          ...dep,
          total_deposits: totalDeposited,
          active_deposits: totalActive,
        }
      }))
      
      setDepositors(depositorsWithStats.sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ))
    } catch (error) {
      console.error('Error loading depositors:', error)
    }
  }

  const filteredDepositors = depositors.filter(d => {
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
    const existing = depositors.find(d => d.phone === formData.phone)
    if (existing) {
      setSnackbar({ open: true, message: `מפקיד עם טלפון זה כבר קיים: ${existing.first_name} ${existing.last_name}`, severity: 'error' })
      return
    }

    try {
      await db.run(
        'INSERT INTO depositors (first_name, last_name, phone, id_number, address, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [formData.first_name, formData.last_name, formData.phone, formData.id_number, formData.address, formData.email, formData.notes]
      )
      setSnackbar({ open: true, message: 'המפקיד נוסף בהצלחה', severity: 'success' })
      setFormData(emptyDepositor)
      loadDepositors()
    } catch (error) {
      console.error('Error saving depositor:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleEdit = (depositor: Depositor) => {
    setEditingDepositor(depositor)
    setEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingDepositor) return

    try {
      await db.run(
        'UPDATE depositors SET first_name = ?, last_name = ?, phone = ?, id_number = ?, address = ?, email = ?, notes = ? WHERE id = ?',
        [editingDepositor.first_name, editingDepositor.last_name, editingDepositor.phone, editingDepositor.id_number, editingDepositor.address, editingDepositor.email, editingDepositor.notes, editingDepositor.id]
      )
      setSnackbar({ open: true, message: 'המפקיד עודכן בהצלחה', severity: 'success' })
      setEditDialogOpen(false)
      setEditingDepositor(null)
      loadDepositors()
    } catch (error) {
      console.error('Error updating depositor:', error)
      setSnackbar({ open: true, message: 'שגיאה בעדכון', severity: 'error' })
    }
  }

  const handleDelete = async (depositor: Depositor) => {
    // בדיקה אם יש הפקדות פעילות
    if (depositor.active_deposits && depositor.active_deposits > 0) {
      setSnackbar({ open: true, message: 'לא ניתן למחוק מפקיד עם הפקדות פעילות', severity: 'error' })
      return
    }

    if (!(await confirmAction(`האם למחוק את המפקיד ${depositor.first_name} ${depositor.last_name}?`))) return

    try {
      // מחיקת כל ההפקדות של המפקיד
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id]) as any[]
      for (const dep of deposits) {
        await db.run('DELETE FROM deposits WHERE id = ?', [dep.id])
      }
      // מחיקת המפקיד
      await db.run('DELETE FROM depositors WHERE id = ?', [depositor.id])
      setSnackbar({ open: true, message: 'המפקיד נמחק בהצלחה', severity: 'success' })
      loadDepositors()
    } catch (error) {
      console.error('Error deleting depositor:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleGenerateReport = async (depositor: Depositor) => {
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
      }, depositorReportLayout)
    } catch (error) {
      console.error('Error generating report:', error)
      setSnackbar({ open: true, message: 'שגיאה בהפקת דו"ח', severity: 'error' })
    }
  }

  const handleSendReportEmail = async (depositor: Depositor) => {
    if (!depositor.email) {
      setSnackbar({ open: true, message: 'למפקיד זה לא הוזנה כתובת מייל', severity: 'error' })
      return
    }
    
    try {
      const deposits = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositor.id]) as any[]

      // טעינת היסטוריית משיכות לכל הפקדה — אותו חישוב כמו handleGenerateReport,
      // כדי שדוח האימייל יהיה זהה לגמרי לדוח המודפס/PDF (מקור אמת יחיד).
      const depositsWithWithdrawals = await Promise.all(
        deposits.map(async (deposit) => {
          const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id)
          const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0)

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

      const emailData = createDepositorReportEmailData({
        gemachName: settings.gemach_name || 'גמ"ח',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        depositorName: `${depositor.first_name} ${depositor.last_name}`,
        depositorPhone: depositor.phone,
        depositorIdNumber: depositor.id_number,
        depositorEmail: depositor.email,
        deposits: depositsWithWithdrawals.sort((a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime()),
        totalActive,
        totalWithdrawn,
        dateFormat: settings.date_format,
      }, depositorReportLayout)
      
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
            הוספת מפקיד חדש
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
              הוסף מפקיד
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Search */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField
            fullWidth
            placeholder="חיפוש מפקיד לפי שם, טלפון, מ.ז..."
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
            רשימת מפקידים ({filteredDepositors.length})
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            לחץ על שורה כדי לבחור מפקיד ולהוסיף לו הפקדות
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>שם</TableCell>
                  <TableCell>טלפון</TableCell>
                  <TableCell>מ.ז.</TableCell>
                  <TableCell align="center">הפקדות פעילות</TableCell>
                  <TableCell align="center">סה"כ הופקד</TableCell>
                  <TableCell align="center">פעולות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDepositors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">אין מפקידים</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDepositors.map((depositor) => (
                    <TableRow
                      key={depositor.id}
                      hover
                      selected={selectedDepositorId === depositor.id}
                      onClick={() => onSelectDepositor(depositor)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Typography fontWeight={selectedDepositorId === depositor.id ? 'bold' : 'normal'}>
                          {depositor.first_name} {depositor.last_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{depositor.phone}</TableCell>
                      <TableCell>{depositor.id_number || '-'}</TableCell>
                      <TableCell align="center">
                        {depositor.active_deposits ? (
                          <Chip 
                            label={formatCurrency(depositor.active_deposits)} 
                            color="success" 
                            size="small" 
                          />
                        ) : (
                          <Typography color="text.secondary">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {depositor.total_deposits ? formatCurrency(depositor.total_deposits) : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => { e.stopPropagation(); handleGenerateReport(depositor); }}
                          title="הפק דוח"
                        >
                          <DocIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="secondary"
                          onClick={(e) => { e.stopPropagation(); handleSendReportEmail(depositor); }}
                          title={depositor.email ? 'שלח דוח במייל' : 'למפקיד לא הוזנה כתובת מייל'}
                          disabled={!depositor.email}
                        >
                          <EmailIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={(e) => { e.stopPropagation(); handleEdit(depositor); }}
                          title="ערוך"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => { e.stopPropagation(); handleDelete(depositor); }}
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
        <DialogTitle>עריכת מפקיד</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="שם פרטי"
                  value={editingDepositor?.first_name || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, first_name: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="שם משפחה"
                  value={editingDepositor?.last_name || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, last_name: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="טלפון"
                  value={editingDepositor?.phone || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, phone: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="מספר זהות"
                  value={editingDepositor?.id_number || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, id_number: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="כתובת"
                  value={editingDepositor?.address || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, address: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="אימייל"
                  value={editingDepositor?.email || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, email: e.target.value } : null)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="הערות"
                  value={editingDepositor?.notes || ''}
                  onChange={(e) => setEditingDepositor(prev => prev ? { ...prev, notes: e.target.value } : null)}
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
