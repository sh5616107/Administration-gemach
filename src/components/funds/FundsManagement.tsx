import { useState, useEffect } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Chip,
  Snackbar,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
} from '@mui/icons-material'
import { fundsService, type Fund } from '../../services/database'
import { confirmAction, confirmDeleteMessage } from '../../utils/confirmDialog'

export default function FundsManagement() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFund, setEditingFund] = useState<Fund | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
  })
  const [snackbar, setSnackbar] = useState({ 
    open: false, 
    message: '', 
    severity: 'success' as 'success' | 'error' 
  })

  useEffect(() => {
    loadFunds()
  }, [])

  const loadFunds = async () => {
    try {
      const data = await fundsService.getAll()
      setFunds(data)
    } catch (error) {
      console.error('Error loading funds:', error)
      setSnackbar({ 
        open: true, 
        message: 'שגיאה בטעינת קופות', 
        severity: 'error' 
      })
    }
  }

  const handleOpenDialog = (fund?: Fund) => {
    if (fund) {
      setEditingFund(fund)
      setFormData({
        name: fund.name,
        description: fund.description || '',
        is_active: fund.is_active,
      })
    } else {
      setEditingFund(null)
      setFormData({
        name: '',
        description: '',
        is_active: true,
      })
    }
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingFund(null)
    setFormData({
      name: '',
      description: '',
      is_active: true,
    })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setSnackbar({ 
        open: true, 
        message: 'נא למלא שם קופה', 
        severity: 'error' 
      })
      return
    }

    try {
      if (editingFund) {
        await fundsService.update(editingFund.id, formData)
        setSnackbar({ 
          open: true, 
          message: 'הקופה עודכנה בהצלחה', 
          severity: 'success' 
        })
      } else {
        await fundsService.create({
          ...formData,
          is_default: false, // קופות חדשות לא יהיו ברירת מחדל אוטומטית
        })
        setSnackbar({ 
          open: true, 
          message: 'הקופה נוספה בהצלחה', 
          severity: 'success' 
        })
      }
      handleCloseDialog()
      loadFunds()
    } catch (error) {
      console.error('Error saving fund:', error)
      setSnackbar({ 
        open: true, 
        message: error instanceof Error ? error.message : 'שגיאה בשמירה', 
        severity: 'error' 
      })
    }
  }

  const handleSetDefault = async (fundId: string) => {
    try {
      await fundsService.setDefault(fundId)
      setSnackbar({ 
        open: true, 
        message: 'קופת ברירת המחדל עודכנה', 
        severity: 'success' 
      })
      loadFunds()
    } catch (error) {
      console.error('Error setting default fund:', error)
      setSnackbar({ 
        open: true, 
        message: error instanceof Error ? error.message : 'שגיאה בעדכון', 
        severity: 'error' 
      })
    }
  }

  const handleToggleActive = async (fund: Fund) => {
    try {
      if (fund.is_active) {
        await fundsService.deactivate(fund.id)
        setSnackbar({ 
          open: true, 
          message: `הקופה "${fund.name}" הושבתה`, 
          severity: 'success' 
        })
      } else {
        await fundsService.update(fund.id, { is_active: true })
        setSnackbar({ 
          open: true, 
          message: `הקופה "${fund.name}" הופעלה`, 
          severity: 'success' 
        })
      }
      loadFunds()
    } catch (error) {
      console.error('Error toggling fund active state:', error)
      setSnackbar({ 
        open: true, 
        message: error instanceof Error ? error.message : 'שגיאה בעדכון', 
        severity: 'error' 
      })
    }
  }

  const handleDelete = async (fund: Fund) => {
    if (!(await confirmAction(confirmDeleteMessage(`האם למחוק את הקופה "${fund.name}"?`)))) {
      return
    }

    try {
      await fundsService.delete(fund.id)
      setSnackbar({ 
        open: true, 
        message: 'הקופה נמחקה בהצלחה', 
        severity: 'success' 
      })
      loadFunds()
    } catch (error) {
      console.error('Error deleting fund:', error)
      setSnackbar({ 
        open: true, 
        message: error instanceof Error ? error.message : 'שגיאה במחיקה', 
        severity: 'error' 
      })
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">ניהול קופות</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          הוסף קופה
        </Button>
      </Box>
      
      {funds.length === 1 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          יש לך כרגע קופה אחת. הוסף קופה נוספת כדי לנהל מספר קרנות בנפרד.
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>שם הקופה</TableCell>
              <TableCell>תיאור</TableCell>
              <TableCell align="center">סטטוס</TableCell>
              <TableCell align="center">ברירת מחדל</TableCell>
              <TableCell align="center">פעולות</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {funds.map((fund) => (
              <TableRow key={fund.id}>
                <TableCell>
                  <Typography fontWeight={fund.is_default ? 600 : 400}>
                    {fund.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {fund.description || '—'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <FormControlLabel
                    control={
                      <Switch
                        checked={fund.is_active}
                        onChange={() => handleToggleActive(fund)}
                        disabled={fund.is_default}
                      />
                    }
                    label={fund.is_active ? 'פעיל' : 'מושבת'}
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    onClick={() => handleSetDefault(fund.id)}
                    disabled={fund.is_default}
                    color={fund.is_default ? 'primary' : 'default'}
                  >
                    {fund.is_default ? <StarIcon /> : <StarBorderIcon />}
                  </IconButton>
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={() => handleOpenDialog(fund)}
                    color="primary"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDelete(fund)}
                    color="error"
                    disabled={fund.is_default}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingFund ? 'עריכת קופה' : 'הוספת קופה חדשה'}
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="שם הקופה"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mt: 2, mb: 2 }}
            autoFocus
          />
          <TextField
            fullWidth
            label="תיאור"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
            }
            label="קופה פעילה"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>ביטול</Button>
          <Button onClick={handleSave} variant="contained">
            {editingFund ? 'שמור' : 'הוסף'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
