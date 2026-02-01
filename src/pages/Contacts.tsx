import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  CircularProgress,
} from '@mui/material'
import {
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  Person as BorrowerIcon,
  Shield as GuarantorIcon,
  VolunteerActivism as DonorIcon,
  AccountBalance as DepositorIcon,
} from '@mui/icons-material'
import { UnifiedContact, ContactRole } from '../types/contacts'
import { getAllContacts, searchContacts, filterByRoles } from '../services/contacts'
import ContactFormDialog from '../components/contacts/ContactFormDialog'
import ContactDetailsDialog from '../components/contacts/ContactDetailsDialog'

export default function Contacts() {
  const { t } = useTranslation()
  const [contacts, setContacts] = useState<UnifiedContact[]>([])
  const [filteredContacts, setFilteredContacts] = useState<UnifiedContact[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilters, setRoleFilters] = useState<Set<ContactRole['type'] | 'none'>>(new Set())
  const [loading, setLoading] = useState(true)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<UnifiedContact | null>(null)

  useEffect(() => {
    loadContacts()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [contacts, searchTerm, roleFilters])

  const loadContacts = async () => {
    try {
      setLoading(true)
      const data = await getAllContacts()
      setContacts(data)
    } catch (error) {
      console.error('שגיאה בטעינת אנשי קשר:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = async () => {
    let result = contacts

    // סינון לפי חיפוש
    if (searchTerm.trim()) {
      result = await searchContacts(searchTerm)
    }

    // סינון לפי תפקידים
    if (roleFilters.size > 0) {
      result = result.filter(contact => {
        // אם נבחר "ללא תפקיד" ולאיש הקשר אין תפקידים
        if (roleFilters.has('none') && contact.roles.length === 0) {
          return true
        }
        // אם יש תפקידים מסוננים ואיש הקשר מתאים
        const hasMatchingRole = contact.roles.some(role => roleFilters.has(role.type))
        return hasMatchingRole
      })
    }

    setFilteredContacts(result)
  }

  const toggleRoleFilter = (role: ContactRole['type'] | 'none') => {
    const newFilters = new Set(roleFilters)
    if (newFilters.has(role)) {
      newFilters.delete(role)
    } else {
      newFilters.add(role)
    }
    setRoleFilters(newFilters)
  }

  const getRoleIcon = (roleType: ContactRole['type']) => {
    switch (roleType) {
      case 'borrower':
        return <BorrowerIcon fontSize="small" />
      case 'guarantor':
        return <GuarantorIcon fontSize="small" />
      case 'donor':
        return <DonorIcon fontSize="small" />
      case 'depositor':
        return <DepositorIcon fontSize="small" />
    }
  }

  const getRoleLabel = (roleType: ContactRole['type']) => {
    return t(`contacts.roles.${roleType}`)
  }

  const getRoleCount = (roleType: ContactRole['type'] | 'none') => {
    if (roleType === 'none') {
      return contacts.filter(c => c.roles.length === 0).length
    }
    return contacts.filter(c => c.roles.some(r => r.type === roleType)).length
  }

  const formatBalance = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handleAddContact = () => {
    setSelectedContact(null)
    setFormDialogOpen(true)
  }

  const handleEditContact = (contact: UnifiedContact) => {
    setSelectedContact(contact)
    setFormDialogOpen(true)
  }

  const handleViewContact = (contact: UnifiedContact) => {
    setSelectedContact(contact)
    setDetailsDialogOpen(true)
  }

  const handleFormSave = () => {
    loadContacts()
  }

  const handleEditFromDetails = () => {
    setDetailsDialogOpen(false)
    setFormDialogOpen(true)
  }

  const handlePrintContactReport = (contact: UnifiedContact) => {
    // יצירת אלמנט זמני להדפסה
    const printContent = generateContactReport(contact, t)
    
    // יצירת iframe נסתר להדפסה
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentWindow?.document
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(printContent)
      iframeDoc.close()
      
      // המתנה לטעינת התוכן ואז הדפסה
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
          
          // הסרת ה-iframe אחרי ההדפסה
          setTimeout(() => {
            document.body.removeChild(iframe)
          }, 100)
        }, 250)
      }
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* כותרת */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          {t('contacts.title')}
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddContact}
        >
          {t('contacts.newContact')}
        </Button>
      </Box>

      {/* חיפוש וסינון */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          {/* שדה חיפוש */}
          <TextField
            fullWidth
            placeholder={t('contacts.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {/* סינון לפי תפקיד */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('contacts.filterByRole')}
          </Typography>
          <FormGroup row>
            <FormControlLabel
              control={
                <Checkbox
                  checked={roleFilters.has('borrower')}
                  onChange={() => toggleRoleFilter('borrower')}
                />
              }
              label={`${t('contacts.roles.borrowers')} (${getRoleCount('borrower')})`}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={roleFilters.has('guarantor')}
                  onChange={() => toggleRoleFilter('guarantor')}
                />
              }
              label={`${t('contacts.roles.guarantors')} (${getRoleCount('guarantor')})`}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={roleFilters.has('donor')}
                  onChange={() => toggleRoleFilter('donor')}
                />
              }
              label={`${t('contacts.roles.donors')} (${getRoleCount('donor')})`}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={roleFilters.has('depositor')}
                  onChange={() => toggleRoleFilter('depositor')}
                />
              }
              label={`${t('contacts.roles.depositors')} (${getRoleCount('depositor')})`}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={roleFilters.has('none')}
                  onChange={() => toggleRoleFilter('none')}
                />
              }
              label={`${t('contacts.roles.noRole')} (${getRoleCount('none')})`}
            />
          </FormGroup>
        </CardContent>
      </Card>

      {/* טבלת אנשי קשר */}
      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : filteredContacts.length === 0 ? (
            <Typography variant="body1" sx={{ textAlign: 'center', p: 3 }}>
              {searchTerm || roleFilters.size > 0
                ? t('contacts.noContactsFound')
                : t('contacts.noContacts')}
            </Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('contacts.form.firstName')}</TableCell>
                    <TableCell>{t('contacts.form.lastName')}</TableCell>
                    <TableCell>{t('contacts.form.phone')}</TableCell>
                    <TableCell>{t('contacts.details.roles')}</TableCell>
                    <TableCell align="right">{t('contacts.stats.netBalance')}</TableCell>
                    <TableCell align="center">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredContacts.map((contact) => (
                    <TableRow key={contact.id} hover>
                      <TableCell>{contact.first_name}</TableCell>
                      <TableCell>{contact.last_name}</TableCell>
                      <TableCell>{contact.phone}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {contact.roles.length === 0 ? (
                            <Chip
                              label={t('contacts.roles.noRole')}
                              size="small"
                              variant="outlined"
                            />
                          ) : (
                            contact.roles.map((role, index) => (
                              <Chip
                                key={index}
                                icon={getRoleIcon(role.type)}
                                label={getRoleLabel(role.type)}
                                size="small"
                                color={role.active ? 'primary' : 'default'}
                              />
                            ))
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            color: contact.stats.net_balance >= 0 ? 'success.main' : 'error.main',
                            fontWeight: 'bold',
                          }}
                        >
                          {formatBalance(contact.stats.net_balance)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => handleViewContact(contact)}
                          title={t('contacts.contactDetails')}
                        >
                          <ViewIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleEditContact(contact)}
                          title={t('contacts.editContact')}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handlePrintContactReport(contact)}
                          title={t('contacts.printContactReport')}
                        >
                          <PrintIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* מונה תוצאות */}
          {!loading && filteredContacts.length > 0 && (
            <Typography variant="caption" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
              {t('contacts.contactCount', { count: filteredContacts.length })}
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* דיאלוגים */}
      <ContactFormDialog
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        onSave={handleFormSave}
        contact={selectedContact}
      />

      <ContactDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        contact={selectedContact}
        onEdit={handleEditFromDetails}
      />
    </Box>
  )
}

