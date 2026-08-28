import { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  FindInPage as FindInPageIcon,
  CleaningServices as CleaningServicesIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material'
import { resolveAttachmentEntityLabel } from '../../services/database'
import {
  scanForMissingDocuments,
  listCleanupCandidates,
  cleanupSoftDeletedAttachments,
  formatFileSize,
  NotInDesktopAppError,
  type MissingDocumentsScanResult,
  type CleanupCandidate,
} from '../../services/attachmentsStorage'

/**
 * "מסמכים מצורפים" maintenance tools for the Advanced Tools screen — see
 * spec section 6.4 / stage 2 roadmap:
 * 1. "בדיקת מסמכים חסרים" — scans the archive for attachments whose
 *    physical file has gone missing.
 * 2. "ניקוי מסמכים ישנים שסומנו למחיקה" — permanently removes attachments
 *    that were soft-deleted (via a parent entity's soft delete) a while
 *    ago, after the user reviews and confirms.
 *
 * Both are user-initiated only — neither runs automatically.
 */
export default function AttachmentMaintenanceTools() {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<MissingDocumentsScanResult | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [candidates, setCandidates] = useState<CleanupCandidate[] | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanupError, setCleanupError] = useState<string | null>(null)
  const [lastCleanedCount, setLastCleanedCount] = useState<number | null>(null)

  const handleScan = async () => {
    setScanning(true)
    setScanError(null)
    setScanResult(null)
    try {
      const result = await scanForMissingDocuments()
      setScanResult(result)
    } catch (e) {
      setScanError(e instanceof NotInDesktopAppError ? e.message : 'שגיאה בסריקת המסמכים')
      console.error(e)
    } finally {
      setScanning(false)
    }
  }

  const handleLoadCandidates = async () => {
    setLoadingCandidates(true)
    setCleanupError(null)
    setLastCleanedCount(null)
    try {
      const list = await listCleanupCandidates()
      setCandidates(list)
      setSelectedIds(new Set(list.map(c => c.attachment.id)))
    } catch (e) {
      setCleanupError('שגיאה בטעינת הרשימה')
      console.error(e)
    } finally {
      setLoadingCandidates(false)
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirmCleanup = async () => {
    if (!candidates) return
    setCleaning(true)
    setCleanupError(null)
    try {
      const toDelete = candidates.filter(c => selectedIds.has(c.attachment.id)).map(c => c.attachment)
      const count = await cleanupSoftDeletedAttachments(toDelete)
      setLastCleanedCount(count)
      setCleanupConfirmOpen(false)
      setCandidates(null)
      setSelectedIds(new Set())
    } catch (e) {
      setCleanupError('שגיאה בניקוי המסמכים')
      console.error(e)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FindInPageIcon /> בדיקת מסמכים חסרים
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            סורק את כל המסמכים המצורפים במערכת ובודק שהקובץ הפיזי שלהם עדיין קיים בארכיון.
          </Typography>
          <Button variant="contained" startIcon={scanning ? <CircularProgress size={16} /> : <FindInPageIcon />} onClick={handleScan} disabled={scanning}>
            {scanning ? 'סורק...' : 'הרץ בדיקה'}
          </Button>

          {scanError && <Alert severity="error" sx={{ mt: 2 }}>{scanError}</Alert>}

          {scanResult && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={scanResult.missing.length === 0 ? 'success' : 'warning'}>
                נבדקו {scanResult.checked} מסמכים — {scanResult.missing.length === 0 ? 'כולם נמצאו תקינים.' : `${scanResult.missing.length} מסמכים חסרים.`}
              </Alert>
              {scanResult.missing.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ישות</TableCell>
                        <TableCell>קטגוריה</TableCell>
                        <TableCell>שם קובץ</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {scanResult.missing.map(att => (
                        <TableRow key={att.id}>
                          <TableCell>{resolveAttachmentEntityLabel(att.entityType, att.entityId)}</TableCell>
                          <TableCell>{att.category === 'אחר' && att.customLabel ? att.customLabel : att.category}</TableCell>
                          <TableCell>{att.fileName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CleaningServicesIcon /> ניקוי מסמכים ישנים שסומנו למחיקה
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            מציג מסמכים שסומנו למחיקה יחד עם הישות שאליה היו מצורפים (למשל הלוואה שנמחקה) לפני 90 יום ומעלה,
            ומאפשר למחוק אותם פיזית לצמיתות מהארכיון.
          </Typography>
          <Button variant="outlined" startIcon={loadingCandidates ? <CircularProgress size={16} /> : <CleaningServicesIcon />} onClick={handleLoadCandidates} disabled={loadingCandidates}>
            {loadingCandidates ? 'טוען...' : 'הצג מסמכים לניקוי'}
          </Button>

          {cleanupError && <Alert severity="error" sx={{ mt: 2 }}>{cleanupError}</Alert>}
          {lastCleanedCount !== null && (
            <Alert severity="success" sx={{ mt: 2 }}>נמחקו {lastCleanedCount} מסמכים לצמיתות.</Alert>
          )}

          {candidates && (
            <Box sx={{ mt: 2 }}>
              {candidates.length === 0 ? (
                <Alert severity="success">אין מסמכים שממתינים לניקוי.</Alert>
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox" />
                          <TableCell>ישות</TableCell>
                          <TableCell>שם קובץ</TableCell>
                          <TableCell>גודל</TableCell>
                          <TableCell>ימים מאז הסימון</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {candidates.map(({ attachment, daysSinceDeleted }) => (
                          <TableRow key={attachment.id}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selectedIds.has(attachment.id)}
                                onChange={() => toggleSelected(attachment.id)}
                              />
                            </TableCell>
                            <TableCell>{resolveAttachmentEntityLabel(attachment.entityType, attachment.entityId)}</TableCell>
                            <TableCell>{attachment.fileName}</TableCell>
                            <TableCell>{formatFileSize(attachment.fileSize)}</TableCell>
                            <TableCell>
                              <Chip size="small" label={`${daysSinceDeleted} ימים`} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Button
                    variant="contained"
                    color="error"
                    sx={{ mt: 2 }}
                    disabled={selectedIds.size === 0}
                    onClick={() => setCleanupConfirmOpen(true)}
                  >
                    מחק {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}מסמכים נבחרים לצמיתות
                  </Button>
                </>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      <Dialog open={cleanupConfirmOpen} onClose={() => !cleaning && setCleanupConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" /> מחיקה לצמיתות
        </DialogTitle>
        <DialogContent>
          <Typography>
            למחוק {selectedIds.size} מסמכים לצמיתות מהארכיון? הפעולה לא ניתנת לביטול.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupConfirmOpen(false)} disabled={cleaning}>ביטול</Button>
          <Button variant="contained" color="error" onClick={handleConfirmCleanup} disabled={cleaning}>
            {cleaning ? 'מוחק...' : 'מחק לצמיתות'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
