import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import localforage from 'localforage'
import {
  Box, Card, CardContent, Typography, Tabs, Tab, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Switch, FormControlLabel, IconButton, Chip, Divider,
  Accordion, AccordionSummary, AccordionDetails, Snackbar, Alert, Table, TableBody,
  TableCell, TableRow, ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon, Add as AddIcon, Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon, ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon, Save as SaveIcon, Info as InfoIcon,
} from '@mui/icons-material'
import { useSettings } from '../hooks/useSettings'
import {
  DocumentType, DocumentLayoutConfig, DocumentLayoutsMap, CustomTextBlock,
  DOCUMENT_ANCHORS, DOCUMENT_FONT_FAMILIES, DocumentFontFamily,
  createEmptyDocumentLayoutConfig, createEmptyDocumentLayoutsMap, copyFrameImageToAllDocuments,
} from '../types/documentLayout'
import {
  buildLoanDocumentHtml, buildDonationReceiptHtml, buildDepositDocumentHtml, buildBorrowerReportHtml,
} from '../services/documents'

// אותו localforage instance בדיוק כמו useSettings.ts ו-migrations.ts — ר' הערה
// בשלב 1 על שני stores נפרדים בפרויקט. משמש כאן רק לקריאה-חוזרת-לאימות אחרי שמירה.
const uiSettingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  loan: 'שטר הלוואה',
  borrowerReport: 'דו"ח לווה',
  donationReceipt: 'קבלה על תרומה',
  depositReceipt: 'קבלה על הפקדה',
}

// תוויות ברירת מחדל שניתנות לדריסה דרך labelOverrides, לפי מסמך (תואם לקריאות
// label(...) בפועל ב-documents.ts — לא רשימה כללית, אלא בדיוק המפתחות בשימוש).
const LABEL_KEYS: Record<DocumentType, Array<{ key: string; fallback: string }>> = {
  loan: [
    { key: 'loan.commitmentIntro', fallback: 'אני הח"מ' },
    { key: 'loan.originalAmount', fallback: 'סכום הלוואה מקורי:' },
    { key: 'loan.guarantorsTitle', fallback: 'ערבים:' },
  ],
  borrowerReport: [
    { key: 'borrowerReport.borrowerNameLabel', fallback: 'שם הלווה:' },
  ],
  donationReceipt: [
    { key: 'donation.receiptNumber', fallback: 'מספר קבלה:' },
    { key: 'donation.receivedFrom', fallback: 'התקבל מאת:' },
    { key: 'donation.amount', fallback: 'סכום:' },
  ],
  depositReceipt: [
    { key: 'deposit.commitmentIntro', fallback: 'אני הח"מ מנהל גמ"ח' },
    { key: 'deposit.receivedFrom', fallback: 'מאשר בזה כי קיבלתי הפקדה מאת:' },
    { key: 'deposit.originalAmount', fallback: 'סכום הפקדה מקורי:' },
  ],
}

// showSystemBlocks הרלוונטיים לכל מסמך (טבלאות שניתן להסתיר, ר' באג #9 —
// אזהרה מפורשת לפני שמירה אם המנהל מכבה טבלת פירעונות).
const SYSTEM_BLOCKS: Record<DocumentType, Array<{ key: string; label: string; warn?: boolean }>> = {
  loan: [{ key: 'repaymentsTable', label: 'טבלת פירעונות', warn: true }],
  borrowerReport: [
    { key: 'repaymentsTable', label: 'טבלת פירעונות', warn: true },
    { key: 'expensesTable', label: 'טבלת הוצאות' },
  ],
  donationReceipt: [],
  depositReceipt: [{ key: 'withdrawalsTable', label: 'טבלת משיכות', warn: true }],
}

// נתוני דמה קבועים לתצוגה מקדימה — שני מצבים: בלי פירעונות/משיכות, ועם
// (כולל פירעון מלא) — בדיוק לפי "מקרה קצה" במסמך ההוראות.
const MOCK_LOAN_BASE = {
  gemachName: 'גמ"ח לדוגמה', borrowerName: 'ישראל ישראלי', amount: 5000,
  loanDate: '2026-01-01', dueDate: '2026-12-01', loanType: 'fixed',
  guarantor1Name: 'משה כהן', guarantor2Name: 'דוד לוי', dateFormat: 'combined',
}
const MOCK_LOAN_NO_REPAY = { ...MOCK_LOAN_BASE }
const MOCK_LOAN_WITH_REPAY = {
  ...MOCK_LOAN_BASE,
  repayments: [
    { amount: 2000, payment_date: '2026-03-01' },
    { amount: 3000, payment_date: '2026-06-01' }, // = amount → פירעון מלא, מפעיל loanFullyRepaid
  ],
}

