/**
 * Bank Matching Page
 * 
 * Page for reviewing and approving matches between bank transactions and records.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  SkipNext as SkipNextIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { bankService, BankTransaction, MatchSuggestion, getTransactionDisplayName } from '../../services/bankService';
import MasterPasswordDialog from '../../components/bank/MasterPasswordDialog';

// ============================================================================
// Types
// ============================================================================

type FilterTab = 'all' | 'pending' | 'approved' | 'rejected' | 'skipped';

const confidenceColor: Record<string, string> = {
  excellent: '#2e7d32',
  high: '#1565c0',
  medium: '#f57f17',
  low: '#e65100',
  suspect: '#b71c1c',
};

const confidenceLabel: Record<string, string> = {
  excellent: 'מצוין',
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
  suspect: 'חשוד',
};

// ============================================================================
// Main Component
// ============================================================================

const BankMatchingPage: React.FC = () => {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [transactions, setTransactions] = useState<Record<string, BankTransaction>>({});
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('pending');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');
  const [manualMatchOpen, setManualMatchOpen] = useState(false);
  const [unmatched, setUnmatched] = useState<BankTransaction[]>([]);
  const [masterPasswordUnlocked, setMasterPasswordUnlocked] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [deleteUnmatchedDialogOpen, setDeleteUnmatchedDialogOpen] = useState(false);
  const [creatingMatches, setCreatingMatches] = useState(false);

  useEffect(() => {
    checkMasterPassword();
  }, []);

  useEffect(() => {
    if (masterPasswordUnlocked) {
      loadData();
    }
  }, [filterTab, masterPasswordUnlocked]);

  const checkMasterPassword = async () => {
    try {
      setLoading(true);
      const hasPassword = await bankService.hasMasterPassword();
      if (hasPassword) {
        setMasterPasswordUnlocked(true);
      }
    } catch (err) {
      setError(`שגיאה בבדיקת סיסמה: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMasterPasswordSuccess = () => {
    setMasterPasswordUnlocked(true);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setCurrentIndex(0);

      const filter = filterTab === 'all' ? undefined : filterTab;
      const [suggs, unmatchedTxns] = await Promise.all([
        bankService.getMatchSuggestions(filter ? { status_filter: filter } : {}),
        bankService.getUnmatchedTransactions(),
      ]);

      setSuggestions(suggs);
      setUnmatched(unmatchedTxns);

      // Build transaction lookup map
      const txnMap: Record<string, BankTransaction> = {};
      for (const s of suggs) {
        if (!txnMap[s.transaction_id]) {
          const txn = await bankService.getTransactionDetails(s.transaction_id);
          if (txn) txnMap[txn.id] = txn;
        }
      }
      setTransactions(txnMap);
    } catch (err) {
      setError(`שגיאה בטעינת נתונים: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const suggestion = suggestions.find(s => s.id === id);
      if (!suggestion) {
        setError('התאמה לא נמצאה');
        return;
      }

      // Approve the match in bank system
      await bankService.approveMatch(id);

      // Update the actual record (repayment/donation/deposit) with bank verification
      const { match_type, target_id, transaction_id } = suggestion;
      
      if (match_type === 'repayment') {
        const { repaymentsService } = await import('../../services/database');
        await repaymentsService.update(target_id, {
          bank_verified: true,
          bank_transaction_id: transaction_id,
          verified_at: new Date().toISOString(),
        });
      } else if (match_type === 'donation') {
        // Update donation in localStorage
        const data = JSON.parse(localStorage.getItem('gemach_data') || '{}');
        const donation = data.donations?.[target_id];
        if (donation) {
          data.donations[target_id] = {
            ...donation,
            bank_verified: true,
            bank_transaction_id: transaction_id,
            verified_at: new Date().toISOString(),
          };
          localStorage.setItem('gemach_data', JSON.stringify(data));
        }
      } else if (match_type === 'deposit') {
        // Update deposit in localStorage
        const data = JSON.parse(localStorage.getItem('gemach_data') || '{}');
        const deposit = data.deposits?.[target_id];
        if (deposit) {
          data.deposits[target_id] = {
            ...deposit,
            bank_verified: true,
            bank_transaction_id: transaction_id,
            verified_at: new Date().toISOString(),
          };
          localStorage.setItem('gemach_data', JSON.stringify(data));
        }
      }

      await loadData();
    } catch (err) {
      setError(`שגיאה באישור התאמה: ${err}`);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await bankService.rejectMatch(id);
      await loadData();
    } catch (err) {
      setError(`שגיאה בדחיית התאמה: ${err}`);
    }
  };

  const handleSkip = async (id: string) => {
    try {
      await bankService.skipMatch(id);
      setCurrentIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } catch (err) {
      setError(`שגיאה בדילוג: ${err}`);
    }
  };

  const handleDeleteAllPending = async () => {
    try {
      // Delete all pending suggestions
      const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
      for (const suggestion of pendingSuggestions) {
        await bankService.rejectMatch(suggestion.id, 'מחיקה קבוצתית');
      }
      setDeleteAllDialogOpen(false);
      await loadData();
    } catch (err) {
      setError(`שגיאה במחיקת התאמות: ${err}`);
    }
  };

  const handleDeleteUnmatchedTransactions = async () => {
    try {
      const count = await bankService.deleteUnmatchedTransactions();
      setDeleteUnmatchedDialogOpen(false);
      await loadData();
      alert(`נמחקו ${count} עסקאות ללא התאמה`);
    } catch (err) {
      setError(`שגיאה במחיקת עסקאות: ${err}`);
    }
  };

  const handleCreateAutoMatches = async () => {
    setCreatingMatches(true);
    setError('');
    
    try {
      const { db, loansService } = await import('../../services/database');
      
      // Get all unmatched transactions
      const unmatchedTxns = await bankService.getUnmatchedTransactions();
      
      if (unmatchedTxns.length === 0) {
        setError('אין עסקאות ללא התאמה');
        setCreatingMatches(false);
        return;
      }

      // Show how many will be processed
      const batchSize = 100;
      const willProcess = Math.min(unmatchedTxns.length, batchSize);
      console.log(`🔍 מעבד ${willProcess} עסקאות מתוך ${unmatchedTxns.length}`);

      let totalMatches = 0;

      // Get data for matching
      const allBorrowers = await db.query('SELECT * FROM borrowers') as any[];
      const borrowers = allBorrowers.filter((b: any) => !b.is_deleted);
      const donors = await db.query('SELECT * FROM donors') as any[];
      const depositors = await db.query('SELECT * FROM depositors') as any[];
      const expenses = await db.query('SELECT * FROM expenses') as any[];
      const allLoans = await db.query('SELECT * FROM loans') as any[];
      const loans = allLoans.filter((l: any) => !l.is_deleted);

      // Prepare borrowers with active loans
      const borrowersWithLoans = [];
      for (const borrower of borrowers) {
        const borrowerLoans = await loansService.getByBorrower(borrower.id);
        const activeLoans = borrowerLoans.filter((l: any) => l.remaining > 0);
        if (activeLoans.length > 0) {
          for (const loan of activeLoans) {
            const loanAny = loan as any; // Cast to any to access dynamic properties
            borrowersWithLoans.push({
              borrower_id: borrower.id,
              first_name: borrower.first_name,
              last_name: borrower.last_name,
              phone: borrower.phone || '',
              loan_amount: loanAny.remaining,
              loan_date: loanAny.loan_date || loanAny.date || new Date().toISOString().split('T')[0],
              loan_id: loanAny.id,
            });
          }
        }
      }

      // Prepare donations (recent ones)
      const recentDonations = await db.query(
        'SELECT * FROM donations ORDER BY date DESC LIMIT 100'
      ) as any[];
      const donationsData = recentDonations.map((d: any) => {
        const donor = donors.find((don: any) => don.id === d.donor_id);
        return {
          donation_id: d.id,
          amount: d.amount,
          date: d.date,
          donor_first: donor?.first_name || '',
          donor_last: donor?.last_name || '',
          donor_phone: donor?.phone || '',
        };
      });

      // Prepare deposits
      const recentDeposits = await db.query(
        'SELECT * FROM deposits WHERE status != "withdrawn" ORDER BY date DESC LIMIT 100'
      ) as any[];
      const depositsData = recentDeposits.map((d: any) => {
        const depositor = depositors.find((dep: any) => dep.id === d.depositor_id);
        return {
          deposit_id: d.id,
          amount: d.amount,
          date: d.date,
          depositor_first: depositor?.first_name || '',
          depositor_last: depositor?.last_name || '',
          depositor_phone: depositor?.phone || '',
        };
      });

      // Prepare expenses
      const expensesData = expenses.map((e: any) => ({
        expense_id: e.id,
        amount: e.amount,
        date: e.date,
        description: e.description || '',
        category: e.category || '',
      }));

      // Prepare loan disbursements
      const loanDisbursementsData = loans.map((l: any) => {
        const borrower = borrowers.find((b: any) => b.id === l.borrower_id);
        return {
          loan_id: l.id,
          borrower_id: l.borrower_id,
          first_name: borrower?.first_name || '',
          last_name: borrower?.last_name || '',
          amount: l.amount,
          date: l.date,
          loan_purpose: l.loan_purpose || '',
        };
      });

      // Create matches for each transaction
      // Process in batches to avoid performance issues
      for (const txn of unmatchedTxns.slice(0, batchSize)) {
        try {
          const count = await bankService.createAutoMatchesForTransaction(
            txn.id,
            borrowersWithLoans,
            donationsData,
            depositsData,
            expensesData,
            loanDisbursementsData
          );
          totalMatches += count;
        } catch (err) {
          console.error(`Failed to create matches for transaction ${txn.id}:`, err);
        }
      }

      await loadData();
      
      // Show detailed message
      const remaining = unmatchedTxns.length - willProcess;
      let message = `נוצרו ${totalMatches} התאמות מתוך ${willProcess} עסקאות!`;
      if (remaining > 0) {
        message += `\n\nנותרו עוד ${remaining} עסקאות ללא התאמה.\nלחץ שוב על הכפתור למעבד אותן.`;
      }
      alert(message);
    } catch (err) {
      setError(`שגיאה ביצירת התאמות: ${err}`);
    } finally {
      setCreatingMatches(false);
    }
  };

  const current = suggestions[currentIndex];
  const currentTxn = current ? transactions[current.transaction_id] : null;

  const tabCounts = {
    all: suggestions.length,
    pending: suggestions.filter((s) => s.status === 'pending').length,
    approved: suggestions.filter((s) => s.status === 'approved').length,
    rejected: suggestions.filter((s) => s.status === 'rejected').length,
    skipped: suggestions.filter((s) => s.status === 'skipped').length,
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Show master password dialog if not unlocked
  if (!masterPasswordUnlocked) {
    return (
      <>
        <MasterPasswordDialog
          open={true}
          mode="verify"
          onSuccess={handleMasterPasswordSuccess}
          onClose={() => window.history.back()}
        />
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <Typography variant="body1" color="text.secondary">
              נא להזין סיסמת-על...
            </Typography>
          </Box>
        </Container>
      </>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          אישור התאמות
        </Typography>
        <Box display="flex" gap={2}>
          {unmatched.length > 0 && (
            <>
              <Button
                variant="contained"
                color="primary"
                onClick={handleCreateAutoMatches}
                disabled={creatingMatches}
              >
                {creatingMatches ? <CircularProgress size={20} /> : `צור התאמות אוטומטיות (${Math.min(unmatched.length, 50)})`}
              </Button>
              <Button
                variant="outlined"
                color="warning"
                onClick={() => setDeleteUnmatchedDialogOpen(true)}
              >
                מחק עסקאות ללא התאמה ({unmatched.length})
              </Button>
            </>
          )}
          {tabCounts.pending > 0 && (
            <Button
              variant="outlined"
              color="error"
              onClick={() => setDeleteAllDialogOpen(true)}
            >
              מחק כל הממתינים ({tabCounts.pending})
            </Button>
          )}
          {/* Debug: Show counts */}
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            ממתין: {tabCounts.pending} | הכל: {tabCounts.all}
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Filter tabs */}
      <Tabs
        value={filterTab}
        onChange={(_, v) => setFilterTab(v as FilterTab)}
        sx={{ mb: 3 }}
      >
        <Tab label={`הכל (${tabCounts.all})`} value="all" />
        <Tab label={`ממתין (${tabCounts.pending})`} value="pending" />
        <Tab label={`מאושר (${tabCounts.approved})`} value="approved" />
        <Tab label={`נדחה (${tabCounts.rejected})`} value="rejected" />
        <Tab label={`דולג (${tabCounts.skipped})`} value="skipped" />
      </Tabs>

      {suggestions.length === 0 ? (
        <Card>
          <CardContent>
            <Typography align="center" color="text.secondary">
              {filterTab === 'pending'
                ? 'אין התאמות ממתינות לאישור'
                : 'אין התאמות בקטגוריה זו'}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Navigation */}
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <IconButton
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={currentIndex === 0}
            >
              <ArrowForwardIcon />
            </IconButton>
            <Typography>
              {currentIndex + 1} / {suggestions.length}
            </Typography>
            <IconButton
              onClick={() => setCurrentIndex((i) => Math.min(i + 1, suggestions.length - 1))}
              disabled={currentIndex === suggestions.length - 1}
            >
              <ArrowBackIcon />
            </IconButton>
          </Box>

          {/* Match card */}
          {current && currentTxn && (
            <TransactionMatchCard
              suggestion={current}
              transaction={currentTxn}
              onApprove={() => handleApprove(current.id)}
              onReject={() => handleReject(current.id)}
              onSkip={() => handleSkip(current.id)}
              onManualMatch={() => setManualMatchOpen(true)}
            />
          )}
        </>
      )}

      {/* Unmatched transactions section */}
      {unmatched.length > 0 && (
        <Box mt={4}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            עסקאות ללא התאמה ({unmatched.length})
          </Typography>
          {unmatched.map((txn) => (
            <UnmatchedTransactionRow
              key={txn.id}
              transaction={txn}
              onManualMatch={() => setManualMatchOpen(true)}
            />
          ))}
        </Box>
      )}

      {/* Manual match dialog */}
      <ManualMatchDialog
        open={manualMatchOpen}
        onClose={() => setManualMatchOpen(false)}
        transactionId={current?.transaction_id || ''}
        transaction={currentTxn}
        onMatchCreated={() => {
          setManualMatchOpen(false);
          loadData();
        }}
      />

      {/* Delete all pending dialog */}
      <Dialog open={deleteAllDialogOpen} onClose={() => setDeleteAllDialogOpen(false)}>
        <DialogTitle>מחיקת כל ההתאמות הממתינות</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ פעולה זו תמחק את כל {tabCounts.pending} ההתאמות הממתינות לאישור
          </Alert>
          <Typography>
            האם אתה בטוח שברצונך למחוק את כל ההתאמות הממתינות?
            <br />
            ההתאמות יסומנו כ"נדחה" ולא יוצגו יותר.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllDialogOpen(false)}>ביטול</Button>
          <Button onClick={handleDeleteAllPending} color="error" variant="contained">
            מחק הכל
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete unmatched transactions dialog */}
      <Dialog open={deleteUnmatchedDialogOpen} onClose={() => setDeleteUnmatchedDialogOpen(false)}>
        <DialogTitle>מחיקת עסקאות ללא התאמה</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            ⚠️ פעולה זו תמחק לצמיתות {unmatched.length} עסקאות בנק שלא הותאמו לרשומות במערכת
          </Alert>
          <Typography variant="body2" sx={{ mb: 2 }}>
            עסקאות אלו יימחקו מהמערכת ולא ניתן יהיה לשחזר אותן.
          </Typography>
          <Typography variant="body2" fontWeight="bold" color="error">
            האם אתה בטוח שברצונך למחוק את כל העסקאות ללא התאמה?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteUnmatchedDialogOpen(false)}>ביטול</Button>
          <Button onClick={handleDeleteUnmatchedTransactions} color="error" variant="contained">
            מחק עסקאות ({unmatched.length})
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// ============================================================================
// Transaction Match Card
// ============================================================================

