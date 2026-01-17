/**
 * DateSearch - רכיב חיפוש תאריך
 * תמיכה בפורמטים DD/MM/YYYY, DD.MM.YYYY ותאריך עברי
 */

import React, { useState } from 'react'
import { Box, TextField, IconButton, Tooltip, Typography } from '@mui/material'
import { Search as SearchIcon, Clear as ClearIcon } from '@mui/icons-material'
import { parseSearchDate } from '../../utils/dateUtils'

interface DateSearchProps {
  onSearch: (date: Date) => void
  onError: (message: string) => void
}

const DateSearch: React.FC<DateSearchProps> = ({ onSearch, onError }) => {
  const [searchValue, setSearchValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSearch = () => {
    if (!searchValue.trim()) {
      setError(null)
      return
    }

    const date = parseSearchDate(searchValue)
    
    if (date) {
      setError(null)
      onSearch(date)
    } else {
      const errorMsg = 'תאריך לא תקין'
      setError(errorMsg)
      onError(errorMsg)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleClear = () => {
    setSearchValue('')
    setError(null)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="חפש תאריך (15/01/2026 או ט״ו שבט)"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyPress={handleKeyPress}
          error={!!error}
          sx={{ 
            flex: 1,
            '& .MuiInputBase-input': {
              textAlign: 'right',
              fontSize: '0.875rem'
            },
            '& .MuiOutlinedInput-root': {
              borderRadius: 2
            }
          }}
          InputProps={{
            endAdornment: searchValue && (
              <IconButton size="small" onClick={handleClear} sx={{ p: 0.5 }}>
                <ClearIcon fontSize="small" />
              </IconButton>
            )
          }}
        />
        
        <Tooltip title="חפש תאריך">
          <IconButton onClick={handleSearch} color="primary" size="small">
            <SearchIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {error}
        </Typography>
      )}
    </Box>
  )
}

export default DateSearch
