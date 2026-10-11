import { useState, useEffect } from 'react'
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
} from '@mui/material'
import { fundsService, type Fund } from '../../services/database'

interface FundSelectorProps {
  value: string
  onChange: (fundId: string) => void
  label?: string
  disabled?: boolean
  required?: boolean
  includeInactive?: boolean  // להצגת קו (בעריכת רשומה קיימת)
  excludeFundId?: string  // להסתיר קופה מסוימת (בהעברה בין קופות)
}

export default function FundSelector({ 
  value, 
  onChange, 
  label = 'קופה',
  disabled = false,
  required = false,
  includeInactive = false,
  excludeFundId,
}: FundSelectorProps) {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFunds()
  }, [includeInactive])

  const loadFunds = async () => {
    try {
      let allFunds
      if (includeInactive) {
        allFunds = await fundsService.getAll()
      } else {
        allFunds = await fundsService.getActive()
      }
      setFunds(allFunds)
      
      // בחירה אוטומטית של ברירת מחדל אם אין ערך
      if (!value && allFunds.length > 0) {
        const defaultFund = allFunds.find(f => f.is_default)
        if (defaultFund) {
          onChange(defaultFund.id)
        }
      }
    } catch (error) {
      console.error('Error loading funds:', error)
    } finally {
      setLoading(false)
    }
  }

  // מוסתר אם יש רק קופה אחת (אלא אם includeInactive=true)
  if (!loading && funds.length <= 1 && !includeInactive) {
    return null
  }

  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value)
  }

  return (
    <FormControl fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value || ''}
        label={label}
        onChange={handleChange}
        disabled={disabled || loading}
        required={required}
      >
        {funds
          .filter(fund => !excludeFundId || fund.id !== excludeFundId)
          .map((fund) => (
            <MenuItem key={fund.id} value={fund.id}>
              {fund.name}
              {fund.is_default && ' (ברירת מחדל)'}
              {!fund.is_active && ' (מושבת)'}
            </MenuItem>
          ))}
      </Select>
    </FormControl>
  )
}
