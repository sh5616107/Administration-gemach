/**
 * Master Password Dialog
 * 
 * Dialog for setting up and verifying the master password.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  TextField,
  Typography,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { bankService } from '../../services/bankService';

// ============================================================================
// Types
// ============================================================================

interface MasterPasswordDialogProps {
  open: boolean;
  mode: 'create' | 'verify';
  onSuccess: () => void;
  onClose?: () => void;
}

// ============================================================================
// Component
// ============================================================================

const MasterPasswordDialog: React.FC<MasterPasswordDialogProps> = ({
  open,
  mode,
  onSuccess,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hint, setHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirmPassword('');
      setHint('');
      setError('');
      setAttemptsRemaining(null);
      setLockedUntil(null);
    }
  }, [open]);

  const calculatePasswordStrength = (pwd: string): number => {
    let strength = 0;
    if (pwd.length >= 8) strength += 25;
    if (pwd.length >= 12) strength += 25;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength += 25;
    if (/\d/.test(pwd)) strength += 15;
    if (/[^a-zA-Z0-9]/.test(pwd)) strength += 10;
    return Math.min(strength, 100);
  };

  const handleCreate = async () => {
    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await bankService.setMasterPassword(password, hint || undefined);
      onSuccess();
    } catch (err) {
      setError(`שגיאה ביצירת סיסמה: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!password) {
      setError('נא להזין סיסמה');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const result = await bankService.verifyMasterPassword(password);

      if (result.success) {
        onSuccess();
      } else {
        setError(result.message || 'סיסמה שגויה');
        if (result.attempts_remaining !== undefined) {
          setAttemptsRemaining(result.attempts_remaining);
        }
        if (result.locked_until) {
          setLockedUntil(result.locked_until);
        }
      }
    } catch (err) {
      setError(`שגיאה באימות: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const strength = calculatePasswordStrength(password);
  const strengthColor =
    strength < 30 ? 'error' : strength < 60 ? 'warning' : 'success';
  const strengthLabel =
    strength < 30 ? 'חלשה' : strength < 60 ? 'בינונית' : 'חזקה';

  const isLocked = lockedUntil !== null;

  return (
    <Dialog
      open={open}
      onClose={mode === 'create' ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={mode === 'create'}
    >
      <DialogTitle>
        {mode === 'create' ? 'הגדרת סיסמת-על' : 'אימות סיסמת-על'}
      </DialogTitle>

      <DialogContent>
        {mode === 'create' && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            ⚠️ <strong>חשוב מאוד!</strong>
            <br />
            שמור סיסמה זו במקום בטוח. אם תשכח אותה, תצטרך להזין מחדש את כל
            פרטי הבנקים.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {isLocked && (
          <Alert severity="error" sx={{ mb: 2 }}>
            החשבון ננעל עקב ניסיונות כושלים מרובים. נסה שוב בעוד 5 דקות.
          </Alert>
        )}

        {attemptsRemaining !== null && attemptsRemaining < 3 && !isLocked && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            נותרו {attemptsRemaining} ניסיונות לפני נעילה
          </Alert>
        )}

        <TextField
          fullWidth
          label="סיסמת-על"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading || isLocked}
          autoFocus
          margin="normal"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {mode === 'create' && password && (
          <Box sx={{ mt: 1 }}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption">חוזק הסיסמה</Typography>
              <Typography variant="caption" color={`${strengthColor}.main`}>
                {strengthLabel}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={strength}
              color={strengthColor}
            />
          </Box>
        )}

        {mode === 'create' && (
          <>
            <TextField
              fullWidth
              label="אישור סיסמה"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              margin="normal"
            />

            <TextField
              fullWidth
              label="רמז (אופציונלי)"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              disabled={loading}
              margin="normal"
              helperText="רמז שיעזור לך לזכור את הסיסמה (לא יוצג לאחרים)"
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        {mode === 'verify' && onClose && (
          <Button onClick={onClose} disabled={loading}>
            ביטול
          </Button>
        )}
        <Button
          onClick={mode === 'create' ? handleCreate : handleVerify}
          variant="contained"
          disabled={loading || isLocked || !password}
        >
          {loading ? (
            <CircularProgress size={24} />
          ) : mode === 'create' ? (
            'צור סיסמה'
          ) : (
            'אמת'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MasterPasswordDialog;
