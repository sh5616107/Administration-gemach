import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Alert,
  Box,
  Grid,
} from '@mui/material'
import { UnifiedContact, ContactFormData, ContactRole } from '../../types/contacts'
import { createContact, updateContact, getContactByPhone } from '../../services/contacts'
import { validateIsraeliId, validateIsraeliPhone, validateEmail } from '../../utils/validation'

interface ContactFormDialogProps {
  open: boolean
  onClose: () => void
  onSave: () => void
  contact?: UnifiedContact | null
}

export default function ContactFormDialog({ open, onClose, onSave, contact }: ContactFormDialogProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ContactFormData>({
    first_name: '',
    last_name: '',
    phone: '',
    id_number: '',
    city: '',
    address: '',
    email: '',
    notes: '',
    initial_roles: [],
    tags: []
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [duplicateWarning, setDuplicateWarning] = useState<UnifiedContact | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (contact) {
      // מצב עריכה
      setFormData({
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone: contact.phone,
        id_number: contact.id_number,
        city: contact.city,
        address: contact.address,
        email: contact.email,
        notes: contact.notes,
        initial_roles: contact.roles.map(r => r.type),
        tags: contact.tags
      })
    } else {
      // מצב הוספה - איפוס הטופס
      setFormData({
        first_name: '',
        last_name: '',
        phone: '',
        id_number: '',
        city: '',
        address: '',
        email: '',
        notes: '',
        initial_roles: [],
        tags: []
      })
    }
    setErrors({})
    setDuplicateWarning(null)
  }, [contact, open])

  const handleChange = (field: keyof ContactFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [field]: e.target.value })
    // ניקוי שגיאה כשמשנים את השדה
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' })
    }
  }

  const handleRoleToggle = (role: ContactRole['type']) => {
    const roles = formData.initial_roles || []
    if (roles.includes(role)) {
      setFormData({ ...formData, initial_roles: roles.filter(r => r !== role) })
    } else {
      setFormData({ ...formData, initial_roles: [...roles, role] })
    }
  }

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}

    // שדות חובה
    if (!formData.first_name.trim()) {
      newErrors.first_name = t('contacts.form.firstNameRequired')
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = t('contacts.form.lastNameRequired')
    }
    if (!formData.phone.trim()) {
      newErrors.phone = t('contacts.form.phoneRequired')
    }

    // אימות טלפון
    if (formData.phone && !validateIsraeliPhone(formData.phone)) {
      newErrors.phone = t('contacts.form.phoneInvalid')
    }

    // בדיקת טלפון כפול (רק בהוספה או אם שינו את הטלפון)
    if (formData.phone && (!contact || contact.phone !== formData.phone)) {
      const existing = await getContactByPhone(formData.phone)
      if (existing) {
        setDuplicateWarning(existing)
        newErrors.phone = t('contacts.form.phoneExists')
      }
    }

    // אימות מספר זהות
    if (formData.id_number) {
      if (!validateIsraeliId(formData.id_number)) {
        newErrors.id_number = t('contacts.form.idNumberInvalid')
      }
      // בדיקת זהות כפולה (רק אם שינו את המספר)
      if (!contact || contact.id_number !== formData.id_number) {
        const contacts = await import('../../services/contacts')
        const allContacts = await contacts.getAllContacts()
        const duplicate = allContacts.find(c => c.id_number === formData.id_number && c.phone !== contact?.phone)
        if (duplicate) {
          newErrors.id_number = t('contacts.form.idNumberExists')
        }
      }
    }

    // אימות אימייל
    if (formData.email && !validateEmail(formData.email)) {
      newErrors.email = t('contacts.form.emailInvalid')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!(await validateForm())) return

    try {
      setSaving(true)

      if (contact) {
        // עדכון איש קשר קיים
        await updateContact(contact.phone, {
          first_name: formData.first_name,
          last_name: formData.last_name,
          id_number: formData.id_number,
          city: formData.city,
          address: formData.address,
          email: formData.email,
          notes: formData.notes,
          tags: formData.tags
        } as any)
      } else {
        // יצירת איש קשר חדש
        await createContact(formData, formData.initial_roles || [])
      }

      onSave()
      onClose()
    } catch (error) {
      console.error('שגיאה בשמירת איש קשר:', error)
      setErrors({ general: 'שגיאה בשמירת איש קשר' })
    } finally {
      setSaving(false)
    }
  }

  const handleLinkToExisting = async () => {
    if (!duplicateWarning) return
    
    try {
      setSaving(true)
      // מיזוג התפקידים החדשים עם התפקידים הקיימים
      const existingRoles = duplicateWarning.roles.map(r => r.type)
      const newRoles = formData.initial_roles || []
      const mergedRoles = [...new Set([...existingRoles, ...newRoles])]
      
      // עדכון איש הקשר הקיים עם התפקידים המשולבים
      // מעדכנים רק את השדות שהשתנו, לא את initial_roles
      const updateData: Partial<UnifiedContact> = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        id_number: formData.id_number,
        city: formData.city,
        address: formData.address,
        email: formData.email,
        notes: formData.notes,
        tags: formData.tags
      }
      
      await updateContact(duplicateWarning.phone, updateData)
      
      // הוספת התפקידים החדשים בנפרד
      // TODO: צריך להוסיף פונקציה להוספת תפקידים
      
      setDuplicateWarning(null)
      onSave()
      onClose()
    } catch (error) {
      console.error('שגיאה בקישור לאיש קשר:', error)
      setErrors({ general: 'שגיאה בקישור לאיש קשר קיים' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {contact ? t('contacts.editContact') : t('contacts.newContact')}
      </DialogTitle>
      <DialogContent>
        {errors.general && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.general}
          </Alert>
        )}

        {duplicateWarning && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Box>
              <strong>{t('contacts.duplicate.title')}</strong>
              <Box sx={{ mt: 1 }}>
                {t('contacts.duplicate.message')}: {duplicateWarning.first_name} {duplicateWarning.last_name}
              </Box>
              <Box sx={{ mt: 1 }}>
                {t('contacts.duplicate.existingRoles')}: {duplicateWarning.roles.map(r => t(`contacts.roles.${r.type}`)).join(', ')}
              </Box>
              <Button size="small" onClick={handleLinkToExisting} sx={{ mt: 1 }}>
                {t('contacts.duplicate.linkToExisting')}
              </Button>
            </Box>
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.firstName')}
              value={formData.first_name}
              onChange={handleChange('first_name')}
              error={!!errors.first_name}
              helperText={errors.first_name}
              required
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.lastName')}
              value={formData.last_name}
              onChange={handleChange('last_name')}
              error={!!errors.last_name}
              helperText={errors.last_name}
              required
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.phone')}
              value={formData.phone}
              onChange={handleChange('phone')}
              error={!!errors.phone}
              helperText={errors.phone}
              required
              disabled={!!contact} // לא ניתן לשנות טלפון בעריכה
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.idNumber')}
              value={formData.id_number}
              onChange={handleChange('id_number')}
              error={!!errors.id_number}
              helperText={errors.id_number}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.city')}
              value={formData.city}
              onChange={handleChange('city')}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={t('contacts.form.email')}
              value={formData.email}
              onChange={handleChange('email')}
              error={!!errors.email}
              helperText={errors.email}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label={t('contacts.form.address')}
              value={formData.address}
              onChange={handleChange('address')}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={3}
              label={t('contacts.form.notes')}
              value={formData.notes}
              onChange={handleChange('notes')}
            />
          </Grid>

          {!contact && (
            <Grid item xs={12}>
              <Box sx={{ mt: 1 }}>
                <strong>{t('contacts.form.initialRoles')}</strong>
                <FormGroup row>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.initial_roles?.includes('borrower')}
                        onChange={() => handleRoleToggle('borrower')}
                      />
                    }
                    label={t('contacts.roles.borrower')}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.initial_roles?.includes('guarantor')}
                        onChange={() => handleRoleToggle('guarantor')}
                      />
                    }
                    label={t('contacts.roles.guarantor')}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.initial_roles?.includes('donor')}
                        onChange={() => handleRoleToggle('donor')}
                      />
                    }
                    label={t('contacts.roles.donor')}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.initial_roles?.includes('depositor')}
                        onChange={() => handleRoleToggle('depositor')}
                      />
                    }
                    label={t('contacts.roles.depositor')}
                  />
                </FormGroup>
              </Box>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
