import { useCallback, useEffect, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { listBackups } from '../services/persistence'
import { restoreBackupSafely } from '../services/destructiveGuard'
import type { BackupInfo } from '../services/storage/sqliteBackend'

/**
 * Safety snapshots + rolling automatic copies, with one-click restore.
 * Collapsed by default (the list is read only when it is first opened); copies that hold no data are hidden.
 * UI strings are unicode-escaped on purpose (patch-safe); each key is documented in English.
 */
const S = {
  title: '\u05d2\u05d9\u05d1\u05d5\u05d9\u05d9 \u05d1\u05d8\u05d9\u05d7\u05d5\u05ea \u05d5\u05e9\u05d7\u05d6\u05d5\u05e8 \u05de\u05d4\u05d9\u05e8',
  intro: '\u05dc\u05e4\u05e0\u05d9 \u05de\u05d7\u05d9\u05e7\u05ea \u05db\u05dc \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd, \u05d9\u05d9\u05d1\u05d5\u05d0 \u05d0\u05d5 \u05e9\u05d7\u05d6\u05d5\u05e8, \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05e9\u05d5\u05de\u05e8\u05ea \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05e2\u05d5\u05ea\u05e7 \u05e9\u05dc \u05d4\u05de\u05e6\u05d1 \u05d4\u05e7\u05d5\u05d3\u05dd. \u05db\u05d0\u05df \u05d0\u05e4\u05e9\u05e8 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05d0\u05dc\u05d9\u05d5 \u05d1\u05dc\u05d7\u05d9\u05e6\u05d4 \u05d0\u05d7\u05ea.',
  note: '\u05d4\u05d2\u05d9\u05d1\u05d5\u05d9\u05d9\u05dd \u05db\u05d5\u05dc\u05dc\u05d9\u05dd \u05d0\u05ea \u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05ea\u05d5\u05db\u05e0\u05d4 \u05d1\u05dc\u05d1\u05d3, \u05d5\u05dc\u05d0 \u05d0\u05ea \u05e7\u05d1\u05e6\u05d9 \u05d4\u05de\u05e1\u05de\u05db\u05d9\u05dd \u05d4\u05de\u05e6\u05d5\u05e8\u05e4\u05d9\u05dd.',
  empty: '\u05d0\u05d9\u05df \u05d2\u05d9\u05d1\u05d5\u05d9\u05d9\u05dd \u05e2\u05dd \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd. \u05d4\u05dd \u05e0\u05d5\u05e6\u05e8\u05d9\u05dd \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05dc\u05e4\u05e0\u05d9 \u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05d4\u05e8\u05e1\u05e0\u05d9\u05d5\u05ea.',
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
  repayments: '\u05e4\u05d9\u05e8\u05e2\u05d5\u05e0\u05d5\u05ea',
  deposits: '\u05d4\u05e4\u05e7\u05d3\u05d5\u05ea',
  donations: '\u05ea\u05e8\u05d5\u05de\u05d5\u05ea',
  guarantors: '\u05e2\u05e8\u05d1\u05d9\u05dd',
  donors: '\u05ea\u05d5\u05e8\u05de\u05d9\u05dd',
  depositors: '\u05de\u05e4\u05e7\u05d9\u05d3\u05d9\u05dd',
  unknownTime: '\u05d6\u05de\u05df \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2',
  showEmpty: '\u05d4\u05e6\u05d2 \u05d2\u05dd \u05e2\u05d5\u05ea\u05e7\u05d9\u05dd \u05e8\u05d9\u05e7\u05d9\u05dd',
  hideEmpty: '\u05d4\u05e1\u05ea\u05e8 \u05e2\u05d5\u05ea\u05e7\u05d9\u05dd \u05e8\u05d9\u05e7\u05d9\u05dd',
} as const
// title: safety backups and quick restore | intro: explains automatic snapshots | note: data only, no attachments
// empty: no backups with data | refresh/restore/cancel/confirm: button labels | invalid: file is damaged
// dialogBody1/2: restore warning | restoring/success/failed: progress and result | borrowers/loans: count labels
// showEmpty/hideEmpty: toggle for copies that contain no data
// repayments/deposits/donations/guarantors/donors/depositors: count labels, shown only when above zero

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

/** Financial records: a copy with none of these is not worth restoring (lists of donors, guarantors and the like do not count). */
const FINANCIAL_STORES = ['borrowers', 'loans', 'repayments', 'donations', 'deposits']
/** Counts shown in each row besides borrowers and loans, only when above zero. */
const EXTRA_COUNT_STORES = ['repayments', 'deposits', 'donations', 'guarantors', 'donors', 'depositors'] as const

/** True for a readable copy with no borrowers, loans, repayments, donations or deposits: restoring it would only empty the app. */
export function isEmptyBackup(item: BackupInfo): boolean {
  return item.valid && Object.keys(item.counts).length > 0 && FINANCIAL_STORES.every(store => !item.counts[store])
}

/** e.g. "14 borrowers, 88 loans, 3 deposits": borrowers and loans always, the other stores only when above zero. */
export function describeCounts(counts: Record<string, number>): string {
  const parts: string[] = []
  if (counts.borrowers !== undefined) parts.push(`${counts.borrowers} ${S.borrowers}`)
  if (counts.loans !== undefined) parts.push(`${counts.loans} ${S.loans}`)
  for (const store of EXTRA_COUNT_STORES) {
    if (counts[store] > 0) parts.push(`${counts[store]} ${S[store]}`)
  }
  return parts.join(', ')
}

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
  /** Start opened (the list is then loaded on mount). Default: collapsed. */
  defaultExpanded?: boolean
}

export default function SafetyBackupsCard({ onRestored, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [items, setItems] = useState<BackupInfo[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [showEmpty, setShowEmpty] = useState(false)
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

  // the list is read from disk only once the section is opened
  useEffect(() => {
    if (expanded && items === null) void refresh()
  }, [expanded, items, refresh])

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

  const emptyCount = (items ?? []).filter(isEmptyBackup).length
  const visible = (items ?? []).filter(item => showEmpty || !isEmptyBackup(item))

  return (
    <>
      <Accordion disableGutters expanded={expanded} onChange={(_, value) => setExpanded(value)}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} data-testid="backups-summary">
          <Typography variant="subtitle1">{S.title}</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {S.intro}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            {S.note}
          </Typography>

          {result && (
            <Alert severity={result.ok ? 'success' : 'error'} sx={{ mb: 1 }}>
              {result.message}
            </Alert>
          )}
          {loadError && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {S.loadError}
            </Alert>
          )}

          {items === null ? (
            <CircularProgress size={20} />
          ) : visible.length === 0 ? (
            <Typography variant="body2">{S.empty}</Typography>
          ) : (
            <Stack divider={<Divider flexItem />}>
              {visible.map(item => {
                const counts = describeCounts(item.counts)
                return (
                  <Box key={item.file} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 0.5 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        {reasonLabel(item.reason)}
                        <Typography component="span" variant="caption" color="text.secondary">
                          {` | ${formatBackupTime(item.createdAt)}`}
                          {counts ? ` | ${counts}` : ''}
                          {` | ${formatSize(item.sizeBytes)}`}
                        </Typography>
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

          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" onClick={() => void refresh()} disabled={restoring} data-testid="backups-refresh">
              {S.refresh}
            </Button>
            {emptyCount > 0 && (
              <Button size="small" onClick={() => setShowEmpty(v => !v)} data-testid="backups-toggle-empty">
                {showEmpty ? S.hideEmpty : S.showEmpty} ({emptyCount})
              </Button>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

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
    </>
  )
}
