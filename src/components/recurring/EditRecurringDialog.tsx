/**
 * Manage Recurring Dialog Component
 * 
 * Unified dialog for viewing and editing recurring items.
 * Shows history, current status, and allows editing parameters.
 * 
 * Feature: recurring-items-management
 * Requirements: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 5.1, 5.2, 10.1, 10.2, 10.4, 10.6, 14.1, 14.2, 14.3
 */

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Box,
  Tabs,
  Tab,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip
} from '@mui/material'
import {
  Edit as EditIcon,
  History as HistoryIcon,
  Info as InfoIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material'
import { useTranslation } from 'react-i18next'
import {
  recurringItemsService,
  ItemType,
  EditRecurringFormData,
  UpdateSummary,
  SeriesItem
} from '../../services/recurringItemsService'
import { ConfirmUpdateDialog } from './ConfirmUpdateDialog'

export interface EditRecurringDialogProps {
  open: boolean
  onClose: () => void
  itemType: ItemType
  itemId: number
  onSuccess: () => void
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`recurring-tabpanel-${index}`}
      aria-labelledby={`recurring-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

export function EditRecurringDialog({
  open,
  onClose,
  itemType,
  itemId,
  onSuccess
}: EditRecurringDialogProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true) // Start with loading=true
  const [error, setError] = useState<string | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [seriesItems, setSeriesItems] = useState<SeriesItem[]>([])
  const [formData, setFormData] = useState<EditRecurringFormData>({
    recurring_day: 1,
    recurring_amount: 0,
    recurring_months: 0
  })
  const [originalData, setOriginalData] = useState<EditRecurringFormData>({
    recurring_day: 1,
    recurring_amount: 0,
    recurring_months: 0
  })
  const [showConfirm, setShowConfirm] = useState(false)
  const [updateSummary, setUpdateSummary] = useState<UpdateSummary | null>(null)

  // Load initial data
  useEffect(() => {
    if (open) {
      setLoading(true) // Ensure loading is true when dialog opens
      loadInitialData()
      setTabValue(0)
      setEditMode(false)
    }
  }, [open, itemId, itemType])

  async function loadInitialData() {
    // Don't set loading here - it's already set in useEffect
    setError(null)
    try {
      // Special case: auto_repayment
      if (itemType === 'auto_repayment') {
        const loan = await recurringItemsService.getOriginalItem(itemId, itemType)
        if (loan) {
          const data = {
            recurring_day: loan.repayment_day || 1,
            recurring_amount: loan.repayment_amount || 0,
            recurring_months: 0 // Not relevant for auto_repayment
          }
          setFormData(data)
          setOriginalData(data)
        }
        // Load series items (existing repayments)
        const items = await recurringItemsService.getSeriesItems(itemId, itemType)
        setSeriesItems(items)
      } else {
        // Load item data
        const item = await recurringItemsService.getOriginalItem(itemId, itemType)
        if (item) {
          const data = {
            recurring_day: item.recurring_day || 1,
            recurring_amount: item.amount,
            recurring_months: item.recurring_months || 0
          }
          setFormData(data)
          setOriginalData(data)
        }

        // Load series items
        const items = await recurringItemsService.getSeriesItems(itemId, itemType)
        setSeriesItems(items)
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בטעינת נתונים')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    setError(null)

    try {
      // Get update summary
      const summary = await recurringItemsService.getUpdateSummary(
        itemId,
        itemType,
        formData
      )

      if (summary.changes.length === 0) {
        setError('לא בוצעו שינויים')
        setLoading(false)
        return
      }

      setUpdateSummary(summary)
      setShowConfirm(true)
    } catch (err: any) {
      setError(err.message || 'שגיאה בהכנת סיכום')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      const result = await recurringItemsService.updateSeriesItems(
        itemId,
        itemType,
        formData
      )

      if (result.success) {
        onSuccess()
        onClose()
      } else {
        setError(result.error || 'שגיאה בעדכון')
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בעדכון')
    } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  function handleClose() {
    if (!loading) {
      setEditMode(false)
      onClose()
    }
  }

  function handleCancelEdit() {
    setFormData(originalData)
    setEditMode(false)
    setError(null)
  }

  function getItemTypeLabel(): string {
    switch (itemType) {
      case 'loan':
        return t('recurring.loans', 'הלוואות')
      case 'repayment':
        return t('recurring.repayments', 'פירעונות')
      case 'deposit':
        return t('recurring.deposits', 'הפקדות')
      case 'auto_repayment':
        return t('recurring.autoRepayment', 'פירעון אוטומטי')
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

  const pastItems = seriesItems.filter(item => item.isPast)
  const futureItems = seriesItems.filter(item => !item.isPast)
  const monthsRemaining = formData.recurring_months || 0
  const totalItems = seriesItems.length
  // Created items = all items that already exist in the database
  const createdItems = totalItems
  const futureItemsCount = futureItems.length

  // Special UI for auto_repayment
  const isAutoRepayment = itemType === 'auto_repayment'

  return (
    <>
      <Dialog 
        open={open && !showConfirm} 
        onClose={handleClose} 
        maxWidth="md" 
        fullWidth
        dir="rtl"
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <ScheduleIcon />
              <Typography variant="h6">
                {t('recurring.manageTitle', 'ניהול {{type}} מחזוריות', { type: getItemTypeLabel() })}
              </Typography>
            </Box>
            {!editMode && (
              <Tooltip title={t('recurring.editMode', 'מצב עריכה')}>
                <IconButton onClick={() => setEditMode(true)} color="primary">
                  <EditIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && tabValue === 0 ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Tabs 
                value={tabValue} 
                onChange={(_, newValue) => setTabValue(newValue)}
                sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
              >
                <Tab 
                  icon={<InfoIcon />} 
                  label={t('recurring.overview', 'סקירה כללית')} 
                  iconPosition="start"
                />
                <Tab 
                  icon={<HistoryIcon />} 
                  label={t('recurring.history', 'היסטוריה')} 
                  iconPosition="start"
                />
              </Tabs>

              {/* Overview Tab */}
              <TabPanel value={tabValue} index={0}>
                <Grid container spacing={3}>
                  {/* Status Cards */}
                  <Grid item xs={12}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={4}>
                        <Card variant="outlined" sx={{ bgcolor: '#e3f2fd' }}>
                          <CardContent>
                            <Typography variant="caption" color="text.secondary">
                              {t('recurring.totalCreated', 'נוצרו עד כה')}
                            </Typography>
                            <Typography variant="h4" color="primary">
                              {createdItems}
                            </Typography>
                            <Typography variant="caption">
                              {isAutoRepayment ? t('recurring.repayments', 'פירעונות') : t('recurring.items', 'פריטים')}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      {!isAutoRepayment && (
                        <>
                          <Grid item xs={12} sm={4}>
                            <Card variant="outlined" sx={{ bgcolor: '#fff3e0' }}>
                              <CardContent>
                                <Typography variant="caption" color="text.secondary">
                                  {t('recurring.monthsRemaining', 'חודשים נותרים')}
                                </Typography>
                                <Typography variant="h4" color="warning.main">
                                  {monthsRemaining}
                                </Typography>
                                <Typography variant="caption">
                                  {t('recurring.moreToCreate', 'עוד ייווצרו')}
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Card variant="outlined" sx={{ bgcolor: '#f3e5f5' }}>
                              <CardContent>
                                <Typography variant="caption" color="text.secondary">
                                  {t('recurring.totalPlanned', 'סה"כ מתוכנן')}
                                </Typography>
                                <Typography variant="h4" color="secondary">
                                  {totalItems + monthsRemaining}
                                </Typography>
                                <Typography variant="caption">
                                  {t('recurring.items', 'פריטים')}
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                        </>
                      )}
                    </Grid>
                  </Grid>

                  <Grid item xs={12}>
                    <Divider />
                  </Grid>

                  {/* Auto Repayment Info Card */}
                  {isAutoRepayment && (
                    <Grid item xs={12}>
                      <Alert severity="info" icon={<InfoIcon />}>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('recurring.autoRepaymentInfo', 'הגדרות פירעון אוטומטי')}
                        </Typography>
                        <Typography variant="body2">
                          {t('recurring.autoRepaymentDescription', 'כאן תוכל לערוך את הפרמטרים של הפירעון האוטומטי להלוואה זו. השינויים ישפיעו על פירעונות עתידיים שייווצרו.')}
                        </Typography>
                      </Alert>
                    </Grid>
                  )}

                  {/* Edit Form */}
                  <Grid item xs={12}>
                    <Box sx={{ bgcolor: editMode ? '#fff9c4' : 'transparent', p: editMode ? 2 : 0, borderRadius: 1 }}>
                      {editMode && !isAutoRepayment && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                          {t('recurring.editWarning', 'שינויים ישפיעו על הלוואות עתידיות שעוד ייווצרו. הלוואות שכבר נוצרו לא ישתנו.')}
                        </Alert>
                      )}
                      
                      {editMode && isAutoRepayment && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                          {t('recurring.autoRepaymentEditWarning', 'שינוי יום הגבייה או סכום הפירעון ישפיע על פירעונות עתידיים שייווצרו.')}
                        </Alert>
                      )}
                      
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={isAutoRepayment ? 6 : 4}>
                          <TextField
                            label={t('recurring.dayOfMonth', 'יום בחודש')}
                            type="number"
                            value={formData.recurring_day}
                            onChange={(e) =>
                              setFormData({ ...formData, recurring_day: parseInt(e.target.value) })
                            }
                            fullWidth
                            inputProps={{ min: 1, max: 31 }}
                            disabled={!editMode || loading}
                            helperText={editMode ? t('recurring.dayHelp', 'יום 1-31') : ''}
                          />
                        </Grid>

                        <Grid item xs={12} sm={isAutoRepayment ? 6 : 4}>
                          <TextField
                            label={t('recurring.amount', 'סכום')}
                            type="number"
                            value={formData.recurring_amount}
                            onChange={(e) =>
                              setFormData({ ...formData, recurring_amount: parseFloat(e.target.value) })
                            }
                            fullWidth
                            inputProps={{ min: 0, step: 0.01 }}
                            disabled={!editMode || loading}
                            helperText={editMode ? t('recurring.amountHelp', 'סכום בש"ח') : ''}
                          />
                        </Grid>

                        {(itemType === 'loan' || itemType === 'deposit') && !isAutoRepayment && (
                          <Grid item xs={12} sm={4}>
                            <TextField
                              label={t('recurring.monthsRemaining', 'חודשים נותרים')}
                              type="number"
                              value={formData.recurring_months}
                              onChange={(e) =>
                                setFormData({ ...formData, recurring_months: parseInt(e.target.value) })
                              }
                              fullWidth
                              inputProps={{ min: 0 }}
                              disabled={!editMode || loading}
                              helperText={editMode ? t('recurring.monthsHelp', 'כמה חודשים עוד ייווצרו') : ''}
                            />
                          </Grid>
                        )}
                      </Grid>
                    </Box>
                  </Grid>

                  {/* Current Status */}
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('recurring.currentStatus', 'מצב נוכחי')}
                        </Typography>
                        <Box display="flex" gap={2} flexWrap="wrap" mt={1}>
                          <Chip 
                            icon={<CheckCircleIcon />}
                            label={`${createdItems} ${t('recurring.created', 'נוצרו')}`}
                            color="success"
                            variant="outlined"
                          />
                          {!isAutoRepayment && (
                            <Chip 
                              icon={<ScheduleIcon />}
                              label={`${monthsRemaining} ${t('recurring.remaining', 'נותרו')}`}
                              color="warning"
                              variant="outlined"
                            />
                          )}
                          <Chip 
                            label={`${t('recurring.dayOfMonth', 'יום')}: ${formData.recurring_day}`}
                            variant="outlined"
                          />
                          <Chip 
                            label={`${t('recurring.amount', 'סכום')}: ₪${formData.recurring_amount.toLocaleString('he-IL')}`}
                            variant="outlined"
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </TabPanel>

              {/* History Tab */}
              <TabPanel value={tabValue} index={1}>
                {seriesItems.length === 0 ? (
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
              </TabPanel>
            </>
          )}
        </DialogContent>

        <DialogActions>
          {editMode ? (
            <>
              <Button onClick={handleCancelEdit} disabled={loading}>
                {t('common.cancel', 'ביטול')}
              </Button>
              <Button 
                onClick={handleSave} 
                variant="contained" 
                disabled={loading}
                color="primary"
              >
                {loading ? <CircularProgress size={24} /> : t('common.save', 'שמור שינויים')}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              {t('common.close', 'סגור')}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {showConfirm && updateSummary && (
        <ConfirmUpdateDialog
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleConfirm}
          changes={updateSummary}
          loading={loading}
        />
      )}
    </>
  )
}
