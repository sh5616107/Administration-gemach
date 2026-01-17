import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Tabs, Tab, Paper } from '@mui/material'
import BorrowersTab from '../components/loans/BorrowersTab'
import GuarantorsTab from '../components/loans/GuarantorsTab'
import LoansTab from '../components/loans/LoansTab'
import WaitlistTab from '../components/loans/WaitlistTab'
import { useSettings } from '../hooks/useSettings'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index} style={{ padding: '24px 0' }}>
      {value === index && children}
    </div>
  )
}

export default function LoansManagement() {
  const { settings } = useSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tabValue, setTabValue] = useState(0)
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<number | null>(null)
  const [selectedWaitlistId, setSelectedWaitlistId] = useState<number | null>(null)
  
  const showWaitlistTab = settings.show_waitlist_tab !== 'no'

  useEffect(() => {
    // Read tab, borrower, and waitlist from URL params
    const tab = searchParams.get('tab')
    const borrowerId = searchParams.get('borrower')
    const waitlistId = searchParams.get('waitlist')
    
    if (tab !== null) {
      setTabValue(parseInt(tab))
    }
    
    if (borrowerId) {
      setSelectedBorrowerId(parseInt(borrowerId))
      // Switch to loans tab (index 2) when borrower is specified
      setTabValue(2)
    }
    
    if (waitlistId) {
      setSelectedWaitlistId(parseInt(waitlistId))
      // Switch to loans tab (index 2) when waitlist is specified
      setTabValue(2)
    }
    
    // Clear URL params after reading
    if (tab || borrowerId || waitlistId) {
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    // לא מאפסים את הלווה הנבחר כשעוברים טאב - רק כשעוברים לטאב לווים
    if (newValue === 0) {
      setSelectedBorrowerId(null)
    }
  }

  // פונקציה שתיקרא מטאב לווים כשבוחרים לווה
  const handleBorrowerSelect = (borrowerId: number) => {
    setSelectedBorrowerId(borrowerId)
  }

  return (
    <Box>
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
        >
          <Tab label="👤 ניהול לווים" />
          <Tab label="🤝 ניהול ערבים" />
          <Tab label="💰 ניהול הלוואות" />
          {showWaitlistTab && <Tab label="📋 תור בקשות" />}
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <BorrowersTab onBorrowerSelect={handleBorrowerSelect} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <GuarantorsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <LoansTab initialBorrowerId={selectedBorrowerId} initialWaitlistId={selectedWaitlistId} />
      </TabPanel>
      {showWaitlistTab && (
        <TabPanel value={tabValue} index={3}>
          <WaitlistTab />
        </TabPanel>
      )}
    </Box>
  )
}
