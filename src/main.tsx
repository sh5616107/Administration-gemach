import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import rtlPlugin from 'stylis-plugin-rtl'
import App from './App'
import { defaultTheme } from './theme'
import './i18n/config'

console.log('🚀 Gemach Manager starting...')

// RTL cache
const cacheRtl = createCache({
  key: 'muirtl',
  // @ts-ignore - RTL plugin types
  stylisPlugins: [rtlPlugin],
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CacheProvider value={cacheRtl}>
      <ThemeProvider theme={defaultTheme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </CacheProvider>
  </React.StrictMode>
)
