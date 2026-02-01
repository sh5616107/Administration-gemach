import { useTranslation } from 'react-i18next'
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  CircularProgress,
} from '@mui/material'
import {
  AccountBalance as LoanIcon,
  Payment as RepaymentIcon,
  VolunteerActivism as DonationIcon,
  Savings as DepositIcon,
  AccountBalanceWallet as WithdrawalIcon,
  Shield as GuaranteeIcon,
} from '@mui/icons-material'
import { ContactActivity } from '../../types/contacts'

interface ActivityTimelineProps {
  activities: ContactActivity[]
  loading?: boolean
  onActivityClick?: (activity: ContactActivity) => void
}

export default function ActivityTimeline({ activities, loading, onActivityClick }: ActivityTimelineProps) {
  const { t } = useTranslation()

  const getActivityIcon = (type: ContactActivity['type']) => {
    switch (type) {
      case 'loan':
        return <LoanIcon color="primary" />
      case 'repayment':
        return <RepaymentIcon color="success" />
      case 'donation':
        return <DonationIcon color="success" />
      case 'deposit':
        return <DepositIcon color="info" />
      case 'withdrawal':
        return <WithdrawalIcon color="warning" />
      case 'guarantee':
        return <GuaranteeIcon color="warning" />
      default:
        return null
    }
  }

  const getActivityColor = (type: ContactActivity['type']) => {
    switch (type) {
      case 'loan':
        return 'error'
      case 'repayment':
      case 'donation':
        return 'success'
      case 'deposit':
        return 'info'
      case 'withdrawal':
      case 'guarantee':
        return 'warning'
      default:
        return 'default'
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('he-IL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (activities.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', p: 3 }}>
        {t('contacts.activity.noActivity')}
      </Typography>
    )
  }

  return (
    <List>
      {activities.map((activity) => (
        <ListItem
          key={activity.id}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            mb: 1,
            cursor: onActivityClick ? 'pointer' : 'default',
            '&:hover': onActivityClick ? { bgcolor: 'action.hover' } : {},
          }}
          onClick={() => onActivityClick?.(activity)}
        >
          <ListItemIcon>{getActivityIcon(activity.type)}</ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1">
                  {t(`contacts.activity.types.${activity.type}`)}
                </Typography>
                <Chip
                  label={formatCurrency(activity.amount)}
                  size="small"
                  color={getActivityColor(activity.type)}
                />
              </Box>
            }
            secondary={
              <Box>
                <Typography variant="body2" color="text.secondary">
                  {activity.description}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(activity.date)} • {activity.status}
                </Typography>
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  )
}
