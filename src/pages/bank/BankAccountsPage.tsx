/**
 * Bank Accounts Page
 * 
 * Page for managing bank accounts and credentials.
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Container,
  Typography,
  Grid,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  InputAdornment,
  FormHelperText,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility,
  VisibilityOff,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  PowerSettingsNew as PowerIcon,
} from '@mui/icons-material';
import { bankService, BankAccount, BankCredentials } from '../../services/bankService';
import MasterPasswordDialog from '../../components/bank/MasterPasswordDialog';

// ============================================================================
// Main Component
// ============================================================================

const BankAccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [error, setError] = useState<string>('');
  const [masterPasswordMode, setMasterPasswordMode] = useState<'create' | 'verify' | null>(null);
  const [masterPasswordUnlocked, setMasterPasswordUnlocked] = useState(false);

  useEffect(() => {
    checkMasterPassword();
  }, []);

  useEffect(() => {
    if (masterPasswordUnlocked) {
      loadAccounts();
    }
  }, [masterPasswordUnlocked]);

  const checkMasterPassword = async () => {
    try {
      setLoading(true);
      const hasPassword = await bankService.hasMasterPassword();
      if (!hasPassword) {
        setMasterPasswordMode('create');
      } else {
        setMasterPasswordMode('verify');
      }
    } catch (err) {
      setError(`שגיאה בבדיקת סיסמה: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMasterPasswordSuccess = () => {
    setMasterPasswordMode(null);
    setMasterPasswordUnlocked(true);
  };

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await bankService.getBankAccounts();
      setAccounts(data);
    } catch (err) {
      setError(`שגיאה בטעינת חשבונות: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = () => {
    setSelectedAccount(null);
    setDialogOpen(true);
  };

  const handleEditAccount = (account: BankAccount) => {
    setSelectedAccount(account);
    setDialogOpen(true);
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק חשבון זה?')) {
      return;
    }

    try {
      await bankService.deleteBankAccount(accountId);
      await loadAccounts();
    } catch (err) {
      setError(`שגיאה במחיקת חשבון: ${err}`);
    }
  };

  const handleToggleAccount = async (accountId: string, isActive: boolean) => {
    try {
      await bankService.toggleBankAccount(accountId, !isActive);
      await loadAccounts();
    } catch (err) {
      setError(`שגיאה בשינוי סטטוס חשבון: ${err}`);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedAccount(null);
  };

  const handleDialogSave = async () => {
    await loadAccounts();
    handleDialogClose();
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  // Show master password dialog if not unlocked
  if (masterPasswordMode !== null) {
    return (
      <>
        <MasterPasswordDialog
          open={true}
          mode={masterPasswordMode}
          onSuccess={handleMasterPasswordSuccess}
          onClose={masterPasswordMode === 'verify' ? () => window.history.back() : undefined}
        />
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <Typography variant="body1" color="text.secondary">
              {masterPasswordMode === 'create' ? 'נא ליצור סיסמת-על...' : 'נא להזין סיסמת-על...'}
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
          חשבונות בנק
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleAddAccount}
        >
          הוסף חשבון
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {accounts.length === 0 ? (
        <Card>
          <CardContent>
            <Typography variant="body1" color="text.secondary" align="center">
              לא הוגדרו חשבונות בנק. הוסף חשבון ראשון כדי להתחיל.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {accounts.map((account) => (
            <Grid item xs={12} md={6} key={account.id}>
              <BankAccountCard
                account={account}
                onEdit={handleEditAccount}
                onDelete={handleDeleteAccount}
                onToggle={handleToggleAccount}
              />
            </Grid>
          ))}
        </Grid>
      )}

      <BankAccountDialog
        open={dialogOpen}
        account={selectedAccount}
        onClose={handleDialogClose}
        onSave={handleDialogSave}
      />
    </Container>
  );
};

// ============================================================================
// Bank Account Card Component
// ============================================================================

interface BankAccountCardProps {
  account: BankAccount;
  onEdit: (account: BankAccount) => void;
  onDelete: (accountId: string) => void;
  onToggle: (accountId: string, isActive: boolean) => void;
}

const BankAccountCard: React.FC<BankAccountCardProps> = ({
  account,
  onEdit,
  onDelete,
  onToggle,
}) => {
  const getStatusChip = () => {
    if (!account.is_active) {
      return <Chip label="לא פעיל" size="small" color="default" />;
    }

    if (account.last_sync_status === 'completed') {
      return <Chip label="פעיל" size="small" color="success" icon={<CheckCircleIcon />} />;
    }

    if (account.last_sync_status === 'failed') {
      return <Chip label="שגיאה" size="small" color="error" icon={<ErrorIcon />} />;
    }

    return <Chip label="פעיל" size="small" color="primary" />;
  };

  const getBankDisplayName = (companyId: string): string => {
    const banks: Record<string, string> = {
      hapoalim: 'בנק הפועלים',
      leumi: 'בנק לאומי',
      discount: 'בנק דיסקונט',
      mizrahi: 'בנק מזרחי טפחות',
      isracard: 'ישראכרט',
      visaCal: 'ויזה כאל',
      max: 'מקס',
      leumiCard: 'לאומי כרטיסים',
      yahav: 'בנק יהב',
      union: 'בנק האיגוד',
      amex: 'אמריקן אקספרס',
      beyahadBishvilha: 'ביחד בשבילך',
      massad: 'בנק מסד',
      mercantile: 'בנק מרכנתיל',
      otsar: 'בנק אוצר החייל',
    };
    return banks[companyId] || companyId;
  };

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
          <Box>
            <Typography variant="h6" component="div">
              {account.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {getBankDisplayName(account.company_id)}
            </Typography>
          </Box>
          {getStatusChip()}
        </Box>

        {account.last_sync_at && (
          <Typography variant="caption" color="text.secondary">
            סנכרון אחרון: {new Date(account.last_sync_at).toLocaleString('he-IL')}
          </Typography>
        )}

        {account.last_sync_error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {account.last_sync_error}
          </Alert>
        )}
      </CardContent>

      <CardActions>
        <IconButton
          size="small"
          color={account.is_active ? 'primary' : 'default'}
          onClick={() => onToggle(account.id, account.is_active)}
          title={account.is_active ? 'השבת' : 'הפעל'}
        >
          <PowerIcon />
        </IconButton>
        <IconButton size="small" onClick={() => onEdit(account)} title="ערוך">
          <EditIcon />
        </IconButton>
        <IconButton
          size="small"
          color="error"
          onClick={() => onDelete(account.id)}
          title="מחק"
        >
          <DeleteIcon />
        </IconButton>
      </CardActions>
    </Card>
  );
};

// ============================================================================
// Bank Account Dialog Component
// ============================================================================

interface BankAccountDialogProps {
  open: boolean;
  account: BankAccount | null;
  onClose: () => void;
  onSave: () => void;
}

const BankAccountDialog: React.FC<BankAccountDialogProps> = ({
  open,
  account,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [credentials, setCredentials] = useState<BankCredentials>({});
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account) {
      setName(account.name);
      setCompanyId(account.company_id);
      // Note: credentials are encrypted, can't show them
      setCredentials({});
    } else {
      setName('');
      setCompanyId('');
      setCredentials({});
    }
    setError('');
  }, [account, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('נא למלא שם חשבון');
      return;
    }

    if (!companyId) {
      setError('נא לבחור בנק');
      return;
    }

    if (!credentials.username && !credentials.user_code && !credentials.id_number) {
      setError('נא למלא שם משתמש / קוד משתמש / תעודת זהות');
      return;
    }

    if (!credentials.password) {
      setError('נא למלא סיסמה');
      return;
    }

    try {
      setSaving(true);
      await bankService.saveBankAccount(name, companyId, credentials, account?.id);
      onSave();
    } catch (err) {
      setError(`שגיאה בשמירת חשבון: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const banks = [
    { id: 'hapoalim', name: 'בנק הפועלים' },
    { id: 'leumi', name: 'בנק לאומי' },
    { id: 'discount', name: 'בנק דיסקונט' },
    { id: 'mizrahi', name: 'בנק מזרחי טפחות' },
    { id: 'isracard', name: 'ישראכרט' },
    { id: 'visaCal', name: 'ויזה כאל' },
    { id: 'max', name: 'מקס' },
    { id: 'leumiCard', name: 'לאומי כרטיסים' },
    { id: 'yahav', name: 'בנק יהב' },
    { id: 'union', name: 'בנק האיגוד' },
    { id: 'amex', name: 'אמריקן אקספרס' },
    { id: 'beinleumi', name: 'בנק בינלאומי' },
    { id: 'massad', name: 'בנק מסד' },
    { id: 'mercantile', name: 'בנק מרכנתיל' },
    { id: 'beyahadBishvilha', name: 'ביחד בשבילך' },
    { id: 'behatsdaa', name: 'בהצדעה' },
    { id: 'oneZero', name: 'OneZero' },
  ];

  const requiresIdNumber = ['discount', 'mizrahi', 'mercantile'].includes(companyId);
  const requiresUserCode = ['hapoalim'].includes(companyId);
  const requiresCard6Digits = ['isracard', 'amex'].includes(companyId);
  const requiresIdAsUsername = ['isracard', 'amex', 'discount', 'mercantile', 'beyahadBishvilha', 'behatsdaa'].includes(companyId);
  const requiresNationalId = ['yahav'].includes(companyId);
  const requiresNum = ['discount', 'mercantile'].includes(companyId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{account ? 'ערוך חשבון בנק' : 'הוסף חשבון בנק'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="שם חשבון"
          value={name}
          onChange={(e) => setName(e.target.value)}
          margin="normal"
          helperText="למשל: חשבון עסקי, כרטיס אשראי אישי"
        />

        <FormControl fullWidth margin="normal">
          <InputLabel>בנק</InputLabel>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} label="בנק">
            {banks.map((bank) => (
              <MenuItem key={bank.id} value={bank.id}>
                {bank.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {companyId && (
          <>
            {/* User code (Hapoalim) */}
            {requiresUserCode && (
              <TextField
                fullWidth
                label="קוד משתמש"
                value={credentials.user_code || ''}
                onChange={(e) => setCredentials({ ...credentials, user_code: e.target.value })}
                margin="normal"
              />
            )}

            {/* ID as username (Isracard, Amex, Discount, etc.) */}
            {requiresIdAsUsername && (
              <TextField
                fullWidth
                label="תעודת זהות"
                value={credentials.id_number || ''}
                onChange={(e) => setCredentials({ ...credentials, id_number: e.target.value })}
                margin="normal"
              />
            )}

            {/* Standard username */}
            {!requiresUserCode && !requiresIdAsUsername && (
              <TextField
                fullWidth
                label="שם משתמש"
                value={credentials.username || ''}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                margin="normal"
              />
            )}

            {/* National ID (Yahav) */}
            {requiresNationalId && (
              <TextField
                fullWidth
                label="תעודת זהות"
                value={credentials.id_number || ''}
                onChange={(e) => setCredentials({ ...credentials, id_number: e.target.value })}
                margin="normal"
              />
            )}

            {/* Card 6 digits (Isracard, Amex) */}
            {requiresCard6Digits && (
              <TextField
                fullWidth
                label="6 ספרות אחרונות של כרטיס"
                value={credentials.card_6_digits || ''}
                onChange={(e) => setCredentials({ ...credentials, card_6_digits: e.target.value })}
                margin="normal"
                inputProps={{ maxLength: 6 }}
              />
            )}

            {/* Password */}
            <TextField
              fullWidth
              label="סיסמה"
              type={showPassword ? 'text' : 'password'}
              value={credentials.password || ''}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              margin="normal"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            {/* Num (Discount, Mercantile) */}
            {requiresNum && (
              <TextField
                fullWidth
                label="מספר חשבון (num)"
                value={credentials.num || ''}
                onChange={(e) => setCredentials({ ...credentials, num: e.target.value })}
                margin="normal"
              />
            )}

            <FormHelperText sx={{ mt: 2 }}>
              ⚠️ הפרטים מוצפנים ונשמרים באופן מאובטח במחשב שלך בלבד
            </FormHelperText>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          ביטול
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={24} /> : 'שמור'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BankAccountsPage;
