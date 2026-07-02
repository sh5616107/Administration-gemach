/**
 * Bank Sync Page
 * 
 * Page for initiating and monitoring bank synchronization.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Switch,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  bankService,
  BankAccount,
  SyncProgressEvent,
  SyncSession,
} from '../../services/bankService';
import MasterPasswordDialog from '../../components/bank/MasterPasswordDialog';

// ============================================================================
// Types
// ============================================================================

interface AccountProgress {
  account_id: string;
  account_name: string;
  status: string;
  progress: number;
  message: string;
  transactions_count?: number;
  error_message?: string;
}

// ============================================================================
// Main Component
// ============================================================================

const BankSyncPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().subtract(30, 'day'));
  const [endDate] = useState<Dayjs>(dayjs());
  const [isSyncing, setIsSyncing] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [progress, setProgress] = useState<AccountProgress[]>([]);
  const [lastSession, setLastSession] = useState<SyncSession | null>(null);
  const [error, setError] = useState('');
  const [masterPasswordUnlocked, setMasterPasswordUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useBrowserMode, setUseBrowserMode] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    checkMasterPassword();
    return () => {
      // Cleanup listener on unmount
      unlistenRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (masterPasswordUnlocked) {
      loadData();
    }
  }, [masterPasswordUnlocked]);

  const checkMasterPassword = async () => {
    try {
      setLoading(true);
      const hasPassword = await bankService.hasMasterPassword();
      if (hasPassword) {
        // Check if already verified in this session
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
      const [accs, sessions] = await Promise.all([
        bankService.getBankAccounts(),
        bankService.getRecentSyncSessions(1),
      ]);
      setAccounts(accs.filter((a) => a.is_active));
      if (sessions.length > 0) setLastSession(sessions[0]);
    } catch (err) {
      setError(`שגיאה בטעינת נתונים: ${err}`);
    }
  };

  const handleStartSync = async () => {
    if (accounts.length === 0) {
      setError('אין חשבונות פעילים לסנכרון');
      return;
    }

    setError('');
    setIsSyncing(true);

    // Init progress entries
    setProgress(
      accounts.map((a) => ({
        account_id: a.id,
        account_name: a.name,
        status: 'waiting',
        progress: 0,
        message: 'ממתין...',
      }))
    );

    // Subscribe to progress events
    unlistenRef.current?.();
    unlistenRef.current = await bankService.onSyncProgress(
      (event: SyncProgressEvent) => {
        setProgress((prev) =>
          prev.map((p) =>
            p.account_id === event.account_id
              ? {
                  ...p,
                  status: event.status,
                  progress: event.progress,
                  message: event.message,
                  transactions_count: event.transactions_count,
                  error_message: event.error_message,
                }
              : p
          )
        );

        // When all accounts are done, navigate to matching
        if (event.status === 'completed' || event.status === 'failed') {
          checkIfAllDone(event.session_id);
        }
      }
    );

    try {
      const result = await bankService.startBankSync(
        startDate.format('YYYY-MM-DD'),
        endDate.format('YYYY-MM-DD'),
        accounts.map((a) => a.id),
        useBrowserMode
      );
      setSessionId(result.session_id);
    } catch (err) {
      setError(`שגיאה בהפעלת סנכרון: ${err}`);
      setIsSyncing(false);
      unlistenRef.current?.();
    }
  };

  const checkIfAllDone = async (sid: string) => {
    try {
      const session = await bankService.getSyncSession(sid);
      if (!session) return;
      if (session.status === 'completed' || session.status === 'failed') {
        setIsSyncing(false);
        setLastSession(session);
        unlistenRef.current?.();

        // Navigate to matching if there are new transactions
        if (session.new_transactions > 0) {
          setTimeout(() => navigate('/bank/matching'), 1500);
        }
      }
    } catch (_) {
      // ignore
    }
  };

  const allDone =
    progress.length > 0 &&
    progress.every((p) => p.status === 'completed' || p.status === 'failed');
  const anyError = progress.some((p) => p.status === 'failed');
  const totalNew = progress.reduce((sum, p) => sum + (p.transactions_count ?? 0), 0);

  // Show loading while checking master password
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
        <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
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
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          סנכרון בנק
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Date range picker */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              טווח תאריכים
            </Typography>
            <Box display="flex" gap={2} flexWrap="wrap">
              <DatePicker
                label="מתאריך"
                value={startDate}
                onChange={(v) => v && setStartDate(v)}
                disabled={isSyncing}
                format="DD/MM/YYYY"
              />
              <DatePicker
                label="עד תאריך"
                value={endDate}
                disabled
                format="DD/MM/YYYY"
              />
              <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
                {[7, 14, 30, 60, 90].map((days) => (
                  <Chip
                    key={days}
                    label={`${days} ימים`}
                    size="small"
                    clickable
                    onClick={() => setStartDate(dayjs().subtract(days, 'day'))}
                    color={
                      dayjs().subtract(days, 'day').isSame(startDate, 'day')
                        ? 'primary'
                        : 'default'
                    }
                  />
                ))}
              </Box>
            </Box>
            <Box mt={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useBrowserMode}
                    onChange={(event) => setUseBrowserMode(event.target.checked)}
                    disabled={isSyncing}
                  />
                }
                label="פתח דפדפן לאימות (בנק רשמי)"
              />
              {useBrowserMode && (
                <Typography variant="caption" color="info.main" sx={{ display: 'block', mt: 1 }}>
                  💡 כשתלחץ על &quot;התחל סנכרון&quot;, דפדפן יפתח לצורך אימות עם הבנק. הכנס את קוד ה-OTP בדפדפן שנפתח.
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Accounts list */}
        {accounts.length === 0 ? (
          <Alert severity="warning">
            אין חשבונות פעילים. הוסף חשבון בנק בדף ניהול החשבונות.
          </Alert>
        ) : (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                חשבונות לסנכרון ({accounts.length})
              </Typography>
              {!isSyncing
                ? accounts.map((a) => (
                    <Chip key={a.id} label={a.name} sx={{ mr: 1, mb: 1 }} />
                  ))
                : progress.map((p) => (
                    <AccountProgressCard key={p.account_id} progress={p} />
                  ))}
            </CardContent>
          </Card>
        )}

        {/* Summary after sync */}
        {allDone && (
          <Card sx={{ mb: 3, bgcolor: anyError ? 'error.50' : 'success.50' }}>
            <CardContent>
              <Typography variant="h6">
                {anyError ? '⚠️ סנכרון הסתיים עם שגיאות' : '✓ סנכרון הושלם!'}
              </Typography>
              <Typography>
                עסקאות חדשות שנוספו: <strong>{totalNew}</strong>
              </Typography>
              {totalNew > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  עובר לדף אישור התאמות...
                </Typography>
              )}
            </CardContent>
          </Card>
        )}

        {/* Start button */}
        <Box display="flex" justifyContent="center">
          <Button
            variant="contained"
            size="large"
            startIcon={isSyncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
            onClick={handleStartSync}
            disabled={isSyncing || accounts.length === 0}
            sx={{ minWidth: 200 }}
          >
            {isSyncing ? 'מסנכרן...' : 'התחל סנכרון'}
          </Button>
        </Box>

        {/* Last session info */}
        {lastSession && !isSyncing && (
          <Box mt={4}>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" color="text.secondary">
              סנכרון אחרון:{' '}
              {new Date(lastSession.started_at).toLocaleString('he-IL')} —{' '}
              {lastSession.new_transactions} עסקאות חדשות
            </Typography>
          </Box>
        )}
      </Container>
    </LocalizationProvider>
  );
};