interface TransactionMatchCardProps {
  suggestion: MatchSuggestion;
  transaction: BankTransaction;
  onApprove: () => void;
  onReject: () => void;
  onSkip: () => void;
  onManualMatch: () => void;
}

const TransactionMatchCard: React.FC<TransactionMatchCardProps> = ({
  suggestion,
  transaction,
  onApprove,
  onReject,
  onSkip,
  onManualMatch,
}) => {
  const matchTypeLabel: Record<string, string> = {
    repayment: 'פירעון',
    donation: 'תרומה',
    deposit: 'הפקדה',
    expense: 'הוצאה',
    loan_disbursement: 'העברת הלוואה',
  };

  const isReadonly = suggestion.status !== 'pending';

  return (
    <Card>
      <CardContent>
        <Grid container spacing={2} alignItems="center">
          {/* Left panel - Bank transaction */}
          <Grid item xs={5}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'primary.50',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'primary.200',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                עסקת בנק
              </Typography>
              <Typography variant="h5" color="primary.main" sx={{ fontWeight: 'bold', my: 0.5 }}>
                ₪{Math.abs(transaction.amount).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                {new Date(transaction.date).toLocaleDateString('he-IL')}
              </Typography>
              
              {/* Show extracted name prominently */}
              <Typography 
                variant="body1" 
                sx={{ 
                  mt: 1.5, 
                  mb: 1,
                  fontWeight: 'bold',
                  wordBreak: 'break-word',
                  fontSize: '1rem'
                }}
              >
                {getTransactionDisplayName(transaction)}
              </Typography>
              
              {/* Show original description as secondary info if memo was used */}
              {transaction.memo && (
                <Typography 
                  variant="caption" 
                  color="text.secondary" 
                  sx={{ 
                    display: 'block', 
                    mt: 0.5,
                    fontSize: '0.75rem',
                    opacity: 0.7
                  }}
                >
                  מקור: {transaction.description}
                </Typography>
              )}
            </Box>
          </Grid>

          {/* Center - confidence score */}
          <Grid item xs={2}>
            <Box display="flex" flexDirection="column" alignItems="center">
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 'bold',
                  color: confidenceColor[suggestion.confidence_level] ?? '#666',
                }}
              >
                {Math.round(suggestion.confidence_score)}%
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: confidenceColor[suggestion.confidence_level] ?? '#666' }}
              >
                {confidenceLabel[suggestion.confidence_level] ?? ''}
              </Typography>
            </Box>
          </Grid>

          {/* Right panel - Record */}
          <Grid item xs={5}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'success.50',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'success.200',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {matchTypeLabel[suggestion.match_type] ?? suggestion.match_type}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                מזהה: {suggestion.target_id}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Match reasons */}
        {suggestion.match_reasons.length > 0 && (
          <Box mt={2} display="flex" gap={1} flexWrap="wrap">
            {suggestion.match_reasons.map((reason, i) => (
              <Chip
                key={i}
                label={reason}
                size="small"
                color={reason.startsWith('⚠️') ? 'warning' : 'default'}
              />
            ))}
          </Box>
        )}

        {/* Actions */}
        {!isReadonly && (
          <Box display="flex" justifyContent="center" gap={2} mt={3}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckIcon />}
              onClick={onApprove}
            >
              אשר
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<CloseIcon />}
              onClick={onReject}
            >
              דחה
            </Button>
            <Button
              variant="outlined"
              startIcon={<SkipNextIcon />}
              onClick={onSkip}
            >
              דלג
            </Button>
            <Button
              variant="outlined"
              startIcon={<SearchIcon />}
              onClick={onManualMatch}
            >
              ידני
            </Button>
          </Box>
        )}

        {isReadonly && (
          <Box mt={2} textAlign="center">
            <Chip
              label={
                suggestion.status === 'approved'
                  ? '✓ אושר'
                  : suggestion.status === 'rejected'
                  ? '✗ נדחה'
                  : '→ דולג'
              }
              color={
                suggestion.status === 'approved'
                  ? 'success'
                  : suggestion.status === 'rejected'
                  ? 'error'
                  : 'default'
              }
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================================================
// Unmatched Transaction Row
// ============================================================================

const UnmatchedTransactionRow: React.FC<{
  transaction: BankTransaction;
  onManualMatch: () => void;
}> = ({ transaction, onManualMatch }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      p: 1.5,
      mb: 1,
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
    }}
  >
    <Box>
      <Typography variant="body2" fontWeight="medium">
        ₪{Math.abs(transaction.amount).toLocaleString()} —{' '}
        {new Date(transaction.date).toLocaleDateString('he-IL')}
      </Typography>
      <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
        {getTransactionDisplayName(transaction)}
      </Typography>
      {transaction.memo && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          מקור: {transaction.description}
        </Typography>
      )}
    </Box>
    <Button size="small" variant="outlined" startIcon={<SearchIcon />} onClick={onManualMatch}>
      התאם
    </Button>
  </Box>
);

