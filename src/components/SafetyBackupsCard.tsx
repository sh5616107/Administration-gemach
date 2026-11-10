import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { listBackups } from '../services/persistence'
import { restoreBackupSafely } from '../services/destructiveGuard'
import type { BackupInfo } from '../services/storage/sqliteBackend'

/**
 * Safety snapshots + rolling automatic copies, with one-click restore.
 * UI strings are unicode-escaped on purpose (patch-safe); each key is documented in English.
 */
const S = {
  title: '\u05d2\u05d9\u05d1\u05d5\u05d9\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea \u05d5\u05e9\u05d7\u05d6\u05d5\u05e8 \u05de\u05d4\u05d9\u05e8',
  intro: '\u05dc\u05e4\u05e0\u05d9 \u05de\u05d7\u05d9\u05e7\u05ea \u05db\u05dc \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd, \u05d9\u05d9\u05d1\u05d5\u05d0 \u05d0\u05d5 \u05e9\u05d7\u05d6\u05d5\u05e8, \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05e9\u05d5\u05de\u05e8\u05ea \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05e2\u05d5\u05ea\u05e7 \u05e9\u05dc \u05d4\u05de\u05e6\u05d1 \u05d4\u05e7\u05d5\u05d3\u05dd. \u05db\u05d0\u05df \u05d0\u05e4\u05e9\u05e8 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05d0\u05dc\u05d9\u05d5 \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4 \u05d0\u05d7\u05ea.',
  note: '\u05d4\u05d2\u05d9\u05d1\u05d5\u05d9\u05d9\u05dd \u05db\u05d5\u05dc\u05dc\u05d9\u05dd \u05d0\u05ea \u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05d1\u05dc\u05d1\u05d3, \u05d5\u05dc\u05d0 \u05d0\u05ea \u05e7\u05d1\u05e6\u05d9 \u05d4\u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d4\u05de\u05e6\u05d5\u05e8\u05e4\u05d9\u05dd.',
  empty: '\u05d0\u05d9\u05df \u05e2\u05d3\u05d9\u05d9\u05df \u05d2\u05d9\u05d1\u05d5\u05d9\u05d9\u05dd. \u05d4\u05dd \u05e0\u05d5\u05e6\u05e8\u05d9\u05dd \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05dc\u05e4\u05e0\u05d9 \u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05d4\u05e8\u05e1\u05e0\u05d9\u05d5\u05ea.',
  refresh: '\u05e8\u05e2\u05e0\u05df',
  restore: '\u05e9\u05d7\u05d6\u05e8',
  invalid: '\u05d4\u05e7\u05d5\u05d1\u05e5 \u05e4\u05d2\u05d5\u05dd \u05d5\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e9\u05d7\u05d6\u05d5\u05e8',
  loadError: '\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e7\u05e8\u05d5\u05d0 \u05d0\u05ea \u05e8\u05e9\u05d9\u05de\u05ea \u05d4\u05d2\u05d9\u05d1\u05d5\u05d9\u05d9\u05dd',
  dialogTitle: '\u05dc\u05e9\u05d7\u05d6\u05e8 \u05d0\u05ea \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd?',
  dialogBody1: '\u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05d4\u05e0\u05d5\u05db\u05d7\u05d9\u05d9\u05dd \u05d9\u05d5\u05d7\u05dc\u05e4\u05d5 \u05d1\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd \u05de\u05d4\u05d2\u05d9\u05d1\u05d5\u05d9 \u05e9\u05e0\u05d1\u05d7\u05e8',
  dialogBody2: '\u05dc\u05e4\u05e0\u05d9 \u05d4\u05e9\u05d7\u05d6\u05d5\u05e8 \u05d9\u05d9\u05e9\u05de\u05e8 \u05e2\u05d5\u05ea\u05e7 \u05e9\u05dc \u05d4\u05de\u05e6\u05d1 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9, \u05db\u05da \u05e9\u05d0\u05e4\u05e9\u05e8 \u05d9\u05d4\u05d9\u05d4 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05d0\u05dc\u05d9\u05d5. \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05ea\u05d9\u05d8\u05e2\u05df \u05de\u05d7\u05d3\u05e9.',
  cancel: '\u05d1\u05d9\u05d8\u05d5\u05dc',
  confirm: '\u05e9\u05d7\u05d6\u05e8 \u05e2\u05db\u05e9\u05d9\u05d5',
  restoring: '\u05de\u05e9\u05d7\u05d6\u05e8...',
  success: '\u05d4\u05e9\u05d7\u05d6\u05d5\u05e8 \u05d4\u05d5\u05e9\u05dc\u05dd. \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05e0\u05d8\u05e2\u05e0\u05ea \u05de\u05d7\u05d3\u05e9...',
  failed: '\u05d4\u05e9\u05d7\u05d6\u05d5\u05e8 \u05e0\u05db\u05e9\u05dc: ',
  borrowers: '\u05dc\u05d5\u05d5\u05d9\u05dd',
  loans: '\u05d4\u05dc\u05d5\u05d5\u05d0\u05d5\u05ea',
  unknownTime: '\u05d6\u05de\u05df \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2',
} as const
// title: safety backups and quick restore | intro: explains automatic snapshots | note: data only, no attachments
// empty: no backups yet | refresh/restore/cancel/confirm: button labels | invalid: file is damaged
// dialogBody1/2: restore warning | restoring/success/failed: progress and result | borrowers/loans: count labels

