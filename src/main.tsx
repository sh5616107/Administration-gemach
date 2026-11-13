import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import rtlPlugin from 'stylis-plugin-rtl'
import App from './App'
import { AppThemeProvider, useThemeContext } from './contexts/ThemeContext'
import './i18n/config'

console.log('🚀 Gemach Manager starting...')

// RTL cache
const cacheRtl = createCache({
  key: 'muirtl',
  // @ts-ignore - RTL plugin types
  stylisPlugins: [rtlPlugin],
})

/**
 * Wrapper שמקבל את ה-theme מההקשר
 */
function ThemedApp() {
  const { theme } = useThemeContext();
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CacheProvider value={cacheRtl}>
      <AppThemeProvider>
        <ThemedApp />
      </AppThemeProvider>
    </CacheProvider>
  </React.StrictMode>
)
