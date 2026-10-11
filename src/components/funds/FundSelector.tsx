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
}

export default function FundSelector({ 
  value, 
  onChange, 
  label = 'קופה',
  disabled = false,
  required = false,
}: FundSelectorProps) {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFunds()
  }, [])

  const loadFunds = async () => {
    try {
      const activeFunds = await fundsService.getActive()
      setFunds(activeFunds)
    } catch (error) {
      console.error('Error loading funds:', error)
    } finally {
      setLoading(false)
    }
  }

  // מוסתר אם יש רק קופה אחת
  if (funds.length <= 1 || loading) {
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
        disabled={disabled}
        required={required}
      >
        {funds.map((fund) => (
          <MenuItem key={fund.id} value={fund.id}>
            {fund.name}
            {fund.is_default && ' (ברירת מחדל)'}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