const REASON_LABELS: Record<string, string> = {
  'delete-all': '\u05dc\u05e4\u05e0\u05d9 \u05de\u05d7\u05d9\u05e7\u05ea \u05db\u05dc \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd',
  'import': '\u05dc\u05e4\u05e0\u05d9 \u05d9\u05d9\u05d1\u05d5\u05d0 \u05d2\u05d9\u05d1\u05d5\u05d9',
  'before-restore': '\u05dc\u05e4\u05e0\u05d9 \u05e9\u05d7\u05d6\u05d5\u05e8 \u05e7\u05d5\u05d3\u05dd',
  'manual': '\u05d2\u05d9\u05d1\u05d5\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea',
  'auto-bak1': '\u05e2\u05d5\u05ea\u05e7 \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9 (\u05d0\u05d7\u05e8\u05d5\u05df)',
  'auto-bak2': '\u05e2\u05d5\u05ea\u05e7 \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9 (\u05e7\u05d5\u05d3\u05dd)',
  'auto-prev': '\u05e2\u05d5\u05ea\u05e7 \u05de\u05ea\u05d7\u05d9\u05dc\u05ea \u05d4\u05e2\u05d1\u05d5\u05d3\u05d4 \u05d4\u05d0\u05d7\u05e8\u05d5\u05e0\u05d4',
}
// delete-all: before deleting all data | import: before importing a backup | before-restore: before an earlier restore
// manual: safety backup | auto-bak1/bak2: rolling automatic copies | auto-prev: copy from start of last session

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? REASON_LABELS.manual
}

export function formatBackupTime(iso: string | null): string {
  if (!iso) return S.unknownTime
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? S.unknownTime : d.toLocaleString('he-IL')
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

interface Props {
  /** Called after a successful restore. Default: reload the app so it loads the restored database. */
  onRestored?: () => void
}

export default function SafetyBackupsCard({ onRestored }: Props) {
  const [items, setItems] = useState<BackupInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const refresh = useCallback(async () => {
    setLoadError(false)
    try {
      setItems(await listBackups())
    } catch {
      setItems([])
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const doRestore = async () => {
    if (!selected) return
    setRestoring(true)
    const res = await restoreBackupSafely(selected.file)
    setRestoring(false)
    setSelected(null)
    if (!res.ok) {
      setResult({ ok: false, message: S.failed + (res.error ?? '') })
      void refresh()
      return
    }
    setResult({ ok: true, message: S.success })
    setTimeout(() => (onRestored ? onRestored() : window.location.reload()), 1200)
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h6">{S.title}</Typography>
          <Button size="small" onClick={() => void refresh()} disabled={restoring} data-testid="backups-refresh">
            {S.refresh}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {S.intro}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          {S.note}
        </Typography>

        {result && (
          <Alert severity={result.ok ? 'success' : 'error'} sx={{ mb: 2 }}>
            {result.message}
          </Alert>
        )}
        {loadError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {S.loadError}
          </Alert>
        )}

        {items === null ? (
          <CircularProgress size={20} />
        ) : items.length === 0 ? (
          <Typography variant="body2">{S.empty}</Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={1}>
            {items.map(item => {
              const counts = [
                item.counts.borrowers !== undefined ? `${item.counts.borrowers} ${S.borrowers}` : '',
                item.counts.loans !== undefined ? `${item.counts.loans} ${S.loans}` : '',
              ]
                .filter(Boolean)
                .join(', ')
              return (
                <Box key={item.file} sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body1">{reasonLabel(item.reason)}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatBackupTime(item.createdAt)}
                      {counts ? ` | ${counts}` : ''}
                      {` | ${formatSize(item.sizeBytes)}`}
                    </Typography>
                    {!item.valid && (
                      <Typography variant="caption" color="error">
                        {S.invalid}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!item.valid || restoring}
                    onClick={() => setSelected(item)}
                    data-testid={`restore-${item.file}`}
                  >
                    {S.restore}
                  </Button>
                </Box>
              )
            })}
          </Stack>
        )}
      </CardContent>

      <Dialog open={selected !== null} onClose={() => !restoring && setSelected(null)}>
        <DialogTitle>{S.dialogTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {S.dialogBody1}
            {selected ? ` (${reasonLabel(selected.reason)}, ${formatBackupTime(selected.createdAt)}). ` : '. '}
            {S.dialogBody2}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={restoring}>
            {S.cancel}
          </Button>
          <Button variant="contained" onClick={() => void doRestore()} disabled={restoring} data-testid="confirm-restore">
            {restoring ? S.restoring : S.confirm}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
