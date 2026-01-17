/**
 * Calendar Page - דף לוח השנה
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { CalendarMonth as CalendarIcon } from '@mui/icons-material'
import CalendarComponent from '../components/calendar/CalendarComponent'

const Calendar: React.FC = () => {
  return (
    <Box>
      {/* כותרת הדף */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <CalendarIcon color="primary" />
        <Typography variant="h5" fontWeight="bold">
          לוח שנה
        </Typography>
      </Box>

      {/* רכיב הלוח */}
      <CalendarComponent />
    </Box>
  )
}

export default Calendar
