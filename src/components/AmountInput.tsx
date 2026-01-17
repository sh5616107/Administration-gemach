import { TextField, TextFieldProps } from '@mui/material'
import { useState, useEffect } from 'react'

interface AmountInputProps extends Omit<TextFieldProps, 'value' | 'onChange'> {
  value: number | string
  onChange: (value: number) => void
}

/**
 * שדה קלט לסכומים עם פורמט אוטומטי של פסיקים לאלפים
 * מציג: 1,234,567
 * שומר: 1234567
 */
export default function AmountInput({ value, onChange, ...props }: AmountInputProps) {
  const [displayValue, setDisplayValue] = useState('')

  // פורמט מספר עם פסיקים
  const formatNumber = (num: number | string): string => {
    const n = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num
    if (isNaN(n) || n === 0) return ''
    return n.toLocaleString('he-IL')
  }

  // עדכון התצוגה כשהערך משתנה מבחוץ
  useEffect(() => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!isNaN(numValue) && numValue > 0) {
      setDisplayValue(formatNumber(numValue))
    } else {
      setDisplayValue('')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    
    // מסיר את כל התווים שאינם ספרות או נקודה עשרונית
    const cleanValue = input.replace(/[^\d.]/g, '')
    
    // מונע יותר מנקודה עשרונית אחת
    const parts = cleanValue.split('.')
    const sanitized = parts.length > 2 
      ? parts[0] + '.' + parts.slice(1).join('')
      : cleanValue

    const numValue = parseFloat(sanitized) || 0
    
    // מעדכן את התצוגה עם פסיקים
    if (sanitized === '' || sanitized === '.') {
      setDisplayValue('')
      onChange(0)
    } else {
      // שומר על הנקודה העשרונית בזמן הקלדה
      if (sanitized.endsWith('.') || (sanitized.includes('.') && sanitized.endsWith('0'))) {
        const intPart = Math.floor(numValue)
        const decPart = sanitized.split('.')[1] || ''
        setDisplayValue(intPart.toLocaleString('he-IL') + '.' + decPart)
      } else {
        setDisplayValue(formatNumber(numValue))
      }
      onChange(numValue)
    }
  }

  return (
    <TextField
      {...props}
      value={displayValue}
      onChange={handleChange}
      inputProps={{
        ...props.inputProps,
        inputMode: 'decimal',
        style: { textAlign: 'right', ...props.inputProps?.style }
      }}
    />
  )
}
