/**
 * EventIndicator - סימון צבעוני לאירוע
 * מיפוי סוג אירוע לצבע לפי הדרישות
 */

import React from 'react'
import { Box, Tooltip } from '@mui/material'
import { EventType } from '../../services/calendarService'

interface EventIndicatorProps {
  type: EventType
  count?: number
}

// מיפוי סוג אירוע לצבע ותיאור
const eventConfig: Record<EventType, { color: string; label: string }> = {
  loan_due: { color: '#d32f2f', label: 'פירעון הלוואה (יעד)' },   // 🔴 אדום
  repayment: { color: '#795548', label: 'פירעון שבוצע' },         // 🟤 חום
  recurring_deposit: { color: '#2e7d32', label: 'הפקדה מחזורית' }, // 🟢 ירוק
  planned_loan: { color: '#0288d1', label: 'הלוואה מתוכננת' },    // 🔵 כחול
  deposit_due: { color: '#ed6c02', label: 'הפקדה להחזרה' },       // 🟠 כתום
  regular_loan: { color: '#9c27b0', label: 'הלוואה' }             // 🟣 סגול
}

/**
 * פונקציה לקבלת צבע לפי סוג אירוע
 */
export function getEventColor(type: EventType): string {
  return eventConfig[type]?.color || '#757575'
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
