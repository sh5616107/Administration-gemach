import { useState, useEffect, useMemo } from 'react';
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
  Payment as PaymentIcon,
  Autorenew as AutorenewIcon,
  EditNote as EditNoteIcon,
  FilterList as FilterIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { borrowersService, loansService, guarantorLoansService, repaymentsService, guarantorsService, type Borrower, type Loan, type Guarantor } from '../services/database';
import { generateLoanDocument, openEmailWithDocument, createLoanEmailData, EmailProvider } from '../services/documents';
import { useSettings } from '../hooks/useSettings';
import { getDocumentLayout } from '../utils/documentLayoutHelper';
import { getLoanFamily, calculateNextRepaymentNumber } from '../services/recurringRepaymentsService';
import { createRepaymentWithNumbering } from '../services/repaymentHelpers';
import LoanCard from '../components/loans/LoanCard';
import LoanSidePanel from '../components/loans/LoanSidePanel';
import BorrowerSidePanel from '../components/loans/BorrowerSidePanel';
import AmountInput from '../components/AmountInput';
import PaymentMethodSelect, { PaymentMethodData } from '../components/PaymentMethodSelect';
import { EditRecurringDialog } from '../components/recurring/EditRecurringDialog';

/**
 * Unified Loans Page — borrower profile (right, in RTL) + loans as cards (left).
 *
 * Differences from the previous version:
 * - Loans render as LoanCard components in a 2-column grid, not a table (LoansTab).
 * - "New loan" / "Edit loan" / "Edit borrower" open a side panel (Drawer) that
 *   covers only the loans column — the borrower profile stays visible at all times.
 *   No more navigate() calls that leave this screen.
 * - Borrower card here shows the full profile (stats, blacklist warning) instead
 *   of three plain fields.
 */

// helper: חישוב תאריך פירעון הבא מיום בחודש
function calculateNextDueDate(repaymentDay?: number): string | undefined {
  if (!repaymentDay) return undefined;
  
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  
  // בדיקת יום אחרון בחודש הנוכחי
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const effectiveDay = Math.min(repaymentDay, lastDayOfMonth);
  
  // אם היום עדיין לא חלף החודש
  if (today.getDate() <= effectiveDay) {
    return new Date(year, month, effectiveDay).toISOString().split('T')[0];
  }
  
  // התאריך כבר עבר החודש - עובר לחודש הבא
  const nextMonth = month + 1;
  const nextYear = nextMonth > 11 ? year + 1 : year;
  const actualNextMonth = nextMonth > 11 ? 0 : nextMonth;
  const lastDayOfNextMonth = new Date(nextYear, actualNextMonth + 1, 0).getDate();
  const effectiveDayNextMonth = Math.min(repaymentDay, lastDayOfNextMonth);
  
  return new Date(nextYear, actualNextMonth, effectiveDayNextMonth).toISOString().split('T')[0];
}

interface UnifiedLoansPageProps {
  initialBorrowerId?: string | null
  initialWaitlistId?: string | null
}