// ============================================================================
// Manual Match Dialog
// ============================================================================

interface ManualMatchDialogProps {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  transaction: BankTransaction | null;
  onMatchCreated: () => void;
}

const ManualMatchDialog: React.FC<ManualMatchDialogProps> = ({
  open,
  onClose,
  transactionId,
  transaction,
  onMatchCreated,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [matchType, setMatchType] = useState<'repayment' | 'donation' | 'deposit' | 'expense' | 'loan_disbursement'>('repayment');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('נא להזין ערך לחיפוש');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { db } = await import('../../services/database');
      const { loansService } = await import('../../services/database');
      
      if (matchType === 'repayment') {
        // Search for borrowers with active loans
        const allBorrowers = await db.query('SELECT * FROM borrowers') as any[];
        const borrowers = allBorrowers.filter(b => 
          !b.is_deleted && (
            b.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.phone?.includes(searchQuery)
          )
        );
        
        const borrowersWithLoans = [];
        for (const borrower of borrowers) {
          const loans = await loansService.getByBorrower(borrower.id);
          const activeLoans = loans.filter((l: any) => l.remaining > 0);
          if (activeLoans.length > 0) {
            borrowersWithLoans.push({
              ...borrower,
              loans: activeLoans,
            });
          }
        }
        
        setResults(borrowersWithLoans);
      } else if (matchType === 'donation') {
        // Search for donors
        const allDonors = await db.query('SELECT * FROM donors') as any[];
        const donors = allDonors.filter(d =>
          d.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.phone?.includes(searchQuery)
        );
        setResults(donors);
      } else if (matchType === 'deposit') {
        // Search for depositors
        const allDepositors = await db.query('SELECT * FROM depositors') as any[];
        const depositors = allDepositors.filter(d =>
          d.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.phone?.includes(searchQuery)
        );
        setResults(depositors);
      } else if (matchType === 'expense') {
        // Search for expenses
        const allExpenses = await db.query('SELECT * FROM expenses') as any[];
        const expenses = allExpenses.filter(e =>
          e.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.category?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        setResults(expenses);
      } else if (matchType === 'loan_disbursement') {
        // Search for recent loans (potential disbursements)
        const allLoans = await db.query('SELECT * FROM loans') as any[];
        const allBorrowers = await db.query('SELECT * FROM borrowers') as any[];
        
        const loans = allLoans
          .filter(l => !l.is_deleted)
          .map(l => {
            const borrower = allBorrowers.find(b => b.id === l.borrower_id);
            return {
              ...l,
              first_name: borrower?.first_name || '',
              last_name: borrower?.last_name || '',
              phone: borrower?.phone || '',
            };
          })
          .filter(l =>
            l.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.last_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.phone?.includes(searchQuery)
          )
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 50);
        
        setResults(loans);
      }
    } catch (err) {
      setError(`שגיאה בחיפוש: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMatch = async (targetId: string) => {
    try {
      await bankService.createManualMatch(transactionId, matchType, targetId);
      onMatchCreated();
    } catch (err) {
      setError(`שגיאה ביצירת התאמה: ${err}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>התאמה ידנית</DialogTitle>
      <DialogContent>
        {transaction && (
          <Box mb={3} p={2} bgcolor="grey.100" borderRadius={1}>
            <Typography variant="subtitle2" color="text.secondary">
              עסקת בנק
            </Typography>
            <Typography variant="h6">
              ₪{Math.abs(transaction.amount).toLocaleString()} - {new Date(transaction.date).toLocaleDateString('he-IL')}
            </Typography>
            <Typography variant="body1" fontWeight="medium" sx={{ mt: 1 }}>
              {getTransactionDisplayName(transaction)}
            </Typography>
            {transaction.memo && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                מקור: {transaction.description}
              </Typography>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2} alignItems="center" mb={2}>
          <Grid item xs={12}>
            <Tabs value={matchType} onChange={(_, v) => setMatchType(v)} variant="scrollable" scrollButtons="auto">
              <Tab label="פירעון" value="repayment" />
              <Tab label="תרומה" value="donation" />
              <Tab label="הפקדה" value="deposit" />
              <Tab label="הוצאה" value="expense" />
              <Tab label="הלוואה חדשה" value="loan_disbursement" />
            </Tabs>
          </Grid>
          <Grid item xs={8}>
            <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
              <TextField
                type="text"
                placeholder={
                  matchType === 'expense' 
                    ? "חיפוש לפי תיאור, קטגוריה..."
                    : "חיפוש לפי שם, טלפון..."
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                fullWidth
                size="small"
                variant="outlined"
              />
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Button
              variant="contained"
              onClick={handleSearch}
              disabled={loading}
              fullWidth
            >
              {loading ? <CircularProgress size={20} /> : 'חפש'}
            </Button>
          </Grid>
        </Grid>

        {results.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              נמצאו {results.length} תוצאות
            </Typography>
            {results.map((result) => (
              <Card key={result.id} sx={{ mb: 1 }}>
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5 }}>
                  <Box>
                    {(matchType === 'repayment' || matchType === 'loan_disbursement') && (
                      <>
                        <Typography variant="body1" fontWeight="medium">
                          {result.first_name} {result.last_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {result.phone}
                        </Typography>
                        {matchType === 'repayment' && result.loans && (
                          <Box mt={0.5}>
                            {result.loans.map((loan: any) => (
                              <Chip
                                key={loan.id}
                                label={`הלוואה: ₪${loan.remaining.toLocaleString()} נותרו`}
                                size="small"
                                sx={{ mr: 0.5 }}
                              />
                            ))}
                          </Box>
                        )}
                        {matchType === 'loan_disbursement' && (
                          <Box mt={0.5}>
                            <Chip
                              label={`סכום: ₪${result.amount.toLocaleString()}`}
                              size="small"
                              color="primary"
                              sx={{ mr: 0.5 }}
                            />
                            <Chip
                              label={new Date(result.date).toLocaleDateString('he-IL')}
                              size="small"
                              sx={{ mr: 0.5 }}
                            />
                            {result.loan_purpose && (
                              <Chip
                                label={result.loan_purpose}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>
                        )}
                      </>
                    )}
                    {(matchType === 'donation' || matchType === 'deposit') && (
                      <>
                        <Typography variant="body1" fontWeight="medium">
                          {result.first_name} {result.last_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {result.phone}
                        </Typography>
                      </>
                    )}
                    {matchType === 'expense' && (
                      <>
                        <Typography variant="body1" fontWeight="medium">
                          {result.description}
                        </Typography>
                        <Box mt={0.5}>
                          <Chip
                            label={result.category}
                            size="small"
                            color="secondary"
                            sx={{ mr: 0.5 }}
                          />
                          <Chip
                            label={`₪${result.amount.toLocaleString()}`}
                            size="small"
                          />
                          {result.date && (
                            <Chip
                              label={new Date(result.date).toLocaleDateString('he-IL')}
                              size="small"
                              sx={{ ml: 0.5 }}
                            />
                          )}
                        </Box>
                      </>
                    )}
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleCreateMatch(result.id)}
                  >
                    התאם
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}

        {results.length === 0 && searchQuery && !loading && (
          <Typography color="text.secondary" align="center">
            לא נמצאו תוצאות
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>סגור</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BankMatchingPage;
