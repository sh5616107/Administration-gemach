import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Suppress React Router v7 warnings
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}
import { Box } from '@mui/material'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'
import Dashboard from './pages/Dashboard'
import LoansManagement from './pages/LoansManagement'
import DonationsDeposits from './pages/DonationsDeposits'
import Calendar from './pages/Calendar'
import Contacts from './pages/Contacts'
import AdvancedTools from './pages/AdvancedTools'
import Settings from './pages/Settings'
import Help from './pages/Help'
import { exportAllData } from './services/database'
import { isProtectionEnabled, checkAuthenticated } from './services/protection'
import { runPendingMigrations } from './services/migrations'
import localforage from 'localforage'

const settingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

// Auto backup function
async function checkAutoBackup() {
  try {
    const autoBackup = await settingsStore.getItem<string>('auto_backup')
    if (!autoBackup || autoBackup === 'off') return

    const lastBackup = await settingsStore.getItem<string>('last_auto_backup')
    const now = new Date()
    const lastBackupDate = lastBackup ? new Date(lastBackup) : null

    let shouldBackup = false
    if (!lastBackupDate) {
      shouldBackup = true
    } else {
      const diffDays = Math.floor((now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (autoBackup === 'daily' && diffDays >= 1) shouldBackup = true
      if (autoBackup === 'weekly' && diffDays >= 7) shouldBackup = true
      if (autoBackup === 'monthly' && diffDays >= 30) shouldBackup = true
    }

    if (shouldBackup) {
      console.log('🔄 Running auto backup...')
      const data = await exportAllData()
      const exportData = {
        exportDate: now.toISOString(),
        version: '1.0',
        autoBackup: true,
        ...data
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gemach_auto_backup_${now.toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      await settingsStore.setItem('last_auto_backup', now.toISOString())
      console.log('✅ Auto backup completed')
    }
  } catch (error) {
    console.error('Auto backup error:', error)
  }
}

function App() {
  const [isLocked, setIsLocked] = useState(true)
  const [loading, setLoading] = useState(true)
  const { i18n } = useTranslation()

  useEffect(() => {
    // Load saved language
    const loadLanguage = async () => {
      const savedLang = await settingsStore.getItem<string>('language')
      if (savedLang && savedLang !== i18n.language) {
        i18n.changeLanguage(savedLang)
      }
    }
    loadLanguage()
    
    // Check if protection is enabled
    const checkProtection = async () => {
      const enabled = await isProtectionEnabled()
      if (!enabled || checkAuthenticated()) {
        setIsLocked(false)
      }
      setLoading(false)
    }
    checkProtection()
    
    // Run pending migrations
    runPendingMigrations().catch(err => {
      console.error('Migration error:', err)
    })
    
    // Check auto backup on app start
    checkAutoBackup()
  }, [])

  const handleUnlock = () => {
    setIsLocked(false)
  }

  if (loading) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: 'primary.dark'
      }}>
        {/* Loading... */}
      </Box>
    )
  }

  if (isLocked) {
    return <LockScreen onUnlock={handleUnlock} />
  }

  return (
    <BrowserRouter future={routerFutureConfig}>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/loans/*" element={<LoansManagement />} />
            <Route path="/donations" element={<DonationsDeposits />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/tools" element={<AdvancedTools />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
          </Routes>
        </Layout>
      </Box>
    </BrowserRouter>
  )
}

export default App
