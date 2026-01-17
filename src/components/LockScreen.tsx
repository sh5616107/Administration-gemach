import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Collapse,
} from '@mui/material'
import {
  Lock as LockIcon,
  Help as HelpIcon,
} from '@mui/icons-material'
import { verifyCode, getCustomHint, setAuthenticated } from '../services/protection'

interface LockScreenProps {
  onUnlock: () => void
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [customHint, setCustomHintState] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    loadCustomHint()
  }, [])

  const loadCustomHint = async () => {
    const hint = await getCustomHint()
    setCustomHintState(hint)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const isValid = await verifyCode(code)
    if (isValid) {
      setAuthenticated(true)
      onUnlock()
    } else {
      setAttempts(prev => prev + 1)
      setError('סיסמה שגויה')
      setCode('')
      
      // הצג רמז אחרי 3 ניסיונות
      if (attempts >= 2) {
        setShowHint(true)
      }
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'primary.dark',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <LockIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h5" fontWeight="bold">
              מינהל הגמ"ח
            </Typography>
            <Typography variant="body2" color="text.secondary">
              הזן סיסמה להמשך
            </Typography>
          </Box>

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="סיסמה"
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError('') }}
              placeholder="הזן סיסמה"
              sx={{ mb: 2 }}
              autoFocus
            />

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
                {attempts >= 3 && ' - לחץ על הרמז לעזרה'}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              type="submit"
              disabled={code.length < 4}
              sx={{ mb: 2 }}
            >
              כניסה
            </Button>
          </form>

          <Box sx={{ textAlign: 'center' }}>
            <Button
              size="small"
              startIcon={<HelpIcon />}
              onClick={() => setShowHint(!showHint)}
              color="inherit"
            >
              {showHint ? 'הסתר רמז' : 'הצג רמז'}
            </Button>
            <Button
              size="small"
              onClick={() => setShowForgotPassword(!showForgotPassword)}
              color="inherit"
              sx={{ mr: 1 }}
            >
              שכחתי סיסמה
            </Button>
          </Box>

          <Collapse in={showHint}>
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                רמז לסיסמה:
              </Typography>
              {customHint ? (
                <Typography variant="body2">{customHint}</Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">לא הוגדר רמז</Typography>
              )}
            </Alert>
          </Collapse>

          <Collapse in={showForgotPassword}>
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                שכחת סיסמה?
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                שלח למפתח את התאריך של היום וקבל קוד שחזור:
              </Typography>
              <Typography 
                variant="body2" 
                component="a" 
                href="mailto:sh5616107@gmail.com"
                sx={{ color: 'primary.main', textDecoration: 'underline', direction: 'ltr', display: 'inline-block' }}
              >
                sh5616107@gmail.com
              </Typography>
            </Alert>
          </Collapse>
        </CardContent>
      </Card>
    </Box>
  )
}
