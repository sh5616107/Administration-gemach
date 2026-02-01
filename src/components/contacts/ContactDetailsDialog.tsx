import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
} from '@mui/material'
import {
  Edit as EditIcon,
  Close as CloseIcon,
  Person as BorrowerIcon,
  Shield as GuarantorIcon,
  VolunteerActivism as DonorIcon,
  AccountBalance as DepositorIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { UnifiedContact } from '../../types/contacts'
import { getContactActivity } from '../../services/contacts'
import ActivityTimeline from './ActivityTimeline'

interface ContactDetailsDialogProps {
  open: boolean
  onClose: () => void
  contact: UnifiedContact | null
  onEdit: () => void
}

export default function ContactDetailsDialog({ open, onClose, contact, onEdit }: ContactDetailsDialogProps) {
  const { t } = useTranslation()
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddRoleDialog, setShowAddRoleDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [addingRole, setAddingRole] = useState(false)

  useEffect(() => {
    if (contact && open) {
      loadActivities()
    }
  }, [contact, open])

  const loadActivities = async () => {
    if (!contact) return
    try {
      setLoading(true)
      const data = await getContactActivity(contact.phone)
      setActivities(data)
    } catch (error) {
      console.error('שגיאה בטעינת פעילות:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRole = async () => {
    if (!contact || !selectedRole) return
    
    try {
      setAddingRole(true)
      const { addRoleToContactByPhone } = await import('../../services/contacts')
      await addRoleToContactByPhone(contact.phone, selectedRole as any)
      setShowAddRoleDialog(false)
      setSelectedRole('')
      // רענון הדף
      window.location.reload()
    } catch (error) {
      console.error('שגיאה בהוספת תפקיד:', error)
      alert(error instanceof Error ? error.message : 'שגיאה בהוספת תפקיד')
    } finally {
      setAddingRole(false)
    }
  }

  const availableRoles = ['borrower', 'guarantor', 'donor', 'depositor'].filter(
    role => !contact?.roles.some(r => r.type === role)
  )

  if (!contact) return null

  const getRoleIcon = (roleType: string) => {
    switch (roleType) {
      case 'borrower':
        return <BorrowerIcon />
      case 'guarantor':
        return <GuarantorIcon />
      case 'donor':
        return <DonorIcon />
      case 'depositor':
        return <DepositorIcon />
      default:
        return null
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {contact.first_name} {contact.last_name}
          </Typography>
          <Box>
            <IconButton onClick={onEdit} size="small">
              <EditIcon />
            </IconButton>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        {/* פרטים אישיים */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('contacts.details.personalInfo')}
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">
                  {t('contacts.form.phone')}
                </Typography>
                <Typography variant="body1">{contact.phone}</Typography>
              </Grid>
              {contact.id_number && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('contacts.form.idNumber')}
                  </Typography>
                  <Typography variant="body1">{contact.id_number}</Typography>
                </Grid>
              )}
              {contact.city && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('contacts.form.city')}
                  </Typography>
                  <Typography variant="body1">{contact.city}</Typography>
                </Grid>
              )}
              {contact.address && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('contacts.form.address')}
                  </Typography>
                  <Typography variant="body1">{contact.address}</Typography>
                </Grid>
              )}
              {contact.email && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    {t('contacts.form.email')}
                  </Typography>
                  <Typography variant="body1">{contact.email}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>

        {/* תפקידים */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                {t('contacts.details.roles')}
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setShowAddRoleDialog(true)}
              >
                {t('contacts.details.addRole')}
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {contact.roles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t('contacts.details.noRoles')}
                </Typography>
              ) : (
                contact.roles.map((role, index) => (
                  <Chip
                    key={index}
                    icon={getRoleIcon(role.type)}
                    label={t(`contacts.roles.${role.type}`)}
                    color="primary"
                  />
                ))
              )}
            </Box>
          </CardContent>
        </Card>

        {/* סטטיסטיקות */}
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('contacts.details.statistics')}
            </Typography>
            <Grid container spacing={2}>
              {/* הלוואות */}
              {contact.stats.total_loans > 0 && (
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {t('contacts.stats.loans')}
                      </Typography>
                      <Typography variant="h6">
                        {contact.stats.active_loans} / {contact.stats.total_loans}
                      </Typography>
                      <Typography variant="body2" color="error.main">
                        {formatCurrency(contact.stats.total_debt)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* ערבויות */}
              {contact.stats.total_guarantees > 0 && (
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {t('contacts.stats.guarantees')}
                      </Typography>
                      <Typography variant="h6">
                        {contact.stats.active_guarantees} / {contact.stats.total_guarantees}
                      </Typography>
                      <Typography variant="body2" color="warning.main">
                        {formatCurrency(contact.stats.total_guaranteed)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* תרומות */}
              {contact.stats.total_donations > 0 && (
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {t('contacts.stats.donations')}
                      </Typography>
                      <Typography variant="h6">{contact.stats.total_donations}</Typography>
                      <Typography variant="body2" color="success.main">
                        {formatCurrency(contact.stats.total_donated)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* הפקדות */}
              {contact.stats.total_deposits > 0 && (
                <Grid item xs={12} sm={6} md={3}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">
                        {t('contacts.stats.deposits')}
                      </Typography>
                      <Typography variant="h6">
                        {contact.stats.active_deposits} / {contact.stats.total_deposits}
                      </Typography>
                      <Typography variant="body2" color="info.main">
                        {formatCurrency(contact.stats.active_deposit_amount)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              )}

              {/* מאזן נטו */}
              <Grid item xs={12}>
                <Card variant="outlined" sx={{ bgcolor: contact.stats.net_balance >= 0 ? 'success.light' : 'error.light' }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      {t('contacts.stats.netBalance')}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(contact.stats.net_balance)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* הערות */}
        {contact.notes && (
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {t('contacts.form.notes')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {contact.notes}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* היסטוריית פעילות */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {t('contacts.activity.title')}
            </Typography>
            <ActivityTimeline activities={activities} loading={loading} />
          </CardContent>
        </Card>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </DialogActions>

      {/* דיאלוג הוספת תפקיד */}
      <Dialog open={showAddRoleDialog} onClose={() => setShowAddRoleDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('contacts.details.addRole')}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            {availableRoles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('contacts.details.allRolesAssigned')}
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {availableRoles.map(role => (
                  <Button
                    key={role}
                    variant={selectedRole === role ? 'contained' : 'outlined'}
                    onClick={() => setSelectedRole(role)}
                    startIcon={getRoleIcon(role)}
                    fullWidth
                  >
                    {t(`contacts.roles.${role}`)}
                  </Button>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddRoleDialog(false)} disabled={addingRole}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleAddRole} 
            variant="contained" 
            disabled={!selectedRole || addingRole || availableRoles.length === 0}
          >
            {addingRole ? t('common.saving') : t('common.add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
