/**
 * CalendarComponent - רכיב הלוח הראשי
 * מחבר את כל תת-הרכיבים ומנהל את ה-state
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Box, Paper, Alert, CircularProgress, IconButton, Tooltip, Chip } from '@mui/material'
import { FilterList as FilterIcon } from '@mui/icons-material'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import DateSearch from './DateSearch'
import EventDetailsDialog from './EventDetailsDialog'
import CalendarLegend from './CalendarLegend'
import AdvancedSearch, { SearchFilters } from './AdvancedSearch'
import SearchResults from './SearchResults'
import { 
  CalendarEvent, 
  getEventsForMonth, 
  getEventsForDay,
  searchEvents,
  countActiveFilters
} from '../../services/calendarService'

const CalendarComponent: React.FC = () => {
  // State
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDayEvents, setSelectedDayEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  
  // State לחיפוש מתקדם
  const [searchResults, setSearchResults] = useState<CalendarEvent[]>([])
  const [showResults, setShowResults] = useState(false)
  const [activeFiltersCount, setActiveFiltersCount] = useState(0)
  const [filterExpanded, setFilterExpanded] = useState(false)

  // טעינת אירועים לחודש
  const loadEvents = useCallback(async (date: Date) => {
    setLoading(true)
    setError(null)
    
    try {
      const monthEvents = await getEventsForMonth(
        date.getFullYear(),
        date.getMonth()
      )
      setEvents(monthEvents)
    } catch (err) {
      console.error('Error loading events:', err)
      setError('שגיאה בטעינת אירועים. נסה לרענן את הדף.')
    } finally {
      setLoading(false)
    }
  }, [])

  // טעינת אירועים בשינוי חודש
  useEffect(() => {
    loadEvents(currentDate)
  }, [currentDate, loadEvents])

  // ניווט לחודש קודם
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  // ניווט לחודש הבא
  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  // ניווט להיום
  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // לחיצה על יום
  const handleDayClick = async (date: Date) => {
    setSelectedDate(date)
    
    // טעינת אירועים ליום הנבחר
    const dayEvents = await getEventsForDay(date)
    setSelectedDayEvents(dayEvents)
    setDialogOpen(true)
  }

  // חיפוש תאריך
  const handleSearch = (date: Date) => {
    // ניווט לחודש של התאריך
    setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
    // בחירת היום
    setSelectedDate(date)
  }

  // שגיאת חיפוש
  const handleSearchError = (message: string) => {
    // אפשר להציג הודעה למשתמש
    console.warn('Search error:', message)
  }

  // חיפוש מתקדם
  const handleAdvancedSearch = async (filters: SearchFilters) => {
    setLoading(true)
    try {
      const results = await searchEvents(filters)
      setSearchResults(results)
      setShowResults(true)
      setActiveFiltersCount(countActiveFilters(filters))
    } catch (err) {
      console.error('Search error:', err)
      setError('שגיאה בחיפוש')
    } finally {
      setLoading(false)
    }
  }

  // ניקוי חיפוש מתקדם
  const handleClearSearch = () => {
    setSearchResults([])
    setShowResults(false)
    setActiveFiltersCount(0)
    setFilterExpanded(false)
  }

  // לחיצה על תוצאת חיפוש - ניווט לתאריך
  const handleSearchResultClick = (date: Date) => {
    setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1))
    setSelectedDate(date)
    handleDayClick(date)
  }

  // סגירת דיאלוג
  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  return (
    <Paper sx={{ p: 2, direction: 'rtl' }}>
      {/* שורת חיפוש - שדה תאריך + אייקון מסנן */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <DateSearch onSearch={handleSearch} onError={handleSearchError} />
        </Box>
        <Tooltip title="חיפוש מתקדם">
          <IconButton
            onClick={() => setFilterExpanded(!filterExpanded)}
            color={filterExpanded || activeFiltersCount > 0 ? 'primary' : 'default'}
            sx={{
              border: activeFiltersCount > 0 ? '2px solid' : 'none',
              borderColor: 'primary.main'
            }}
          >
            <FilterIcon />
          </IconButton>
        </Tooltip>
        {activeFiltersCount > 0 && (
          <Chip
            label={`${activeFiltersCount} פילטרים`}
            size="small"
            color="primary"
            onDelete={handleClearSearch}
          />
        )}
      </Box>

      {/* אקורדיון חיפוש מתקדם - נפתח מתחת לשדה החיפוש */}
      <AdvancedSearch
        expanded={filterExpanded}
        onSearch={handleAdvancedSearch}
        onClear={handleClearSearch}
      />

      {/* תוצאות חיפוש מתקדם */}
      <SearchResults
        results={searchResults}
        visible={showResults}
        onClose={handleClearSearch}
        onEventClick={handleSearchResultClick}
      />

      {/* כותרת וניווט */}
      <CalendarHeader
        currentDate={currentDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
      />

      {/* הודעת שגיאה */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* טעינה */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* רשת הלוח */}
          <CalendarGrid
            currentDate={currentDate}
            events={events}
            onDayClick={handleDayClick}
            selectedDate={selectedDate}
          />

          {/* מקרא צבעים */}
          <CalendarLegend />
        </>
      )}

      {/* דיאלוג פרטי אירועים */}
      <EventDetailsDialog
        open={dialogOpen}
        date={selectedDate}
        events={selectedDayEvents}
        onClose={handleCloseDialog}
      />
    </Paper>
  )
}

export default CalendarComponent
