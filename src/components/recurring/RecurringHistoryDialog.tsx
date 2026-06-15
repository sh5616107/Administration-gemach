/**
 * Recurring History Dialog Component
 * 
 * Displays the complete history of all items in a recurring series.
 * Shows item number, date, amount, and status for each item.
 * Visually distinguishes between past and future items.
 * 
 * Feature: recurring-items-management
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.3
 */

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Alert,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Typography
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import {
  recurringItemsService,
  ItemType,
  SeriesItem
} from '../../services/recurringItemsService'
import HistoryIcon from '@mui/icons-material/History'

export interface RecurringHistoryDialogProps {
  open: boolean
  onClose: () => void
  itemType: ItemType
  itemId: string  // UUID
}

export function RecurringHistoryDialog({
  open,
  onClose,
  itemType,
  itemId
}: RecurringHistoryDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seriesItems, setSeriesItems] = useState<SeriesItem[]>([])

  // Load history
  useEffect(() => {
    if (open) {
      loadHistory()
    }
  }, [open, itemId])

  async function loadHistory() {
    setLoading(true)
    setError(null)
    try {
      const items = await recurringItemsService.getSeriesItems(itemId, itemType)
      setSeriesItems(items)
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת היסטוריה')
    } finally {
      setLoading(false)
    }
  }

  function getItemTypeLabel(): string {
    switch (itemType) {
      case 'loan':
        return t('recurring.loans', 'הלוואות')
      case 'repayment':
        return t('recurring.repayments', 'פירעונות')
      case 'deposit':
        return t('recurring.deposits', 'הפקדות')
      default:
        return ''
    }
  }

  function getStatusLabel(status: string): string {
    const statusMap: Record<string, string> = {
      active: t('status.active', 'פעיל'),
      paid: t('status.paid', 'שולם'),
      planned: t('status.planned', 'מתוכנן'),
      withdrawn: t('status.withdrawn', 'נמשך'),
      overdue: t('status.overdue', 'באיחור')
    }
    return statusMap[status] || status
  }

  function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'default' {
    const colorMap: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
      active: 'success',
      paid: 'info',
      planned: 'warning',
      withdrawn: 'default',
      overdue: 'error'
    }
    return colorMap[status] || 'default'
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      dir="rtl"
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <HistoryIcon />
          {t('recurring.historyTitle', 'היסטוריית {{type}}', { type: getItemTypeLabel() })}
          {seriesItems.length > 0 && (
            <Chip 
              label={`${seriesItems.length} ${t('recurring.itemsInSeries', 'פריטים בסדרה')}`}
              size="small"
              color="primary"
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress />
          </Box>
        ) : seriesItems.length === 0 ? (
          <Alert severity="info">
            {t('recurring.noItems', 'אין פריטים נוספים בסדרה')}
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell align="center">
                    <strong>{t('recurring.itemNumber', 'מספר')}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>{t('recurring.date', 'תאריך')}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>{t('recurring.amount', 'סכום')}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>{t('recurring.status', 'מצב')}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <strong>{t('recurring.type', 'סוג')}</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {seriesItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    sx={{
                      backgroundColor: item.isPast ? '#f5f5f5' : '#e3f2fd',
                      '&:hover': {
                        backgroundColor: item.isPast ? '#eeeeee' : '#bbdefb'
                      }
                    }}
                  >
                    <TableCell align="center">
                      <Chip 
                        label={item.item_number} 
                        size="small"
                        color={item.item_number === 1 ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {new Date(item.date).toLocaleDateString('he-IL')}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight="bold">
                        ₪{item.amount.toLocaleString('he-IL')}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={getStatusLabel(item.status)} 
                        size="small"
                        color={getStatusColor(item.status)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={item.isPast ? t('recurring.past', 'עבר') : t('recurring.future', 'עתיד')}
                        size="small"
                        variant="outlined"
                        color={item.isPast ? 'default' : 'primary'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          {t('common.close', 'סגור')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
