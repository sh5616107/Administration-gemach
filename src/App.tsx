import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

// Suppress React Router v7 warnings
const routerFutureConfig = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import LockScreen from './components/LockScreen'

// Lazy load pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'))
const LoansManagement = lazy(() => import('./pages/LoansManagement'))
const UnifiedLoansPage = lazy(() => import('./pages/UnifiedLoansPage'))
const Donations = lazy(() => import('./pages/Donations'))
const Deposits = lazy(() => import('./pages/Deposits'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Contacts = lazy(() => import('./pages/Contacts'))
const AdvancedTools = lazy(() => import('./pages/AdvancedTools'))
const Settings = lazy(() => import('./pages/Settings'))
const Help = lazy(() => import('./pages/Help'))

// Bank integration pages
const BankAccountsPage = lazy(() => import('./pages/bank/BankAccountsPage'))
const BankSyncPage = lazy(() => import('./pages/bank/BankSyncPage'))
const BankMatchingPage = lazy(() => import('./pages/bank/BankMatchingPage'))
const BankHistoryPage = lazy(() => import('./pages/bank/BankHistoryPage'))
const BankDebugPage = lazy(() => import('./pages/bank/BankDebugPage'))

import { exportAllData } from './services/database'
import { isProtectionEnabled, checkAuthenticated } from './services/protection'
import { runPendingMigrations } from './services/migrations'
import { runStartupChecks } from './services/scheduler'
import localforage from 'localforage'

const settingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

// Loading component
const PageLoader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection: 'column', gap: 2 }}>
    <CircularProgress size={60} />
    <Box sx={{ fontSize: '1.2rem', color: 'text.secondary' }}>טוען...</Box>
  </Box>
)

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
    
    // Run scheduler checks on app startup
    runStartupChecks().then(alerts => {
      console.log('[APP] Startup checks completed, alerts:', alerts.length)
    }).catch(err => {
      console.error('[APP] Scheduler error:', err)
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
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/loans/*" element={<LoansManagement />} />
              <Route path="/borrowers-loans-modern" element={<UnifiedLoansPage />} />
              <Route path="/donations" element={<Donations />} />
              <Route path="/deposits" element={<Deposits />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/tools" element={<AdvancedTools />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/help" element={<Help />} />
              
              {/* Bank Integration Routes */}
              <Route path="/bank" element={<Navigate to="/bank/accounts" replace />} />
              <Route path="/bank/accounts" element={<BankAccountsPage />} />
              <Route path="/bank/sync" element={<BankSyncPage />} />
              <Route path="/bank/matching" element={<BankMatchingPage />} />
              <Route path="/bank/history" element={<BankHistoryPage />} />
              <Route path="/bank/debug" element={<BankDebugPage />} />
            </Routes>
          </Suspense>
        </Layout>
      </Box>
    </BrowserRouter>
  )
}

export default App
