import { useEffect, useState, type ReactNode } from 'react'
import { Alert, AlertTitle, Box, Button, Snackbar, Stack, Typography } from '@mui/material'
import { ensureInitialized } from '../services/database'
import {
  getSaveFailure,
  getStorageStatus,
  retrySaveNow,
  startFreshAfterStorageError,
  subscribeStorageStatus,
  type SaveFailure,
  type StorageStatus,
} from '../services/persistence'

/**
 * שער שמוודא שאחסון הנתונים נטען תקין לפני שהאפליקציה עולה.
 *
 * - אם מסד הנתונים נפגע / לא קריא: האפליקציה לא עולה. כך לא רצים בה גיבויים אוטומטיים,
 *   מתזמנים ופעולות שמבוססים על נתונים ריקים, ושום דבר לא נכתב על גבי הנתונים הקיימים.
 * - אם התבצע מעבר או שחזור: מוצגת הודעה חד-פעמית, והאפליקציה עולה כרגיל.
 * - אם שמירה לדיסק נכשלת (גם בשמירות "שגר ושכח" שאין להן מסך משלהן): מוצגת התראה קבועה
 *   שאינה ניתנת לסגירה עד שהשמירה מצליחה, בזמן שהתוכנה מנסה שוב אוטומטית.
 */
export default function StorageStatusGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(true)
  const [confirmFresh, setConfirmFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [freshError, setFreshError] = useState<string | null>(null)
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(() => getSaveFailure())
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    const sync = () => setSaveFailure(getSaveFailure() ? { ...getSaveFailure()! } : null)
    sync()
    return subscribeStorageStatus(sync)
  }, [])

  // כל עוד יש שינויים שלא נשמרו: מבקשים אישור לפני רענון/סגירת הדף
  useEffect(() => {
    if (!saveFailure) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveFailure])

  useEffect(() => {
    let cancelled = false
    ensureInitialized()
      .catch(() => {
        // שגיאות טעינה משתקפות ב-getStorageStatus
      })
      .finally(() => {
        if (!cancelled) setStatus({ ...getStorageStatus() })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!status) {
    return <Box sx={{ minHeight: '100vh', bgcolor: 'primary.dark' }} />
  }

  if (status.state === 'error') {
    const handleStartFresh = async () => {
      setBusy(true)
      setFreshError(null)
      try {
        await startFreshAfterStorageError()
        window.location.reload()
      } catch (e) {
        setFreshError((e as Error).message)
        setBusy(false)
      }
    }

    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 640 }}>
          <Alert severity="error">
            <AlertTitle>לא ניתן לטעון את נתוני המערכת</AlertTitle>
            {status.error}
          </Alert>
          <Typography variant="body1">
            כדי להגן על הנתונים, התוכנה לא תכתוב דבר עד שהבעיה תטופל. הקבצים לא נמחקו ולא שונו.
            מומלץ לפנות לתמיכה לפני כל פעולה נוספת, ולשמור עותק של תיקיית הנתונים.
          </Typography>

          <Button variant="contained" onClick={() => window.location.reload()}>
            נסה שוב (טעינה מחדש)
          </Button>

          {status.canStartFresh && !confirmFresh && (
            <Button variant="outlined" color="warning" onClick={() => setConfirmFresh(true)}>
              התחל ממסד נתונים חדש
            </Button>
          )}
          {status.canStartFresh && confirmFresh && (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" disabled={busy} onClick={handleStartFresh}>
                  אישור, התחל מחדש
                </Button>
              }
            >
              המערכת תיפתח ריקה. הקבצים הקודמים יישמרו בתיקיית הנתונים בשם חדש ולא יימחקו, אך לא יוצגו
              בתוכנה עד לשחזור ידני.
            </Alert>
          )}
          {freshError && <Alert severity="error">{freshError}</Alert>}
        </Stack>
      </Box>
    )
  }

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await retrySaveNow()
    } catch {
      // המצב מתעדכן דרך המנוי
    } finally {
      setRetrying(false)
    }
  }

  return (
    <>
      {saveFailure && (
        <Alert
          severity="error"
          role="alert"
          sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: theme => theme.zIndex.snackbar + 1, borderRadius: 0 }}
          action={
            <Button color="inherit" size="small" disabled={retrying} onClick={handleRetry}>
              נסה שוב עכשיו
            </Button>
          }
        >
          <AlertTitle>השינויים האחרונים לא נשמרו לדיסק</AlertTitle>
          {saveFailure.message}. אל תסגור את התוכנה - היא תנסה לשמור שוב אוטומטית. (ניסיונות שנכשלו: {saveFailure.attempts})
        </Alert>
      )}
      {children}
      {(status.notice || status.warning) && (
        <Snackbar
          open={noticeOpen}
          onClose={(_, reason) => {
            // לחיצה בכל מקום אחר במסך לא סוגרת הודעה (במיוחד אזהרה) - רק כפתור הסגירה
            if (reason === 'clickaway') return
            setNoticeOpen(false)
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={status.warning ? 'warning' : 'info'}
            onClose={() => setNoticeOpen(false)}
            sx={{ maxWidth: 560 }}
          >
            {status.notice}
            {status.notice && status.warning ? ' ' : ''}
            {status.warning}
          </Alert>
        </Snackbar>
      )}
    </>
  )
}
