import { ReactNode, useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  IconButton,
  Badge,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  Chip,
  Divider,
} from '@mui/material'
import {
  Home as HomeIcon,
  People as PeopleIcon,
  VolunteerActivism as DonationIcon,
  CalendarMonth as CalendarIcon,
  Build as ToolsIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Search as SearchIcon,
  Person as PersonIcon,
  AccountBalanceWallet as DepositIcon,
  AccountBalance as BankIcon,
} from '@mui/icons-material'
import { useSettings } from '../hooks/useSettings'
import { loansService, borrowersService, guarantorsService, donorsService, depositorsService } from '../services/database'
import AlertsDialog, { getUnreadAlertCount } from './AlertsDialog'

const drawerWidth = 220

const menuItems = [
  { text: 'דף הבית', icon: <HomeIcon />, path: '/' },
  { text: 'לווים והלוואות', icon: <PeopleIcon />, path: '/loans' },
  { text: 'תרומות', icon: <DonationIcon />, path: '/donations' },
  { text: 'הפקדות', icon: <DepositIcon />, path: '/deposits' },
  { text: 'אנשי קשר', icon: <PersonIcon />, path: '/contacts' },
  { text: 'לוח שנה', icon: <CalendarIcon />, path: '/calendar' },
  { text: 'כלים מתקדמים', icon: <ToolsIcon />, path: '/tools' },
  { text: 'שילוב בנקים', icon: <BankIcon />, path: '/bank', submenu: [
    { text: 'חשבונות בנק', path: '/bank/accounts' },
    { text: 'סנכרון', path: '/bank/sync' },
    { text: 'אישור התאמות', path: '/bank/matching' },
    { text: 'היסטוריה', path: '/bank/history' },
    { text: '🐛 אבחון בעיות', path: '/bank/debug' },
  ]},
  { text: 'הגדרות', icon: <SettingsIcon />, path: '/settings' },
  { text: 'מדריך שימוש', icon: <HelpIcon />, path: '/help' },
]

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { settings } = useSettings()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<{
    borrowers: any[]
    guarantors: any[]
    donors: any[]
    depositors: any[]
  }>({ borrowers: [], guarantors: [], donors: [], depositors: [] })
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Wait a bit for database to initialize, then check alerts
    const timer = setTimeout(() => {
      checkAlertCount()
    }, 500)
    
    // Also check again after a longer delay to catch any late-loading data
    const timer2 = setTimeout(() => {
      checkAlertCount()
    }, 2000)
    
    return () => {
      clearTimeout(timer)
      clearTimeout(timer2)
    }
  }, [])

  useEffect(() => {
    if (searchTerm.length >= 2) {
      performSearch()
    } else {
      setSearchResults({ borrowers: [], guarantors: [], donors: [], depositors: [] })
    }
  }, [searchTerm])

  // Focus the search input when dialog opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      // Small delay to ensure dialog is fully rendered
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [searchOpen])

  const checkAlertCount = async () => {
    const count = await getUnreadAlertCount()
    console.log('[LAYOUT] Setting alert count to:', count)
    setAlertCount(count)
  }

  const handleAlertCountChange = (count: number) => {
    setAlertCount(count)
  }

  const performSearch = async () => {
    console.log('=== Starting search for:', searchTerm)
    try {
      const borrowers = await borrowersService.search(searchTerm)
      console.log('Borrowers found:', borrowers)
      
      const guarantors = await guarantorsService.search(searchTerm)
      console.log('Guarantors found:', guarantors)
      
      const donors = await donorsService.search(searchTerm)
      console.log('Donors found:', donors)
      
      const depositors = await depositorsService.search(searchTerm)
      console.log('Depositors found:', depositors)
      
      setSearchResults({
        borrowers: borrowers as any[],
        guarantors: guarantors as any[],
        donors: donors as any[],
        depositors: depositors as any[],
      })
      console.log('Search results set:', { borrowers, guarantors, donors, depositors })
    } catch (error) {
      console.error('Search error:', error)
    }
  }

  const handleSearchSelect = (type: string, id: number) => {
    setSearchOpen(false)
    setSearchTerm('')
    switch (type) {
      case 'borrower':
        navigate(`/loans?tab=0&borrower=${id}`)
        break
      case 'guarantor':
        navigate(`/loans?tab=1&guarantor=${id}`)
        break
      case 'donor':
        navigate(`/donations?tab=1&donor=${id}`)
        break
      case 'depositor':
        navigate(`/deposits?tab=1&depositor=${id}`)
        break
    }
  }

  const totalResults = searchResults.borrowers.length + searchResults.guarantors.length + 
    searchResults.donors.length + searchResults.depositors.length

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: '#fafafa' }}>
      <Box sx={{ p: 2, textAlign: 'center', borderBottom: '1px solid #eee' }}>
        <Avatar
          src={settings.gemach_logo || undefined}
          sx={{ 
            width: 56, 
            height: 56, 
            mx: 'auto', 
            mb: 1, 
            bgcolor: '#1976d2',
            fontSize: '1.5rem'
          }}
        >
          {!settings.gemach_logo && 'ג'}
        </Avatar>
        <Typography variant="subtitle1" fontWeight={600} color="text.primary">
          {settings.gemach_name || 'גמ"ח שלי'}
        </Typography>
      </Box>
      <List sx={{ pt: 1 }}>
        {menuItems.map((item) => {
          const isSelected = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path))
          
          // If item has submenu, render parent + children
          if (item.submenu) {
            return (
              <Box key={item.path}>
                <ListItem disablePadding sx={{ px: 1, py: 0.25 }}>
                  <ListItemButton
                    selected={isSelected}
                    sx={{
                      borderRadius: 2,
                      '&.Mui-selected': {
                        bgcolor: '#e3f2fd',
                        color: '#1976d2',
                        '& .MuiListItemIcon-root': { color: '#1976d2' },
                        '&:hover': { bgcolor: '#bbdefb' },
                      },
                      '&:hover': { bgcolor: '#f5f5f5' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: isSelected ? '#1976d2' : '#666' }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.text} 
                      primaryTypographyProps={{ fontSize: '0.9rem' }}
                    />
                  </ListItemButton>
                </ListItem>
                {/* Submenu items */}
                {item.submenu.map((subItem) => {
                  const subIsSelected = location.pathname === subItem.path
                  return (
                    <ListItem key={subItem.path} disablePadding sx={{ px: 1, py: 0.25, pl: 4 }}>
                      <ListItemButton
                        selected={subIsSelected}
                        onClick={() => {
                          navigate(subItem.path)
                          setMobileOpen(false)
                        }}
                        sx={{
                          borderRadius: 2,
                          py: 0.75,
                          '&.Mui-selected': {
                            bgcolor: '#e3f2fd',
                            color: '#1976d2',
                            '&:hover': { bgcolor: '#bbdefb' },
                          },
                          '&:hover': { bgcolor: '#f5f5f5' },
                        }}
                      >
                        <ListItemText 
                          primary={subItem.text} 
                          primaryTypographyProps={{ fontSize: '0.85rem' }}
                        />
                      </ListItemButton>
                    </ListItem>
                  )
                })}
              </Box>
            )
          }
          
          // Regular menu item without submenu
          return (
            <ListItem key={item.path} disablePadding sx={{ px: 1, py: 0.25 }}>
              <ListItemButton
                selected={isSelected}
                onClick={() => {
                  navigate(item.path)
                  setMobileOpen(false)
                }}
                sx={{
                  borderRadius: 2,
                  '&.Mui-selected': {
                    bgcolor: '#e3f2fd',
                    color: '#1976d2',
                    '& .MuiListItemIcon-root': { color: '#1976d2' },
                    '&:hover': { bgcolor: '#bbdefb' },
                  },
                  '&:hover': { bgcolor: '#f5f5f5' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: isSelected ? '#1976d2' : '#666' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text} 
                  primaryTypographyProps={{ fontSize: '0.9rem' }}
                />
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', width: '100%' }}>
      {/* Sidebar - LEFT side */}
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              borderRight: '1px solid #eee',
              borderLeft: 'none',
            },
          }}
          anchor="left"
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: drawerWidth,
              borderRight: '1px solid #eee',
              borderLeft: 'none',
            },
          }}
          anchor="left"
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          bgcolor: '#fff',
        }}
      >
        {/* Top bar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: '#fff',
            color: 'text.primary',
            borderBottom: '1px solid #eee',
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 2, display: { sm: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" noWrap component="div" fontWeight={500} sx={{ flexGrow: 1 }}>
              {menuItems.find(item => 
                location.pathname === item.path || 
                (item.path !== '/' && location.pathname.startsWith(item.path))
              )?.text || 'דף הבית'}
            </Typography>
            <IconButton color="inherit" onClick={() => setSearchOpen(true)} sx={{ mr: 1 }}>
              <SearchIcon />
            </IconButton>
            <IconButton color="inherit" onClick={() => setAlertsOpen(true)}>
              <Badge badgeContent={alertCount} color="error" key={`badge-${alertCount}`}>
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      </Box>

      {/* Alerts Dialog */}
      <AlertsDialog 
        open={alertsOpen} 
        onClose={() => setAlertsOpen(false)} 
        onAlertCountChange={handleAlertCountChange}
      />

      {/* Global Search Dialog */}
      <Dialog 
        open={searchOpen} 
        onClose={() => { setSearchOpen(false); setSearchTerm(''); }} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{ sx: { position: 'fixed', top: 100 } }}
        TransitionProps={{
          onEntered: () => {
            searchInputRef.current?.focus()
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <TextField
            fullWidth
            autoFocus
            inputRef={searchInputRef}
            placeholder="חיפוש בכל המערכת..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            variant="outlined"
            size="small"
          />
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {searchTerm.length < 2 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              הקלד לפחות 2 תווים לחיפוש
            </Typography>
          ) : totalResults === 0 ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              לא נמצאו תוצאות
            </Typography>
          ) : (
            <Box>
              {searchResults.borrowers.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
                    <PersonIcon fontSize="small" color="primary" />
                    <Typography variant="subtitle2" color="primary">לווים</Typography>
                    <Chip label={searchResults.borrowers.length} size="small" />
                  </Box>
                  {searchResults.borrowers.map((b: any) => (
                    <Box
                      key={`b-${b.id}`}
                      onClick={() => handleSearchSelect('borrower', b.id)}
                      sx={{ p: 1.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'grey.100' } }}
                    >
                      <Typography>{b.first_name} {b.last_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{b.phone} | {b.city}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                </>
              )}

              {searchResults.guarantors.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <PersonIcon fontSize="small" color="secondary" />
                    <Typography variant="subtitle2" color="secondary">ערבים</Typography>
                    <Chip label={searchResults.guarantors.length} size="small" />
                  </Box>
                  {searchResults.guarantors.map((g: any) => (
                    <Box
                      key={`g-${g.id}`}
                      onClick={() => handleSearchSelect('guarantor', g.id)}
                      sx={{ p: 1.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'grey.100' } }}
                    >
                      <Typography>{g.first_name} {g.last_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{g.phone}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                </>
              )}

              {searchResults.donors.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <DonationIcon fontSize="small" color="success" />
                    <Typography variant="subtitle2" color="success.main">תורמים</Typography>
                    <Chip label={searchResults.donors.length} size="small" />
                  </Box>
                  {searchResults.donors.map((d: any) => (
                    <Box
                      key={`d-${d.id}`}
                      onClick={() => handleSearchSelect('donor', d.id)}
                      sx={{ p: 1.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'grey.100' } }}
                    >
                      <Typography>{d.first_name} {d.last_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{d.phone}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                </>
              )}

              {searchResults.depositors.length > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <DepositIcon fontSize="small" color="info" />
                    <Typography variant="subtitle2" color="info.main">מפקידים</Typography>
                    <Chip label={searchResults.depositors.length} size="small" />
                  </Box>
                  {searchResults.depositors.map((dep: any) => (
                    <Box
                      key={`dep-${dep.id}`}
                      onClick={() => handleSearchSelect('depositor', dep.id)}
                      sx={{ p: 1.5, cursor: 'pointer', borderRadius: 1, '&:hover': { bgcolor: 'grey.100' } }}
                    >
                      <Typography>{dep.first_name} {dep.last_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{dep.phone}</Typography>
                    </Box>
                  ))}
                </>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  )
}
