import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Tabs, Tab, Paper, Grid } from '@mui/material'
import {
  CardGiftcard as GiftIcon,
  Person as PersonIcon,
  AccountBalanceWallet as DepositIcon,
} from '@mui/icons-material'
import DonationsTab from '../components/donations/DonationsTab'
import DepositorsTab from '../components/donations/DepositorsTab'
import DepositsTab from '../components/donations/DepositsTab'

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

interface Depositor {
  id: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
}

export default function DonationsDeposits() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tabValue, setTabValue] = useState(() => {
    // קריאת הטאב הראשוני מה-URL
    const tab = new URLSearchParams(window.location.search).get('tab')
    return tab !== null ? parseInt(tab) : 1 // ברירת מחדל: מפקידים
  })
  const [selectedDepositor, setSelectedDepositor] = useState<Depositor | null>(null)
  const [selectedDepositId, setSelectedDepositId] = useState<number | null>(null)

  useEffect(() => {
    // Read tab and depositId from URL params
    const tab = searchParams.get('tab')
    const depositId = searchParams.get('depositId')
    const action = searchParams.get('action')
    
    if (tab !== null) {
      setTabValue(parseInt(tab))
    }
    
    if (depositId) {
      setSelectedDepositId(parseInt(depositId))
      // Switch to deposits tab (index 2) when depositId is specified
      setTabValue(2)
    }
    
    // Clear URL params after reading
    if (tab || depositId || action) {
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const handleSelectDepositor = (depositor: Depositor) => {
    setSelectedDepositor(depositor)
  }

  return (
    <Box>
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="fullWidth"
        >
          <Tab icon={<GiftIcon />} iconPosition="start" label="תרומות" />
          <Tab icon={<PersonIcon />} iconPosition="start" label="מפקידים" />
          <Tab icon={<DepositIcon />} iconPosition="start" label="הפקדות" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <DonationsTab />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <DepositorsTab 
              onSelectDepositor={(dep) => {
                handleSelectDepositor(dep)
                setTabValue(2) // עבור לטאב הפקדות
              }}
              selectedDepositorId={selectedDepositor?.id}
            />
          </Grid>
        </Grid>
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <DepositsTab 
          selectedDepositor={selectedDepositor} 
          onSelectDepositor={setSelectedDepositor}
          initialDepositId={selectedDepositId}
        />
      </TabPanel>
    </Box>
  )
}