// פונקציה ליצירת דוח אישי HTML להדפסה
function generateContactReport(contact: UnifiedContact, t: any): string {
  const now = new Date().toLocaleDateString('he-IL', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getRoleLabel = (roleType: string) => {
    return t(`contacts.roles.${roleType}`)
  }

  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>דוח אישי - ${contact.first_name} ${contact.last_name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      direction: rtl;
      background: white;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 3px solid #1976d2;
      padding-bottom: 30px;
    }
    .header h1 {
      color: #1976d2;
      margin-bottom: 10px;
      font-size: 32px;
    }
    .header .subtitle {
      color: #666;
      font-size: 18px;
      margin-bottom: 10px;
    }
    .header .date {
      color: #999;
      font-size: 14px;
    }
    .info-section {
      background: #f5f5f5;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .info-section h2 {
      color: #1976d2;
      margin-bottom: 20px;
      font-size: 20px;
      border-bottom: 2px solid #1976d2;
      padding-bottom: 10px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .info-item {
      display: flex;
      padding: 10px;
      background: white;
      border-radius: 4px;
    }
    .info-label {
      font-weight: bold;
      color: #666;
      min-width: 120px;
    }
    .info-value {
      color: #333;
    }
    .roles-section {
      margin: 20px 0;
    }
    .role-badge {
      display: inline-block;
      background: #1976d2;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      margin-left: 10px;
    }
    .stats-section {
      margin-bottom: 30px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 20px;
    }
    .stat-card {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-card.highlight {
      border-color: #1976d2;
      background: #e3f2fd;
    }
    .stat-label {
      font-size: 13px;
      color: #666;
      margin-bottom: 10px;
      font-weight: 500;
    }
    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #333;
    }
    .stat-value.positive {
      color: #2e7d32;
    }
    .stat-value.negative {
      color: #d32f2f;
    }
    .stat-subvalue {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }
    .balance-section {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      margin: 30px 0;
    }
    .balance-section h2 {
      font-size: 18px;
      margin-bottom: 15px;
      opacity: 0.9;
    }
    .balance-amount {
      font-size: 48px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .balance-section.positive {
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    }
    .balance-section.negative {
      background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
    }
    .notes-section {
      background: #fff9e6;
      border-right: 5px solid #ffc107;
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .notes-section h3 {
      color: #f57c00;
      margin-bottom: 10px;
    }
    .notes-content {
      color: #333;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .footer {
      text-align: center;
      margin-top: 50px;
      padding-top: 30px;
      border-top: 2px solid #ddd;
      color: #666;
      font-size: 13px;
    }
    @media print {
      body {
        padding: 20px;
      }
      .stat-card {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>דוח אישי מפורט</h1>
    <div class="subtitle">${contact.first_name} ${contact.last_name}</div>
    <div class="date">נוצר בתאריך: ${now}</div>
  </div>

  <div class="info-section">
    <h2>פרטים אישיים</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">שם מלא:</span>
        <span class="info-value">${contact.first_name} ${contact.last_name}</span>
      </div>
      <div class="info-item">
        <span class="info-label">טלפון:</span>
        <span class="info-value">${contact.phone}</span>
      </div>
      ${contact.id_number ? `
      <div class="info-item">
        <span class="info-label">תעודת זהות:</span>
        <span class="info-value">${contact.id_number}</span>
      </div>
      ` : ''}
      ${contact.city ? `
      <div class="info-item">
        <span class="info-label">עיר:</span>
        <span class="info-value">${contact.city}</span>
      </div>
      ` : ''}
      ${contact.address ? `
      <div class="info-item">
        <span class="info-label">כתובת:</span>
        <span class="info-value">${contact.address}</span>
      </div>
      ` : ''}
      ${contact.email ? `
      <div class="info-item">
        <span class="info-label">דוא"ל:</span>
        <span class="info-value">${contact.email}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="roles-section">
      <div class="info-label" style="margin-bottom: 10px;">תפקידים במערכת:</div>
      ${contact.roles.length === 0 
        ? `<span class="role-badge" style="background: #999;">ללא תפקיד</span>`
        : contact.roles.map(role => `<span class="role-badge">${getRoleLabel(role.type)}</span>`).join('')
      }
    </div>
  </div>

  ${contact.notes ? `
  <div class="notes-section">
    <h3>הערות</h3>
    <div class="notes-content">${contact.notes}</div>
  </div>
  ` : ''}

  <div class="balance-section ${contact.stats.net_balance >= 0 ? 'positive' : 'negative'}">
    <h2>מאזן נטו</h2>
    <div class="balance-amount">${formatCurrency(contact.stats.net_balance)}</div>
    <div>${contact.stats.net_balance >= 0 ? 'זכות' : 'חובה'}</div>
  </div>

  <div class="stats-section">
    <div class="info-section">
      <h2>סטטיסטיקות מפורטות</h2>
      <div class="stats-grid">
        ${contact.stats.total_loans > 0 ? `
        <div class="stat-card ${contact.stats.active_loans > 0 ? 'highlight' : ''}">
          <div class="stat-label">הלוואות</div>
          <div class="stat-value">${contact.stats.active_loans}/${contact.stats.total_loans}</div>
          <div class="stat-subvalue">פעילות/סה"כ</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">סך הלוואות</div>
          <div class="stat-value">${formatCurrency(contact.stats.total_borrowed)}</div>
        </div>
        <div class="stat-card ${contact.stats.total_debt > 0 ? 'highlight' : ''}">
          <div class="stat-label">חוב נוכחי</div>
          <div class="stat-value negative">${formatCurrency(contact.stats.total_debt)}</div>
        </div>
        ` : ''}
        
        ${contact.stats.total_guarantees > 0 ? `
        <div class="stat-card ${contact.stats.active_guarantees > 0 ? 'highlight' : ''}">
          <div class="stat-label">ערבויות</div>
          <div class="stat-value">${contact.stats.active_guarantees}/${contact.stats.total_guarantees}</div>
          <div class="stat-subvalue">פעילות/סה"כ</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">סכום ערבויות פעיל</div>
          <div class="stat-value">${formatCurrency(contact.stats.total_guaranteed)}</div>
        </div>
        ` : ''}
        
        ${contact.stats.total_donations > 0 ? `
        <div class="stat-card">
          <div class="stat-label">תרומות</div>
          <div class="stat-value">${contact.stats.total_donations}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">סך תרומות</div>
          <div class="stat-value positive">${formatCurrency(contact.stats.total_donated)}</div>
        </div>
        ` : ''}
        
        ${contact.stats.total_deposits > 0 ? `
        <div class="stat-card ${contact.stats.active_deposits > 0 ? 'highlight' : ''}">
          <div class="stat-label">הפקדות</div>
          <div class="stat-value">${contact.stats.active_deposits}/${contact.stats.total_deposits}</div>
          <div class="stat-subvalue">פעילות/סה"כ</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">סך הפקדות פעילות</div>
          <div class="stat-value positive">${formatCurrency(contact.stats.active_deposit_amount)}</div>
        </div>
        ` : ''}
      </div>
    </div>
  </div>

  <div class="footer">
    <p>דוח זה נוצר אוטומטית ממערכת ניהול הגמ"ח</p>
    <p>תאריך הפקה: ${now}</p>
  </div>
</body>
</html>
  `
}
