/**
 * SearchResults - תצוגת תוצאות חיפוש מתקדם
 * רשימה מסוננת של אירועים עם סיכום
 */

import React from 'react'
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  IconButton,
  Tooltip,
  Collapse
} from '@mui/material'
import {
  Close as CloseIcon,
  CalendarMonth as CalendarIcon
} from '@mui/icons-material'
import { CalendarEvent } from '../../services/calendarService'
import { getEventColor, getEventLabel } from './EventIndicator'
import { toHebrewDate } from '../../utils/dateUtils'

interface SearchResultsProps {
  results: CalendarEvent[]
  visible: boolean
  onClose: () => void
  onEventClick: (date: Date) => void
}

/**
 * פורמט תאריך לתצוגה
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

/**
 * קיבוץ אירועים לפי תאריך
 */
function groupByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>()
  
  // מיון לפי תאריך
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))
  
  for (const event of sorted) {
    const existing = grouped.get(event.date) || []
    grouped.set(event.date, [...existing, event])
  }
  
  return grouped
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  visible,
  onClose,
  onEventClick
}) => {
  // חישוב סיכום
  const totalAmount = results.reduce((sum, e) => sum + e.amount, 0)
  const groupedResults = groupByDate(results)

  return (
    <Collapse in={visible}>
      <Paper
        elevation={2}
        sx={{
          mt: 2,
          mb: 2,
          borderRadius: 2,
          overflow: 'hidden'
        }}
      >
        {/* כותרת */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 1.5,
            bgcolor: 'primary.main',
            color: 'white'
          }}
        >
          <Typography variant="subtitle1" fontWeight="medium">
            תוצאות חיפוש
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* סיכום */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            p: 1.5,
            bgcolor: 'grey.50',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Chip
            label={`${results.length} אירועים`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`סה"כ: ₪${totalAmount.toLocaleString('he-IL')}`}
            size="small"
            color="success"
            variant="outlined"
          />
        </Box>

        {/* תוצאות */}
        {results.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              לא נמצאו אירועים התואמים לחיפוש
            </Typography>
          </Box>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto', py: 0 }}>
            {Array.from(groupedResults.entries()).map(([date, events], groupIndex) => (
              <React.Fragment key={date}>
                {/* כותרת תאריך */}
                <ListItem
                  sx={{
                    bgcolor: 'grey.100',
                    py: 0.5,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'grey.200' }
                  }}
                  onClick={() => {
                    const [year, month, day] = date.split('-').map(Number)
                    onEventClick(new Date(year, month - 1, day))
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CalendarIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography variant="body2" fontWeight="medium">
                          {formatDate(date)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {toHebrewDate(date)}
                        </Typography>
                      </Box>
                    }
                  />
                  <Chip
                    label={`${events.length}`}
                    size="small"
                    sx={{ height: 20, fontSize: '0.75rem' }}
                  />
                </ListItem>

                {/* אירועים בתאריך */}
                {events.map((event, eventIndex) => (
                  <ListItem
                    key={event.id}
                    sx={{
                      py: 1,
                      pr: 4,
                      borderBottom: eventIndex < events.length - 1 ? '1px solid' : 'none',
                      borderColor: 'divider'
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          bgcolor: getEventColor(event.type)
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2">
                          {getEventLabel(event.type)} - {event.relatedName}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          ₪{event.amount.toLocaleString('he-IL')}
                          {event.metadata?.remaining !== undefined && (
                            <> | יתרה: ₪{event.metadata.remaining.toLocaleString('he-IL')}</>
                          )}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}

                {groupIndex < groupedResults.size - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Collapse>
  )
}

export default SearchResults
