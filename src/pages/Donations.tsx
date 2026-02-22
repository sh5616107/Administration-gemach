import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Tabs, Tab, Paper } from '@mui/material'
import {
  VolunteerActivism as DonorIcon,
  CardGiftcard as GiftIcon,
} from '@mui/icons-material'
import DonorsTab from '../components/donations/DonorsTab'
import DonationsTab from '../components/donations/DonationsTab'
import { db } from '../services/database'

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

interface Donor {
  id?: number
  first_name: string
  last_name: string
  phone: string
  id_number: string
}

export default function Donations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tabValue, setTabValue] = useState(0)
  const [selectedDonor, setSelectedDonor] = useState<Donor | null>(null)

  useEffect(() => {
    // Read tab and donor from URL params
    const tab = searchParams.get('tab')
    const donorId = searchParams.get('donor')
    
    if (tab !== null) {
      setTabValue(parseInt(tab))
    }
    
    if (donorId) {
      // Load donor by ID and set selectedDonor
      loadDonorById(parseInt(donorId))
      // Switch to donations tab (index 1) when donor is specified
      setTabValue(1)
    }
    
    // Clear URL params after reading
    if (tab || donorId) {
      setSearchParams({})
    }
  }, [searchParams, setSearchParams])

  const loadDonorById = async (id: number) => {
    try {
      const donors = await db.query('SELECT * FROM donors WHERE id = ?', [id]) as Donor[]
      if (donors.length > 0) {
        setSelectedDonor(donors[0])
      }
    } catch (error) {
      console.error('Error loading donor:', error)
    }
  }

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
    // לא מאפסים את התורם הנבחר כשעוברים טאב - רק כשעוברים לטאב תורמים
    if (newValue === 0) {
      setSelectedDonor(null)
    }
  }

  // פונקציה שתיקרא מטאב תורמים כשבוחרים תורם
  const handleDonorSelect = (donor: Donor | null) => {
    if (donor) {
      setSelectedDonor(donor)
      setTabValue(1) // עבור לטאב תרומות
    }
  }

  return (
    <Box>
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
        >
          <Tab icon={<DonorIcon />} iconPosition="start" label="ניהול תורמים" />
          <Tab icon={<GiftIcon />} iconPosition="start" label="ניהול תרומות" />
        </Tabs>
      </Paper>

      <TabPanel value={tabValue} index={0}>
        <DonorsTab 
          onSelectDonor={handleDonorSelect}
          selectedDonorId={selectedDonor?.id}
        />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <DonationsTab 
          selectedDonor={selectedDonor} 
          onSelectDonor={setSelectedDonor}
        />
      </TabPanel>
    </Box>
  )
}
