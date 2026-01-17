/**
 * AdvancedSearch - חיפוש מתקדם בלוח השנה
 * פילטרים לפי תאריך, סכום, סוג אירוע וסטטוס
 * רק האקורדיון - הכפתור נמצא ב-CalendarComponent
 */

import React, { useState } from 'react'
import {
  Box,
  Paper,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Typography,
  Collapse,
  Divider,
  InputAdornment
} from '@mui/material'
import {
  Search as SearchIcon,
  Clear as ClearIcon
} from '@mui/icons-material'
import { EventType } from '../../services/calendarService'
import { getEventColor, getEventLabel } from './EventIndicator'

// ממשק פילטרים
export interface SearchFilters {
  dateFrom: string
  dateTo: string
  amountMin: string
  amountMax: string
  eventTypes: EventType[]
  personName: string
}

// ערכי ברירת מחדל
export const defaultFilters: SearchFilters = {
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  eventTypes: [],
  personName: ''
}

// כל סוגי האירועים
const allEventTypes: EventType[] = [
  'loan_due',
  'repayment',
  'recurring_deposit',
  'planned_loan',
  'deposit_due',
  'regular_loan'
]

interface AdvancedSearchProps {
  expanded: boolean
  onSearch: (filters: SearchFilters) => void
  onClear: () => void
}

const AdvancedSearch: React.FC<AdvancedSearchProps> = ({
  expanded,
  onSearch,
  onClear
}) => {
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters)

  // עדכון פילטר
  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  // טוגל סוג אירוע
  const toggleEventType = (type: EventType) => {
    setFilters(prev => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(type)
        ? prev.eventTypes.filter(t => t !== type)
        : [...prev.eventTypes, type]
    }))
  }

  // בחירת כל סוגי האירועים
  const selectAllTypes = () => {
    setFilters(prev => ({ ...prev, eventTypes: [...allEventTypes] }))
  }

  // ניקוי בחירת סוגים
  const clearTypes = () => {
    setFilters(prev => ({ ...prev, eventTypes: [] }))
  }

  // חיפוש
  const handleSearch = () => {
    onSearch(filters)
  }

  // ניקוי הכל
  const handleClear = () => {
    setFilters(defaultFilters)
    onClear()
  }

  // בדיקה אם יש פילטרים פעילים
  const hasActiveFilters = 
    filters.dateFrom || 
    filters.dateTo || 
    filters.amountMin || 
    filters.amountMax || 
    filters.eventTypes.length > 0 ||
    filters.personName

  return (
    <Collapse in={expanded}>
      <Paper
        elevation={0}
        sx={{
          mt: 1,
          p: 2,
          bgcolor: 'grey.50',
          borderRadius: 2
        }}
      >
        {/* טווח תאריכים */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          טווח תאריכים
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="עד תאריך"
            type="date"
            size="small"
            value={filters.dateTo}
            onChange={e => updateFilter('dateTo', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="מתאריך"
            type="date"
            size="small"
            value={filters.dateFrom}
            onChange={e => updateFilter('dateFrom', e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* טווח סכומים */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          טווח סכומים
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            label="עד סכום"
            size="small"
            value={filters.amountMax ? Number(filters.amountMax).toLocaleString('he-IL') : ''}
            onChange={e => {
              const value = e.target.value.replace(/,/g, '')
              if (value === '' || /^\d+$/.test(value)) {
                updateFilter('amountMax', value)
              }
            }}
            InputLabelProps={{ shrink: true }}
            InputProps={{
              startAdornment: <InputAdornment position="start">₪</InputAdornment>
            }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="מסכום"
            size="small"
            value={filters.amountMin ? Number(filters.amountMin).toLocaleString('he-IL') : ''}
            onChange={e => {
              const value = e.target.value.replace(/,/g, '')
              if (value === '' || /^\d+$/.test(value)) {
                updateFilter('amountMin', value)
              }
            }}
            InputLabelProps={{ shrink: true }}
            InputProps={{
              startAdornment: <InputAdornment position="start">₪</InputAdornment>
            }}
            sx={{ flex: 1 }}
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* סוגי אירועים */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            סוג אירוע
          </Typography>
          <Box>
            <Button size="small" onClick={selectAllTypes}>בחר הכל</Button>
            <Button size="small" onClick={clearTypes}>נקה</Button>
          </Box>
        </Box>
        <FormGroup row sx={{ gap: 1, flexWrap: 'wrap' }}>
          {allEventTypes.map(type => (
            <FormControlLabel
              key={type}
              control={
                <Checkbox
                  checked={filters.eventTypes.includes(type)}
                  onChange={() => toggleEventType(type)}
                  size="small"
                  sx={{
                    color: getEventColor(type),
                    '&.Mui-checked': { color: getEventColor(type) }
                  }}
                />
              }
              label={
                <Typography variant="body2">
                  {getEventLabel(type)}
                </Typography>
              }
              sx={{
                mr: 0,
                ml: 1,
                '& .MuiFormControlLabel-label': { fontSize: '0.875rem' }
              }}
            />
          ))}
        </FormGroup>

        <Divider sx={{ my: 2 }} />

        {/* חיפוש לפי שם */}
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          חיפוש לפי שם
        </Typography>
        <TextField
          placeholder="שם לווה / מפקיד / תורם"
          size="small"
          fullWidth
          value={filters.personName}
          onChange={e => updateFilter('personName', e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            )
          }}
          sx={{ mb: 2 }}
        />

        {/* כפתורי פעולה */}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            disabled={!hasActiveFilters}
          >
            נקה הכל
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
          >
            חפש
          </Button>
        </Box>
      </Paper>
    </Collapse>
  )
}

export default AdvancedSearch
