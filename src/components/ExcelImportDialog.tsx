/**
 * ExcelImportDialog - דיאלוג ייבוא מאקסל
 * ממשק מלא לייבוא נתונים מקבצי Excel
 */

import React, { useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  IconButton
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Close as CloseIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Person as PersonIcon,
  Handshake as GuarantorIcon,
  AttachMoney as LoanIcon,
  Payment as RepaymentIcon,
  CardGiftcard as DonationIcon,
  AccountBalanceWallet as DepositIcon
} from '@mui/icons-material'
import {
  ImportType,
  ValidationResult,
  ImportResult,
  FullImportResult,
  ImportError,
  readExcelFile,
  getSheetName,
  mapColumns,
  validateData,
  executeImport,
  executeFullImport,
  generateTemplate,
  generateFullTemplate
} from '../services/excelImport'

interface ExcelImportDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const steps = ['בחירת סוג נתונים', 'העלאת קובץ', 'בדיקה ואישור', 'סיכום']

const importTypes: { type: ImportType; label: string; icon: React.ReactNode; standalone: boolean }[] = [
  { type: 'borrowers', label: 'לווים', icon: <PersonIcon />, standalone: true },
  { type: 'guarantors', label: 'ערבים', icon: <GuarantorIcon />, standalone: true },
  { type: 'loans', label: 'הלוואות', icon: <LoanIcon />, standalone: false },
  { type: 'repayments', label: 'פירעונות', icon: <RepaymentIcon />, standalone: false },
  { type: 'donations', label: 'תרומות', icon: <DonationIcon />, standalone: true },
  { type: 'deposits', label: 'הפקדות', icon: <DepositIcon />, standalone: true }
]

