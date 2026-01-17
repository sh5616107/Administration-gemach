/**
 * CalendarLegend - מקרא צבעים לאירועים
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { EventType } from '../../services/calendarService'
import { getEventColor, getEventLabel } from './EventIndicator'

const eventTypes: EventType[] = [
  'loan_due',
  'repayment',
  'recurring_deposit',
  'planned_loan',
  'deposit_due',
  'regular_loan'
]

const CalendarLegend: React.FC = () => {
  return (
    <Box
      sx={{
        mt: 2,
        pt: 2,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        justifyContent: 'center'
      }}
    >
      {eventTypes.map((type) => (
        <Box
          key={type}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5
          }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: getEventColor(type)
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {getEventLabel(type)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

export default CalendarLegend
