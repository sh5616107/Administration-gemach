import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Autocomplete,
  TextField,
  Button,
  Typography,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  Description as DocIcon,
  History as HistoryIcon,
  Autorenew as AutorenewIcon,
  EditNote as EditNoteIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  AccountBalanceWallet as DepositIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material';
import { db, depositWithdrawalsService } from '../services/database';
import { generateDepositorReport, openEmailWithDocument, createDepositorReportEmailData, EmailProvider } from '../services/documents';
import { useSettings } from '../hooks/useSettings';
import DepositorSidePanel from '../components/donations/DepositorSidePanel';
import DepositSidePanel from '../components/donations/DepositSidePanel';

interface Depositor {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  id_number: string;
  address: string;
  email: string;
  notes: string;
  created_at: string;
  total_deposits?: number;
  active_deposits?: number;
}

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
  withdrawal_date?: string;
  withdrawn_amount?: number;
  withdrawal_payment_method?: string;
  withdrawal_payment_details?: string;
}

/**
 * Unified Deposits Page — depositor profile (right, in RTL) + deposits as cards (left).
 * Based on UnifiedLoansPage design pattern.
 */
export default function Deposits() {
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [depositors, setDepositors] = useState<Depositor[]>([]);
  const [selectedDepositor, setSelectedDepositor] = useState<Depositor | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loadingDeposits, setLoadingDeposits] = useState(false);

  // Map of deposit ID to recurring info
  const [depositRecurringInfo, setDepositRecurringInfo] = useState<Map<string, any>>(new Map());

  // Side panel state
  const [depositPanelOpen, setDepositPanelOpen] = useState(false);
  const [activeDeposit, setActiveDeposit] = useState<Deposit | null>(null);

  // Depositor edit panel
  const [depositorPanelOpen, setDepositorPanelOpen] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'withdrawn',
    periodType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });

  useEffect(() => {
    loadDepositors();
  }, []);

  // Handle URL params for depositor/deposit selection
  useEffect(() => {
    const depositorId = searchParams.get('depositor');
    const depositId = searchParams.get('deposit');
    
    if (depositorId && depositors.length > 0) {
      const depositor = depositors.find(d => d.id.toString() === depositorId);
      if (depositor) {
        setSelectedDepositor(depositor);
        
        // If also depositId, open that deposit after loading
        if (depositId) {
          setTimeout(() => {
            loadDepositsForDepositor(depositor.id).then(() => {
              // Find and open the specific deposit
              const deposit = deposits.find(d => d.id.toString() === depositId);
              if (deposit) {
                handleOpenDeposit(deposit);
              }
            });
          }, 100);
        }
      }
      // Clear params after handling
      setSearchParams({});
    }
  }, [searchParams, depositors]);

  useEffect(() => {
    if (selectedDepositor) {
      loadDepositsForDepositor(selectedDepositor.id);
    } else {
      setDeposits([]);
    }
  }, [selectedDepositor]);

  const loadDepositors = async (selectDepositorId?: string) => {
    try {
      const deps = await db.query('SELECT * FROM depositors') as Depositor[];
      
      // חישוב סה"כ הפקדות לכל מפקיד
      const deposits = await db.query('SELECT * FROM deposits') as Deposit[];
      
      const depositorsWithStats = await Promise.all(deps.map(async dep => {
        const depositorDeposits = deposits.filter(d => d.depositor_id === dep.id);
        
        let totalDeposited = 0;
        let totalActive = 0;
        
        for (const deposit of depositorDeposits) {
          let depositAmount = deposit.amount;
          if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
            depositAmount = deposit.amount * deposit.recurring_deposit_number;
          }
          
          totalDeposited += depositAmount;
          
          if (deposit.status === 'active' || deposit.status === 'planned') {
            const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id);
            const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
            const remaining = depositAmount - totalWithdrawn;
            if (remaining > 0) {
              totalActive += remaining;
            }
          }
        }
        
        return {
          ...dep,
          total_deposits: totalDeposited,
          active_deposits: totalActive,
        };
      }));
      
      setDepositors(depositorsWithStats.sort((a, b) => 
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
      ));
      
      // Empty string = depositor was deleted, clear selection
      if (selectDepositorId === '') {
        setSelectedDepositor(null);
        return;
      }

      // If selectDepositorId provided, select it
      if (selectDepositorId) {
        const newDepositor = depositorsWithStats.find(d => d.id === parseInt(selectDepositorId));
        if (newDepositor) {
          setSelectedDepositor(newDepositor);
        }
      }
      // If a depositor is already selected, update it
      else if (selectedDepositor) {
        const updatedDepositor = depositorsWithStats.find(d => d.id === selectedDepositor.id);
        if (updatedDepositor) {
          setSelectedDepositor(updatedDepositor);
        }
      }
    } catch (error) {
      console.error('Error loading depositors:', error);
    }
  };

  const loadDepositsForDepositor = async (depositorId: number) => {
    setLoadingDeposits(true);
    try {
      const data = await db.query('SELECT * FROM deposits WHERE depositor_id = ?', [depositorId]) as Deposit[];
      // Sort newest first
      const sorted = [...data].sort(
        (a, b) => new Date(b.deposit_date).getTime() - new Date(a.deposit_date).getTime()
      );
      
      // Load withdrawal info for each deposit
      const depositsWithWithdrawals = await Promise.all(
        sorted.map(async (deposit) => {
          const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id);
          const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
          return {
            ...deposit,
            withdrawn_amount: totalWithdrawn
          };
        })
      );
      
      setDeposits(depositsWithWithdrawals);
    } catch (error) {
      console.error('Error loading deposits:', error);
    } finally {
      setLoadingDeposits(false);
    }
  };

  const stats = useMemo(() => {
    let total = 0;
    let withdrawn = 0;
    let activeCount = 0;
    let withdrawnCount = 0;
    
    deposits.forEach((d) => {
      let depositAmount = d.amount;
      if (d.is_recurring === 1 && d.recurring_deposit_number) {
        depositAmount = d.amount * d.recurring_deposit_number;
      }
      
      total += depositAmount;
      const withdrewAmount = d.withdrawn_amount || 0;
      withdrawn += withdrewAmount;
      
      if (depositAmount - withdrewAmount > 0) {
        activeCount++;
      } else {
        withdrawnCount++;
      }
    });
    
    return { total, withdrawn, balance: total - withdrawn, activeCount, withdrawnCount };
  }, [deposits]);

  // Filtered deposits
  const filteredDeposits = useMemo(() => {
    return deposits.filter(deposit => {
      let depositAmount = deposit.amount;
      if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
        depositAmount = deposit.amount * deposit.recurring_deposit_number;
      }
      
      const balance = depositAmount - (deposit.withdrawn_amount ?? 0);
      const isWithdrawn = balance <= 0;

      // Date filter
      if (filters.dateFrom && deposit.deposit_date < filters.dateFrom) return false;
      if (filters.dateTo && deposit.deposit_date > filters.dateTo) return false;

      // Amount filter
      if (filters.amountFrom && deposit.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && deposit.amount > parseFloat(filters.amountTo)) return false;

      // Status filter
      if (filters.status === 'active' && isWithdrawn) return false;
      if (filters.status === 'withdrawn' && !isWithdrawn) return false;

      // Period type filter
      if (filters.periodType !== 'all' && deposit.period_type !== filters.periodType) return false;

      // Recurring filter
      if (filters.isRecurring === 'yes' && deposit.is_recurring !== 1) return false;
      if (filters.isRecurring === 'no' && deposit.is_recurring === 1) return false;

      return true;
    });
  }, [deposits, filters]);

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo || 
    filters.status !== 'all' || filters.periodType !== 'all' || filters.isRecurring !== 'all';

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
      status: 'all',
      periodType: 'all',
      isRecurring: 'all',
    });
  };

  const handleOpenNewDeposit = () => {
    setActiveDeposit(null);
    setDepositPanelOpen(true);
  };

  const handleOpenDeposit = (deposit: Deposit) => {
    setActiveDeposit(deposit);
    setDepositPanelOpen(true);
  };

  const handleDepositSaved = () => {
    if (selectedDepositor) loadDepositsForDepositor(selectedDepositor.id);
    setDepositPanelOpen(false);
  };

  const handleDeleteDeposit = async (deposit: Deposit) => {
    if (!deposit.id) return;
    
    // Check if deposit has withdrawals
    if ((deposit.withdrawn_amount || 0) > 0) {
      setSnackbar({ open: true, message: 'לא ניתן למחוק הפקדה שיש לה משיכות', severity: 'error' });
      return;
    }
    
    if (!confirm('האם למחוק את ההפקדה?')) return;

    try {
      await db.run('DELETE FROM deposits WHERE id = ?', [deposit.id]);
      setSnackbar({ open: true, message: 'ההפקדה נמחקה', severity: 'success' });
      if (selectedDepositor) loadDepositsForDepositor(selectedDepositor.id);
    } catch (error) {
      console.error('Error deleting deposit:', error);
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' });
    }
  };

  const formatCurrency = (amount: number) => `₪${amount.toLocaleString()}`;

  return (
    <Box>
      {/* Top bar — depositor search + add depositor */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              options={depositors}
              value={selectedDepositor}
              getOptionLabel={(d) => `${d.first_name} ${d.last_name}`}
              onChange={(_, value) => setSelectedDepositor(value)}
              renderOption={(props, d) => (
                <li {...props} key={d.id}>
                  <Box>
                    <Box sx={{ fontWeight: 500 }}>
                      {d.first_name} {d.last_name}
                    </Box>
                    <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      {d.phone}
                      {d.address && ` • ${d.address}`}
                    </Box>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} placeholder="חיפוש מפקיד לפי שם, טלפון, ת.ז..." fullWidth />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              fullWidth
              variant="contained"
              startIcon={selectedDepositor ? <EditIcon /> : <AddIcon />}
              onClick={() => setDepositorPanelOpen(true)}
            >
              {selectedDepositor ? 'ערוך פרטי המפקיד' : 'הוסף מפקיד חדש'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Split view: profile (right) + deposits-as-cards (left) */}
      {selectedDepositor ? (
        <Grid container spacing={2}>
          {/* Deposits — Cards, 70% */}
          <Grid item xs={12} md={8} order={{ xs: 2, md: 1 }}>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">הפקדות המפקיד</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant={hasActiveFilters ? 'contained' : 'outlined'}
                    color={hasActiveFilters ? 'secondary' : 'inherit'}
                    startIcon={filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    size="small"
                  >
                    סינון {hasActiveFilters && `(${filteredDeposits.length}/${deposits.length})`}
                  </Button>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewDeposit}>
                    הפקדה חדשה
                  </Button>
                </Stack>
              </Box>

              {/* Filters Panel */}
              <Collapse in={filtersOpen}>
                <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="מתאריך"
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="עד תאריך"
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="סכום מינימום"
                        type="number"
                        value={filters.amountFrom}
                        onChange={(e) => setFilters({ ...filters, amountFrom: e.target.value })}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="סכום מקסימום"
                        type="number"
                        value={filters.amountTo}
                        onChange={(e) => setFilters({ ...filters, amountTo: e.target.value })}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>סטטוס</InputLabel>
                        <Select
                          value={filters.status}
                          label="סטטוס"
                          onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                        >
                          <MenuItem value="all">הכל</MenuItem>
                          <MenuItem value="active">פעילה</MenuItem>
                          <MenuItem value="withdrawn">נמשכה</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>סוג תקופה</InputLabel>
                        <Select
                          value={filters.periodType}
                          label="סוג תקופה"
                          onChange={(e) => setFilters({ ...filters, periodType: e.target.value as any })}
                        >
                          <MenuItem value="all">הכל</MenuItem>
                          <MenuItem value="flexible">גמישה</MenuItem>
                          <MenuItem value="fixed">קבועה</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>מחזורית</InputLabel>
                        <Select
                          value={filters.isRecurring}
                          label="מחזורית"
                          onChange={(e) => setFilters({ ...filters, isRecurring: e.target.value as any })}
                        >
                          <MenuItem value="all">הכל</MenuItem>
                          <MenuItem value="yes">כן</MenuItem>
                          <MenuItem value="no">לא</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                      >
                        נקה סינון
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>
              </Collapse>

              {loadingDeposits ? (
                <Typography color="text.secondary">טוען הפקדות…</Typography>
              ) : filteredDeposits.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    {hasActiveFilters ? 'לא נמצאו הפקדות התואמות לסינון' : 'אין הפקדות למפקיד זה עדיין.'}
                  </Typography>
                  {hasActiveFilters && (
                    <Button variant="text" onClick={clearFilters} sx={{ mt: 1 }}>
                      נקה סינון
                    </Button>
                  )}
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {filteredDeposits.map((deposit) => {
                    let depositAmount = deposit.amount;
                    if (deposit.is_recurring === 1 && deposit.recurring_deposit_number) {
                      depositAmount = deposit.amount * deposit.recurring_deposit_number;
                    }
                    const withdrawn = deposit.withdrawn_amount || 0;
                    const balance = depositAmount - withdrawn;
                    
                    return (
                      <Grid item xs={12} sm={6} key={deposit.id}>
                        <Box 
                          sx={{ 
                            position: 'relative',
                            '&:hover .action-buttons': {
                              opacity: 1,
                            }
                          }}
                        >
                          {/* Deposit Card */}
                          <Paper
                            elevation={balance <= 0 ? 1 : 3}
                            onClick={() => handleOpenDeposit(deposit)}
                            sx={{
                              p: 2,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              borderLeft: balance <= 0 ? '4px solid #9e9e9e' : '4px solid #2196f3',
                              opacity: balance <= 0 ? 0.7 : 1,
                              '&:hover': {
                                transform: 'translateY(-2px)',
                                boxShadow: 4,
                              },
                            }}
                          >
                            <Stack spacing={1.5}>
                              {/* Header: Amount and Status */}
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box>
                                  <Typography variant="h5" fontWeight="bold" color={balance <= 0 ? 'text.secondary' : 'primary'}>
                                    {formatCurrency(depositAmount)}
                                  </Typography>
                                  {deposit.is_recurring === 1 && (
                                    <Chip
                                      label={`מחזורית ${deposit.recurring_deposit_number || 1}/${deposit.recurring_deposit_count || '∞'}`}
                                      size="small"
                                      color="info"
                                      icon={<AutorenewIcon />}
                                      sx={{ mt: 0.5 }}
                                    />
                                  )}
                                </Box>
                                <Chip
                                  label={balance <= 0 ? 'נמשכה' : 'פעילה'}
                                  color={balance <= 0 ? 'default' : 'success'}
                                  size="small"
                                />
                              </Box>

                              <Divider />

                              {/* Details */}
                              <Stack spacing={0.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    תאריך הפקדה:
                                  </Typography>
                                  <Typography variant="body2" fontWeight={500}>
                                    {new Date(deposit.deposit_date).toLocaleDateString('he-IL')}
                                  </Typography>
                                </Box>
                                
                                {withdrawn > 0 && (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" color="text.secondary">
                                      נמשך:
                                    </Typography>
                                    <Typography variant="body2" color="error.main" fontWeight={500}>
                                      {formatCurrency(withdrawn)}
                                    </Typography>
                                  </Box>
                                )}
                                
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    יתרה:
                                  </Typography>
                                  <Typography 
                                    variant="body2" 
                                    fontWeight="bold" 
                                    color={balance > 0 ? 'success.main' : 'text.disabled'}
                                  >
                                    {formatCurrency(balance)}
                                  </Typography>
                                </Box>
                                
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2" color="text.secondary">
                                    סוג:
                                  </Typography>
                                  <Typography variant="body2">
                                    {deposit.period_type === 'flexible' ? 'גמישה' : 'קבועה'}
                                    {deposit.due_date && ` • ${new Date(deposit.due_date).toLocaleDateString('he-IL')}`}
                                  </Typography>
                                </Box>
                              </Stack>

                              {deposit.notes && (
                                <>
                                  <Divider />
                                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    {deposit.notes}
                                  </Typography>
                                </>
                              )}
                            </Stack>
                          </Paper>

                          {/* Action buttons overlay - shown on hover */}
                          <Stack
                            className="action-buttons"
                            direction="row"
                            spacing={0.5}
                            sx={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              zIndex: 10,
                              opacity: 0,
                              transition: 'opacity 0.2s',
                              bgcolor: 'rgba(255, 255, 255, 0.95)',
                              borderRadius: 1,
                              padding: 0.5,
                              boxShadow: 2,
                            }}
                          >
                            {deposit.is_recurring === 1 && deposit.recurring_deposit_number === 1 && (
                              <Tooltip title="נהל הפקדה מחזורית">
                                <IconButton
                                  size="small"
                                  color="info"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // TODO: Implement recurring deposit management
                                  }}
                                  sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                                >
                                  <AutorenewIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            
                            {/* Withdraw button - only for active deposits with balance */}
                            {balance > 0 && (
                              <Tooltip title="משיכה">
                                <IconButton
                                  size="small"
                                  color="warning"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // TODO: Implement withdraw dialog
                                  }}
                                  sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                                >
                                  <PaymentIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            
                            <Tooltip title="עריכה">
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDeposit(deposit);
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            <Tooltip title="היסטוריית משיכות">
                              <IconButton
                                size="small"
                                color="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // TODO: Show withdrawal history
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                <HistoryIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            <Tooltip title="מחק">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteDeposit(deposit);
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </Box>
                      </Grid>
                    );
                  })}
                </Grid>
              )}

              {/* Side panel for create/edit deposit */}
              <DepositSidePanel
                open={depositPanelOpen}
                deposit={activeDeposit}
                depositor={selectedDepositor}
                onClose={() => setDepositPanelOpen(false)}
                onSaved={handleDepositSaved}
              />
            </Paper>
          </Grid>

          {/* Depositor Profile — 30% */}
          <Grid item xs={12} md={4} order={{ xs: 1, md: 2 }}>
            <Paper sx={{ p: 2, position: 'sticky', top: 16 }}>
              <Stack spacing={2}>
                {/* Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <DepositIcon color="primary" />
                  <Typography variant="h6">פרטי המפקיד</Typography>
                </Box>

                <Divider />

                {/* Name */}
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {selectedDepositor.first_name} {selectedDepositor.last_name}
                  </Typography>
                </Box>

                {/* Contact Info */}
                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PhoneIcon fontSize="small" color="action" />
                    <Typography>{selectedDepositor.phone}</Typography>
                  </Box>
                  {selectedDepositor.address && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationIcon fontSize="small" color="action" />
                      <Typography>{selectedDepositor.address}</Typography>
                    </Box>
                  )}
                  {selectedDepositor.email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon fontSize="small" color="action" />
                      <Typography>{selectedDepositor.email}</Typography>
                    </Box>
                  )}
                  {selectedDepositor.id_number && (
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        ת.ז: {selectedDepositor.id_number}
                      </Typography>
                    </Box>
                  )}
                </Stack>

                <Divider />

                {/* Stats */}
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    סטטיסטיקות
                  </Typography>
                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'success.50' }}>
                        <Typography variant="body2" color="text.secondary">
                          הפקדות פעילות
                        </Typography>
                        <Typography variant="h6" color="success.main">
                          {stats.activeCount}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'grey.50' }}>
                        <Typography variant="body2" color="text.secondary">
                          נמשכו
                        </Typography>
                        <Typography variant="h6" color="text.secondary">
                          {stats.withdrawnCount}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'info.50' }}>
                        <Typography variant="body2" color="text.secondary">
                          סה"כ הופקד
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="info.main">
                          {formatCurrency(stats.total)}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'error.50' }}>
                        <Typography variant="body2" color="text.secondary">
                          נמשך
                        </Typography>
                        <Typography variant="h6" color="error.main">
                          {formatCurrency(stats.withdrawn)}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12}>
                      <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center', bgcolor: 'primary.50' }}>
                        <Typography variant="body2" color="text.secondary">
                          יתרה פעילה
                        </Typography>
                        <Typography variant="h4" fontWeight="bold" color="primary.main">
                          {formatCurrency(stats.balance)}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>

                {selectedDepositor.notes && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        הערות
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {selectedDepositor.notes}
                      </Typography>
                    </Box>
                  </>
                )}

                <Divider />

                {/* Actions */}
                <Stack spacing={1}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="secondary"
                    startIcon={<DocIcon />}
                    onClick={async () => {
                      if (!selectedDepositor) return;
                      
                      try {
                        // Prepare deposits data with withdrawals
                        const depositsWithDetails = await Promise.all(
                          deposits.map(async (dep, index) => {
                            const withdrawals = await depositWithdrawalsService.getByDeposit(dep.id);
                            const withdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
                            const remaining = dep.amount - withdrawn;
                            
                            return {
                              ...dep,
                              id: index + 1, // Use sequential number instead of UUID
                              withdrawals: withdrawals.map(w => ({
                                amount: w.amount,
                                withdrawal_date: w.withdrawal_date
                              })),
                              withdrawn_amount: withdrawn,
                              remaining: remaining
                            };
                          })
                        );
                        
                        const totalActive = depositsWithDetails
                          .filter(d => d.remaining > 0)
                          .reduce((sum, d) => sum + d.remaining, 0);
                        const totalWithdrawn = depositsWithDetails
                          .reduce((sum, d) => sum + (d.withdrawn_amount || 0), 0);
                        
                        // Generate and print report (opens print dialog)
                        generateDepositorReport({
                          gemachName: settings.gemach_name || 'גמ"ח',
                          gemachLogo: settings.gemach_logo,
                          depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
                          depositorPhone: selectedDepositor.phone,
                          depositorIdNumber: selectedDepositor.id_number,
                          deposits: depositsWithDetails,
                          totalActive,
                          totalWithdrawn,
                          dateFormat: settings.date_format
                        });
                        
                        setSnackbar({ open: true, message: 'הדו"ח הופק בהצלחה', severity: 'success' });
                      } catch (error) {
                        console.error('Error generating report:', error);
                        setSnackbar({ open: true, message: 'שגיאה בהפקת דו"ח', severity: 'error' });
                      }
                    }}
                  >
                    הפק דו"ח
                  </Button>
                  {selectedDepositor.email && (
                    <Button
                      fullWidth
                      variant="outlined"
                      color="info"
                      startIcon={<EmailIcon />}
                      onClick={() => {
                        // TODO: Send report by email
                      }}
                    >
                      שלח דו"ח במייל
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DepositIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            בחר מפקיד כדי להתחיל
          </Typography>
          <Typography variant="body2" color="text.secondary">
            חפש מפקיד קיים בחלון החיפוש למעלה או הוסף מפקיד חדש
          </Typography>
        </Paper>
      )}

      {/* Depositor Edit Panel */}
      <DepositorSidePanel
        open={depositorPanelOpen}
        depositor={selectedDepositor}
        onClose={() => setDepositorPanelOpen(false)}
        onSaved={(id) => {
          loadDepositors(id);
          setDepositorPanelOpen(false);
        }}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
