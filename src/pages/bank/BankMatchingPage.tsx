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
import { bankService, BankTransaction, MatchSuggestion } from '../../services/bankService';
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
      await bankService.approveMatch(id);
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
      <Typography variant="h4" component="h1" gutterBottom>
        אישור התאמות
      </Typography>

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
      <Dialog open={manualMatchOpen} onClose={() => setManualMatchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>התאמה ידנית</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            חיפוש התאמה ידנית יהיה זמין בגרסה הבאה.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualMatchOpen(false)}>סגור</Button>
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
              <Typography variant="body2" sx={{ mt: 1, wordBreak: 'break-word' }}>
                {transaction.description}
              </Typography>
              {transaction.memo && (
                <Typography variant="caption" color="text.secondary">
                  {transaction.memo}
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
      <Typography variant="caption" color="text.secondary">
        {transaction.description}
      </Typography>
    </Box>
    <Button size="small" variant="outlined" startIcon={<SearchIcon />} onClick={onManualMatch}>
      התאם
    </Button>
  </Box>
);

export default BankMatchingPage;
