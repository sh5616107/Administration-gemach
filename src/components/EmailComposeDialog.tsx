import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import type { EmailData } from '../services/documents'
import { isEmailContentEmpty, registerEmailComposeHandler } from '../services/emailComposeBridge'

interface PendingCompose {
  data: EmailData
  resolve: (result: EmailData | null) => void
}

/**
 * מוצג פעם אחת ברמת האפליקציה. כשנשלחת הודעה ישירה (gmail_oauth) הוא מציג
 * את הנמען, הנושא והתוכן לעריכה, ושולח רק אחרי לחיצה מפורשת על "שלח".
 */
export default function EmailComposeHost() {
  const [pending, setPending] = useState<PendingCompose | null>(null)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const pendingRef = useRef<PendingCompose | null>(null)

  const open = useCallback((data: EmailData) => {
    return new Promise<EmailData | null>((resolve) => {
      // בקשה חדשה כשחלון כבר פתוח — מבטלים את הקודמת.
      pendingRef.current?.resolve(null)
      const next = { data, resolve }
      pendingRef.current = next
      setTo(data.to)
      setSubject(data.subject)
      setBody(data.body)
      setPending(next)
    })
  }, [])

  useEffect(() => {
    registerEmailComposeHandler(open)
    return () => registerEmailComposeHandler(null)
  }, [open])

  const close = (result: EmailData | null) => {
    const current = pendingRef.current
    pendingRef.current = null
    setPending(null)
    current?.resolve(result)
  }

  const attachmentName = pending?.data.htmlContent && pending.data.filename
    ? `${pending.data.filename}.pdf`
    : null
  const empty = isEmailContentEmpty({ subject, body })

  return (
    <Dialog open={!!pending} onClose={() => close(null)} maxWidth="sm" fullWidth dir="rtl">
      <DialogTitle>שליחת הודעה</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          margin="dense"
          label="אל"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          inputProps={{ dir: 'ltr', style: { textAlign: 'right' } }}
        />
        <TextField
          fullWidth
          margin="dense"
          label="נושא"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextField
          fullWidth
          multiline
          minRows={8}
          maxRows={16}
          margin="dense"
          label="תוכן ההודעה"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {attachmentName && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
            <AttachFileIcon fontSize="small" color="action" />
            <Typography variant="body2" color="text.secondary">
              מצורף: {attachmentName}
            </Typography>
          </Box>
        )}
        {empty && (
          <Alert severity="info" sx={{ mt: 2 }}>
            יש לכתוב נושא או תוכן לפני השליחה.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => close(null)}>ביטול</Button>
        <Button
          variant="contained"
          disabled={empty || !to.trim()}
          onClick={() => close({ ...pending!.data, to: to.trim(), subject, body })}
        >
          שלח
        </Button>
      </DialogActions>
    </Dialog>
  )
}