export default function UnifiedLoansPage({ initialBorrowerId, initialWaitlistId }: UnifiedLoansPageProps = {}) {
  const { settings } = useSettings();
  const loanDocumentLayout = getDocumentLayout(settings.document_layouts, 'loan');
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  
  // State מקומי עבור waitlist - ינוקה אחרי השימוש הראשון
  const [activeWaitlistId, setActiveWaitlistId] = useState<string | null>(null)

  // Map of loan ID to first recurring repayment (for auto-repayment management)
  const [loanRecurringRepayments, setLoanRecurringRepayments] = useState<Map<string, any>>(new Map());

  // Side panel state — one piece of state drives both "new loan" and "edit loan"
  const [loanPanelOpen, setLoanPanelOpen] = useState(false);
  const [activeLoan, setActiveLoan] = useState<Loan | null>(null); // null => creating new

  // Borrower edit panel (separate small drawer, also scoped — not a full navigate)
  const [borrowerPanelOpen, setBorrowerPanelOpen] = useState(false);
  // true => panel is creating a brand-new borrower, regardless of which borrower
  // (if any) is currently selected. Lets you add a new borrower while another
  // borrower's page is open, without clearing the search field first.
  const [creatingNewBorrower, setCreatingNewBorrower] = useState(false);

  // Multi-repayment dialog state
  const [multiRepaymentDialogOpen, setMultiRepaymentDialogOpen] = useState(false);
  const [multiRepaymentAmount, setMultiRepaymentAmount] = useState(0);
  const [multiRepaymentPaymentMethod, setMultiRepaymentPaymentMethod] = useState<PaymentMethodData>({ payment_method: '' });
  const [isSubmittingMultiRepayment, setIsSubmittingMultiRepayment] = useState(false);

  // Recurring items dialogs
  const [editRecurringLoanDialogOpen, setEditRecurringLoanDialogOpen] = useState(false);
  const [selectedRecurringLoanId, setSelectedRecurringLoanId] = useState<string | null>(null);
  const [editAutoRepaymentDialogOpen, setEditAutoRepaymentDialogOpen] = useState(false);
  const [selectedAutoRepaymentLoanId, setSelectedAutoRepaymentLoanId] = useState<string | null>(null);

  // Manual repayment dialog (for recording ad-hoc repayments on recurring loans)
  const [manualRepaymentDialogOpen, setManualRepaymentDialogOpen] = useState(false);
  const [manualRepaymentLoanId, setManualRepaymentLoanId] = useState<string | null>(null);
  const [manualRepaymentAmount, setManualRepaymentAmount] = useState(0);
  const [manualRepaymentDate, setManualRepaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualRepaymentMethod, setManualRepaymentMethod] = useState<PaymentMethodData>({ payment_method: '' });
  const [isSubmittingManualRepayment, setIsSubmittingManualRepayment] = useState(false);

  // Loan families expansion state (tracks which recurring_series_id are expanded)
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    amountFrom: '',
    amountTo: '',
    status: 'all' as 'all' | 'active' | 'paid',
    loanType: 'all' as 'all' | 'flexible' | 'fixed',
    isRecurring: 'all' as 'all' | 'yes' | 'no',
  });

  useEffect(() => {
    loadBorrowers();
  }, []);

  // Handle initial borrower selection from props
  useEffect(() => {
    if (initialBorrowerId && borrowers.length > 0) {
      const borrower = borrowers.find(b => b.id === initialBorrowerId);
      if (borrower) {
        setSelectedBorrower(borrower);
      }
    }
  }, [initialBorrowerId, borrowers]);

  // Handle initial waitlist entry - open loan panel with pre-filled form
  useEffect(() => {
    const loadWaitlistEntry = async () => {
      if (initialWaitlistId && borrowers.length > 0) {
        try {
          const { waitlistService } = await import('../services/database')
          const entry = await waitlistService.getById(initialWaitlistId)
          if (entry) {
            const borrower = borrowers.find(b => b.id === entry.borrower_id)
            if (borrower) {
              setSelectedBorrower(borrower)
              // שמירת ה-waitlist ID ב-state מקומי
              setActiveWaitlistId(initialWaitlistId)
              // פתיחת מגירת הלוואה חדשה - הטופס יתמלא אוטומטית ב-LoanSidePanel
              setActiveLoan(null)
              setLoanPanelOpen(true)
              setSnackbar({ 
                open: true, 
                message: `טעינת בקשה מהתור: ${borrower.first_name} ${borrower.last_name}`, 
                severity: 'success' 
              })
            }
          }
        } catch (error) {
          console.error('Error loading waitlist entry:', error)
        }
      }
    }
    loadWaitlistEntry()
  }, [initialWaitlistId, borrowers])

  useEffect(() => {
    if (selectedBorrower) {
      loadLoansForBorrower(selectedBorrower.id);
    } else {
      setLoans([]);
    }
  }, [selectedBorrower]);

  const loadBorrowers = async (selectBorrowerId?: string) => {
    try {
      const data = await borrowersService.getAll();
      setBorrowers(data as Borrower[]);
      
      // Empty string = borrower was deleted, clear selection
      if (selectBorrowerId === '') {
        setSelectedBorrower(null);
        return;
      }

      // If selectBorrowerId provided (new borrower), select it
      if (selectBorrowerId) {
        const newBorrower = data.find(b => b.id === selectBorrowerId);
        if (newBorrower) {
          setSelectedBorrower(newBorrower as Borrower);
        }
      }
      // If a borrower is already selected, update it with fresh data
      else if (selectedBorrower) {
        const updatedBorrower = data.find(b => b.id === selectedBorrower.id);
        if (updatedBorrower) {
          setSelectedBorrower(updatedBorrower as Borrower);
        }
      }
    } catch (error) {
      console.error('Error loading borrowers:', error);
    }
  };

  const loadLoansForBorrower = async (borrowerId: string) => {
    setLoadingLoans(true);
    try {
      const data = await loansService.getByBorrower(borrowerId);
      // Sort newest first, as required.
      const sorted = [...data].sort(
        (a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime()
      );
      setLoans(sorted as Loan[]);

      // Load recurring repayments for each loan with auto_repayment
      const recurringRepaymentsMap = new Map<string, any>();
      for (const loan of sorted) {
        if (loan.auto_repayment === 1 && loan.id) {
          try {
            const repayments = await repaymentsService.getByLoan(loan.id);
            const recurringRepayments = repayments.filter((r: any) => r.is_recurring === 1);
            
            if (recurringRepayments.length > 0) {
              // מיון לפי מספר פירעון ולקיחת האחרון
              const sortedRepayments = recurringRepayments.sort(
                (a: any, b: any) => (b.recurring_repayment_number || 0) - (a.recurring_repayment_number || 0)
              );
              const latestRecurringRepayment = sortedRepayments[0];
              recurringRepaymentsMap.set(loan.id, latestRecurringRepayment);
            }
          } catch (error) {
            console.error(`Error loading repayments for loan ${loan.id}:`, error);
          }
        }
      }
      setLoanRecurringRepayments(recurringRepaymentsMap);
    } catch (error) {
      console.error('Error loading loans:', error);
    } finally {
      setLoadingLoans(false);
    }
  };

  const stats = useMemo(() => {
    const total = loans.reduce((sum, l) => sum + l.amount, 0);
    const paid = loans.reduce((sum, l) => sum + (l.total_repaid ?? 0), 0);
    const activeCount = loans.filter((l) => l.amount - (l.total_repaid ?? 0) > 0).length;
    const paidOffCount = loans.length - activeCount;
    return { total, balance: total - paid, activeCount, paidOffCount };
  }, [loans]);

  // Filtered loans based on filters
  const filteredLoans = useMemo(() => {
    return loans.filter(loan => {
      const balance = loan.amount - (loan.total_repaid ?? 0);
      const isPaid = balance <= 0;

      // Date filter
      if (filters.dateFrom && loan.loan_date < filters.dateFrom) return false;
      if (filters.dateTo && loan.loan_date > filters.dateTo) return false;

      // Amount filter
      if (filters.amountFrom && loan.amount < parseFloat(filters.amountFrom)) return false;
      if (filters.amountTo && loan.amount > parseFloat(filters.amountTo)) return false;

      // Status filter
      if (filters.status === 'active' && isPaid) return false;
      if (filters.status === 'paid' && !isPaid) return false;

      // Loan type filter
      if (filters.loanType !== 'all' && loan.loan_type !== filters.loanType) return false;

      // Recurring filter
      if (filters.isRecurring === 'yes' && loan.is_recurring !== 1) return false;
      if (filters.isRecurring === 'no' && loan.is_recurring === 1) return false;

      return true;
    });
  }, [loans, filters]);

  const hasActiveFilters = filters.dateFrom || filters.dateTo || filters.amountFrom || filters.amountTo || 
    filters.status !== 'all' || filters.loanType !== 'all' || filters.isRecurring !== 'all';

  // Group loans into families for display
  const loanFamilies = useMemo(() => {
    const familiesMap = new Map<string, Loan[]>();
    const standaloneLoans: Loan[] = [];

    filteredLoans.forEach(loan => {
      if (loan.is_recurring === 1 && loan.recurring_series_id) {
        // Recurring loan with series_id - group by family
        const familyKey = loan.recurring_series_id;
        if (!familiesMap.has(familyKey)) {
          familiesMap.set(familyKey, []);
        }
        familiesMap.get(familyKey)!.push(loan);
      } else {
        // Standalone loan (not recurring or no series_id)
        standaloneLoans.push(loan);
      }
    });

    // Convert map to array of families, each sorted by loan number
    const families = Array.from(familiesMap.values()).map(family => {
      return family.sort((a, b) => (a.recurring_loan_number || 0) - (b.recurring_loan_number || 0));
    });

    // Sort families by first loan date
    families.sort((a, b) => {
      const dateA = new Date(a[0].loan_date).getTime();
      const dateB = new Date(b[0].loan_date).getTime();
      return dateB - dateA; // newest first
    });

    return { families, standaloneLoans };
  }, [filteredLoans]);

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      amountFrom: '',
      amountTo: '',
      status: 'all',
      loanType: 'all',
      isRecurring: 'all',
    });
  };

  const handleOpenNewLoan = () => {
    setActiveLoan(null);
    setLoanPanelOpen(true);
  };

  const handleOpenLoan = (loan: Loan) => {
    setActiveLoan(loan);
    setLoanPanelOpen(true);
  };

  const handleLoanSaved = () => {
    if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
    setLoanPanelOpen(false); // Close the drawer after saving
    setActiveWaitlistId(null); // ניקוי ה-waitlist ID אחרי השמירה
  };

  const handleDeleteLoan = async (loan: Loan) => {
    if (!loan.id) return;
    
    // Check if loan has repayments
    if ((loan.total_repaid || 0) > 0) {
      setSnackbar({ open: true, message: 'לא ניתן למחוק הלוואה שיש לה פירעונות', severity: 'error' });
      return;
    }
    
    if (!confirm('האם למחוק את ההלוואה?')) return;

    try {
      // Update guarantor loans if needed
      const guarantorLoans = await guarantorLoansService.getByOriginalLoan(loan.id);
      for (const gl of guarantorLoans) {
        let cleanNotes = (gl.notes || '')
          .split('\n')
          .filter(line => !line.includes('מגיע החזר לערב'))
          .join('\n')
          .trim();
        
        await guarantorLoansService.update(gl.id, {
          amount: gl.amount + (gl.total_repaid || 0),
          status: 'active',
          notes: cleanNotes
        });
      }
      
      await loansService.delete(loan.id);
      setSnackbar({ open: true, message: 'ההלוואה נמחקה', severity: 'success' });
      if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
    } catch (error) {
      console.error('Error deleting loan:', error);
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' });
    }
  };

  const handleGenerateDocument = async (loan: Loan) => {
    if (!loan.id || !selectedBorrower) return;
    
    try {
      const guarantor1 = loan.guarantor1_id ? await guarantorsService.getById(loan.guarantor1_id) as Guarantor : null;
      const guarantor2 = loan.guarantor2_id ? await guarantorsService.getById(loan.guarantor2_id) as Guarantor : null;
      
      generateLoanDocument({
        borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
        borrowerId: selectedBorrower.id_number || '',
        amount: loan.amount,
        loanDate: loan.loan_date,
        dueDate: loan.due_date,
        loanType: loan.loan_type,
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
        guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      }, loanDocumentLayout);
      
      setSnackbar({ open: true, message: 'השטר הופק בהצלחה', severity: 'success' });
    } catch (error) {
      console.error('Error generating document:', error);
      setSnackbar({ open: true, message: 'שגיאה בהפקת השטר', severity: 'error' });
    }
  };

  const handleSendEmail = async (loan: Loan) => {
    if (!loan.id || !selectedBorrower) return;
    
    try {
      const guarantor1 = loan.guarantor1_id ? await guarantorsService.getById(loan.guarantor1_id) as Guarantor : null;
      const guarantor2 = loan.guarantor2_id ? await guarantorsService.getById(loan.guarantor2_id) as Guarantor : null;
      
      const emailData = await createLoanEmailData({
        borrowerName: `${selectedBorrower.first_name} ${selectedBorrower.last_name}`,
        borrowerEmail: selectedBorrower.email || '',
        amount: loan.amount,
        loanDate: loan.loan_date,
        dueDate: loan.due_date,
        loanType: loan.loan_type,
        gemachName: settings.gemach_name || 'גמ"ח שלי',
        gemachLogo: settings.gemach_logo,
        gemachDocumentFrame: settings.gemach_document_frame,
        frameMarginTop: settings.gemach_frame_margin_top,
        frameMarginBottom: settings.gemach_frame_margin_bottom,
        frameMarginRight: settings.gemach_frame_margin_right,
        frameMarginLeft: settings.gemach_frame_margin_left,
        guarantor1Name: guarantor1 ? `${guarantor1.first_name} ${guarantor1.last_name}` : undefined,
        guarantor2Name: guarantor2 ? `${guarantor2.first_name} ${guarantor2.last_name}` : undefined,
      }, loanDocumentLayout);
      
      openEmailWithDocument(emailData, settings.email_provider as EmailProvider || 'gmail');
      setSnackbar({ open: true, message: 'המייל נפתח', severity: 'success' });
    } catch (error) {
      console.error('Error sending email:', error);
      setSnackbar({ open: true, message: 'שגיאה בשליחת מייל', severity: 'error' });
    }
  };

  const handleMultiRepayment = async () => {
    if (!selectedBorrower || multiRepaymentAmount <= 0) return;
    
    // מניעת הגשה כפולה
    if (isSubmittingMultiRepayment) return;
    setIsSubmittingMultiRepayment(true);
    
    try {
      const activeLoans = loans.filter(l => (l.remaining || 0) > 0 && l.loan_date <= new Date().toISOString().split('T')[0]);
      
      if (activeLoans.length === 0) {
        setSnackbar({ open: true, message: 'אין הלוואות פעילות', severity: 'error' });
        return;
      }
      
      let remainingAmount = multiRepaymentAmount;
      const today = new Date().toISOString().split('T')[0];
      
      // Sort by oldest first
      activeLoans.sort((a, b) => a.loan_date.localeCompare(b.loan_date));
      
      for (const loan of activeLoans) {
        if (remainingAmount <= 0 || !loan.id) break;
        
        const loanRemaining = loan.remaining || 0;
        const paymentAmount = Math.min(remainingAmount, loanRemaining);
        
        // חישוב מספור מחזורי אם יש פירעון אוטומטי
        const numberInfo = await calculateNextRepaymentNumber(loan.id);
        
        await repaymentsService.create({
          loan_id: loan.id,
          amount: paymentAmount,
          payment_date: today,
          payment_method: multiRepaymentPaymentMethod.payment_method,
          payment_details: JSON.stringify(multiRepaymentPaymentMethod),
          is_recurring: numberInfo.recurringRepaymentNumber > 1 || numberInfo.recurringRepaymentCount ? 1 : 0,
          recurring_repayment_number: numberInfo.recurringRepaymentNumber,
          recurring_repayment_count: numberInfo.recurringRepaymentCount,
        });
        
        remainingAmount -= paymentAmount;
      }
      
      setSnackbar({ open: true, message: 'פירעון מרובה בוצע בהצלחה', severity: 'success' });
      setMultiRepaymentDialogOpen(false);
      setMultiRepaymentAmount(0);
      setMultiRepaymentPaymentMethod({ payment_method: '' });
      if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
    } catch (error) {
      console.error('Error in multi repayment:', error);
      setSnackbar({ open: true, message: 'שגיאה בפירעון מרובה', severity: 'error' });
    } finally {
      setIsSubmittingMultiRepayment(false);
    }
  };

  const handleManualRepayment = async () => {
    if (!manualRepaymentLoanId || manualRepaymentAmount <= 0) return;
    
    // מניעת הגשה כפולה
    if (isSubmittingManualRepayment) return;
    setIsSubmittingManualRepayment(true);
    
    try {
      await createRepaymentWithNumbering({
        loanId: manualRepaymentLoanId,
        amount: manualRepaymentAmount,
        paymentDate: manualRepaymentDate,
        paymentMethod: manualRepaymentMethod.payment_method,
        paymentDetails: JSON.stringify(manualRepaymentMethod),
        notes: 'פירעון חריג ידני',
      });
      
      setSnackbar({ open: true, message: 'פירעון נרשם בהצלחה', severity: 'success' });
      setManualRepaymentDialogOpen(false);
      setManualRepaymentLoanId(null);
      setManualRepaymentAmount(0);
      setManualRepaymentDate(new Date().toISOString().split('T')[0]);
      setManualRepaymentMethod({ payment_method: '' });
      if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
    } catch (error) {
      console.error('Error in manual repayment:', error);
      setSnackbar({ open: true, message: 'שגיאה ברישום פירעון', severity: 'error' });
    } finally {
      setIsSubmittingManualRepayment(false);
    }
  };

  const formatCurrency = (amount: number) => `₪${amount.toLocaleString()}`;

  return (
    <Box>
      {/* Top bar — borrower search + add borrower (this one legitimately can't
          attach to an existing borrower, so it stays as its own panel/dialog) */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Autocomplete
              options={borrowers}
              value={selectedBorrower}
              getOptionLabel={(b) => `${b.first_name} ${b.last_name}`}
              onChange={(_, value) => setSelectedBorrower(value)}
              openOnFocus
              renderOption={(props, b) => (
                <li {...props} key={b.id}>
                  <Box>
                    <Box sx={{ fontWeight: 500 }}>
                      {b.first_name} {b.last_name}
                    </Box>
                    <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      {b.phone}
                      {b.city && ` • ${b.city}`}
                    </Box>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} placeholder="חיפוש לווה לפי שם, טלפון, ת.ז... (או לחצו לרשימה המלאה)" fullWidth autoFocus />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                variant={selectedBorrower ? 'outlined' : 'contained'}
                startIcon={<AddIcon />}
                onClick={() => {
                  setCreatingNewBorrower(true);
                  setBorrowerPanelOpen(true);
                }}
              >
                לווה חדש
              </Button>
              {selectedBorrower && (
                <Button
                  fullWidth
                  variant="contained"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setCreatingNewBorrower(false);
                    setBorrowerPanelOpen(true);
                  }}
                >
                  ערוך פרטי הלווה
                </Button>
              )}
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Split view: profile (right) + loans-as-cards (left), matching the
          original mockup proportions: ~30% profile / ~70% loans */}
      {selectedBorrower ? (
        <Grid container spacing={2}>
          {/* Loans — Cards, 70% */}
          <Grid item xs={12} md={8} order={{ xs: 2, md: 1 }}>
            <Paper sx={{ p: 2, position: 'relative' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">הלוואות הלווה</Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant={hasActiveFilters ? 'contained' : 'outlined'}
                    color={hasActiveFilters ? 'secondary' : 'inherit'}
                    startIcon={filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    size="small"
                  >
                    סינון {hasActiveFilters && `(${filteredLoans.length}/${loans.length})`}
                  </Button>
                  {loans.some(loan => (loan.remaining || 0) > 0 && loan.loan_date <= new Date().toISOString().split('T')[0]) && (
                    <Button
                      variant="outlined"
                      color="secondary"
                      startIcon={<PaymentIcon />}
                      onClick={() => setMultiRepaymentDialogOpen(true)}
                    >
                      פירעון מרובה
                    </Button>
                  )}
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewLoan}>
                    הלוואה חדשה
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
                          <MenuItem value="paid">נפרעה</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>סוג הלוואה</InputLabel>
                        <Select
                          value={filters.loanType}
                          label="סוג הלוואה"
                          onChange={(e) => setFilters({ ...filters, loanType: e.target.value as any })}
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

              {loadingLoans ? (
                <Typography color="text.secondary">טוען הלוואות…</Typography>
              ) : filteredLoans.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    {hasActiveFilters ? 'לא נמצאו הלוואות התואמות לסינון' : 'אין הלוואות ללווה זה עדיין.'}
                  </Typography>
                  {hasActiveFilters && (
                    <Button variant="text" onClick={clearFilters} sx={{ mt: 1 }}>
                      נקה סינון
                    </Button>
                  )}
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {/* Render loan families (recurring loans grouped) */}
                  {loanFamilies.families.map((family) => {
                    const firstLoan = family[0];
                    const familyKey = firstLoan.recurring_series_id!;
                    const isExpanded = expandedFamilies.has(familyKey);
                    
                    // Calculate family summary
                    const totalAmount = family.reduce((sum, l) => sum + l.amount, 0);
                    const totalRepaid = family.reduce((sum, l) => sum + (l.total_repaid ?? 0), 0);
                    const balance = totalAmount - totalRepaid;
                    const progress = totalAmount > 0 ? (totalRepaid / totalAmount) * 100 : 0;
                    
                    return (
                      <Grid item xs={12} key={familyKey}>
                        {/* Family summary card */}
                        <Paper
                          sx={{
                            p: 2,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                            borderRight: 4,
                            borderColor: 'primary.main',
                          }}
                          onClick={() => {
                            setExpandedFamilies(prev => {
                              const next = new Set(prev);
                              if (next.has(familyKey)) {
                                next.delete(familyKey);
                              } else {
                                next.add(familyKey);
                              }
                              return next;
                            });
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <IconButton size="small">
                              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                            
                            <AutorenewIcon color="primary" />
                            
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="h6">
                                הלוואה מחזורית - {firstLoan.recurring_loan_count} תשלומים
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                התקדמות: {family.length} מתוך {firstLoan.recurring_loan_count} | 
                                סכום כולל: ₪{totalAmount.toLocaleString()}
                              </Typography>
                            </Box>
                            
                            <Box sx={{ textAlign: 'left', minWidth: 120 }}>
                              <Typography variant="body2" color={balance > 0 ? 'error' : 'success'}>
                                יתרה: ₪{balance.toLocaleString()}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {progress.toFixed(0)}% שולם
                              </Typography>
                            </Box>
                            
                            {/* Action buttons */}
                            <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                              <Tooltip title="נהל הלוואה מחזורית">
                                <IconButton
                                  size="small"
                                  color="info"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRecurringLoanId(firstLoan.id!);
                                    setEditRecurringLoanDialogOpen(true);
                                  }}
                                >
                                  <AutorenewIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              
                              {firstLoan.auto_repayment === 1 && firstLoan.id && (
                                <Tooltip title="נהל פירעון אוטומטי">
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const firstRepayment = loanRecurringRepayments.get(firstLoan.id!);
                                      if (firstRepayment?.id) {
                                        setSelectedAutoRepaymentLoanId(firstRepayment.id);
                                        setEditAutoRepaymentDialogOpen(true);
                                      } else {
                                        handleOpenLoan(firstLoan);
                                      }
                                    }}
                                  >
                                    <EditNoteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </Box>
                        </Paper>
                        
                        {/* Expanded family loans */}
                        <Collapse in={isExpanded}>
                          <Grid container spacing={2} sx={{ mt: 0, pl: 4 }}>
                            {family.map((loan) => (
                              <Grid item xs={12} sm={6} key={loan.id}>
                                <Box 
                                  sx={{ 
                                    position: 'relative',
                                    '&:hover .action-buttons': {
                                      opacity: 1,
                                    }
                                  }}
                                >
                                  <LoanCard 
                                    loan={loan} 
                                    onClick={() => handleOpenLoan(loan)}
                                    recurringRepaymentInfo={
                                      loan.auto_repayment === 1 && loanRecurringRepayments.has(loan.id!)
                                        ? {
                                            number: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_number!,
                                            count: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_count!,
                                            nextDueDate: calculateNextDueDate(loan.repayment_day),
                                          }
                                        : undefined
                                    }
                                  />
                                  {/* Action buttons overlay */}
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
                                    <Tooltip title="עריכה">
                                      <IconButton
                                        size="small"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenLoan(loan);
                                        }}
                                        sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                                      >
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Collapse>
                      </Grid>
                    );
                  })}
                  
                  {/* Render standalone loans (not in families) */}
                  {loanFamilies.standaloneLoans.map((loan) => (
                    <Grid item xs={12} sm={6} key={loan.id}>
                      <Box 
                        sx={{ 
                          position: 'relative',
                          '&:hover .action-buttons': {
                            opacity: 1,
                          }
                        }}
                      >
                        <LoanCard 
                          loan={loan} 
                          onClick={() => handleOpenLoan(loan)}
                          recurringRepaymentInfo={
                            loan.auto_repayment === 1 && loanRecurringRepayments.has(loan.id!)
                              ? {
                                  number: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_number!,
                                  count: loanRecurringRepayments.get(loan.id!)!.recurring_repayment_count!,
                                  nextDueDate: calculateNextDueDate(loan.repayment_day),
                                }
                              : undefined
                          }
                        />
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
                          {/* Edit recurring loan - show on all recurring loans */}
                          {loan.is_recurring === 1 && (
                            <Tooltip title="נהל הלוואה מחזורית">
                              <IconButton
                                size="small"
                                color="info"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecurringLoanId(loan.id!);
                                  setEditRecurringLoanDialogOpen(true);
                                }}
                                sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                              >
                                <AutorenewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          
                          {/* Edit auto repayment - show on all loans with auto repayment */}
                          {loan.auto_repayment === 1 && loan.id && (
                            <>
                              <Tooltip title={loanRecurringRepayments.has(loan.id) ? "נהל פירעון אוטומטי" : "ערוך הגדרות פירעון אוטומטי"}>
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const firstRepayment = loanRecurringRepayments.get(loan.id!);
                                    if (firstRepayment?.id) {
                                      // Has existing repayments - open recurring repayment manager
                                      setSelectedAutoRepaymentLoanId(firstRepayment.id);
                                      setEditAutoRepaymentDialogOpen(true);
                                    } else {
                                      // No repayments yet - open loan edit form to modify settings
                                      handleOpenLoan(loan);
                                    }
                                  }}
                                  sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                                >
                                  <EditNoteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="רשום פירעון חריג">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManualRepaymentLoanId(loan.id!);
                                    setManualRepaymentDialogOpen(true);
                                  }}
                                  sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                                >
                                  <PaymentIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}

                          <Tooltip title="עריכה">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenLoan(loan);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="הפק שטר">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateDocument(loan);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <DocIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="שלח במייל">
                            <IconButton
                              size="small"
                              color="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendEmail(loan);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <EmailIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="מחק">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLoan(loan);
                              }}
                              sx={{ '&:hover': { bgcolor: 'grey.200' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}

              {/* Side panel for create/edit — scoped to this Paper via the
                  Drawer's relative container; see LoanSidePanel for the
                  width/anchor logic that keeps the profile visible. */}
              <LoanSidePanel
                open={loanPanelOpen}
                loan={activeLoan}
                borrowerId={selectedBorrower.id}
                waitlistEntryId={activeWaitlistId}
                onClose={() => {
                  setLoanPanelOpen(false)
                  setActiveWaitlistId(null) // ניקוי גם בסגירה ידנית
                }}
                onSaved={handleLoanSaved}
              />
            </Paper>
          </Grid>

          {/* Borrower profile — 30% */}
          <Grid item xs={12} md={4} order={{ xs: 1, md: 2 }}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6">
                  {selectedBorrower.first_name} {selectedBorrower.last_name}
                </Typography>
                {/* Blacklist warning - need to check how blacklist is implemented */}
              </Box>

              <Stack spacing={1} sx={{ mb: 2 }}>
                {selectedBorrower.id_number && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>ת.ז:</Typography>
                    <Typography variant="body2">{selectedBorrower.id_number}</Typography>
                  </Stack>
                )}
                <Stack direction="row" spacing={1} alignItems="center">
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">{selectedBorrower.phone}</Typography>
                  {selectedBorrower.phone2 && (
                    <Typography variant="caption" color="text.secondary">(ראשי)</Typography>
                  )}
                </Stack>
                {selectedBorrower.phone2 && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PhoneIcon fontSize="small" color="action" />
                    <Typography variant="body2">{selectedBorrower.phone2}</Typography>
                    <Typography variant="caption" color="text.secondary">(נוסף)</Typography>
                  </Stack>
                )}
                {selectedBorrower.email && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 60 }}>אימייל:</Typography>
                    <Typography 
                      variant="body2" 
                      onClick={() => {
                        openEmailWithDocument(
                          {
                            to: selectedBorrower.email || '',
                            subject: '',
                            body: '',
                            documentType: 'borrower_report',
                          },
                          settings.email_provider as EmailProvider || 'gmail'
                        );
                      }}
                      sx={{ 
                        fontSize: '0.8rem',
                        color: 'primary.main',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        '&:hover': {
                          textDecoration: 'underline'
                        }
                      }}
                    >
                      {selectedBorrower.email}
                    </Typography>
                  </Stack>
                )}
                {selectedBorrower.city && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LocationIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {selectedBorrower.city}
                      {selectedBorrower.address ? `, ${selectedBorrower.address}` : ''}
                    </Typography>
                  </Stack>
                )}
                {selectedBorrower.notes && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      הערות:
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {selectedBorrower.notes}
                    </Typography>
                  </Box>
                )}
              </Stack>

              <Grid container spacing={1} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">סך הלוואות</Typography>
                    <Typography variant="h6">₪{stats.total.toLocaleString()}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">חוב נוכחי</Typography>
                    <Typography variant="h6" color="error.main">₪{stats.balance.toLocaleString()}</Typography>
                  </Paper>
                </Grid>
              </Grid>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <Chip color="primary" label={`פעילות: ${stats.activeCount}`} size="small" />
                <Chip color="success" label={`נפרעו: ${stats.paidOffCount}`} size="small" />
              </Stack>

              <Divider />
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">בחר לווה כדי להציג את ההלוואות שלו</Typography>
        </Paper>
      )}

      {/* Borrower edit/create panel - works for both selected and new borrowers.
          borrower is forced to null while creatingNewBorrower is true, so "לווה
          חדש" always opens a blank form even when another borrower is selected. */}
      <BorrowerSidePanel
        open={borrowerPanelOpen}
        borrower={creatingNewBorrower ? null : selectedBorrower}
        onClose={() => {
          setBorrowerPanelOpen(false);
          setCreatingNewBorrower(false);
        }}
        onSaved={(borrowerId) => {
          loadBorrowers(borrowerId);
          setCreatingNewBorrower(false);
        }}
      />

      {/* Multi-Repayment Dialog */}
      <Dialog open={multiRepaymentDialogOpen} onClose={() => setMultiRepaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>פירעון מרובה</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            הזן סכום שיחולק באופן אוטומטי על כל ההלוואות הפעילות (מהישנה לחדשה)
          </Typography>
          <AmountInput
            label="סכום לפירעון"
            value={multiRepaymentAmount}
            onChange={setMultiRepaymentAmount}
            fullWidth
            autoFocus
          />
          {settings.show_payment_method === 'yes' && (
            <Box sx={{ mt: 2 }}>
              <PaymentMethodSelect
                value={multiRepaymentPaymentMethod}
                onChange={setMultiRepaymentPaymentMethod}
              />
            </Box>
          )}
          {multiRepaymentAmount > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              הסכום יחולק על {loans.filter(l => (l.remaining || 0) > 0).length} הלוואות פעילות
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMultiRepaymentDialogOpen(false)} disabled={isSubmittingMultiRepayment}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleMultiRepayment}
            disabled={multiRepaymentAmount <= 0 || (settings.show_payment_method === 'yes' && !multiRepaymentPaymentMethod.payment_method) || isSubmittingMultiRepayment}
          >
            {isSubmittingMultiRepayment ? 'מבצע פירעון...' : 'בצע פירעון'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Recurring Loan Dialog */}
      {selectedRecurringLoanId && (
        <EditRecurringDialog
          open={editRecurringLoanDialogOpen}
          onClose={() => {
            setEditRecurringLoanDialogOpen(false);
            setSelectedRecurringLoanId(null);
          }}
          itemId={selectedRecurringLoanId}
          itemType="loan"
          onSuccess={() => {
            if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
            setSnackbar({ open: true, message: 'ההלוואה המחזורית עודכנה בהצלחה', severity: 'success' });
          }}
        />
      )}

      {/* Edit Auto Repayment Dialog */}
      {selectedAutoRepaymentLoanId && (
        <EditRecurringDialog
          open={editAutoRepaymentDialogOpen}
          onClose={() => {
            setEditAutoRepaymentDialogOpen(false);
            setSelectedAutoRepaymentLoanId(null);
          }}
          itemId={selectedAutoRepaymentLoanId}
          itemType="repayment"
          onSuccess={() => {
            if (selectedBorrower) loadLoansForBorrower(selectedBorrower.id);
            setSnackbar({ open: true, message: 'הפירעון האוטומטי עודכן בהצלחה', severity: 'success' });
          }}
        />
      )}

      {/* Manual Repayment Dialog */}
      <Dialog open={manualRepaymentDialogOpen} onClose={() => setManualRepaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>רישום פירעון חריג</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            רשום פירעון עם מספור אוטומטי נכון (מוקדם/מאוחר/חלקי)
          </Typography>
          <Stack spacing={2}>
            <AmountInput
              label="סכום"
              value={manualRepaymentAmount}
              onChange={setManualRepaymentAmount}
              fullWidth
              autoFocus
            />
            <TextField
              label="תאריך פירעון"
              type="date"
              value={manualRepaymentDate}
              onChange={(e) => setManualRepaymentDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            {settings.show_payment_method === 'yes' && (
              <PaymentMethodSelect
                value={manualRepaymentMethod}
                onChange={setManualRepaymentMethod}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualRepaymentDialogOpen(false)} disabled={isSubmittingManualRepayment}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleManualRepayment}
            disabled={manualRepaymentAmount <= 0 || (settings.show_payment_method === 'yes' && !manualRepaymentMethod.payment_method) || isSubmittingManualRepayment}
          >
            {isSubmittingManualRepayment ? 'רושם פירעון...' : 'רשום פירעון'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
