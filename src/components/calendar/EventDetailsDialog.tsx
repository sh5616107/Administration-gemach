/**
 * EventDetailsDialog - דיאלוג פרטי אירועים
 * מציג את כל האירועים ליום נבחר
 */

import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material'
import { Close as CloseIcon } from '@mui/icons-material'
import { CalendarEvent } from '../../services/calendarService'
import { getEventColor, getEventLabel } from './EventIndicator'
import { toHebrewDate } from '../../utils/dateUtils'

interface EventDetailsDialogProps {
  open: boolean
  date: Date | null
  events: CalendarEvent[]
  onClose: () => void
}

/**
 * פורמט סכום לתצוגה
 */
function formatAmount(amount: number): string {
  return amount.toLocaleString('he-IL') + ' ₪'
}

const EventDetailsDialog: React.FC<EventDetailsDialogProps> = ({
  open,
  date,
  events,
  onClose
}) => {
  if (!date) return null

  const dateStr = date.toLocaleDateString('he-IL')
  // המרה לפורמט מקומי במקום UTC
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const localDateStr = `${year}-${month}-${day}`
  const hebrewDate = toHebrewDate(localDateStr)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { direction: 'rtl' }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6">
            אירועים ליום {dateStr}
          </Typography>
          {hebrewDate && (
            <Typography variant="caption" color="text.secondary">
              {hebrewDate}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {events.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              אין אירועים ביום זה
            </Typography>
          </Box>
        ) : (
          <List>
            {events.map((event, index) => (
              <React.Fragment key={event.id}>
                {index > 0 && <Divider />}
                <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: getEventColor(event.type),
                        mt: 1
                      }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" fontWeight="medium">
                        {getEventLabel(event.type)}
                      </Typography>
                    }
                    secondary={
                      <Box component="span">
                        <Typography variant="body2" component="span" display="block">
                          {event.relatedName}
                        </Typography>
                        <Typography variant="body2" component="span" display="block" color="text.secondary">
                          סכום: ₪{event.amount.toLocaleString('he-IL')}
                          {event.metadata?.remaining !== undefined && (
                            <> | יתרה: ₪{event.metadata.remaining.toLocaleString('he-IL')}</>
                          )}
                        </Typography>
                        {event.description && (
                          <Typography variant="caption" component="span" display="block" color="text.secondary">
                            {event.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default EventDetailsDialog
