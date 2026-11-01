/**
 * EventIndicator - סימון צבעוני לאירוע
 * מיפוי סוג אירוע לצבע לפי הדרישות
 */

import { calendarTokens } from '../../theme';
import React from 'react'
import { Box, Tooltip } from '@mui/material'
import { EventType } from '../../services/calendarService'

interface EventIndicatorProps {
  type: EventType
  count?: number
}

// מיפוי סוג אירוע לצבע ותיאור
const eventConfig: Record<EventType, { color: string; label: string }> = {
  loan_due: { color: calendarTokens.loanDue, label: 'פירעון הלוואה (יעד)' },
  repayment: { color: calendarTokens.repayment, label: 'פירעון שבוצע' },
  recurring_deposit: { color: calendarTokens.recurringDeposit, label: 'הפקדה מחזורית' },
  planned_loan: { color: calendarTokens.plannedLoan, label: 'הלוואה מתוכננת' },
  deposit_due: { color: calendarTokens.depositDue, label: 'הפקדה להחזרה' },
  regular_loan: { color: calendarTokens.regularLoan, label: 'הלוואה' }
}

/**
 * פונקציה לקבלת צבע לפי סוג אירוע
 */
export function getEventColor(type: EventType): string {
  return eventConfig[type]?.color || calendarTokens.regularLoan
}

/**
 * פונקציה לקבלת תיאור לפי סוג אירוע
 */
export function getEventLabel(type: EventType): string {
  return eventConfig[type]?.label || 'אירוע'
}

const EventIndicator: React.FC<EventIndicatorProps> = ({ type, count }) => {
  const config = eventConfig[type]
  
  if (!config) return null

  return (
    <Tooltip title={`${config.label}${count && count > 1 ? ` (${count})` : ''}`} arrow>
      <Box
        sx={{
          width: count && count > 1 ? 'auto' : 8,
          height: 8,
          minWidth: 8,
          px: count && count > 1 ? 0.5 : 0,
          borderRadius: '50%',
          bgcolor: config.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.5rem',
          color: 'white',
          fontWeight: 'bold'
        }}
      >
        {count && count > 1 ? count : ''}
      </Box>
    </Tooltip>
  )
}

export default EventIndicator
