/**
 * Bank History Page
 * 
 * Page for viewing sync history and balance reconciliation.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { bankService, SyncSession } from '../../services/bankService';
import MasterPasswordDialog from '../../components/bank/MasterPasswordDialog';

// ============================================================================
// Main Component
// ============================================================================

const BankHistoryPage: React.FC = () => {
  const [sessions, setSessions] = useState<SyncSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [masterPasswordUnlocked, setMasterPasswordUnlocked] = useState(false);

  useEffect(() => {
    checkMasterPassword();
  }, []);

  useEffect(() => {
    if (masterPasswordUnlocked) {
      loadSessions();
    }
  }, [masterPasswordUnlocked]);

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

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await bankService.getRecentSyncSessions(20);
      setSessions(data);
    } catch (err) {
      setError(`שגיאה בטעינת היסטוריה: ${err}`);
    } finally {
      setLoading(false);
    }
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
        היסטוריית סנכרונים
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {sessions.length === 0 ? (
        <Card>
          <CardContent>
            <Typography align="center" color="text.secondary">
              אין סנכרונים קודמים
            </Typography>
          </CardContent>
        </Card>
      ) : (
        sessions.map((session) => (
          <SyncSessionCard key={session.id} session={session} />
        ))
      )}
    </Container>
  );
};

// ============================================================================
// Sync Session Card
// ============================================================================

const SyncSessionCard: React.FC<{ session: SyncSession }> = ({ session }) => {
  const [expanded, setExpanded] = useState(false);

  const getStatusChip = () => {
    if (session.status === 'completed') {
      const hasErrors = session.accounts_synced.some((a) => a.status === 'failed');
      if (hasErrors) {
        return (
          <Chip
            icon={<WarningIcon />}
            label="הושלם עם שגיאות"
            color="warning"
            size="small"
          />
        );
      }
      return (
        <Chip
          icon={<CheckCircleIcon />}
          label="הושלם"
          color="success"
          size="small"
        />
      );
    }

    if (session.status === 'failed') {
      return (
        <Chip
          icon={<ErrorIcon />}
          label="נכשל"
          color="error"
          size="small"
        />
      );
    }

    return <Chip label={session.status} size="small" />;
  };

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        {/* Header */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          sx={{ cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          <Box>
            <Typography variant="h6">
              {new Date(session.started_at).toLocaleString('he-IL')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {session.accounts_synced.length} חשבונות
            </Typography>
          </Box>
          {getStatusChip()}
        </Box>

        {/* Stats */}
        <Box display="flex" gap={3} mt={2} flexWrap="wrap">
          <Box>
            <Typography variant="caption" color="text.secondary">
              עסקאות
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {session.total_transactions}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              חדשות
            </Typography>
            <Typography variant="body1" fontWeight="medium" color="success.main">
              {session.new_transactions}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              כפילויות
            </Typography>
            <Typography variant="body1" fontWeight="medium" color="text.secondary">
              {session.duplicates_skipped}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              התאמות
            </Typography>
            <Typography variant="body1" fontWeight="medium" color="primary.main">
              {session.matches_created}
            </Typography>
          </Box>
        </Box>

        {/* Expanded details */}
        {expanded && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              תוצאות לפי חשבון
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>חשבון</TableCell>
                  <TableCell>סטטוס</TableCell>
                  <TableCell align="right">עסקאות</TableCell>
                  <TableCell>הערות</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {session.accounts_synced.map((acc) => (
                  <TableRow key={acc.account_id}>
                    <TableCell>{acc.account_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={acc.status === 'completed' ? 'הושלם' : 'נכשל'}
                        size="small"
                        color={acc.status === 'completed' ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">{acc.transactions_count}</TableCell>
                    <TableCell>
                      {acc.error_message && (
                        <Typography variant="caption" color="error">
                          {acc.error_message}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BankHistoryPage;
