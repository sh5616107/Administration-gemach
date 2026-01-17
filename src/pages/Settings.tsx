import { useState, useRef, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Avatar,
  Snackbar,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
} from '@mui/material'
import { 
  Save as SaveIcon, 
  Upload as UploadIcon,
  ExpandMore as ExpandMoreIcon,
  Lock as LockIcon,
} from '@mui/icons-material'
import { useSettings } from '../hooks/useSettings'
import { isProtectionEnabled, setProtectionEnabled, setUserPassword, getUserPassword, setCustomHint, getCustomHint } from '../services/protection'

const defaultFieldLabels = {
  borrower_first_name: 'שם פרטי',
  borrower_last_name: 'שם משפחה',
  borrower_id_number: 'מספר זהות',
  borrower_phone: 'טלפון',
  borrower_phone2: 'טלפון נוסף',
  borrower_city: 'עיר',
  loan_amount: 'סכום הלוואה',
  loan_date: 'תאריך מתן',
  guarantor_name: 'שם ערב',
  donation_amount: 'סכום תרומה',
  deposit_amount: 'סכום הפקדה',
}

export default function Settings() {
  const { settings, updateSetting, refreshSettings } = useSettings()
  
  // Helper to check if text contains old template variables
  const isOldTemplate = (text: string) => text && (text.includes('{שם_') || text.includes('{סכום}') || text.includes('{תאריך}'))
  
  const [localSettings, setLocalSettings] = useState({
    gemach_name: settings.gemach_name || '',
    gemach_logo: settings.gemach_logo || '',
    risk_threshold: settings.risk_threshold || '50000',
    id_required: settings.id_required || 'optional',
    currency: settings.currency || 'ILS',
    default_loan_months: settings.default_loan_months || '12',
    default_loan_type: settings.default_loan_type || 'flexible',
    auto_backup: settings.auto_backup || 'off',
    auto_backup_path: settings.auto_backup_path || '',
    show_recurring_options: settings.show_recurring_options || 'yes',
    date_format: settings.date_format || 'gregorian',
    show_payment_method: settings.show_payment_method || 'no',
    show_waitlist_tab: settings.show_waitlist_tab || 'yes',
    email_provider: settings.email_provider || 'gmail',
    loan_document_text: isOldTemplate(settings.loan_document_text) ? '' : (settings.loan_document_text || ''),
    deposit_document_text: isOldTemplate(settings.deposit_document_text) ? '' : (settings.deposit_document_text || ''),
  })
  
  // Update local settings when settings change (e.g., after refresh)
  useEffect(() => {
    setLocalSettings({
      gemach_name: settings.gemach_name || '',
      gemach_logo: settings.gemach_logo || '',
      risk_threshold: settings.risk_threshold || '50000',
      id_required: settings.id_required || 'optional',
      currency: settings.currency || 'ILS',
      default_loan_months: settings.default_loan_months || '12',
      default_loan_type: settings.default_loan_type || 'flexible',
      auto_backup: settings.auto_backup || 'off',
      auto_backup_path: settings.auto_backup_path || '',
      show_recurring_options: settings.show_recurring_options || 'yes',
      date_format: settings.date_format || 'gregorian',
      show_payment_method: settings.show_payment_method || 'no',
      show_waitlist_tab: settings.show_waitlist_tab || 'yes',
      email_provider: settings.email_provider || 'gmail',
      loan_document_text: isOldTemplate(settings.loan_document_text) ? '' : (settings.loan_document_text || ''),
      deposit_document_text: isOldTemplate(settings.deposit_document_text) ? '' : (settings.deposit_document_text || ''),
    })
  }, [settings])
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>(
    settings.field_labels ? JSON.parse(settings.field_labels) : defaultFieldLabels
  )
  
  // עדכון fieldLabels כש-settings משתנה
  useEffect(() => {
    if (settings.field_labels) {
      try {
        setFieldLabels(JSON.parse(settings.field_labels))
      } catch {
        setFieldLabels(defaultFieldLabels)
      }
    }
  }, [settings.field_labels])
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [protectionEnabled, setProtectionEnabledState] = useState(false)
  const [customHint, setCustomHintState] = useState('')
  const [userPassword, setUserPasswordState] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hasExistingPassword, setHasExistingPassword] = useState(false)

  useEffect(() => {
    loadProtectionSettings()
  }, [])

  const loadProtectionSettings = async () => {
    const enabled = await isProtectionEnabled()
    setProtectionEnabledState(enabled)
    const hint = await getCustomHint()
    setCustomHintState(hint || '')
    const existingPwd = await getUserPassword()
    setHasExistingPassword(!!existingPwd)
  }

  const handleProtectionToggle = async (enabled: boolean) => {
    await setProtectionEnabled(enabled)
    setProtectionEnabledState(enabled)
    setSnackbar({ open: true, message: enabled ? 'הגנה הופעלה' : 'הגנה כובתה', severity: 'success' })
  }

  const handleSavePassword = async () => {
    if (userPassword.length < 4) {
      setSnackbar({ open: true, message: 'הסיסמה חייבת להכיל לפחות 4 תווים', severity: 'error' })
      return
    }
    if (userPassword !== confirmPassword) {
      setSnackbar({ open: true, message: 'הסיסמאות אינן תואמות', severity: 'error' })
      return
    }
    await setUserPassword(userPassword)
    setHasExistingPassword(true)
    setUserPasswordState('')
    setConfirmPassword('')
    setSnackbar({ open: true, message: 'הסיסמה נשמרה בהצלחה', severity: 'success' })
  }

  const handleSaveCustomHint = async () => {
    await setCustomHint(customHint)
    setSnackbar({ open: true, message: 'הרמז נשמר', severity: 'success' })
  }

  const handleSave = async () => {
    try {
      await updateSetting('gemach_name', localSettings.gemach_name)
      await updateSetting('risk_threshold', localSettings.risk_threshold)
      await updateSetting('field_labels', JSON.stringify(fieldLabels))
      await updateSetting('id_required', localSettings.id_required)
      await updateSetting('currency', localSettings.currency)
      await updateSetting('default_loan_months', localSettings.default_loan_months)
      await updateSetting('default_loan_type', localSettings.default_loan_type)
      await updateSetting('auto_backup', localSettings.auto_backup)
      await updateSetting('auto_backup_path', localSettings.auto_backup_path)
      await updateSetting('show_recurring_options', localSettings.show_recurring_options)
      await updateSetting('show_waitlist_tab', localSettings.show_waitlist_tab)
      await updateSetting('date_format', localSettings.date_format)
      await updateSetting('show_payment_method', localSettings.show_payment_method)
      await updateSetting('email_provider', localSettings.email_provider)
      await updateSetting('loan_document_text', localSettings.loan_document_text)
      await updateSetting('deposit_document_text', localSettings.deposit_document_text)
      if (localSettings.gemach_logo !== settings.gemach_logo) {
        await updateSetting('gemach_logo', localSettings.gemach_logo)
      }
      setSnackbar({ open: true, message: 'ההגדרות נשמרו בהצלחה', severity: 'success' })
      refreshSettings()
    } catch (error) {
      console.error('Error saving settings:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירה', severity: 'error' })
    }
  }

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: 'נא לבחור קובץ תמונה', severity: 'error' })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      setLocalSettings({ ...localSettings, gemach_logo: base64 })
    }
    reader.readAsDataURL(file)
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* General Settings */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3 }}>
                ⚙️ הגדרות כלליות
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  לוגו הגמ"ח
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar
                    src={localSettings.gemach_logo || undefined}
                    sx={{ width: 80, height: 80, bgcolor: 'primary.main' }}
                  >
                    {!localSettings.gemach_logo && 'ג'}
                  </Avatar>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleLogoUpload}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    העלה לוגו
                  </Button>
                  {localSettings.gemach_logo && (
                    <Button
                      variant="text"
                      color="error"
                      onClick={() => setLocalSettings({ ...localSettings, gemach_logo: '' })}
                    >
                      הסר
                    </Button>
                  )}
                </Box>
              </Box>

              <TextField
                fullWidth
                label="שם הגמ״ח"
                value={localSettings.gemach_name}
                onChange={(e) => setLocalSettings({ ...localSettings, gemach_name: e.target.value })}
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                label="סף סיכון לערבים (ש״ח)"
                type="number"
                value={localSettings.risk_threshold}
                onChange={(e) => setLocalSettings({ ...localSettings, risk_threshold: e.target.value })}
                helperText="ערבים עם ערבויות מעל סכום זה יסומנו כ'בסיכון גבוה'"
                sx={{ mb: 3 }}
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>מספר זהות</InputLabel>
                <Select
                  value={localSettings.id_required}
                  label="מספר זהות"
                  onChange={(e) => setLocalSettings({ ...localSettings, id_required: e.target.value })}
                >
                  <MenuItem value="optional">אופציונלי</MenuItem>
                  <MenuItem value="required">חובה</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>מטבע</InputLabel>
                <Select
                  value={localSettings.currency}
                  label="מטבע"
                  onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
                >
                  <MenuItem value="ILS">₪ שקל</MenuItem>
                  <MenuItem value="USD">$ דולר</MenuItem>
                  <MenuItem value="EUR">€ יורו</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>תצוגת תאריכים</InputLabel>
                <Select
                  value={localSettings.date_format}
                  label="תצוגת תאריכים"
                  onChange={(e) => setLocalSettings({ ...localSettings, date_format: e.target.value })}
                >
                  <MenuItem value="gregorian">לועזי בלבד (01/01/2025)</MenuItem>
                  <MenuItem value="combined">משולב - לועזי + עברי (01/01/2025 | א' טבת תשפ"ה)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="תקופת הלוואה ברירת מחדל (חודשים)"
                type="number"
                value={localSettings.default_loan_months}
                onChange={(e) => setLocalSettings({ ...localSettings, default_loan_months: e.target.value })}
                sx={{ mb: 3 }}
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>סוג הלוואה ברירת מחדל</InputLabel>
                <Select
                  value={localSettings.default_loan_type || 'flexible'}
                  label="סוג הלוואה ברירת מחדל"
                  onChange={(e) => setLocalSettings({ ...localSettings, default_loan_type: e.target.value })}
                >
                  <MenuItem value="flexible">גמישה - ללא תאריך פירעון קבוע</MenuItem>
                  <MenuItem value="fixed">קבועה - עם תאריך פירעון</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>הצג אפשרויות מחזוריות בטופס הלוואה</InputLabel>
                <Select
                  value={localSettings.show_recurring_options}
                  label="הצג אפשרויות מחזוריות בטופס הלוואה"
                  onChange={(e) => setLocalSettings({ ...localSettings, show_recurring_options: e.target.value })}
                >
                  <MenuItem value="yes">כן - הצג הלוואה מחזורית ופירעון מחזורי</MenuItem>
                  <MenuItem value="no">לא - הסתר</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>הצג טאב תור בקשות להלוואות</InputLabel>
                <Select
                  value={localSettings.show_waitlist_tab}
                  label="הצג טאב תור בקשות להלוואות"
                  onChange={(e) => setLocalSettings({ ...localSettings, show_waitlist_tab: e.target.value })}
                >
                  <MenuItem value="yes">כן - הצג טאב תור בקשות</MenuItem>
                  <MenuItem value="no">לא - הסתר</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>הצג פרטי אמצעי תשלום</InputLabel>
                <Select
                  value={localSettings.show_payment_method}
                  label="הצג פרטי אמצעי תשלום"
                  onChange={(e) => setLocalSettings({ ...localSettings, show_payment_method: e.target.value })}
                >
                  <MenuItem value="no">לא - הסתר</MenuItem>
                  <MenuItem value="yes">כן - הצג (מזומן/אשראי/העברה/צ'ק)</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>ספק מייל לשליחת מסמכים</InputLabel>
                <Select
                  value={localSettings.email_provider}
                  label="ספק מייל לשליחת מסמכים"
                  onChange={(e) => setLocalSettings({ ...localSettings, email_provider: e.target.value })}
                >
                  <MenuItem value="gmail">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📧</span> Gmail
                    </Box>
                  </MenuItem>
                  <MenuItem value="outlook">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📧</span> Outlook
                    </Box>
                  </MenuItem>
                  <MenuItem value="default">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>📧</span> תוכנת מייל מותקנת (ברירת מחדל)
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </CardContent>
          </Card>
        </Grid>

        {/* Preview + Auto Backup */}
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3 }}>
                👁️ תצוגה מקדימה
              </Typography>

              <Box
                sx={{
                  p: 3,
                  border: '2px dashed #e0e0e0',
                  borderRadius: 2,
                  textAlign: 'center',
                }}
              >
                <Avatar
                  src={localSettings.gemach_logo || undefined}
                  sx={{ width: 100, height: 100, mx: 'auto', mb: 2, bgcolor: 'primary.main' }}
                >
                  {!localSettings.gemach_logo && 'ג'}
                </Avatar>
                <Typography variant="h5" fontWeight={600}>
                  {localSettings.gemach_name || 'שם הגמ"ח'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  כך ייראה הלוגו והשם בתוכנה ובשטרות
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                💾 גיבוי אוטומטי
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>גיבוי אוטומטי</InputLabel>
                <Select
                  value={localSettings.auto_backup}
                  label="גיבוי אוטומטי"
                  onChange={(e) => setLocalSettings({ ...localSettings, auto_backup: e.target.value })}
                >
                  <MenuItem value="off">כבוי</MenuItem>
                  <MenuItem value="daily">יומי</MenuItem>
                  <MenuItem value="weekly">שבועי</MenuItem>
                  <MenuItem value="monthly">חודשי</MenuItem>
                </Select>
              </FormControl>

              {localSettings.auto_backup !== 'off' && (
                <TextField
                  fullWidth
                  label="נתיב לשמירת גיבויים"
                  value={localSettings.auto_backup_path}
                  onChange={(e) => setLocalSettings({ ...localSettings, auto_backup_path: e.target.value })}
                  placeholder="C:\Backups\Gemach"
                  helperText="השאר ריק לשמירה בתיקיית ברירת מחדל"
                />
              )}
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon color="primary" /> הגנת התוכנה
              </Typography>

              {/* הפעלת הגנה - למעלה */}
              <FormControlLabel
                control={
                  <Switch
                    checked={protectionEnabled}
                    onChange={(e) => handleProtectionToggle(e.target.checked)}
                    color="primary"
                  />
                }
                label="הפעל הגנה בסיסמה"
                sx={{ mb: 2, display: 'block' }}
              />

              {/* הגדרת סיסמה - מופיע רק כשההגנה מופעלת */}
              {protectionEnabled && (
                <>
                  <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>
                      {hasExistingPassword ? 'שינוי סיסמה' : 'הגדרת סיסמה'}
                    </Typography>
                    {!hasExistingPassword && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        יש להגדיר סיסמה כדי שההגנה תפעל
                      </Alert>
                    )}
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      label="סיסמה חדשה"
                      value={userPassword}
                      onChange={(e) => setUserPasswordState(e.target.value)}
                      placeholder="מינימום 4 תווים"
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      label="אימות סיסמה"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="הזן שוב את הסיסמה"
                      sx={{ mb: 1 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleSavePassword}
                      disabled={userPassword.length < 4}
                    >
                      {hasExistingPassword ? 'עדכן סיסמה' : 'שמור סיסמה'}
                    </Button>
                  </Box>

                  {/* רמז מותאם */}
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    רמז לסיסמה (אופציונלי)
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={customHint}
                    onChange={(e) => setCustomHintState(e.target.value)}
                    placeholder="הוסף רמז שיעזור לך לזכור את הסיסמה"
                    sx={{ mb: 1 }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSaveCustomHint}
                  >
                    שמור רמז
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Field Customization - Accordion */}
        <Grid item xs={12}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">📝 התאמת שמות שדות</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                ניתן לשנות את שמות השדות המוצגים בטפסים
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>שדה</TableCell>
                      <TableCell>שם מותאם</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(defaultFieldLabels).map(([key, defaultLabel]) => (
                      <TableRow key={key}>
                        <TableCell sx={{ color: 'text.secondary' }}>{defaultLabel}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            value={fieldLabels[key] || defaultLabel}
                            onChange={(e) => setFieldLabels({ ...fieldLabels, [key]: e.target.value })}
                            placeholder={defaultLabel}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Button
                variant="text"
                size="small"
                sx={{ mt: 1 }}
                onClick={() => setFieldLabels(defaultFieldLabels)}
              >
                אפס לברירת מחדל
              </Button>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Document Templates - Accordion */}
        <Grid item xs={12}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">📄 עריכת נוסח שטרות</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                ניתן לערוך את הנוסח המשפטי בשטרות. הפרטים (שם, סכום, תאריך) יוצגו אוטומטית.
              </Typography>
              
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                שטר הלוואה - נוסח ההתחייבות:
              </Typography>
              <Box sx={{ mb: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  אני הח"מ <strong>[שם הלווה]</strong> ...
                </Typography>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={3}
                value={localSettings.loan_document_text}
                onChange={(e) => setLocalSettings({ ...localSettings, loan_document_text: e.target.value })}
                placeholder="מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע."
                sx={{ mb: 3 }}
              />
              
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                שטר הפקדה - נוסח ההתחייבות:
              </Typography>
              <Box sx={{ mb: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  אני הח"מ מנהל הגמ"ח מאשר כי קיבלתי הפקדה מאת <strong>[שם המפקיד]</strong> ...
                </Typography>
              </Box>
              <TextField
                fullWidth
                multiline
                rows={3}
                value={localSettings.deposit_document_text}
                onChange={(e) => setLocalSettings({ ...localSettings, deposit_document_text: e.target.value })}
                placeholder="ואני מתחייב להחזיר את הסכום בתנאים שנקבעו."
                sx={{ mb: 2 }}
              />
              
              <Button
                variant="text"
                size="small"
                onClick={() => setLocalSettings({
                  ...localSettings,
                  loan_document_text: 'מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע.',
                  deposit_document_text: 'ואני מתחייב להחזיר את הסכום בתנאים שנקבעו.',
                })}
              >
                אפס לברירת מחדל
              </Button>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Save Button */}
        <Grid item xs={12}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            size="large"
            fullWidth
          >
            שמור הגדרות
          </Button>
        </Grid>

        {/* About */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                ℹ️ אודות
              </Typography>
              <Typography variant="body2" color="text.secondary">
                מינהל הגמ"ח
              </Typography>
              <Typography variant="body2" color="text.secondary">
                גרסה 3.3.0
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary">
                📧 מייל המפתח: sh5616107@gmail.com
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  )
}
