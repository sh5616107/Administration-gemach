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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
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
  Download as DownloadIcon,
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
import { confirmAction } from '../utils/confirmDialog';
import { generateDepositorReport, generateDepositDocument, openEmailWithDocument, createDepositorReportEmailData, EmailProvider } from '../services/documents';
import { useSettings } from '../hooks/useSettings';
import { getDocumentLayout } from '../utils/documentLayoutHelper';
import DepositorSidePanel from '../components/donations/DepositorSidePanel';
import DepositSidePanel from '../components/donations/DepositSidePanel';
import { EditRecurringDialog } from '../components/recurring/EditRecurringDialog';
import PaymentMethodSelect, { PaymentMethodData } from '../components/PaymentMethodSelect';
import AmountInput from '../components/AmountInput';

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
  const depositReceiptLayout = getDocumentLayout(settings.document_layouts, 'depositReceipt');
  const depositorReportLayout = getDocumentLayout(settings.document_layouts, 'depositorReport');
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
  // true => panel is creating a brand-new depositor, regardless of which
  // depositor (if any) is currently selected. Lets you add a new depositor
  // while another depositor's page is open, without clearing the search field.
  const [creatingNewDepositor, setCreatingNewDepositor] = useState(false);

  // Withdraw dialog state
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawingDeposit, setWithdrawingDeposit] = useState<Deposit | null>(null);
  const [withdrawPaymentMethod, setWithdrawPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' });
  const [withdrawAmount, setWithdrawAmount] = useState(0);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Withdrawal history dialog state
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedDepositForHistory, setSelectedDepositForHistory] = useState<Deposit | null>(null);
  const [withdrawalHistory, setWithdrawalHistory] = useState<any[]>([]);
  const [manageRecurringDialogOpen, setManageRecurringDialogOpen] = useState(false);
  const [selectedRecurringDepositId, setSelectedRecurringDepositId] = useState<number | null>(null);

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
          // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
          // recurring deposit row is its own independent monthly contribution
          // (matching expectedFundsCalculator.ts and how recurring loans already
          // work) - multiplying inflated every row's displayed value by its own
          // position in the series, so month 2 showed 44 (=22*2) alongside month
          // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
          
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
      // NOTE: depositor ids are UUID strings (see generateId() in services/database.ts),
      // not numbers — comparing with parseInt(selectDepositorId) never matched anything,
      // which is why creating a new depositor never navigated to their page. Compare as
      // strings instead, the same way loadBorrowers() does in UnifiedLoansPage.tsx.
      if (selectDepositorId) {
        const newDepositor = depositorsWithStats.find(d => String(d.id) === String(selectDepositorId));
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
      // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
      // recurring deposit row is its own independent monthly contribution
      // (matching expectedFundsCalculator.ts and how recurring loans already
      // work) - multiplying inflated every row's displayed value by its own
      // position in the series, so month 2 showed 44 (=22*2) alongside month
      // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
      
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
      // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
      // recurring deposit row is its own independent monthly contribution
      // (matching expectedFundsCalculator.ts and how recurring loans already
      // work) - multiplying inflated every row's displayed value by its own
      // position in the series, so month 2 showed 44 (=22*2) alongside month
      // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
      
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
    
    if (!(await confirmAction('האם למחוק את ההפקדה?'))) return;

    try {
      await db.run('DELETE FROM deposits WHERE id = ?', [deposit.id]);
      setSnackbar({ open: true, message: 'ההפקדה נמחקה', severity: 'success' });
      if (selectedDepositor) loadDepositsForDepositor(selectedDepositor.id);
    } catch (error) {
      console.error('Error deleting deposit:', error);
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' });
    }
  };

  const handleWithdraw = async (deposit: Deposit) => {
    // חישוב היתרה הזמינה למשיכה מההיסטוריה
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id);
    const alreadyWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);

    // חישוב סכום הפקדה בפועל (כולל הפקדות מחזוריות) - עקבי עם תצוגת הכרטיס
    let depositAmount = deposit.amount;
    // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
    // recurring deposit row is its own independent monthly contribution
    // (matching expectedFundsCalculator.ts and how recurring loans already
    // work) - multiplying inflated every row's displayed value by its own
    // position in the series, so month 2 showed 44 (=22*2) alongside month
    // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
    const availableToWithdraw = depositAmount - alreadyWithdrawn;

    if (availableToWithdraw <= 0) {
      setSnackbar({ open: true, message: 'כל הסכום כבר נמשך', severity: 'error' });
      return;
    }

    setWithdrawingDeposit({ ...deposit, amount: depositAmount, withdrawn_amount: alreadyWithdrawn });
    setWithdrawPaymentMethod({ payment_method: '' });
    setWithdrawAmount(availableToWithdraw); // ברירת מחדל: כל היתרה
    setWithdrawDialogOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawingDeposit) return;
    
    // מניעת הגשה כפולה
    if (isWithdrawing) return;
    setIsWithdrawing(true);

    try {
      // ולידציה - חישוב מחדש מההיסטוריה
      const withdrawals = await depositWithdrawalsService.getByDeposit(withdrawingDeposit.id);
      const alreadyWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
      const availableToWithdraw = withdrawingDeposit.amount - alreadyWithdrawn;

      if (withdrawAmount <= 0) {
        setSnackbar({ open: true, message: 'נא להזין סכום למשיכה', severity: 'error' });
        return;
      }

      if (withdrawAmount > availableToWithdraw) {
        setSnackbar({ open: true, message: `לא ניתן למשוך יותר מ-${formatCurrency(availableToWithdraw)}`, severity: 'error' });
        return;
      }

      const withdrawalDate = new Date().toISOString().split('T')[0];

      // יצירת רשומת משיכה חדשה
      await depositWithdrawalsService.create({
        deposit_id: withdrawingDeposit.id,
        amount: withdrawAmount,
        withdrawal_date: withdrawalDate,
        payment_method: withdrawPaymentMethod.payment_method,
        payment_details: JSON.stringify(withdrawPaymentMethod),
        notes: ''
      });

      // עדכון סטטוס ההפקדה ופרטי המשיכה
      const totalWithdrawn = alreadyWithdrawn + withdrawAmount;
      const newStatus = totalWithdrawn >= withdrawingDeposit.amount ? 'withdrawn' : 'active';

      await db.run(
        'UPDATE deposits SET status = ?, withdrawal_date = ?, withdrawn_amount = ?, withdrawal_payment_method = ?, withdrawal_payment_details = ? WHERE id = ?',
        [newStatus, withdrawalDate, totalWithdrawn, withdrawPaymentMethod.payment_method, JSON.stringify(withdrawPaymentMethod), withdrawingDeposit.id]
      );

      const message = newStatus === 'withdrawn'
        ? 'המשיכה בוצעה - ההפקדה נסגרה'
        : `נמשכו ${formatCurrency(withdrawAmount)} - נותרו ${formatCurrency(withdrawingDeposit.amount - totalWithdrawn)}`;

      setSnackbar({ open: true, message, severity: 'success' });
      setWithdrawDialogOpen(false);
      setWithdrawingDeposit(null);
      if (selectedDepositor) loadDepositsForDepositor(selectedDepositor.id);
    } catch (error) {
      console.error('Error withdrawing:', error);
      setSnackbar({ open: true, message: 'שגיאה במשיכה', severity: 'error' });
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleShowHistory = async (deposit: Deposit) => {
    const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id);
    setWithdrawalHistory(withdrawals);
    setSelectedDepositForHistory(deposit);
    setHistoryDialogOpen(true);
  };

  // BUG FIX: a deposit that has any withdrawals could never be deleted
  // (see handleDeleteDeposit), but until now there was no way to remove a
  // withdrawal record either — depositWithdrawalsService.delete() existed in
  // the service layer but was never called from any screen, so a fully- or
  // partially-withdrawn deposit was permanently stuck. This wires up a delete
  // action from the withdrawal-history dialog itself.
  const handleDeleteWithdrawal = async (withdrawal: any) => {
    if (!selectedDepositForHistory) return;

    if (!(await confirmAction('האם למחוק את רשומת המשיכה? הפעולה תשחזר את הסכום להפקדה.'))) return;

    try {
      await depositWithdrawalsService.delete(withdrawal.id);
      setSnackbar({ open: true, message: 'רשומת המשיכה נמחקה', severity: 'success' });

      // Refresh the history dialog itself
      const refreshedWithdrawals = await depositWithdrawalsService.getByDeposit(selectedDepositForHistory.id);
      setWithdrawalHistory(refreshedWithdrawals);

      // Refresh the deposits list so the withdrawn/remaining amounts and the
      // delete-blocking check reflect the removed withdrawal
      if (selectedDepositor) await loadDepositsForDepositor(selectedDepositor.id);
    } catch (error) {
      console.error('Error deleting withdrawal:', error);
      setSnackbar({ open: true, message: 'שגיאה במחיקת רשומת המשיכה', severity: 'error' });
    }
  };

  const handleGenerateDepositReceipt = async (deposit: Deposit) => {
    if (!selectedDepositor) return;

    try {
      const withdrawals = await depositWithdrawalsService.getByDeposit(deposit.id);

      await generateDepositDocument({
        gemachName: settings.gemach_name || 'גמ"ח',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
        amount: deposit.amount,
        depositDate: deposit.deposit_date,
        periodType: deposit.period_type,
        dueDate: deposit.due_date,
        dateFormat: settings.date_format,
        isRecurring: deposit.is_recurring === 1,
        recurringDepositNumber: deposit.recurring_deposit_number,
        recurringDepositCount: deposit.recurring_deposit_count,
        withdrawals: withdrawals.map(w => ({ amount: w.amount, withdrawal_date: w.withdrawal_date })),
      }, depositReceiptLayout);

      setSnackbar({ open: true, message: 'הקבלה הופקה בהצלחה', severity: 'success' });
    } catch (error) {
      console.error('Error generating deposit receipt:', error);
      setSnackbar({ open: true, message: 'שגיאה בהפקת הקבלה', severity: 'error' });
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
              openOnFocus
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
                <TextField {...params} placeholder="חיפוש מפקיד לפי שם, טלפון, ת.ז... (או לחצו לרשימה המלאה)" fullWidth autoFocus />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant={selectedDepositor ? 'outlined' : 'contained'}
                startIcon={<AddIcon />}
                onClick={() => {
                  setCreatingNewDepositor(true);
                  setDepositorPanelOpen(true);
                }}
              >
                מפקיד חדש
              </Button>
              {selectedDepositor && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setCreatingNewDepositor(false);
                    setDepositorPanelOpen(true);
                  }}
                >
                  ערוך פרטי המפקיד
                </Button>
              )}
            </Stack>
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
                    // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
                    // recurring deposit row is its own independent monthly contribution
                    // (matching expectedFundsCalculator.ts and how recurring loans already
                    // work) - multiplying inflated every row's displayed value by its own
                    // position in the series, so month 2 showed 44 (=22*2) alongside month
                    // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
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
                                    setSelectedRecurringDepositId(deposit.id);
                                    setManageRecurringDialogOpen(true);
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
                                    handleWithdraw(deposit);
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

                            <Tooltip title={depositReceiptLayout?.frame ? 'הפק והורד שטר (PDF עם מסגרת)' : 'הדפס קבלה'}>
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateDepositReceipt(deposit);
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                {depositReceiptLayout?.frame ? <DownloadIcon fontSize="small" /> : <DocIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                            
                            <Tooltip title="היסטוריית משיכות">
                              <IconButton
                                size="small"
                                color="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShowHistory(deposit);
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
                        await generateDepositorReport({
                          gemachName: settings.gemach_name || 'גמ"ח',
                          gemachLogo: settings.gemach_logo,
                          gemachDocumentFrame: settings.gemach_document_frame,
                          frameMarginTop: settings.gemach_frame_margin_top,
                          frameMarginBottom: settings.gemach_frame_margin_bottom,
                          frameMarginRight: settings.gemach_frame_margin_right,
                          frameMarginLeft: settings.gemach_frame_margin_left,
                          depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
                          depositorPhone: selectedDepositor.phone,
                          depositorIdNumber: selectedDepositor.id_number,
                          deposits: depositsWithDetails,
                          totalActive,
                          totalWithdrawn,
                          dateFormat: settings.date_format
                        }, depositorReportLayout);
                        
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
                      onClick={async () => {
                        if (!selectedDepositor) return;

                        try {
                          // Prepare deposits data with withdrawals (same calculation as the report)
                          const depositsWithDetails = await Promise.all(
                            deposits.map(async (dep) => {
                              const withdrawals = await depositWithdrawalsService.getByDeposit(dep.id);
                              const withdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);
                              let depositAmount = dep.amount;
                              // BUG FIX: removed `* recurring_deposit_number` multiplication. Each
                              // recurring deposit row is its own independent monthly contribution
                              // (matching expectedFundsCalculator.ts and how recurring loans already
                              // work) - multiplying inflated every row's displayed value by its own
                              // position in the series, so month 2 showed 44 (=22*2) alongside month
                              // 1's own 22, month 3 showed 66, etc. instead of each showing its own 22.
                              return {
                                ...dep,
                                withdrawals: withdrawals.map(w => ({
                                  amount: w.amount,
                                  withdrawal_date: w.withdrawal_date,
                                })),
                                withdrawn_amount: withdrawn,
                                remaining: depositAmount - withdrawn,
                              };
                            })
                          );

                          const totalActive = depositsWithDetails
                            .filter(d => d.remaining > 0)
                            .reduce((sum, d) => sum + d.remaining, 0);
                          const totalWithdrawn = depositsWithDetails
                            .reduce((sum, d) => sum + (d.withdrawn_amount || 0), 0);

                          const emailData = createDepositorReportEmailData({
                            gemachName: settings.gemach_name || 'גמ"ח',
                            gemachLogo: settings.gemach_logo,
                            gemachDocumentFrame: settings.gemach_document_frame,
                            frameMarginTop: settings.gemach_frame_margin_top,
                            frameMarginBottom: settings.gemach_frame_margin_bottom,
                            frameMarginRight: settings.gemach_frame_margin_right,
                            frameMarginLeft: settings.gemach_frame_margin_left,
                            depositorName: `${selectedDepositor.first_name} ${selectedDepositor.last_name}`,
                            depositorPhone: selectedDepositor.phone,
                            depositorIdNumber: selectedDepositor.id_number,
                            depositorEmail: selectedDepositor.email,
                            deposits: depositsWithDetails,
                            totalActive,
                            totalWithdrawn,
                            dateFormat: settings.date_format,
                          }, depositorReportLayout);

                          const provider = (settings.email_provider || 'gmail') as EmailProvider;
                          const result = await openEmailWithDocument(emailData, provider);
                          setSnackbar({
                            open: true,
                            message: result.message,
                            severity: result.success ? 'success' : 'error',
                          });
                        } catch (error) {
                          console.error('Error sending email:', error);
                          setSnackbar({ open: true, message: 'שגיאה בשליחת המייל', severity: 'error' });
                        }
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

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onClose={() => setWithdrawDialogOpen(false)}>
        <DialogTitle>משיכת הפקדה</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {withdrawingDeposit && (
              <>
                <Typography sx={{ mb: 1 }}>
                  סכום הפקדה: {formatCurrency(withdrawingDeposit.amount)}
                </Typography>
                {(withdrawingDeposit.withdrawn_amount || 0) > 0 && (
                  <Typography sx={{ mb: 1 }} color="warning.main">
                    כבר נמשך: {formatCurrency(withdrawingDeposit.withdrawn_amount || 0)}
                  </Typography>
                )}
                <Typography sx={{ mb: 2 }} color="success.main" fontWeight="bold">
                  זמין למשיכה: {formatCurrency(withdrawingDeposit.amount - (withdrawingDeposit.withdrawn_amount || 0))}
                </Typography>

                <AmountInput
                  fullWidth
                  label="סכום למשיכה"
                  value={withdrawAmount}
                  onChange={(value) => setWithdrawAmount(Math.min(value, withdrawingDeposit.amount - (withdrawingDeposit.withdrawn_amount || 0)))}
                  sx={{ mb: 2 }}
                />

                {settings.show_payment_method === 'yes' && (
                  <PaymentMethodSelect
                    value={withdrawPaymentMethod}
                    onChange={setWithdrawPaymentMethod}
                    label="אמצעי תשלום למשיכה"
                  />
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawDialogOpen(false)} disabled={isWithdrawing}>ביטול</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmWithdraw} disabled={isWithdrawing}>
            {isWithdrawing ? 'מבצע משיכה...' : 'בצע משיכה'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Withdrawal History Dialog */}
      <Dialog 
        open={historyDialogOpen} 
        onClose={() => setHistoryDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          היסטוריית משיכות
          {selectedDepositForHistory && (
            <Typography variant="body2" color="text.secondary">
              הפקדה מתאריך {new Date(selectedDepositForHistory.deposit_date).toLocaleDateString('he-IL')}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {withdrawalHistory.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">אין היסטוריית משיכות להפקדה זו</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell align="right">תאריך משיכה</TableCell>
                    <TableCell align="center">סכום</TableCell>
                    <TableCell align="right">אמצעי תשלום</TableCell>
                    <TableCell align="center">פעולות</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {withdrawalHistory.map((withdrawal, index) => {
                    let paymentMethodText = withdrawal.payment_method || '-';
                    try {
                      const details = JSON.parse(withdrawal.payment_details || '{}');
                      if (details.payment_method === 'bank_transfer' && details.bank_name) {
                        paymentMethodText = `העברה בנקאית - ${details.bank_name}`;
                      } else if (details.payment_method === 'check' && details.check_number) {
                        paymentMethodText = `צ'ק - ${details.check_number}`;
                      } else if (details.payment_method === 'cash') {
                        paymentMethodText = 'מזומן';
                      }
                    } catch (e) {
                      // Keep original payment_method value
                    }
                    
                    return (
                      <TableRow key={index}>
                        <TableCell align="right">
                          {new Date(withdrawal.withdrawal_date).toLocaleDateString('he-IL')}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                          {formatCurrency(withdrawal.amount)}
                        </TableCell>
                        <TableCell align="right">
                          {paymentMethodText}
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="מחק רשומת משיכה">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteWithdrawal(withdrawal)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell align="right">
                      <strong>סה"כ נמשך</strong>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                      {formatCurrency(withdrawalHistory.reduce((sum, w) => sum + w.amount, 0))}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* Depositor Edit/Create Panel — depositor is forced to null while
          creatingNewDepositor is true, so "מפקיד חדש" always opens a blank
          form even when another depositor is selected. */}
      <DepositorSidePanel
        open={depositorPanelOpen}
        depositor={creatingNewDepositor ? null : selectedDepositor}
        onClose={() => {
          setDepositorPanelOpen(false);
          setCreatingNewDepositor(false);
        }}
        onSaved={(id) => {
          loadDepositors(id);
          setDepositorPanelOpen(false);
          setCreatingNewDepositor(false);
        }}
      />

      {/* Manage Recurring Deposit Dialog */}
      {selectedRecurringDepositId !== null && (
        <EditRecurringDialog
          open={manageRecurringDialogOpen}
          onClose={() => setManageRecurringDialogOpen(false)}
          itemType="deposit"
          itemId={selectedRecurringDepositId as unknown as string}
          onSuccess={() => {
            setSnackbar({ open: true, message: 'ההפקדה המחזורית עודכנה בהצלחה', severity: 'success' });
            if (selectedDepositor) {
              loadDepositsForDepositor(selectedDepositor.id);
            }
          }}
        />
      )}

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
