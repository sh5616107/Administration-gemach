/**
 * CalendarHeader - כותרת הלוח עם ניווט
 * כפתורי ניווט והצגת שם החודש
 */

import React from 'react'
import { Box, IconButton, Typography, Tooltip } from '@mui/material'
import {
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  Today as TodayIcon
} from '@mui/icons-material'
import { HDate, gematriya, Locale } from '@hebcal/core'

interface CalendarHeaderProps {
  currentDate: Date
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
}

// שמות החודשים בעברית
const hebrewMonthNames = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

/**
 * הסרת ניקוד מטקסט עברי
 */
function removeNikkud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, '')
}

/**
 * קבלת שם החודש העברי - מציג שני חודשים אם החודש הלועזי חוצה שני חודשים עבריים
 */
function getHebrewMonthsForGregorianMonth(date: Date): string {
  try {
    // יום ראשון בחודש
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
    const firstHDate = new HDate(firstDay)
    const firstMonthName = removeNikkud(Locale.gettext(firstHDate.getMonthName(), 'he') || firstHDate.getMonthName())
    
    // יום אחרון בחודש
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    const lastHDate = new HDate(lastDay)
    const lastMonthName = removeNikkud(Locale.gettext(lastHDate.getMonthName(), 'he') || lastHDate.getMonthName())
    
    const year = gematriya(firstHDate.getFullYear())
    
    // אם שני החודשים שונים, מציגים שניהם
    if (firstMonthName !== lastMonthName) {
      return `${firstMonthName} - ${lastMonthName} ${year}`
    }
    
    return `${firstMonthName} ${year}`
  } catch {
    return ''
  }
}

const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentDate,
  onPrevMonth,
  onNextMonth,
  onToday
}) => {
  const gregorianMonth = hebrewMonthNames[currentDate.getMonth()]
  const gregorianYear = currentDate.getFullYear()
  const hebrewMonthYear = getHebrewMonthsForGregorianMonth(currentDate)

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 2,
        px: 1
      }}
    >
      {/* כפתורי ניווט */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <Tooltip title="חודש הבא">
          <IconButton onClick={onNextMonth} size="small">
            <PrevIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="היום">
          <IconButton onClick={onToday} size="small" color="primary">
            <TodayIcon />
          </IconButton>
        </Tooltip>
        
        <Tooltip title="חודש קודם">
          <IconButton onClick={onPrevMonth} size="small">
            <NextIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* שם החודש */}
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h6" fontWeight="bold">
          {gregorianMonth} {gregorianYear}
        </Typography>
        {hebrewMonthYear && (
          <Typography variant="caption" color="text.secondary">
            {hebrewMonthYear}
          </Typography>
        )}
      </Box>

      {/* מקום ריק לאיזון */}
      <Box sx={{ width: 120 }} />
    </Box>
  )
}

export default CalendarHeader
