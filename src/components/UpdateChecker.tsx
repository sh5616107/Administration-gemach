import { useEffect, useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  LinearProgress,
  Box,
  Alert,
} from '@mui/material'

// הופך שורת טקסט עם **הדגשות** למקטעי JSX, בלי תלות בספריית markdown חיצונית
function renderInlineBold(line: string, keyPrefix: string) {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>
  })
}

// רינדור פשוט של "מה חדש" (מקורו בסעיף CHANGELOG.md): כותרות ###, רשימות עם - ותת-רשימות מוזחות, והדגשות **טקסט**
function ReleaseNotes({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trimEnd()
        const key = `line-${idx}`

        if (line.trim() === '') {
          return <Box key={key} sx={{ height: 6 }} />
        }

        const headerMatch = line.match(/^#{1,3}\s+(.*)$/)
        if (headerMatch) {
          return (
            <Typography key={key} variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
              {renderInlineBold(headerMatch[1], key)}
            </Typography>
          )
        }

        const bulletMatch = line.match(/^(\s*)-\s+(.*)$/)
        if (bulletMatch) {
          const indented = bulletMatch[1].length > 0
          return (
            <Box key={key} sx={{ display: 'flex', gap: 1, pr: indented ? 3 : 1.5 }}>
              <Typography variant="body2" component="span">•</Typography>
              <Typography variant="body2" component="span">
                {renderInlineBold(bulletMatch[2], key)}
              </Typography>
            </Box>
          )
        }

        return (
          <Typography key={key} variant="body2">
            {renderInlineBold(line, key)}
          </Typography>
        )
      })}
    </Box>
  )
}

// גוף העדכון (updateInfo.body) מגיע מ-CHANGELOG.md ומיועד גם לעמוד ה-Release ב-GitHub,
// שם קיים סעיף "הורדה והתקנה" רלוונטי. בתוך האפליקציה זה מיותר (העדכון כבר מותקן דרך הדיאלוג הזה) - מסירים אותו
export function stripInstallFooter(body: string) {
  return body.split(/\n#{1,3}\s+הורדה והתקנה/)[0].trim()
}

export default function UpdateChecker() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkForUpdates()
  }, [])

  const checkForUpdates = async () => {
    try {
      const update = await check()
      
      if (update?.available) {
        setUpdateAvailable(true)
        setUpdateInfo(update)
        console.log('✅ עדכון זמין:', update.version, 'תאריך:', update.date)
      } else {
        console.log('✅ אין עדכונים זמינים')
      }
    } catch (err: any) {
      console.error('❌ שגיאה בבדיקת עדכונים:', err)
      
      // אם זו שגיאה של "לא נמצא JSON" - זה תקין, פשוט אין releases
      if (err?.toString().includes('Could not fetch') || err?.toString().includes('valid release')) {
        console.log('ℹ️ אין releases זמינים ב-GitHub - זה תקין')
      } else {
        setError('לא ניתן לבדוק עדכונים כרגע')
      }
    }
  }

  const handleUpdate = async () => {
    if (!updateInfo) return
    
    setDownloading(true)
    setError(null)
    
    try {
      // הורדת העדכון עם progress
      await updateInfo.downloadAndInstall((progress: any) => {
        if (progress.event === 'Started') {
          console.log('🔽 מתחיל להוריד עדכון...')
        } else if (progress.event === 'Progress') {
          const percent = Math.round((progress.chunkLength / progress.contentLength) * 100)
          setDownloadProgress(percent)
          console.log(`📥 התקדמות: ${percent}%`)
        } else if (progress.event === 'Finished') {
          console.log('✅ הורדה הושלמה!')
        }
      })
      
      // הפעלה מחדש של האפליקציה
      console.log('🔄 מפעיל מחדש...')
      await relaunch()
      
    } catch (err) {
      console.error('❌ שגיאה בעדכון:', err)
      setError('שגיאה בהתקנת העדכון. נסה שוב מאוחר יותר.')
      setDownloading(false)
    }
  }

  const handleSkip = () => {
    setUpdateAvailable(false)
  }

  if (!updateAvailable) return null

  return (
    <Dialog open={updateAvailable} onClose={handleSkip} maxWidth="sm" fullWidth>
      <DialogTitle>
        עדכון חדש זמין! 🎉
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            גרסה {updateInfo?.version}
          </Typography>
          {updateInfo?.date && (
            <Typography variant="body2" color="text.secondary">
              תאריך פרסום: {new Date(updateInfo.date).toLocaleDateString('he-IL')}
            </Typography>
          )}
        </Box>

        {updateInfo?.body && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 320, overflowY: 'auto' }}>
            <Typography variant="subtitle2" gutterBottom>
              מה חדש:
            </Typography>
            <ReleaseNotes text={stripInstallFooter(updateInfo.body)} />
          </Box>
        )}

        {downloading && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              מוריד עדכון... {downloadProgress}%
            </Typography>
            <LinearProgress variant="determinate" value={downloadProgress} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSkip} disabled={downloading}>
          אולי מאוחר יותר
        </Button>
        <Button 
          onClick={handleUpdate} 
          variant="contained" 
          color="primary"
          disabled={downloading}
        >
          {downloading ? 'מוריד...' : 'עדכן עכשיו'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