const MOCK_DONATION = {
  gemachName: 'גמ"ח לדוגמה', donorName: 'רחל כהן', amount: 500,
  donationDate: '2026-03-01', receiptNumber: '1042', dateFormat: 'combined',
}

const MOCK_DEPOSIT_BASE = {
  gemachName: 'גמ"ח לדוגמה', depositorName: 'יעקב לוי', amount: 10000,
  depositDate: '2026-01-01', periodType: 'fixed', dueDate: '2027-01-01', dateFormat: 'combined',
}
const MOCK_DEPOSIT_NO_WITHDRAW = { ...MOCK_DEPOSIT_BASE }
const MOCK_DEPOSIT_WITH_WITHDRAW = {
  ...MOCK_DEPOSIT_BASE,
  withdrawals: [{ amount: 4000, withdrawal_date: '2026-05-01' }],
}

const MOCK_BORROWER_REPORT_NO_REPAY = {
  gemachName: 'גמ"ח לדוגמה', borrowerName: 'ישראל ישראלי', totalDebt: 5000,
  loans: [{ id: 1, amount: 5000, loanDate: '2026-01-01', remaining: 5000, status: 'active' }],
}
const MOCK_BORROWER_REPORT_WITH_REPAY = {
  gemachName: 'גמ"ח לדוגמה', borrowerName: 'ישראל ישראלי', totalDebt: 0,
  loans: [
    { id: 1, amount: 5000, loanDate: '2026-01-01', remaining: 0, status: 'completed', repayments: [{ amount: 5000, payment_date: '2026-06-01' }] },
    { id: 2, amount: 1500, loanDate: '2025-05-01', remaining: 0, status: 'completed', repayments: [{ amount: 1500, payment_date: '2025-08-01' }] },
  ],
  expenses: [{ id: 1, description: 'עמלת פתיחה', amount: 30, expense_date: '2026-01-05', category: 'fee' }],
}