const ExcelImportDialog: React.FC<ExcelImportDialogProps> = ({
  open,
  onClose,
  onSuccess
}) => {
  const [activeStep, setActiveStep] = useState(0)
  const [importType, setImportType] = useState<ImportType | null>(null)
  const [isFullImport, setIsFullImport] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [fullImportResult, setFullImportResult] = useState<FullImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipErrors, setSkipErrors] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  // איפוס
  const handleReset = () => {
    setActiveStep(0)
    setImportType(null)
    setIsFullImport(false)
    setFile(null)
    setValidationResults([])
    setImportResult(null)
    setFullImportResult(null)
    setError(null)
  }

  // סגירה
  const handleClose = () => {
    handleReset()
    onClose()
  }

  // הורדת תבנית
  const handleDownloadTemplate = () => {
    if (!importType) return
    
    const blob = generateTemplate(importType)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `תבנית_${importType}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // הורדת תבנית מלאה עם כל הגליונות
  const handleDownloadFullTemplate = () => {
    const blob = generateFullTemplate()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'תבנית_יבוא_מלאה.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  // העלאת קובץ
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setLoading(true)
    setError(null)
    
    try {
      // ייבוא מלא - דילוג ישירות לייבוא
      if (isFullImport) {
        const result = await executeFullImport(selectedFile)
        setFullImportResult(result)
        setActiveStep(3)
        onSuccess()
      } else {
        // ייבוא רגיל - קריאת הגליון המתאים לסוג הייבוא
        if (!importType) return
        const sheetName = getSheetName(importType)
        const rows = await readExcelFile(selectedFile, sheetName)
        const mappedRows = mapColumns(rows, importType)
        const results = await validateData(mappedRows, importType)
        setValidationResults(results)
        setActiveStep(2)
      }
    } catch (err) {
      setError('שגיאה בקריאת הקובץ. ודא שזהו קובץ Excel תקין.')
    } finally {
      setLoading(false)
    }
  }

  // גרירת קובץ
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
      handleFileSelect(droppedFile)
    } else {
      setError('יש להעלות קובץ Excel בלבד (.xlsx או .xls)')
    }
  }, [importType])

  // ביצוע ייבוא
  const handleImport = async () => {
    if (!importType) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await executeImport(validationResults, importType, skipErrors)
      setImportResult(result)
      setActiveStep(3)
      onSuccess()
    } catch (err) {
      setError('שגיאה בייבוא הנתונים')
    } finally {
      setLoading(false)
    }
  }

  // ספירת סטטוסים
  const validCount = validationResults.filter(r => r.status === 'valid').length
  const errorCount = validationResults.filter(r => r.status === 'error').length

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { direction: 'rtl', minHeight: 500 } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        ייבוא נתונים מאקסל
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Stepper - RTL */}
        <Stepper 
          activeStep={activeStep} 
          sx={{ 
            mb: 3,
            flexDirection: 'row-reverse'
          }}
        >
          {steps.map(label => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* שלב 1: בחירת סוג */}
        {activeStep === 0 && (
          <Box>
            {/* אפשרות ייבוא מלא */}
            <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.50', borderRadius: 2, border: '2px solid', borderColor: 'primary.main' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'primary.main' }}>
                🚀 ייבוא מלא - כל הנתונים בפעם אחת
              </Typography>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                ייבא את כל הגליונות מהקובץ המלא בסדר הנכון: לווים → ערבים → הלוואות → פירעונות → תרומות → הפקדות
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => {
                    setIsFullImport(true)
                    setImportType(null)
                    setActiveStep(1)
                  }}
                >
                  ייבוא מלא
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadFullTemplate}
                >
                  הורד תבנית מלאה
                </Button>
              </Box>
            </Box>

            <Typography variant="body1" gutterBottom sx={{ mt: 2 }}>
              או בחר סוג נתונים לייבוא בנפרד:
            </Typography>
            <ToggleButtonGroup
              value={importType}
              exclusive
              onChange={(_, value) => {
                if (value) {
                  setImportType(value)
                  setIsFullImport(false)
                }
              }}
              sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}
            >
              {importTypes.filter(t => t.standalone).map(({ type, label, icon }) => (
                <ToggleButton
                  key={type}
                  value={type}
                  sx={{
                    flex: '1 1 calc(25% - 8px)',
                    maxWidth: 'calc(25% - 8px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    py: 2
                  }}
                >
                  {icon}
                  <Typography variant="body2">{label}</Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              💡 לייבוא הלוואות ופירעונות יש להשתמש ב"ייבוא מלא"
            </Typography>

            {importType && (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  onClick={handleDownloadTemplate}
                >
                  הורד תבנית לדוגמה
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* שלב 2: העלאת קובץ */}
        {activeStep === 1 && (
          <Box>
            {isFullImport && (
              <Alert severity="info" sx={{ mb: 2 }}>
                ייבוא מלא - העלה קובץ עם כל הגליונות (לווים, ערבים, הלוואות, פירעונות, תרומות, הפקדות)
              </Alert>
            )}
            <Box
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              sx={{
                border: '2px dashed',
                borderColor: dragOver ? 'primary.main' : 'grey.300',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                bgcolor: dragOver ? 'action.hover' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              {loading ? (
                <Box>
                  <CircularProgress sx={{ mb: 2 }} />
                  <Typography variant="body1">
                    {isFullImport ? 'מייבא את כל הנתונים...' : 'קורא את הקובץ...'}
                  </Typography>
                </Box>
              ) : (
                <>
                  <UploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                  <Typography variant="body1" gutterBottom>
                    גרור קובץ Excel לכאן או לחץ לבחירה
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    תומך בפורמטים: .xlsx, .xls
                  </Typography>
                </>
              )}
            </Box>
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
              }}
            />
          </Box>
        )}

        {/* שלב 3: בדיקה ואישור */}
        {activeStep === 2 && (
          <Box>
            {/* סיכום */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Chip
                icon={<SuccessIcon />}
                label={`${validCount} תקינות`}
                color="success"
                variant="outlined"
              />
              <Chip
                icon={<ErrorIcon />}
                label={`${errorCount} שגיאות`}
                color="error"
                variant="outlined"
              />
            </Box>

            {/* טבלת תצוגה מקדימה */}
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>שורה</TableCell>
                    <TableCell>סטטוס</TableCell>
                    <TableCell>הערות</TableCell>
                    <TableCell>נתונים</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {validationResults.slice(0, 50).map((result, index) => (
                    <TableRow
                      key={index}
                      sx={{
                        bgcolor: result.status === 'error' ? 'error.light' : 'inherit',
                        opacity: result.status === 'error' ? 0.7 : 1
                      }}
                    >
                      <TableCell>{result.row}</TableCell>
                      <TableCell>
                        {result.status === 'valid' && <SuccessIcon color="success" fontSize="small" />}
                        {result.status === 'error' && <ErrorIcon color="error" fontSize="small" />}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{result.message || '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {Object.values(result.data).slice(0, 3).join(', ')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {validationResults.length > 50 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                מוצגות 50 שורות ראשונות מתוך {validationResults.length}
              </Typography>
            )}

            {/* אפשרויות */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={skipErrors}
                    onChange={e => setSkipErrors(e.target.checked)}
                  />
                }
                label="דלג על שורות עם שגיאות"
              />
            </Box>
          </Box>
        )}

        {/* שלב 4: סיכום */}
        {activeStep === 3 && (importResult || fullImportResult) && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SuccessIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              הייבוא הושלם בהצלחה!
            </Typography>
            
            {/* סיכום ייבוא רגיל */}
            {importResult && !fullImportResult && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
                <Chip
                  label={`${importResult.success} יובאו`}
                  color="success"
                />
                {importResult.errors > 0 && (
                  <Chip
                    label={`${importResult.errors} דולגו`}
                    color="error"
                  />
                )}
              </Box>
            )}
            
            {/* סיכום ייבוא מלא */}
            {fullImportResult && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  סה"כ: {fullImportResult.total.success} רשומות יובאו
                  {fullImportResult.total.errors > 0 && ` (${fullImportResult.total.errors} שגיאות)`}
                </Typography>
                <TableContainer component={Paper} sx={{ maxWidth: 400, mx: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell align="right">סוג</TableCell>
                        <TableCell align="center">יובאו</TableCell>
                        <TableCell align="center">שגיאות</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell align="right"><PersonIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />לווים</TableCell>
                        <TableCell align="center">{fullImportResult.borrowers.success}</TableCell>
                        <TableCell align="center">{fullImportResult.borrowers.errors || '-'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell align="right"><GuarantorIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />ערבים</TableCell>
                        <TableCell align="center">{fullImportResult.guarantors.success}</TableCell>
                        <TableCell align="center">{fullImportResult.guarantors.errors || '-'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell align="right"><LoanIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />הלוואות</TableCell>
                        <TableCell align="center">{fullImportResult.loans.success}</TableCell>
                        <TableCell align="center">{fullImportResult.loans.errors || '-'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell align="right"><RepaymentIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />פירעונות</TableCell>
                        <TableCell align="center">{fullImportResult.repayments.success}</TableCell>
                        <TableCell align="center">{fullImportResult.repayments.errors || '-'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell align="right"><DonationIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />תרומות</TableCell>
                        <TableCell align="center">{fullImportResult.donations.success}</TableCell>
                        <TableCell align="center">{fullImportResult.donations.errors || '-'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell align="right"><DepositIcon fontSize="small" sx={{ ml: 1, verticalAlign: 'middle' }} />הפקדות</TableCell>
                        <TableCell align="center">{fullImportResult.deposits.success}</TableCell>
                        <TableCell align="center">{fullImportResult.deposits.errors || '-'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                
                {/* פרטי שגיאות */}
                {fullImportResult.errorDetails && fullImportResult.errorDetails.length > 0 && (
                  <Box sx={{ mt: 3, textAlign: 'right' }}>
                    <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>
                      פרטי שגיאות:
                    </Typography>
                    <TableContainer component={Paper} sx={{ maxHeight: 200, maxWidth: 500, mx: 'auto' }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell align="right">גליון</TableCell>
                            <TableCell align="center">שורה</TableCell>
                            <TableCell align="right">שגיאה</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {fullImportResult.errorDetails.slice(0, 20).map((err, idx) => (
                            <TableRow key={idx}>
                              <TableCell align="right">{err.sheet}</TableCell>
                              <TableCell align="center">{err.row}</TableCell>
                              <TableCell align="right">
                                <Typography variant="caption">{err.message}</Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {fullImportResult.errorDetails.length > 20 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        מוצגות 20 שגיאות ראשונות מתוך {fullImportResult.errorDetails.length}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {activeStep === 0 && (
          <Button
            variant="contained"
            onClick={() => setActiveStep(1)}
            disabled={!importType && !isFullImport}
          >
            המשך
          </Button>
        )}

        {activeStep === 1 && (
          <Button variant="outlined" onClick={() => setActiveStep(0)} disabled={loading}>
            חזור
          </Button>
        )}

        {activeStep === 2 && (
          <>
            <Button variant="outlined" onClick={() => setActiveStep(1)}>
              חזור
            </Button>
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={loading || validCount === 0}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              ייבא {skipErrors ? validCount : validationResults.length} רשומות
            </Button>
          </>
        )}

        {activeStep === 3 && (
          <Button variant="contained" onClick={handleClose}>
            סגור
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default ExcelImportDialog
