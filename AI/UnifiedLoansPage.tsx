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
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { borrowersService, loansService, type Borrower, type Loan } from '../services/database';
import LoanCard from '../components/loans/LoanCard';
import LoanSidePanel from '../components/loans/LoanSidePanel';
import BorrowerSidePanel from '../components/loans/BorrowerSidePanel';

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
export default function UnifiedLoansPage() {
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);

  // Side panel state — one piece of state drives both "new loan" and "edit loan"
  const [loanPanelOpen, setLoanPanelOpen] = useState(false);
  const [activeLoan, setActiveLoan] = useState<Loan | null>(null); // null => creating new

  // Borrower edit panel (separate small drawer, also scoped — not a full navigate)
  const [borrowerPanelOpen, setBorrowerPanelOpen] = useState(false);

  useEffect(() => {
    loadBorrowers();
  }, []);

  useEffect(() => {
    if (selectedBorrower) {
      loadLoansForBorrower(selectedBorrower.id);
    } else {
      setLoans([]);
    }
  }, [selectedBorrower]);

  const loadBorrowers = async () => {
    try {
      const data = await borrowersService.getAll();
      setBorrowers(data as Borrower[]);
    } catch (error) {
      console.error('Error loading borrowers:', error);
    }
  };

  const loadLoansForBorrower = async (borrowerId: number) => {
    setLoadingLoans(true);
    try {
      const data = await loansService.getByBorrowerId(borrowerId);
      // Sort newest first, as required.
      const sorted = [...data].sort(
        (a, b) => new Date(b.loan_date).getTime() - new Date(a.loan_date).getTime()
      );
      setLoans(sorted as Loan[]);
    } catch (error) {
      console.error('Error loading loans:', error);
    } finally {
      setLoadingLoans(false);
    }
  };

  const stats = useMemo(() => {
    const total = loans.reduce((sum, l) => sum + l.amount, 0);
    const paid = loans.reduce((sum, l) => sum + (l.paid_amount ?? 0), 0);
    const activeCount = loans.filter((l) => l.amount - (l.paid_amount ?? 0) > 0).length;
    const paidOffCount = loans.length - activeCount;
    return { total, balance: total - paid, activeCount, paidOffCount };
  }, [loans]);

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
  };

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
                <TextField {...params} placeholder="חיפוש לווה לפי שם, טלפון, ת.ז..." fullWidth />
              )}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setBorrowerPanelOpen(true)}
            >
              הוסף לווה חדש
            </Button>
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
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenNewLoan}>
                  הלוואה חדשה
                </Button>
              </Box>

              {loadingLoans ? (
                <Typography color="text.secondary">טוען הלוואות…</Typography>
              ) : loans.length === 0 ? (
                <Typography color="text.secondary">אין הלוואות ללווה זה עדיין.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {loans.map((loan) => (
                    <Grid item xs={12} sm={6} key={loan.id}>
                      <LoanCard loan={loan} onClick={() => handleOpenLoan(loan)} />
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
                onClose={() => setLoanPanelOpen(false)}
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
                {selectedBorrower.is_blacklisted && (
                  <WarningIcon color="error" titleAccess="לווה ברשימה שחורה" />
                )}
              </Box>

              <Stack spacing={1} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <PhoneIcon fontSize="small" color="action" />
                  <Typography variant="body2">{selectedBorrower.phone}</Typography>
                </Stack>
                {selectedBorrower.city && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LocationIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {selectedBorrower.city}
                      {selectedBorrower.street ? `, ${selectedBorrower.street}` : ''}
                    </Typography>
                  </Stack>
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

              <Button
                fullWidth
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => setBorrowerPanelOpen(true)}
              >
                ערוך פרטים
              </Button>

              {/* Edit/new borrower also opens as a side panel, not a full
                  page navigation — keeps you in context either way. */}
              <BorrowerSidePanel
                open={borrowerPanelOpen}
                borrower={selectedBorrower}
                onClose={() => setBorrowerPanelOpen(false)}
                onSaved={loadBorrowers}
              />
            </Paper>
          </Grid>
        </Grid>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">בחר לווה כדי להציג את ההלוואות שלו</Typography>
        </Paper>
      )}

      {/* "Add new borrower" while no borrower is selected reuses the same panel */}
      {!selectedBorrower && (
        <BorrowerSidePanel
          open={borrowerPanelOpen}
          borrower={null}
          onClose={() => setBorrowerPanelOpen(false)}
          onSaved={loadBorrowers}
        />
      )}
    </Box>
  );
}