function buildPreviewHtml(docType: DocumentType, layout: DocumentLayoutConfig, withVariant: boolean): string {
  let content = ''
  switch (docType) {
    case 'loan':
      content = buildLoanDocumentHtml(withVariant ? MOCK_LOAN_WITH_REPAY : MOCK_LOAN_NO_REPAY, layout)
      break
    case 'donationReceipt':
      content = buildDonationReceiptHtml(MOCK_DONATION, layout)
      break
    case 'depositReceipt':
      content = buildDepositDocumentHtml(withVariant ? MOCK_DEPOSIT_WITH_WITHDRAW : MOCK_DEPOSIT_NO_WITHDRAW, layout)
      break
    case 'borrowerReport':
      content = buildBorrowerReportHtml(withVariant ? MOCK_BORROWER_REPORT_WITH_REPAY : MOCK_BORROWER_REPORT_NO_REPAY, layout)
      break
  }

  // אם יש מסגרת מוגדרת למסמך: עוטפים את התוכן ב"עמוד" בגודל A4 (יחסי,
  // 210x297mm — אותו יחס גובה-רוחב כמו ב-downloadPdf) עם תמונת המסגרת
  // כרקע מלא-עמוד (background-size: 100% 100%), ומרווח פנימי כמרווחי
  // המשתמש כדי שהתוכן לא יתנגש עם עיצוב המסגרת — תואם ויזואלית לאיך
  // שהמסגרת מצוירת בפועל ב-PDF. הערה: אם התוכן ארוך מעמוד אחד (בעיקר
  // דוח לווה), הרקע נמתח לגובה ה"עמוד" הראשון בלבד ולא חוזר על עצמו
  // מעמוד לעמוד כמו ב-PDF האמיתי — זו תצוגה מקדימה מקורבת, לא פיצול
  // עמודים מדויק.
  const frame = layout.frame
  const pageContent = frame?.imageBase64 ? `
    <div style="
      width: 210mm; min-height: 297mm; margin: 0 auto; position: relative;
      background-image: url('${frame.imageBase64}'); background-size: 100% 100%; background-repeat: no-repeat;
      box-sizing: border-box;
      padding-top: ${frame.marginTop}mm; padding-bottom: ${frame.marginBottom}mm;
      padding-right: ${frame.marginRight}mm; padding-left: ${frame.marginLeft}mm;
    ">${content}</div>
  ` : content

  // "נייר לבן" קבוע — לא var(--surface-*)/var(--text-*), גם אם האפליקציה במצב כהה
  // (ר' עקרונות עיצוב בשלב 3). מוזרק ל-iframe srcDoc, לא dangerouslySetInnerHTML
  // בעץ הראשי — בידוד סגנונות/סקריפטים מהטקסט החופשי.
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><style>body{background:#e0e0e0;color:#000000;margin:0;font-family:Arial,sans-serif;}</style></head>
<body>${pageContent}</body>
</html>`
}

interface AnchorEditorProps {
  anchorId: string
  anchorLabel: string
  conditional?: boolean
  blocks: CustomTextBlock[]
  onChange: (blocks: CustomTextBlock[]) => void
}

function AnchorEditor({ anchorId, anchorLabel, conditional, blocks, onChange }: AnchorEditorProps) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Omit<CustomTextBlock, 'id' | 'anchorId' | 'order'>>({
    text: '', align: 'right', bold: false, underline: false, fontFamily: 'Arial', fontSize: 15,
  })

  const addBlock = () => {
    if (!draft.text.trim()) return
    const newBlock: CustomTextBlock = {
      ...draft,
      id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      anchorId,
      order: blocks.length,
    }
    onChange([...blocks, newBlock])
    setDraft({ text: '', align: 'right', bold: false, underline: false, fontFamily: 'Arial', fontSize: 15 })
    setAdding(false)
  }

  const removeBlock = (id: string) => onChange(blocks.filter(b => b.id !== id))

  const moveBlock = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex(b => b.id === id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= blocks.length) return
    const copy = [...blocks]
    ;[copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]]
    onChange(copy.map((b, i) => ({ ...b, order: i })))
  }

  return (
    <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">
          {anchorLabel}
          {conditional && <Chip size="small" label="מותנה" sx={{ mr: 1, fontSize: 11 }} />}
        </Typography>
        {!adding && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            הוסף טקסט
          </Button>
        )}
      </Box>

      {blocks.map((b, i) => (
        <Box key={b.id} sx={{ mt: 1, p: 1, bgcolor: '#f7f7f7', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ flex: 1, direction: b.align === 'left' ? 'ltr' : 'rtl', fontWeight: b.bold ? 'bold' : 'normal', textDecoration: b.underline ? 'underline' : 'none' }}>
            {b.text}
          </Typography>
          <IconButton size="small" disabled={i === 0} onClick={() => moveBlock(b.id, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton>
          <IconButton size="small" disabled={i === blocks.length - 1} onClick={() => moveBlock(b.id, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={() => removeBlock(b.id)}><DeleteIcon fontSize="small" /></IconButton>
        </Box>
      ))}

      {adding && (
        <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            multiline minRows={2} size="small" placeholder="טקסט חופשי..."
            value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })}
            inputProps={{ dir: draft.align === 'left' ? 'ltr' : 'rtl' }}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 90 }}>
              <InputLabel>יישור</InputLabel>
              <Select label="יישור" value={draft.align} onChange={e => setDraft({ ...draft, align: e.target.value as any })}>
                <MenuItem value="right">ימין</MenuItem>
                <MenuItem value="center">מרכז</MenuItem>
                <MenuItem value="left">שמאל</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>גופן</InputLabel>
              <Select label="גופן" value={draft.fontFamily} onChange={e => setDraft({ ...draft, fontFamily: e.target.value as DocumentFontFamily })}>
                {DOCUMENT_FONT_FAMILIES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small" type="number" label="גודל" sx={{ width: 90 }}
              value={draft.fontSize} inputProps={{ min: 10, max: 36 }}
              onChange={e => setDraft({ ...draft, fontSize: Math.min(36, Math.max(10, Number(e.target.value) || 15)) })}
            />
            <FormControlLabel control={<Switch size="small" checked={draft.bold} onChange={e => setDraft({ ...draft, bold: e.target.checked })} />} label="בולד" />
            <FormControlLabel control={<Switch size="small" checked={draft.underline} onChange={e => setDraft({ ...draft, underline: e.target.checked })} />} label="קו תחתון" />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="contained" onClick={addBlock}>הוסף</Button>
            <Button size="small" onClick={() => setAdding(false)}>ביטול</Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default function DocumentDesignerPanel() {
  const navigate = useNavigate()
  const { settings, loading } = useSettings()

  // באג אמיתי שנמצא בבדיקה ידנית: useSettings() טוען מ-localforage
  // באופן א-סינכרוני — ברגע ה-mount הראשון settings.document_layouts
  // עדיין ריק (ברירת המחדל), ורק כמה מילישניות אח"כ נטען הערך האמיתי.
  // useState(() => parse(settings.document_layouts)) קורא רק פעם אחת,
  // בדיוק באותו רגע ריק — כך שהמסגרת "נעלמת" בכל mount מחדש (למשל אחרי
  // ניווט למסך אחר וחזרה), למרות שהיא כן שמורה בפועל באחסון. התיקון:
  // מתחילים מקונפיג ריק תמיד, ומסנכרנים מ-settings פעם אחת ויחידה —
  // ברגע שה-loading האמיתי מסתיים (לא לפני, ולא שוב אחרי, כדי לא לדרוס
  // עריכות מקומיות לא-שמורות אם settings מתעדכן מסיבה אחרת בהמשך).
  const [layouts, setLayouts] = useState<DocumentLayoutsMap>(createEmptyDocumentLayoutsMap())
  const hasSyncedFromSettingsRef = useRef(false)

  useEffect(() => {
    if (loading || hasSyncedFromSettingsRef.current) return
    hasSyncedFromSettingsRef.current = true
    try {
      setLayouts(settings.document_layouts ? JSON.parse(settings.document_layouts) : createEmptyDocumentLayoutsMap())
    } catch {
      // קונפיג פגום לעולם לא חוסם את הפאנל — נופל לריק (ר' באג #7)
      setLayouts(createEmptyDocumentLayoutsMap())
    }
  }, [loading, settings.document_layouts])
  const [activeTab, setActiveTab] = useState<DocumentType>('loan')
  const [previewVariant, setPreviewVariant] = useState<'plain' | 'withData'>('plain')
  const [saveState, setSaveState] = useState<{ open: boolean; ok: boolean; message: string }>({ open: false, ok: true, message: '' })
  const [hideRepaymentsWarning, setHideRepaymentsWarning] = useState(false)

  const activeLayout = layouts[activeTab] ?? createEmptyDocumentLayoutConfig()

  const updateActiveLayout = useCallback((patch: Partial<DocumentLayoutConfig>) => {
    setLayouts(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], ...patch } }))
  }, [activeTab])

  const previewHtml = useMemo(
    () => buildPreviewHtml(activeTab, activeLayout, previewVariant === 'withData'),
    [activeTab, activeLayout, previewVariant]
  )

  const hasBlocksOnAnchor = (anchorId: string) =>
    activeLayout.customBlocks.filter(b => b.anchorId === anchorId)

  const anchorsWithBlocksCount = activeLayout.customBlocks.length

  const handleSave = async () => {
    // באג #9: אזהרה מפורשת לפני שמירה אם טבלת פירעונות מוסתרת באחד המסמכים
    const anyRepaymentsHidden = (['loan', 'borrowerReport'] as DocumentType[]).some(
      dt => layouts[dt]?.showSystemBlocks?.repaymentsTable === false
    )
    if (anyRepaymentsHidden && !hideRepaymentsWarning) {
      setHideRepaymentsWarning(true)
      return
    }
    setHideRepaymentsWarning(false)

    try {
      const serialized = JSON.stringify(layouts)
      await uiSettingsStore.setItem('document_layouts', serialized)
      // קריאה-חוזרת-לאימות — לא מניחים הצלחה, בדיוק כמו במיגרציה בשלב 1.
      const readBack = await uiSettingsStore.getItem<string>('document_layouts')
      const verified = readBack === serialized
      console.log('📋 DocumentDesignerPanel save:', {
        savedLength: serialized.length,
        readBackLength: readBack?.length,
        verified,
        perDocument: (Object.keys(layouts) as DocumentType[]).map(dt => ({
          type: dt,
          blocks: layouts[dt].customBlocks.length,
          hasFrame: !!layouts[dt].frame,
        })),
      })
      if (!verified) {
        setSaveState({ open: true, ok: false, message: 'השמירה נכשלה באימות קריאה-חוזרת — נסה שוב' })
        return
      }
      window.dispatchEvent(new CustomEvent('gemach-settings-changed'))
      setSaveState({ open: true, ok: true, message: 'נשמר בהצלחה ואומת' })
    } catch (error) {
      console.error('❌ DocumentDesignerPanel save failed:', error)
      setSaveState({ open: true, ok: false, message: 'שמירה נכשלה — ראה קונסול' })
    }
  }

  if (loading) return null

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => navigate('/settings')}><ArrowBackIcon /></IconButton>
        <Typography variant="h5">פאנל עיצוב שטרות ודוחות</Typography>
      </Box>

      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map(dt => (
          <Tab key={dt} value={dt} label={DOCUMENT_TYPE_LABELS[dt]} />
        ))}
      </Tabs>

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* צד עריכה */}
        <Box sx={{ flex: '1 1 480px', minWidth: 380 }}>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>עוגני טקסט</Typography>
              {DOCUMENT_ANCHORS[activeTab].map(a => (
                <AnchorEditor
                  key={a.id}
                  anchorId={a.id}
                  anchorLabel={a.label}
                  conditional={a.conditional}
                  blocks={hasBlocksOnAnchor(a.id)}
                  onChange={(newBlocksForAnchor) => {
                    const others = activeLayout.customBlocks.filter(b => b.anchorId !== a.id)
                    updateActiveLayout({ customBlocks: [...others, ...newBlocksForAnchor] })
                  }}
                />
              ))}
            </CardContent>
          </Card>

          {anchorsWithBlocksCount > 0 && (
            <Accordion sx={{ mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>סקירה כללית — {anchorsWithBlocksCount} בלוקים בסך הכל</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Table size="small">
                  <TableBody>
                    {activeLayout.customBlocks.map(b => (
                      <TableRow key={b.id}>
                        <TableCell sx={{ width: 160 }}>
                          {DOCUMENT_ANCHORS[activeTab].find(a => a.id === b.anchorId)?.label || b.anchorId}
                        </TableCell>
                        <TableCell sx={{ direction: b.align === 'left' ? 'ltr' : 'rtl' }}>{b.text}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionDetails>
            </Accordion>
          )}

          {SYSTEM_BLOCKS[activeTab].length > 0 && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>הצגת רכיבי מערכת</Typography>
                {SYSTEM_BLOCKS[activeTab].map(sb => (
                  <Box key={sb.key}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={activeLayout.showSystemBlocks?.[sb.key] !== false}
                          onChange={e => updateActiveLayout({
                            showSystemBlocks: { ...activeLayout.showSystemBlocks, [sb.key]: e.target.checked },
                          })}
                        />
                      }
                      label={sb.label}
                    />
                    {sb.warn && activeLayout.showSystemBlocks?.[sb.key] === false && (
                      <Alert severity="warning" sx={{ mt: 0.5, mb: 1 }} icon={<InfoIcon />}>
                        הסתרת {sb.label} עלולה למחוק עדות לתשלומים שבוצעו בפועל מהמסמך המודפס/הנשלח.
                      </Alert>
                    )}
                  </Box>
                ))}
              </CardContent>
            </Card>
          )}

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>דריסת תוויות</Typography>
              {LABEL_KEYS[activeTab].map(lk => (
                <TextField
                  key={lk.key} fullWidth size="small" sx={{ mb: 1 }}
                  label={lk.fallback}
                  placeholder={lk.fallback}
                  value={activeLayout.labelOverrides?.[lk.key] || ''}
                  onChange={e => updateActiveLayout({
                    labelOverrides: { ...activeLayout.labelOverrides, [lk.key]: e.target.value },
                  })}
                />
              ))}
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>מסגרת מסמך</Typography>
              <Alert severity="info" sx={{ mb: 1.5 }}>
                המסגרת תופיע רק בקובץ ה-PDF שיורד, לא בתצוגת ההדפסה/דפדפן — זו מגבלה טכנית ידועה, לא באג (ר' היסטוריית הפרויקט).
              </Alert>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!activeLayout.frame}
                    onChange={e => updateActiveLayout({
                      frame: e.target.checked
                        ? (activeLayout.frame || { imageBase64: '', marginTop: 35, marginBottom: 48, marginRight: 20, marginLeft: 20 })
                        : undefined,
                    })}
                  />
                }
                label="הפעל מסגרת למסמך זה"
              />
              {activeLayout.frame && (
                <>
                  {activeLayout.frame.imageBase64 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, mb: 2 }}>
                      <Box
                        component="img"
                        src={activeLayout.frame.imageBase64}
                        sx={{ 
                          width: 100, 
                          height: 140, 
                          objectFit: 'contain', 
                          border: '1px solid #ddd',
                          borderRadius: 1,
                          bgcolor: '#f5f5f5'
                        }}
                        alt="תצוגה מקדימה של המסגרת"
                      />
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                          מסגרת נוכחית
                        </Typography>
                        <Button 
                          component="label" 
                          size="small" 
                          variant="outlined"
                          sx={{ mr: 1 }}
                        >
                          החלף מסגרת
                          <input hidden type="file" accept="image/*" onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = () => updateActiveLayout({ frame: { ...activeLayout.frame!, imageBase64: String(reader.result) } })
                            reader.readAsDataURL(file)
                          }} />
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          color="error"
                          onClick={() => updateActiveLayout({ frame: { ...activeLayout.frame!, imageBase64: '' } })}
                        >
                          הסר מסגרת
                        </Button>
                        <Button
                          size="small"
                          variant="text"
                          sx={{ mt: 1, display: 'block' }}
                          onClick={() => {
                            setLayouts(prev => copyFrameImageToAllDocuments(prev, activeTab))
                            setSaveState({ open: true, ok: true, message: 'תמונת המסגרת הועתקה ל-3 המסמכים האחרים (השוליים של כל מסמך נשארו כפי שהיו) — לחץ "שמור" כדי לשמור' })
                          }}
                        >
                          העתק תמונת מסגרת זו לכל המסמכים
                        </Button>
                      </Box>
                    </Box>
                  )}
                  {!activeLayout.frame.imageBase64 && (
                    <Box sx={{ mt: 2, mb: 2 }}>
                      <Button component="label" size="small" variant="outlined">
                        בחר תמונת מסגרת
                        <input hidden type="file" accept="image/*" onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => updateActiveLayout({ frame: { ...activeLayout.frame!, imageBase64: String(reader.result) } })
                          reader.readAsDataURL(file)
                        }} />
                      </Button>
                    </Box>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {(['marginTop', 'marginBottom', 'marginRight', 'marginLeft'] as const).map(m => (
                      <TextField
                        key={m} size="small" type="number" sx={{ width: 100 }}
                        label={{ marginTop: 'שוליים עליון', marginBottom: 'שוליים תחתון', marginRight: 'שוליים ימין', marginLeft: 'שוליים שמאל' }[m]}
                        value={activeLayout.frame[m]}
                        onChange={e => updateActiveLayout({ frame: { ...activeLayout.frame!, [m]: Number(e.target.value) || 0 } })}
                      />
                    ))}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>

          {hideRepaymentsWarning && (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setHideRepaymentsWarning(false)}>
              אתה עומד לשמור עם טבלת פירעונות מוסתרת באחד המסמכים. לחץ "שמור" שוב לאישור.
            </Alert>
          )}

          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave}>
            שמור
          </Button>
        </Box>

        {/* צד תצוגה מקדימה */}
        <Box sx={{ flex: '1 1 480px', minWidth: 380 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">תצוגה מקדימה</Typography>
                {activeTab !== 'donationReceipt' && (
                  <ToggleButtonGroup size="small" value={previewVariant} exclusive onChange={(_, v) => v && setPreviewVariant(v)}>
                    <ToggleButton value="plain">ללא פירעונות</ToggleButton>
                    <ToggleButton value="withData">עם פירעונות (כולל פירעון מלא)</ToggleButton>
                  </ToggleButtonGroup>
                )}
              </Box>
              <Tooltip title="תצוגה זו מדמה נייר לבן — נשארת קבועה גם במצב כהה באפליקציה">
                <Box sx={{ border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                  <iframe
                    title="document-preview"
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: 600, border: 'none', background: '#fff' }}
                  />
                </Box>
              </Tooltip>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <Snackbar open={saveState.open} autoHideDuration={4000} onClose={() => setSaveState(s => ({ ...s, open: false }))}>
        <Alert severity={saveState.ok ? 'success' : 'error'}>{saveState.message}</Alert>
      </Snackbar>
    </Box>
  )
}
