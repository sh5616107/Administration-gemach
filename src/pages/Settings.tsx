import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  Settings as SettingsIcon,
  Visibility as VisibilityIcon,
  Save as BackupIcon,
  Email as EmailIcon,
  Edit as EditIcon,
  Description as DescriptionIcon,
  Info as InfoIcon,
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
  const { t, i18n } = useTranslation()
  
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
    // Sync i18n with settings
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language)
    }
  }, [settings.language, i18n])

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
    setSnackbar({ open: true, message: enabled ? t('settings.protectionEnabled') : t('settings.protectionDisabled'), severity: 'success' })
  }

  const handleSavePassword = async () => {
    if (userPassword.length < 4) {
      setSnackbar({ open: true, message: t('settings.passwordTooShort'), severity: 'error' })
      return
    }
    if (userPassword !== confirmPassword) {
      setSnackbar({ open: true, message: t('settings.passwordMismatch'), severity: 'error' })
      return
    }
    await setUserPassword(userPassword)
    setHasExistingPassword(true)
    setUserPasswordState('')
    setConfirmPassword('')
    setSnackbar({ open: true, message: t('settings.passwordSaved'), severity: 'success' })
  }

  const handleSaveCustomHint = async () => {
    await setCustomHint(customHint)
    setSnackbar({ open: true, message: t('settings.hintSaved'), severity: 'success' })
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
      await updateSetting('language', i18n.language)
      if (localSettings.gemach_logo !== settings.gemach_logo) {
        await updateSetting('gemach_logo', localSettings.gemach_logo)
      }
      setSnackbar({ open: true, message: t('settings.settingsSaved'), severity: 'success' })
      refreshSettings()
    } catch (error) {
      console.error('Error saving settings:', error)
      setSnackbar({ open: true, message: t('settings.settingsSaveError'), severity: 'error' })
    }
  }

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: t('common.error') + ': ' + 'נא לבחור קובץ תמונה', severity: 'error' })
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
              <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SettingsIcon /> {t('settings.general')}
              </Typography>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.language')}</InputLabel>
                <Select
                  value={i18n.language}
                  label={t('settings.language')}
                  onChange={async (e) => {
                    const newLang = e.target.value
                    await i18n.changeLanguage(newLang)
                    await updateSetting('language', newLang)
                  }}
                >
                  <MenuItem value="he">🇮🇱 עברית</MenuItem>
                  <MenuItem value="en">🇺🇸 English</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {t('settings.gemachLogo')}
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
                    {t('settings.uploadLogo')}
                  </Button>
                  {localSettings.gemach_logo && (
                    <Button
                      variant="text"
                      color="error"
                      onClick={() => setLocalSettings({ ...localSettings, gemach_logo: '' })}
                    >
                      {t('settings.removeLogo')}
                    </Button>
                  )}
                </Box>
              </Box>

              <TextField
                fullWidth
                label={t('settings.gemachName')}
                value={localSettings.gemach_name}
                onChange={(e) => setLocalSettings({ ...localSettings, gemach_name: e.target.value })}
                sx={{ mb: 3 }}
              />

              <TextField
                fullWidth
                label={t('settings.riskThreshold')}
                type="number"
                value={localSettings.risk_threshold}
                onChange={(e) => setLocalSettings({ ...localSettings, risk_threshold: e.target.value })}
                helperText={t('settings.riskThresholdHelp')}
                sx={{ mb: 3 }}
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.idNumber')}</InputLabel>
                <Select
                  value={localSettings.id_required}
                  label={t('settings.idNumber')}
                  onChange={(e) => setLocalSettings({ ...localSettings, id_required: e.target.value })}
                >
                  <MenuItem value="optional">{t('settings.idOptional')}</MenuItem>
                  <MenuItem value="required">{t('settings.idRequired')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.currency')}</InputLabel>
                <Select
                  value={localSettings.currency}
                  label={t('settings.currency')}
                  onChange={(e) => setLocalSettings({ ...localSettings, currency: e.target.value })}
                >
                  <MenuItem value="ILS">{t('settings.shekel')}</MenuItem>
                  <MenuItem value="USD">{t('settings.dollar')}</MenuItem>
                  <MenuItem value="EUR">{t('settings.euro')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.dateFormat')}</InputLabel>
                <Select
                  value={localSettings.date_format}
                  label={t('settings.dateFormat')}
                  onChange={(e) => setLocalSettings({ ...localSettings, date_format: e.target.value })}
                >
                  <MenuItem value="gregorian">{t('settings.dateGregorian')}</MenuItem>
                  <MenuItem value="combined">{t('settings.dateCombined')}</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label={t('settings.defaultLoanMonths')}
                type="number"
                value={localSettings.default_loan_months}
                onChange={(e) => setLocalSettings({ ...localSettings, default_loan_months: e.target.value })}
                sx={{ mb: 3 }}
              />

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.defaultLoanType')}</InputLabel>
                <Select
                  value={localSettings.default_loan_type || 'flexible'}
                  label={t('settings.defaultLoanType')}
                  onChange={(e) => setLocalSettings({ ...localSettings, default_loan_type: e.target.value })}
                >
                  <MenuItem value="flexible">{t('settings.loanTypeFlexible')}</MenuItem>
                  <MenuItem value="fixed">{t('settings.loanTypeFixed')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.showRecurringOptions')}</InputLabel>
                <Select
                  value={localSettings.show_recurring_options}
                  label={t('settings.showRecurringOptions')}
                  onChange={(e) => setLocalSettings({ ...localSettings, show_recurring_options: e.target.value })}
                >
                  <MenuItem value="yes">{t('settings.showRecurringYes')}</MenuItem>
                  <MenuItem value="no">{t('settings.showRecurringNo')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.showWaitlistTab')}</InputLabel>
                <Select
                  value={localSettings.show_waitlist_tab}
                  label={t('settings.showWaitlistTab')}
                  onChange={(e) => setLocalSettings({ ...localSettings, show_waitlist_tab: e.target.value })}
                >
                  <MenuItem value="yes">{t('settings.showWaitlistYes')}</MenuItem>
                  <MenuItem value="no">{t('settings.showWaitlistNo')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.showPaymentMethod')}</InputLabel>
                <Select
                  value={localSettings.show_payment_method}
                  label={t('settings.showPaymentMethod')}
                  onChange={(e) => setLocalSettings({ ...localSettings, show_payment_method: e.target.value })}
                >
                  <MenuItem value="no">{t('settings.showPaymentMethodNo')}</MenuItem>
                  <MenuItem value="yes">{t('settings.showPaymentMethodYes')}</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>{t('settings.emailProvider')}</InputLabel>
                <Select
                  value={localSettings.email_provider}
                  label={t('settings.emailProvider')}
                  onChange={(e) => setLocalSettings({ ...localSettings, email_provider: e.target.value })}
                >
                  <MenuItem value="gmail">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon sx={{ fontSize: 18 }} /> {t('settings.emailGmail')}
                    </Box>
                  </MenuItem>
                  <MenuItem value="outlook">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon sx={{ fontSize: 18 }} /> {t('settings.emailOutlook')}
                    </Box>
                  </MenuItem>
                  <MenuItem value="default">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EmailIcon sx={{ fontSize: 18 }} /> {t('settings.emailDefault')}
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
              <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <VisibilityIcon /> {t('settings.preview')}
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
                  {t('settings.previewText')}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <BackupIcon /> {t('settings.autoBackup')}
              </Typography>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>{t('settings.autoBackup')}</InputLabel>
                <Select
                  value={localSettings.auto_backup}
                  label={t('settings.autoBackup')}
                  onChange={(e) => setLocalSettings({ ...localSettings, auto_backup: e.target.value })}
                >
                  <MenuItem value="off">{t('settings.autoBackupOff')}</MenuItem>
                  <MenuItem value="daily">{t('settings.autoBackupDaily')}</MenuItem>
                  <MenuItem value="weekly">{t('settings.autoBackupWeekly')}</MenuItem>
                  <MenuItem value="monthly">{t('settings.autoBackupMonthly')}</MenuItem>
                </Select>
              </FormControl>

              {localSettings.auto_backup !== 'off' && (
                <TextField
                  fullWidth
                  label={t('settings.autoBackupPath')}
                  value={localSettings.auto_backup_path}
                  onChange={(e) => setLocalSettings({ ...localSettings, auto_backup_path: e.target.value })}
                  placeholder="C:\Backups\Gemach"
                  helperText={t('settings.autoBackupPathHelp')}
                />
              )}
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockIcon color="primary" /> {t('settings.protection')}
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
                label={t('settings.enableProtection')}
                sx={{ mb: 2, display: 'block' }}
              />

              {/* הגדרת סיסמה - מופיע רק כשההגנה מופעלת */}
              {protectionEnabled && (
                <>
                  <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2 }}>
                      {hasExistingPassword ? t('settings.changePassword') : t('settings.setPassword')}
                    </Typography>
                    {!hasExistingPassword && (
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('settings.passwordWarning')}
                      </Alert>
                    )}
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      label={t('settings.newPassword')}
                      value={userPassword}
                      onChange={(e) => setUserPasswordState(e.target.value)}
                      placeholder={t('settings.passwordMinLength')}
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      fullWidth
                      size="small"
                      type="password"
                      label={t('settings.confirmPassword')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('settings.confirmPassword')}
                      sx={{ mb: 1 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleSavePassword}
                      disabled={userPassword.length < 4}
                    >
                      {hasExistingPassword ? t('settings.updatePassword') : t('settings.savePassword')}
                    </Button>
                  </Box>

                  {/* רמז מותאם */}
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t('settings.passwordHint')}
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    value={customHint}
                    onChange={(e) => setCustomHintState(e.target.value)}
                    placeholder={t('settings.passwordHintPlaceholder')}
                    sx={{ mb: 1 }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleSaveCustomHint}
                  >
                    {t('settings.saveHint')}
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
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EditIcon /> התאמת שמות שדות
              </Typography>
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
              <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DescriptionIcon /> עריכת נוסח שטרות
              </Typography>
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
            {t('common.save')} {t('settings.title')}
          </Button>
        </Grid>

        {/* About */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon /> {t('settings.about')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                מינהל הגמ"ח
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('settings.version')}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EmailIcon sx={{ fontSize: 16 }} /> {t('settings.developerEmail')}
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