// ============================================================================
// Account Progress Card
// ============================================================================

const statusLabel: Record<string, string> = {
  waiting: 'ממתין...',
  connecting: 'מתחבר...',
  fetching: 'שולף עסקאות...',
  processing: 'מעבד...',
  completed: '✓ הושלם',
  failed: '✗ נכשל',
};

const statusColor = (status: string) => {
  if (status === 'completed') return 'success.main';
  if (status === 'failed') return 'error.main';
  return 'primary.main';
};

const AccountProgressCard: React.FC<{ progress: AccountProgress }> = ({ progress }) => (
  <Box sx={{ mb: 2 }}>
    <Box display="flex" justifyContent="space-between" mb={0.5}>
      <Typography variant="body2">{progress.account_name}</Typography>
      <Typography variant="body2" color={statusColor(progress.status)}>
        {statusLabel[progress.status] ?? progress.status}
      </Typography>
    </Box>
    <LinearProgress
      variant="determinate"
      value={progress.progress * 100}
      color={
        progress.status === 'completed'
          ? 'success'
          : progress.status === 'failed'
          ? 'error'
          : 'primary'
      }
    />
    {progress.status === 'fetching' && (
      <Typography variant="caption" color="info.main" sx={{ mt: 1, display: 'block' }}>
        🔔 אם בחרת &quot;פתח דפדפן&quot;, הוא פתוח כעת. הכנס את קוד ה-OTP בדפדפן.
      </Typography>
    )}
    {progress.error_message && (
      <Typography variant="caption" color="error">
        {progress.error_message}
      </Typography>
    )}
  </Box>
);

export default BankSyncPage;
