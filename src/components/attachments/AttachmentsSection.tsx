import { useEffect, useState } from 'react'
import {
  Box,
  Stack,
  Typography,
  Button,
  IconButton,
  Chip,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import {
  AttachFile as AttachFileIcon,
  Visibility as VisibilityIcon,
  Delete as DeleteIcon,
  PictureAsPdf as PdfIcon,
  Image as ImageIcon,
  Description as DocIcon,
  InsertDriveFile as FileIcon,
  Refresh as RefreshIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material'
import type { Attachment, AttachmentCategory, AttachmentEntityType } from '../../types/attachments'
import { ATTACHMENT_CATEGORIES } from '../../types/attachments'
import { attachmentsService } from '../../services/database'
import {
  pickAndAttachFile,
  openAttachment,
  hardDeleteAttachment,
  reattachFile,
  formatFileSize,
  NotInDesktopAppError,
} from '../../services/attachmentsStorage'

interface AttachmentsSectionProps {
  entityType: AttachmentEntityType
  /** null/undefined = the parent entity hasn't been saved yet (e.g. a new, unsaved loan) — attaching is disabled until it has an id. */
  entityId: string | null | undefined
}

function fileIconFor(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return <PdfIcon fontSize="small" color="error" />
  if (['jpg', 'jpeg', 'png'].includes(ext || '')) return <ImageIcon fontSize="small" color="primary" />
  if (['doc', 'docx', 'xls', 'xlsx'].includes(ext || '')) return <DocIcon fontSize="small" color="info" />
  return <FileIcon fontSize="small" />
}

/**
 * Self-contained "attached documents" section — a list of an entity's
 * attachments plus a "צרף מסמך" button, meant to be dropped into an
 * entity's detail/edit view (loan, borrower, etc.).
 *
 * MVP scope: wired up for loans only (see LoanSidePanel). Same component
 * works for any entity type once other detail views adopt it.
 */
export default function AttachmentsSection({ entityType, entityId }: AttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [attachDialogOpen, setAttachDialogOpen] = useState(false)
  const [pickedCategory, setPickedCategory] = useState<AttachmentCategory>('שטר הלוואה')
  const [pickedNote, setPickedNote] = useState('')
  const [attaching, setAttaching] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [missingIds, setMissingIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    if (!entityId) {
      setAttachments([])
      return
    }
    setLoading(true)
    try {
      const items = await attachmentsService.getByEntity(entityType, entityId)
      setAttachments(items)
    } catch (e) {
      console.error('שגיאה בטעינת מסמכים מצורפים:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  const handleAttach = async () => {
    if (!entityId) return
    setAttaching(true)
    setError(null)
    try {
      const created = await pickAndAttachFile(entityType, entityId, pickedCategory, pickedNote.trim() || undefined)
      if (created) {
        setAttachDialogOpen(false)
        setPickedNote('')
        setPickedCategory('שטר הלוואה')
        await refresh()
      }
    } catch (e) {
      setError(e instanceof NotInDesktopAppError ? e.message : 'שגיאה בצירוף הקובץ')
      console.error(e)
    } finally {
      setAttaching(false)
    }
  }

  const handleOpen = async (attachment: Attachment) => {
    setBusyId(attachment.id)
    try {
      const found = await openAttachment(attachment)
      if (!found) {
        setMissingIds(prev => new Set(prev).add(attachment.id))
      } else {
        setMissingIds(prev => {
          if (!prev.has(attachment.id)) return prev
          const next = new Set(prev)
          next.delete(attachment.id)
          return next
        })
      }
    } catch (e) {
      console.error('שגיאה בפתיחת המסמך:', e)
    } finally {
      setBusyId(null)
    }
  }

  const handleReattach = async (attachment: Attachment) => {
    setBusyId(attachment.id)
    try {
      const updated = await reattachFile(attachment)
      if (updated) {
        setMissingIds(prev => {
          const next = new Set(prev)
          next.delete(attachment.id)
          return next
        })
        await refresh()
      }
    } catch (e) {
      console.error('שגיאה בצירוף מחדש:', e)
    } finally {
      setBusyId(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await hardDeleteAttachment(deleteTarget)
      setDeleteTarget(null)
      await refresh()
    } catch (e) {
      console.error('שגיאה במחיקת המסמך:', e)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          📎 מסמכים מצורפים{attachments.length > 0 ? ` (${attachments.length})` : ''}
        </Typography>
        <Button
          size="small"
          startIcon={<AttachFileIcon />}
          onClick={() => setAttachDialogOpen(true)}
          disabled={!entityId}
        >
          צרף מסמך
        </Button>
      </Stack>

      {!entityId && (
        <Typography variant="body2" color="text.secondary">
          יש לשמור תחילה כדי לצרף מסמכים.
        </Typography>
      )}

      {entityId && loading && <CircularProgress size={20} />}

      {entityId && !loading && attachments.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          אין עדיין מסמכים מצורפים.
        </Typography>
      )}

      <Stack spacing={1}>
        {attachments.map(att => {
          const isMissing = missingIds.has(att.id)
          const isBusy = busyId === att.id
          return (
            <Paper key={att.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ minWidth: 0 }}>
                  {fileIconFor(att.fileName)}
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight="medium" noWrap title={att.fileName}>
                      {att.fileName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {att.category}
                      {att.fileSize ? ` · ${formatFileSize(att.fileSize)}` : ''}
                      {' · נוסף '}
                      {new Date(att.addedDate).toLocaleDateString('he-IL')}
                    </Typography>
                    {att.note && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {att.note}
                      </Typography>
                    )}
                    {isMissing && (
                      <Chip
                        icon={<WarningIcon />}
                        label="קובץ לא נמצא"
                        color="error"
                        size="small"
                        variant="outlined"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </Box>
                </Stack>

                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                  {isMissing ? (
                    <Tooltip title="צרף מחדש">
                      <span>
                        <IconButton size="small" onClick={() => handleReattach(att)} disabled={isBusy}>
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip title="פתח">
                      <span>
                        <IconButton size="small" onClick={() => handleOpen(att)} disabled={isBusy}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title="מחק לצמיתות">
                    <span>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(att)} disabled={isBusy}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Stack>
            </Paper>
          )
        })}
      </Stack>

      {/* Attach dialog */}
      <Dialog open={attachDialogOpen} onClose={() => !attaching && setAttachDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>צירוף מסמך</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField
            select
            fullWidth
            label="קטגוריה"
            value={pickedCategory}
            onChange={e => setPickedCategory(e.target.value as AttachmentCategory)}
            sx={{ mt: 1, mb: 2 }}
          >
            {ATTACHMENT_CATEGORIES.map(cat => (
              <MenuItem key={cat} value={cat}>{cat}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label="הערה (אופציונלי)"
            value={pickedNote}
            onChange={e => setPickedNote(e.target.value)}
            multiline
            minRows={2}
            sx={{ mb: 1 }}
          />
          <Typography variant="caption" color="text.secondary">
            בלחיצה על "בחר קובץ" תיפתח האפשרות לבחור קובץ מהמחשב. הקובץ יועתק אוטומטית לארכיון המסמכים המסודר של המערכת.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttachDialogOpen(false)} disabled={attaching}>ביטול</Button>
          <Button variant="contained" onClick={handleAttach} disabled={attaching} startIcon={attaching ? <CircularProgress size={16} /> : <AttachFileIcon />}>
            {attaching ? 'מצרף...' : 'בחר קובץ ושמור'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>מחיקת מסמך</DialogTitle>
        <DialogContent>
          <Typography>
            למחוק את {deleteTarget?.fileName} לצמיתות? הפעולה לא ניתנת לביטול.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>ביטול</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? 'מוחק...' : 'מחק לצמיתות'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
