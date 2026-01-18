import { useState } from 'react'
import { Box, Tabs, Tab, Paper, Grid } from '@mui/material'
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
  const [tabValue, setTabValue] = useState(1) // ברירת מחדל: מפקידים
  const [selectedDepositor, setSelectedDepositor] = useState<Depositor | null>(null)

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
          <Tab label="🎁 תרומות" />
          <Tab label="👤 מפקידים" />
          <Tab label="📥 הפקדות" />
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
        />
      </TabPanel>
    </Box>
  )
}
