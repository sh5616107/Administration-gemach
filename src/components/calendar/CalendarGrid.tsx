/**
 * CalendarGrid - רשת הימים של החודש
 * יוצר רשת 7x6 עם כותרות ימים
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { HDate, gematriya, Locale } from '@hebcal/core'
import DayCell from './DayCell'
import { CalendarEvent } from '../../services/calendarService'

interface CalendarGridProps {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (date: Date) => void
  selectedDate: Date | null
}

// שמות הימים בעברית - מימין לשמאל (א׳ בצד ימין)
const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

/**
 * הסרת ניקוד מטקסט עברי
 */
function removeNikkud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, '')
}

/**
 * קבלת התאריך העברי המקוצר (יום בלבד)
 */
function getHebrewDayShort(date: Date): string {
  try {
    const hdate = new HDate(date)
    return gematriya(hdate.getDate())
  } catch {
    return ''
  }
}

/**
 * יצירת מערך הימים לתצוגה בלוח - בסדר RTL
 * כל שורה מסודרת מימין לשמאל (יום א׳ בצד ימין)
 */
export function generateCalendarDays(year: number, month: number): Date[] {
  const days: Date[] = []
  
  // יום ראשון של החודש
  const firstDay = new Date(year, month, 1)
  // יום אחרון של החודש
  const lastDay = new Date(year, month + 1, 0)
  
  // מספר הימים בחודש
  const daysInMonth = lastDay.getDate()
  
  // באיזה יום בשבוע מתחיל החודש (0 = ראשון)
  const startDayOfWeek = firstDay.getDay()
  
  // הוספת ימים מהחודש הקודם
  const prevMonth = new Date(year, month, 0)
  const daysInPrevMonth = prevMonth.getDate()
  
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month - 1, daysInPrevMonth - i))
  }
  
  // הוספת ימי החודש הנוכחי
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }
  
  // הוספת ימים מהחודש הבא להשלמת 42 ימים (6 שורות)
  const remainingDays = 42 - days.length
  for (let i = 1; i <= remainingDays; i++) {
    days.push(new Date(year, month + 1, i))
  }
  
  return days
}

/**
 * הפיכת מערך לסדר RTL - כל שורה של 7 ימים מתהפכת
 */
function reverseRowsForRTL(days: Date[]): Date[] {
  const result: Date[] = []
  for (let i = 0; i < days.length; i += 7) {
    const row = days.slice(i, i + 7)
    result.push(...row.reverse())
  }
  return result
}

/**
 * המרת תאריך למחרוזת YYYY-MM-DD בזמן מקומי (לא UTC)
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentDate,
  events,
  onDayClick,
  selectedDate
}) => {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // יצירת הימים - בלי היפוך, ה-CSS יטפל ב-RTL
  const days = generateCalendarDays(year, month)
  
  // פונקציה לקבלת אירועים ליום מסוים
  const getEventsForDay = (date: Date): CalendarEvent[] => {
    const dateStr = formatLocalDate(date)
    const dayEvents = events.filter(e => e.date === dateStr)
    return dayEvents
  }
  
  // בדיקה אם תאריך הוא היום
  const isToday = (date: Date): boolean => {
    return date.getTime() === today.getTime()
  }
  
  // בדיקה אם תאריך נבחר
  const isSelected = (date: Date): boolean => {
    if (!selectedDate) return false
    return date.toDateString() === selectedDate.toDateString()
  }
  
  // בדיקה אם תאריך בחודש הנוכחי
  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === month
  }

  // שמות הימים - סדר רגיל, ה-CSS יהפוך
  const displayDayNames = dayNames

  return (
    <Box>
      {/* כותרות ימים - RTL עם flexbox */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'row-reverse',
        mb: 1 
      }}>
        {displayDayNames.map((name, index) => (
          <Box key={index} sx={{ flex: 1 }}>
            <Typography
              variant="caption"
              fontWeight="bold"
              color="text.secondary"
              sx={{ 
                display: 'block', 
                textAlign: 'center',
                py: 0.5
              }}
            >
              {name}
            </Typography>
          </Box>
        ))}
      </Box>
      
      {/* רשת הימים - כל שורה ב-RTL */}
      {Array.from({ length: 6 }, (_, weekIndex) => (
        <Box 
          key={weekIndex} 
          sx={{ 
            display: 'flex', 
            flexDirection: 'row-reverse',
            gap: 0.5,
            mb: 0.5
          }}
        >
          {days.slice(weekIndex * 7, (weekIndex + 1) * 7).map((date, dayIndex) => (
            <Box key={dayIndex} sx={{ flex: 1 }}>
              <DayCell
                date={date}
                isCurrentMonth={isCurrentMonth(date)}
                isToday={isToday(date)}
                isSelected={isSelected(date)}
                hebrewDate={getHebrewDayShort(date)}
                events={getEventsForDay(date)}
                onClick={() => onDayClick(date)}
              />
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default CalendarGrid
