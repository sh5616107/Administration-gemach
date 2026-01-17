/**
 * DayCell - תא יום בודד בלוח השנה
 * מציג תאריך לועזי ועברי עם סימוני אירועים, חגים ופרשות
 */

import React from 'react'
import { Box, Typography, Tooltip } from '@mui/material'
import { HDate, HebrewCalendar, Locale, flags } from '@hebcal/core'
import { CalendarEvent } from '../../services/calendarService'
import EventIndicator from './EventIndicator'

interface DayCellProps {
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  hebrewDate: string
  events: CalendarEvent[]
  onClick: () => void
}

/**
 * הסרת ניקוד מטקסט עברי
 */
function removeNikkud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, '')
}

/**
 * קבלת חגים ופרשות ליום מסוים
 * מסנן חגים מודרניים ומציג רק חגים יהודיים מסורתיים
 */
function getHolidaysForDate(date: Date): { holidays: string[], parsha: string | null, isShabbat: boolean } {
  try {
    const hdate = new HDate(date)
    const isShabbat = date.getDay() === 6
    
    // קבלת אירועים - כולל פרשות
    const events = HebrewCalendar.getHolidaysOnDate(hdate, false) || []
    
    const holidays: string[] = []
    let parsha: string | null = null
    
    // רשימת מילים לסינון - חגים מודרניים/ציוניים
    const excludeKeywords = [
      'עצמאות', 'הזיכרון', 'ירושלים', 'הרצל', 'ז\'בוטינסקי', 
      'רבין', 'השואה', 'העלייה', 'המשפחה', 'בן גוריון'
    ]
    
    for (const ev of events) {
      const desc = removeNikkud(ev.render('he'))
      const evFlags = ev.getFlags()
      
      // בדיקה אם זה חג מודרני - דילוג
      if (evFlags & flags.MODERN_HOLIDAY) {
        continue
      }
      
      // בדיקה אם מכיל מילות מפתח לסינון
      const shouldExclude = excludeKeywords.some(keyword => desc.includes(keyword))
      if (shouldExclude) {
        continue
      }
      
      // פרשת השבוע
      if (evFlags & flags.PARSHA_HASHAVUA) {
        parsha = desc.replace('פרשת ', '')
      }
      // חגים מסורתיים בלבד
      else if (evFlags & (flags.MAJOR_FAST | flags.MINOR_FAST | flags.SPECIAL_SHABBAT | 
                         flags.ROSH_CHODESH | flags.YOM_TOV_ENDS | flags.CHANUKAH_CANDLES | 
                         flags.LIGHT_CANDLES | flags.MINOR_HOLIDAY)) {
        holidays.push(desc)
      }
      // חגים ראשיים מסורתיים
      else if (desc.includes('סוכות') || desc.includes('פסח') || desc.includes('שבועות') ||
               desc.includes('ראש השנה') || desc.includes('יום כיפור') || desc.includes('חנוכה') ||
               desc.includes('פורים') || desc.includes('ט"ו בשבט') || desc.includes('ל"ג בעומר') ||
               desc.includes('ראש חודש') || desc.includes('צום') || desc.includes('תענית') ||
               desc.includes('שמיני עצרת') || desc.includes('שמחת תורה') || desc.includes('הושענא')) {
        holidays.push(desc)
      }
    }
    
    // אם זה שבת ואין פרשה - ננסה לקבל אותה ישירות
    if (isShabbat && !parsha) {
      try {
        const sedra = HebrewCalendar.getSedra(hdate.getFullYear(), false)
        const parshaArr = sedra.lookup(hdate)
        if (parshaArr && parshaArr.parsha && parshaArr.parsha.length > 0) {
          parsha = removeNikkud(parshaArr.parsha.map(p => Locale.gettext(p, 'he')).join('-'))
        }
      } catch {
        // אם נכשל, נמשיך בלי פרשה
      }
    }
    
    return { holidays, parsha, isShabbat }
  } catch {
    return { holidays: [], parsha: null, isShabbat: date.getDay() === 6 }
  }
}

const DayCell: React.FC<DayCellProps> = ({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  hebrewDate,
  events,
  onClick
}) => {
  // קיבוץ אירועים לפי סוג
  const eventsByType = events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const eventTypes = Object.keys(eventsByType)
  const totalEvents = events.length

  // חגים ופרשות
  const { holidays, parsha, isShabbat } = getHolidaysForDate(date)
  const hasHoliday = holidays.length > 0
  
  // בניית טקסט מלא לטולטיפ
  const tooltipParts: string[] = []
  if (hasHoliday) tooltipParts.push(holidays.join(', '))
  if (parsha) tooltipParts.push(`פרשת ${parsha}`)
  const tooltipText = tooltipParts.join(' | ')

  return (
    <Tooltip 
      title={tooltipText} 
      arrow 
      placement="top"
      disableHoverListener={!hasHoliday && !parsha}
    >
      <Box
        onClick={onClick}
        sx={{
          p: 0.5,
          minHeight: 70,
          cursor: 'pointer',
          borderRadius: 1,
          border: isSelected ? '2px solid' : '1px solid',
          borderColor: isSelected ? 'primary.main' : hasHoliday ? 'warning.main' : 'divider',
          bgcolor: isToday 
            ? 'primary.light' 
            : isSelected 
              ? 'action.selected' 
              : hasHoliday 
                ? 'warning.lighter'
                : isShabbat 
                  ? 'grey.100' 
                  : 'background.paper',
          opacity: isCurrentMonth ? 1 : 0.4,
          transition: 'all 0.2s ease',
          '&:hover': {
            bgcolor: isToday ? 'primary.light' : 'action.hover',
            transform: 'scale(1.02)',
            boxShadow: 1
          }
        }}
      >
        {/* תאריך לועזי */}
        <Typography
          variant="body2"
          fontWeight={isToday || hasHoliday ? 'bold' : 'normal'}
          color={isToday ? 'primary.contrastText' : hasHoliday ? 'warning.dark' : 'text.primary'}
          sx={{ lineHeight: 1.2 }}
        >
          {date.getDate()}
        </Typography>

        {/* תאריך עברי */}
        <Typography
          variant="caption"
          color={isToday ? 'primary.contrastText' : 'text.secondary'}
          sx={{ 
            fontSize: '0.65rem',
            lineHeight: 1,
            display: 'block'
          }}
        >
          {hebrewDate}
        </Typography>

        {/* שם חג ו/או פרשה */}
        {(hasHoliday || parsha) && (
          <Box sx={{ mt: 0.3 }}>
            {/* חג */}
            {hasHoliday && (
              <Typography
                variant="caption"
                color="warning.dark"
                sx={{ 
                  fontSize: '0.55rem',
                  lineHeight: 1.1,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                  fontWeight: 'bold'
                }}
              >
                {holidays[0]}
              </Typography>
            )}
            {/* פרשה */}
            {parsha && (
              <Typography
                variant="caption"
                color="info.main"
                sx={{ 
                  fontSize: '0.5rem',
                  lineHeight: 1.1,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%'
                }}
              >
                {parsha}
              </Typography>
            )}
          </Box>
        )}

        {/* סימוני אירועים */}
        {totalEvents > 0 && (
          <Box sx={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: 0.3, 
            mt: 0.5,
            justifyContent: 'center'
          }}>
            {eventTypes.slice(0, 3).map((type) => (
              <EventIndicator 
                key={type} 
                type={type as any} 
                count={eventsByType[type] > 1 ? eventsByType[type] : undefined}
              />
            ))}
            {eventTypes.length > 3 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                +{eventTypes.length - 3}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Tooltip>
  )
}

export default DayCell
