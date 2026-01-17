import { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Snackbar,
  Alert,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material'
import {
  Download as ExportIcon,
  Upload as ImportIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  Assessment as ReportIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  CreditCard as PaymentIcon,
  Print as PrintIcon,
  Receipt as ExpenseIcon,
  Edit as EditIcon,
  Description as ReceiptDocIcon,
} from '@mui/icons-material'
import { db, loansService, borrowersService, guarantorsService, importAllData, exportAllData, statsService, guarantorLoansService } from '../services/database'
import { generateFullReport, generateBorrowerReport, generateExpenseReceipt } from '../services/documents'
import { useSettings } from '../hooks/useSettings'
import { formatDisplayDate } from '../utils/dateUtils'
import PaymentMethodSelect from '../components/PaymentMethodSelect'
import AmountInput from '../components/AmountInput'
import ExcelImportDialog from '../components/ExcelImportDialog'
import { exportToExcel } from '../services/excelImport'

interface OverdueLoan {
  id: number
  borrower_id: number
  borrower_name: string
  amount: number
  remaining: number
  due_date: string
  guarantor1_id?: number
  guarantor2_id?: number
}

interface BlacklistItem {
  id: number
  entity_type: string
  entity_id: number
  reason: string
  added_at: string
  name?: string
}

interface EntityOption {
  id: number
  name: string
  type: 'borrower' | 'guarantor'
}

interface PaymentMethodStats {
  [method: string]: {
    loansOut: number
    repaymentsIn: number
    donationsIn: number
    depositsIn: number
    withdrawalsOut: number
    expensesOut: number
  }
}

interface Expense {
  id: number
  description: string
  amount: number
  expense_date: string
  category: string
  paid_by: 'gemach' | 'borrower'
  borrower_id?: number
  borrower_name?: string
  payment_method?: string
  payment_details?: string
  notes?: string
  created_at: string
}

interface TransferDialogData {
  loan: OverdueLoan | null
  guarantor1: any | null
  guarantor2: any | null
  splitType: 'single' | 'equal' | 'custom'
  selectedGuarantor: 'g1' | 'g2' | null
  amount1: number
  amount2: number
  repaymentType: 'single' | 'monthly'
  dueDate: string
  monthlyPayments: number
  startDate: string
}

export default function AdvancedTools() {
  const { settings } = useSettings()
  const [overdueLoans, setOverdueLoans] = useState<OverdueLoan[]>([])
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([])
  const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false)
  const [blacklistForm, setBlacklistForm] = useState({ type: 'borrower' as 'borrower' | 'guarantor', entity: null as EntityOption | null, reason: '' })
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([])
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' })
  
  // Excel import dialog
  const [excelImportDialogOpen, setExcelImportDialogOpen] = useState(false)
  
  // Transfer to guarantor dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [transferData, setTransferData] = useState<TransferDialogData>({
    loan: null,
    guarantor1: null,
    guarantor2: null,
    splitType: 'single',
    selectedGuarantor: null,
    amount1: 0,
    amount2: 0,
    repaymentType: 'single',
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    monthlyPayments: 3,
    startDate: new Date().toISOString().split('T')[0]
  })
  
  // Payment method stats dialog
  const [paymentStatsDialogOpen, setPaymentStatsDialogOpen] = useState(false)
  const [paymentStats, setPaymentStats] = useState<PaymentMethodStats | null>(null)
  
  // Borrowers report dialog
  const [borrowersReportDialogOpen, setBorrowersReportDialogOpen] = useState(false)
  const [borrowersReportData, setBorrowersReportData] = useState<{ 
    borrowers: { name: string; loanCount: number; totalDebt: number }[]; 
    stats: { totalLoans: number; activeLoans: number; totalLoanAmount: number; totalDeposits: number; totalDepositAmount: number; totalDonations: number; totalDonationAmount: number; availableCash: number }
  } | null>(null)
  
  // Depositors report dialog
  const [depositorsReportDialogOpen, setDepositorsReportDialogOpen] = useState(false)
  const [depositorsReportData, setDepositorsReportData] = useState<{ deposits: any[]; totalAmount: number } | null>(null)
  
  // Full statistics dialog
  const [fullStatsDialogOpen, setFullStatsDialogOpen] = useState(false)
  const [fullStats, setFullStats] = useState<{
    summary: { totalIn: number; totalOut: number; netBeforeExpenses: number; expenses: number; netFinal: number }
    paymentMethodSummary: PaymentMethodStats
    loans: { byMethod: Record<string, { count: number; total: number }> }
    repayments: { byMethod: Record<string, { count: number; total: number }> }
    deposits: { byMethod: Record<string, { count: number; total: number }> }
    donations: { byMethod: Record<string, { count: number; total: number }> }
    guarantorLoans: { count: number; totalAmount: number; totalRemaining: number }
  } | null>(null)
  
  // Expenses
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: 'fee',
    paid_by: 'gemach' as 'gemach' | 'borrower',
    borrower_id: null as number | null,
    payment_method: '' as string,
    payment_details: '' as string,
    notes: ''
  })
  const [expensePaymentData, setExpensePaymentData] = useState<{ payment_method: string; [key: string]: string }>({ payment_method: '' })
  const [borrowerOptions, setBorrowerOptions] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const overdue = await loansService.getOverdue()
      setOverdueLoans(overdue as OverdueLoan[])

      // Load blacklist with names
      const rawBlacklist = await db.query('SELECT * FROM blacklist') as BlacklistItem[]
      const borrowers = await borrowersService.getAll() as any[]
      const guarantors = await guarantorsService.getAll() as any[]
      
      // Add names to blacklist items
      const blacklistWithNames = rawBlacklist.map(item => {
        let name = ''
        if (item.entity_type === 'borrower') {
          const borrower = borrowers.find(b => b.id === item.entity_id)
          name = borrower ? `${borrower.first_name} ${borrower.last_name}` : `לווה #${item.entity_id}`
        } else if (item.entity_type === 'guarantor') {
          const guarantor = guarantors.find(g => g.id === item.entity_id)
          name = guarantor ? `${guarantor.first_name} ${guarantor.last_name}` : `ערב #${item.entity_id}`
        }
        return { ...item, name }
      }).sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
      
      setBlacklist(blacklistWithNames)

      // Load entity options for blacklist dialog
      const options: EntityOption[] = [
        ...borrowers.map(b => ({ id: b.id, name: `${b.first_name} ${b.last_name}`, type: 'borrower' as const })),
        ...guarantors.map(g => ({ id: g.id, name: `${g.first_name} ${g.last_name}`, type: 'guarantor' as const })),
      ]
      setEntityOptions(options)
      
      // Load borrower options for expenses
      setBorrowerOptions(borrowers.map(b => ({ id: b.id, name: `${b.first_name} ${b.last_name}` })))
      
      // Load expenses
      const expensesData = await statsService.getExpenses()
      setExpenses(expensesData as Expense[])
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleExport = async () => {
    try {
      const data = await exportAllData()
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        ...data
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gemach_backup_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      setSnackbar({ open: true, message: 'הגיבוי יוצא בהצלחה', severity: 'success' })
    } catch (error) {
      console.error('Error exporting:', error)
      setSnackbar({ open: true, message: 'שגיאה בייצוא', severity: 'error' })
    }
  }

  const handleExportToExcel = async () => {
    try {
      const blob = await exportToExcel()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gemach_export_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      setSnackbar({ open: true, message: 'הנתונים יוצאו לאקסל בהצלחה', severity: 'success' })
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      setSnackbar({ open: true, message: 'שגיאה בייצוא לאקסל', severity: 'error' })
    }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Validate backup file
        if (!data.exportDate && !data.borrowers && !data.settings) {
          throw new Error('Invalid backup file')
        }

        // Convert old format to new format if needed
        const importData: any = {
          settings: {},
          borrowers: {},
          guarantors: {},
          loans: {},
          repayments: {},
          donors: {},
          donations: {},
          depositors: {},
          deposits: {},
          blacklist: {},
          expenses: {},
          guarantorLoans: {},
        }

        // Handle settings
        if (Array.isArray(data.settings)) {
          data.settings.forEach((s: any) => { importData.settings[s.key] = s.value })
        } else if (data.settings) {
          importData.settings = data.settings
        }

        // Handle arrays or objects - convert to objects with id as key
        const convertToObject = (input: any) => {
          if (!input) return {}
          // If already an object (not array), return as is
          if (!Array.isArray(input) && typeof input === 'object') {
            return input
          }
          // If array, convert to object
          const obj: Record<string, any> = {}
          if (Array.isArray(input)) {
            input.forEach(item => { if (item.id) obj[String(item.id)] = item })
          }
          return obj
        }

        if (data.borrowers) importData.borrowers = convertToObject(data.borrowers)
        if (data.guarantors) importData.guarantors = convertToObject(data.guarantors)
        if (data.loans) importData.loans = convertToObject(data.loans)
        if (data.repayments) importData.repayments = convertToObject(data.repayments)
        if (data.donors) importData.donors = convertToObject(data.donors)
        if (data.donations) importData.donations = convertToObject(data.donations)
        if (data.depositors) importData.depositors = convertToObject(data.depositors)
        if (data.deposits) importData.deposits = convertToObject(data.deposits)
        if (data.blacklist) importData.blacklist = convertToObject(data.blacklist)
        if (data.expenses) importData.expenses = convertToObject(data.expenses)
        if (data.guarantorLoans) importData.guarantorLoans = convertToObject(data.guarantorLoans)

        await importAllData(importData)
        
        setSnackbar({ open: true, message: 'הגיבוי יובא בהצלחה!', severity: 'success' })
        
        // Reload data
        loadData()
      } catch (error) {
        console.error('Error importing:', error)
        setSnackbar({ open: true, message: 'שגיאה בייבוא - קובץ לא תקין', severity: 'error' })
      }
    }
    input.click()
  }

  const handleAddToBlacklist = async () => {
    if (!blacklistForm.entity || !blacklistForm.reason) {
      setSnackbar({ open: true, message: 'נא לבחור אדם ולמלא סיבה', severity: 'error' })
      return
    }

    try {
      await db.run(
        'INSERT INTO blacklist (entity_type, entity_id, reason) VALUES (?, ?, ?)',
        [blacklistForm.entity.type, blacklistForm.entity.id, blacklistForm.reason]
      )

      if (blacklistForm.entity.type === 'guarantor') {
        await guarantorsService.update(blacklistForm.entity.id, { is_blacklisted: 1 })
      }

      setSnackbar({ open: true, message: 'נוסף לרשימה השחורה', severity: 'success' })
      setBlacklistDialogOpen(false)
      setBlacklistForm({ type: 'borrower', entity: null, reason: '' })
      loadData()
    } catch (error) {
      console.error('Error adding to blacklist:', error)
      setSnackbar({ open: true, message: 'שגיאה בהוספה', severity: 'error' })
    }
  }

  const handleRemoveFromBlacklist = async (item: BlacklistItem) => {
    if (!confirm('האם להסיר מהרשימה השחורה?')) return

    try {
      await db.run('DELETE FROM blacklist WHERE id = ?', [item.id])

      if (item.entity_type === 'guarantor') {
        await guarantorsService.update(item.entity_id, { is_blacklisted: 0 })
      }

      setSnackbar({ open: true, message: 'הוסר מהרשימה השחורה', severity: 'success' })
      loadData()
    } catch (error) {
      console.error('Error removing from blacklist:', error)
      setSnackbar({ open: true, message: 'שגיאה בהסרה', severity: 'error' })
    }
  }

  const formatCurrency = (amount: number) => {
    const currency = settings.currency || 'ILS'
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const handleTransferToGuarantor = async (loan: OverdueLoan) => {
    if (!loan.guarantor1_id && !loan.guarantor2_id) {
      setSnackbar({ open: true, message: 'להלוואה זו אין ערבים', severity: 'error' })
      return
    }

    // Get guarantor details
    const guarantor1 = loan.guarantor1_id ? await guarantorsService.getById(loan.guarantor1_id) as any : null
    const guarantor2 = loan.guarantor2_id ? await guarantorsService.getById(loan.guarantor2_id) as any : null
    
    const hasTwo = guarantor1 && guarantor2
    
    setTransferData({
      loan,
      guarantor1,
      guarantor2,
      splitType: hasTwo ? 'equal' : 'single',
      selectedGuarantor: guarantor1 ? 'g1' : 'g2',
      amount1: hasTwo ? Math.ceil(loan.remaining / 2) : loan.remaining,
      amount2: hasTwo ? Math.floor(loan.remaining / 2) : 0,
      repaymentType: 'single',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      monthlyPayments: 3,
      startDate: new Date().toISOString().split('T')[0]
    })
    setTransferDialogOpen(true)
  }

  const handleConfirmTransfer = async () => {
    if (!transferData.loan) return

    try {
      const today = new Date().toISOString().split('T')[0]
      const loan = transferData.loan

      // Create guarantor loan record
      const createGuarantorLoan = async (guarantorId: number, amount: number) => {
        await guarantorLoansService.create({
          guarantor_id: guarantorId,
          original_loan_id: loan.id,
          amount: amount,
          status: 'active',
          due_date: transferData.repaymentType === 'single' ? transferData.dueDate : undefined,
          monthly_payments: transferData.repaymentType === 'monthly' ? transferData.monthlyPayments : undefined,
          start_date: transferData.repaymentType === 'monthly' ? transferData.startDate : undefined,
          notes: `הועבר מהלוואה של ${loan.borrower_name}`
        })
      }

      // Process based on split type
      if (transferData.splitType === 'single') {
        const guarantor = transferData.selectedGuarantor === 'g1' ? transferData.guarantor1 : transferData.guarantor2
        await createGuarantorLoan(guarantor.id, loan.remaining)
      } else {
        // Split between two guarantors
        if (transferData.guarantor1 && transferData.amount1 > 0) {
          await createGuarantorLoan(transferData.guarantor1.id, transferData.amount1)
        }
        if (transferData.guarantor2 && transferData.amount2 > 0) {
          await createGuarantorLoan(transferData.guarantor2.id, transferData.amount2)
        }
      }

      // Update original loan status to "transferred"
      await loansService.update(loan.id, { 
        status: 'transferred',
        notes: (await loansService.getById(loan.id) as any)?.notes + `\n[${today}] הועבר לערב/ים`
      })

      // Add original borrower to blacklist
      await db.run(
        'INSERT INTO blacklist (entity_type, entity_id, reason) VALUES (?, ?, ?)',
        ['borrower', loan.borrower_id, `הלוואה #${loan.id} הועברה לערב - חוב לא שולם`]
      )

      setSnackbar({ open: true, message: 'החוב הועבר לערב/ים בהצלחה והלווה נוסף לרשימה השחורה', severity: 'success' })
      setTransferDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Error transferring to guarantor:', error)
      setSnackbar({ open: true, message: 'שגיאה בהעברת החוב', severity: 'error' })
    }
  }

  const handleBorrowersReport = async () => {
    try {
      const borrowers = await borrowersService.getAll() as any[]
      const loans = await loansService.getAll() as any[]
      
      const borrowersWithDebt = borrowers.map(b => {
        const borrowerLoans = loans.filter(l => l.borrower_id === b.id && l.status === 'active')
        const totalDebt = borrowerLoans.reduce((sum, l) => sum + (l.remaining || 0), 0)
        return {
          name: `${b.first_name} ${b.last_name}`,
          loanCount: borrowerLoans.length,
          totalDebt
        }
      }).filter(b => b.totalDebt > 0).sort((a, b) => b.totalDebt - a.totalDebt)

      const activeLoans = loans.filter(l => l.status === 'active')
      const deposits = await db.query("SELECT * FROM deposits WHERE status = 'active'") as any[]
      const donations = await db.query("SELECT * FROM donations") as any[]

      const totalLoanAmount = activeLoans.reduce((sum, l) => sum + (l.remaining || 0), 0)
      const totalDepositAmount = deposits.reduce((sum, d) => sum + d.amount, 0)
      const totalDonationAmount = donations.reduce((sum, d) => sum + d.amount, 0)

      setBorrowersReportData({
        borrowers: borrowersWithDebt,
        stats: {
          totalLoans: loans.length,
          activeLoans: activeLoans.length,
          totalLoanAmount,
          totalDeposits: deposits.length,
          totalDepositAmount,
          totalDonations: donations.length,
          totalDonationAmount,
          availableCash: totalDepositAmount + totalDonationAmount - totalLoanAmount
        }
      })
      setBorrowersReportDialogOpen(true)
    } catch (error) {
      console.error('Error loading borrowers report:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הדו"ח', severity: 'error' })
    }
  }

  const handlePrintBorrowersReport = () => {
    const printContent = document.getElementById('borrowers-report-content')
    if (!printContent) return
    
    const logoHtml = settings.gemach_logo 
      ? `<img src="${settings.gemach_logo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />`
      : ''
    
    const printHtml = `
      <html dir="rtl">
        <head>
          <title>דו"ח לווים</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; margin: 10px 0; }
            h2 { font-size: 18px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background: #f5f5f5; }
            .summary { margin: 15px 0; padding: 10px; background: #f9f9f9; border-radius: 8px; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${logoHtml}
          <h1>📋 דו"ח לווים</h1>
          <h2>${settings.gemach_name || 'גמ"ח שלי'}</h2>
          <p style="text-align: center; color: #999;">תאריך: ${new Date().toLocaleDateString('he-IL')}</p>
          ${printContent.innerHTML}
        </body>
      </html>
    `
    
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentWindow?.document
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(printHtml)
      iframeDoc.close()
      
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    }
    
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }

  const handleDepositorsReport = async () => {
    try {
      const deposits = await db.query(`
        SELECT d.*, dp.first_name || ' ' || dp.last_name as depositor_name
        FROM deposits d
        JOIN depositors dp ON d.depositor_id = dp.id
        WHERE d.status = 'active'
      `) as any[]

      const totalAmount = deposits.reduce((sum, d) => sum + d.amount, 0)
      
      setDepositorsReportData({ deposits, totalAmount })
      setDepositorsReportDialogOpen(true)
    } catch (error) {
      console.error('Error loading depositors report:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הדו"ח', severity: 'error' })
    }
  }

  const handlePrintDepositorsReport = () => {
    const printContent = document.getElementById('depositors-report-content')
    if (!printContent) return
    
    const logoHtml = settings.gemach_logo 
      ? `<img src="${settings.gemach_logo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />`
      : ''
    
    const printHtml = `
      <html dir="rtl">
        <head>
          <title>דו"ח מפקידים</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1, h2 { text-align: center; margin: 10px 0; }
            h2 { font-size: 18px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background: #f5f5f5; }
            .summary { font-size: 18px; margin: 15px 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${logoHtml}
          <h1>📋 דו"ח מפקידים</h1>
          <h2>${settings.gemach_name || 'גמ"ח שלי'}</h2>
          <p style="text-align: center; color: #999;">תאריך: ${new Date().toLocaleDateString('he-IL')}</p>
          ${printContent.innerHTML}
        </body>
      </html>
    `
    
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentWindow?.document
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(printHtml)
      iframeDoc.close()
      
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    }
    
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }

  const handleStatisticsReport = async () => {
    try {
      const loans = await loansService.getAll() as any[]
      const allDeposits = await db.query("SELECT * FROM deposits") as any[]
      const deposits = allDeposits.filter(d => d.status === 'active')
      const withdrawnDeposits = allDeposits.filter(d => d.status === 'withdrawn')
      const donations = await db.query("SELECT * FROM donations") as any[]
      const repayments = await db.query("SELECT * FROM repayments") as any[]
      const expensesData = await statsService.getExpenses() as any[]
      const gemachExpenses = expensesData.filter(e => e.paid_by === 'gemach')
      const guarantorLoansData = await guarantorLoansService.getAllWithDetails()

      // Calculate totals
      const totalLoansOut = loans.reduce((sum, l) => sum + (l.amount || 0), 0)
      const totalRepaymentsIn = repayments.reduce((sum, r) => sum + (r.amount || 0), 0)
      const totalDepositsIn = deposits.reduce((sum, d) => sum + (d.amount || 0), 0)
      const totalDonationsIn = donations.reduce((sum, d) => sum + (d.amount || 0), 0)
      const totalWithdrawalsOut = withdrawnDeposits.reduce((sum, d) => sum + (d.amount || 0), 0)
      const totalExpensesOut = gemachExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)

      const totalIn = totalRepaymentsIn + totalDepositsIn + totalDonationsIn
      const totalOut = totalLoansOut + totalWithdrawalsOut
      const netBeforeExpenses = totalIn - totalOut
      const netFinal = netBeforeExpenses - totalExpensesOut

      // Group by payment method
      const methodLabels: Record<string, string> = {
        cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', '': 'לא צוין'
      }

      const groupByMethod = (items: any[], amountField = 'amount', methodField = 'payment_method') => {
        const result: Record<string, { count: number; total: number }> = {}
        for (const item of items) {
          const method = item[methodField] || ''
          if (!result[method]) result[method] = { count: 0, total: 0 }
          result[method].count++
          result[method].total += item[amountField] || 0
        }
        return result
      }

      // Get payment method stats
      const paymentMethodStats = await statsService.getPaymentMethodStats()

      setFullStats({
        summary: {
          totalIn,
          totalOut,
          netBeforeExpenses,
          expenses: totalExpensesOut,
          netFinal
        },
        paymentMethodSummary: paymentMethodStats,
        loans: { byMethod: groupByMethod(loans) },
        repayments: { byMethod: groupByMethod(repayments) },
        deposits: { byMethod: groupByMethod(deposits) },
        donations: { byMethod: groupByMethod(donations) },
        guarantorLoans: {
          count: guarantorLoansData.length,
          totalAmount: guarantorLoansData.reduce((sum, gl) => sum + gl.amount, 0),
          totalRemaining: guarantorLoansData.filter(gl => gl.status === 'active').reduce((sum, gl) => sum + gl.remaining, 0)
        }
      })
      setFullStatsDialogOpen(true)
    } catch (error) {
      console.error('Error loading statistics:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הסטטיסטיקות', severity: 'error' })
    }
  }

  const handlePrintFullStats = () => {
    const printContent = document.getElementById('full-stats-content')
    if (!printContent) return
    
    const logoHtml = settings.gemach_logo 
      ? `<img src="${settings.gemach_logo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />`
      : ''
    
    const printHtml = `
      <html dir="rtl">
        <head>
          <title>דו"ח סטטיסטיקות מורחב</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1, h2, h3 { text-align: center; margin: 10px 0; }
            h2 { font-size: 18px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background: #f5f5f5; }
            .summary-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .in { color: #388e3c; }
            .out { color: #d32f2f; }
            .section { margin: 25px 0; page-break-inside: avoid; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${logoHtml}
          <h1>📊 דו"ח סטטיסטיקות מורחב</h1>
          <h2>${settings.gemach_name || 'גמ"ח שלי'}</h2>
          <p style="text-align: center; color: #999;">תאריך: ${new Date().toLocaleDateString('he-IL')}</p>
          ${printContent.innerHTML}
        </body>
      </html>
    `
    
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentWindow?.document
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(printHtml)
      iframeDoc.close()
      
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    }
    
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }

  const handleOpenPaymentStats = async () => {
    try {
      const stats = await statsService.getPaymentMethodStats()
      setPaymentStats(stats)
      setPaymentStatsDialogOpen(true)
    } catch (error) {
      console.error('Error loading payment stats:', error)
      setSnackbar({ open: true, message: 'שגיאה בטעינת הנתונים', severity: 'error' })
    }
  }

  const handlePrintPaymentStats = () => {
    const printContent = document.getElementById('payment-stats-table')
    if (!printContent) return
    
    const logoHtml = settings.gemach_logo 
      ? `<img src="${settings.gemach_logo}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;" />`
      : ''
    
    const printHtml = `
      <html dir="rtl">
        <head>
          <title>סטטיסטיקות אמצעי תשלום</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
            th { background: #f5f5f5; }
            .out { color: #d32f2f; }
            .in { color: #388e3c; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          ${logoHtml}
          <h1>💳 סטטיסטיקות לפי אמצעי תשלום</h1>
          <p style="text-align: center;">${settings.gemach_name || 'גמ"ח שלי'}</p>
          <p style="text-align: center;">תאריך: ${new Date().toLocaleDateString('he-IL')}</p>
          <p style="text-align: center; font-size: 12px; color: #666;">* הוצאות = הוצאות הנהלת הגמ"ח בלבד</p>
          ${printContent.outerHTML}
        </body>
      </html>
    `
    
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)
    
    const iframeDoc = iframe.contentWindow?.document
    if (iframeDoc) {
      iframeDoc.open()
      iframeDoc.write(printHtml)
      iframeDoc.close()
      
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    }
    
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }

  const handleAddExpense = async () => {
    if (!expenseForm.description || !expenseForm.amount) {
      setSnackbar({ open: true, message: 'נא למלא תיאור וסכום', severity: 'error' })
      return
    }
    
    if (expenseForm.paid_by === 'borrower' && !expenseForm.borrower_id) {
      setSnackbar({ open: true, message: 'נא לבחור לווה', severity: 'error' })
      return
    }

    try {
      const paymentDetails = JSON.stringify(expensePaymentData)
      
      if (editingExpense) {
        // Update existing expense
        await statsService.updateExpense(editingExpense.id, {
          description: expenseForm.description,
          amount: parseFloat(expenseForm.amount),
          expense_date: expenseForm.expense_date,
          category: expenseForm.category,
          paid_by: expenseForm.paid_by,
          borrower_id: expenseForm.paid_by === 'borrower' ? expenseForm.borrower_id : undefined,
          payment_method: expensePaymentData.payment_method,
          payment_details: paymentDetails,
          notes: expenseForm.notes
        })
        setSnackbar({ open: true, message: 'ההוצאה עודכנה בהצלחה', severity: 'success' })
      } else {
        // Add new expense
        await statsService.addExpense({
          description: expenseForm.description,
          amount: parseFloat(expenseForm.amount),
          expense_date: expenseForm.expense_date,
          category: expenseForm.category,
          paid_by: expenseForm.paid_by,
          borrower_id: expenseForm.paid_by === 'borrower' ? expenseForm.borrower_id : undefined,
          payment_method: expensePaymentData.payment_method,
          payment_details: paymentDetails,
          notes: expenseForm.notes
        })
        setSnackbar({ open: true, message: 'ההוצאה נוספה בהצלחה', severity: 'success' })
      }

      handleCloseExpenseDialog()
      loadData()
    } catch (error) {
      console.error('Error saving expense:', error)
      setSnackbar({ open: true, message: 'שגיאה בשמירת ההוצאה', severity: 'error' })
    }
  }

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setExpenseForm({
      description: expense.description,
      amount: String(expense.amount),
      expense_date: expense.expense_date,
      category: expense.category,
      paid_by: expense.paid_by,
      borrower_id: expense.borrower_id || null,
      payment_method: expense.payment_method || '',
      payment_details: expense.payment_details || '',
      notes: expense.notes || ''
    })
    // Parse payment details
    try {
      const parsed = expense.payment_details ? JSON.parse(expense.payment_details) : { payment_method: expense.payment_method || '' }
      setExpensePaymentData(parsed)
    } catch {
      setExpensePaymentData({ payment_method: expense.payment_method || '' })
    }
    setExpenseDialogOpen(true)
  }

  const handleCloseExpenseDialog = () => {
    setExpenseDialogOpen(false)
    setEditingExpense(null)
    setExpenseForm({
      description: '',
      amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      category: 'fee',
      paid_by: 'gemach',
      borrower_id: null,
      payment_method: '',
      payment_details: '',
      notes: ''
    })
    setExpensePaymentData({ payment_method: '' })
  }

  const handleDeleteExpense = async (id: number) => {
    if (!confirm('האם למחוק את ההוצאה?')) return
    
    try {
      await statsService.deleteExpense(id)
      setSnackbar({ open: true, message: 'ההוצאה נמחקה', severity: 'success' })
      loadData()
    } catch (error) {
      console.error('Error deleting expense:', error)
      setSnackbar({ open: true, message: 'שגיאה במחיקה', severity: 'error' })
    }
  }

  const handleGenerateExpenseReceipt = (expense: Expense) => {
    if (expense.paid_by !== 'borrower' || !expense.borrower_name) {
      setSnackbar({ open: true, message: 'קבלה זמינה רק להוצאות ששולמו ע"י לווה', severity: 'error' })
      return
    }
    
    generateExpenseReceipt({
      gemachName: settings.gemach_name || 'גמ"ח שלי',
      gemachLogo: settings.gemach_logo,
      borrowerName: expense.borrower_name,
      expense: {
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        expense_date: expense.expense_date,
        category: expense.category,
        payment_method: expense.payment_method
      },
      receiptNumber: expense.id,
      dateFormat: settings.date_format
    })
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Backup & Restore */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                📦 גיבוי ושחזור
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  startIcon={<ExportIcon />}
                  onClick={handleExport}
                >
                  יצוא לגיבוי
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ImportIcon />}
                  onClick={handleImport}
                >
                  יבוא מגיבוי
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ImportIcon />}
                  onClick={() => setExcelImportDialogOpen(true)}
                  color="success"
                >
                  יבוא מאקסל
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ExportIcon />}
                  onClick={handleExportToExcel}
                  color="info"
                >
                  יצוא לאקסל
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Reports */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                📊 דוחות
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button variant="outlined" startIcon={<ReportIcon />} onClick={handleBorrowersReport}>
                  דו"ח לווים
                </Button>
                <Button variant="outlined" startIcon={<ReportIcon />} onClick={handleDepositorsReport}>
                  דו"ח מפקידים
                </Button>
                <Button variant="outlined" startIcon={<ReportIcon />} onClick={handleStatisticsReport}>
                  סטטיסטיקות
                </Button>
                {settings.show_payment_method === 'yes' && (
                  <Button variant="outlined" startIcon={<PaymentIcon />} onClick={handleOpenPaymentStats} color="secondary">
                    סטטיסטיקות אמצעי תשלום
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Overdue Loans */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <WarningIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="h6">
                  הלוואות שפג תוקפן ({overdueLoans.length})
                </Typography>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'warning.light' }}>
                      <TableCell>לווה</TableCell>
                      <TableCell align="center">סכום מקורי</TableCell>
                      <TableCell align="center">יתרה</TableCell>
                      <TableCell align="center">תאריך פירעון</TableCell>
                      <TableCell align="center">פעולות</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {overdueLoans.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">אין הלוואות באיחור 🎉</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      overdueLoans.map((loan) => (
                        <TableRow key={loan.id}>
                          <TableCell>{loan.borrower_name}</TableCell>
                          <TableCell align="center">{formatCurrency(loan.amount)}</TableCell>
                          <TableCell align="center">{formatCurrency(loan.remaining)}</TableCell>
                          <TableCell align="center">
                            <Chip label={formatDisplayDate(loan.due_date, settings.date_format)} color="error" size="small" />
                          </TableCell>
                          <TableCell align="center">
                            <Button 
                              size="small" 
                              variant="outlined"
                              onClick={() => handleTransferToGuarantor(loan)}
                              disabled={!loan.guarantor1_id && !loan.guarantor2_id}
                            >
                              העבר לערב
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Expenses */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ExpenseIcon color="warning" sx={{ mr: 1 }} />
                  <Typography variant="h6">
                    הוצאות הגמ"ח ({expenses.length})
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setExpenseDialogOpen(true)}
                >
                  הוסף הוצאה
                </Button>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.100' }}>
                      <TableCell>תיאור</TableCell>
                      <TableCell align="center">קטגוריה</TableCell>
                      <TableCell align="center">סכום</TableCell>
                      <TableCell align="center">תאריך</TableCell>
                      <TableCell align="center">שולם ע"י</TableCell>
                      <TableCell align="center">פעולות</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          אין הוצאות רשומות
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => {
                        const categoryLabels: Record<string, string> = {
                          fee: 'עמלה',
                          office: 'הוצאות משרד',
                          bank: 'עמלת בנק',
                          legal: 'משפטי',
                          other: 'אחר'
                        }
                        return (
                          <TableRow key={expense.id}>
                            <TableCell>{expense.description}</TableCell>
                            <TableCell align="center">
                              <Chip label={categoryLabels[expense.category] || expense.category} size="small" />
                            </TableCell>
                            <TableCell align="center" sx={{ color: 'error.main' }}>{formatCurrency(expense.amount)}</TableCell>
                            <TableCell align="center">{formatDisplayDate(expense.expense_date, settings.date_format)}</TableCell>
                            <TableCell align="center">
                              {expense.paid_by === 'gemach' ? (
                                <Chip label="הנהלת הגמ״ח" size="small" color="primary" />
                              ) : (
                                <Chip label={expense.borrower_name || 'לווה'} size="small" color="secondary" />
                              )}
                            </TableCell>
                            <TableCell align="center">
                              {expense.paid_by === 'borrower' ? (
                                <IconButton size="small" color="success" onClick={() => handleGenerateExpenseReceipt(expense)} title="הפק קבלה">
                                  <ReceiptDocIcon />
                                </IconButton>
                              ) : (
                                <IconButton size="small" disabled sx={{ visibility: 'hidden' }}>
                                  <ReceiptDocIcon />
                                </IconButton>
                              )}
                              <IconButton size="small" color="primary" onClick={() => handleEditExpense(expense)} title="עריכה">
                                <EditIcon />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleDeleteExpense(expense.id)} title="מחיקה">
                                <DeleteIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                    {expenses.length > 0 && (
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell colSpan={2}><strong>סה"כ הוצאות</strong></TableCell>
                        <TableCell align="center" sx={{ color: 'error.main' }}>
                          <strong>{formatCurrency(expenses.reduce((sum, e) => sum + e.amount, 0))}</strong>
                        </TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Blacklist */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <BlockIcon color="error" sx={{ mr: 1 }} />
                  <Typography variant="h6">
                    רשימה שחורה ({blacklist.length})
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setBlacklistDialogOpen(true)}
                >
                  הוסף לרשימה
                </Button>
              </Box>
              <List>
                {blacklist.length === 0 ? (
                  <ListItem>
                    <ListItemText
                      primary="הרשימה השחורה ריקה"
                      secondary="אין לווים או ערבים חסומים"
                    />
                  </ListItem>
                ) : (
                  blacklist.map((item) => (
                    <ListItem key={item.id} divider>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {item.name}
                            <Chip
                              label={item.entity_type === 'borrower' ? 'לווה' : 'ערב'}
                              size="small"
                              color={item.entity_type === 'borrower' ? 'primary' : 'secondary'}
                            />
                          </Box>
                        }
                        secondary={`סיבה: ${item.reason} | נוסף: ${formatDisplayDate(item.added_at?.split('T')[0], settings.date_format)}`}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          color="error"
                          onClick={() => handleRemoveFromBlacklist(item)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))
                )}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onClose={handleCloseExpenseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingExpense ? 'עריכת הוצאה' : 'הוספת הוצאה'}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="תיאור ההוצאה"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              required
            />
            <AmountInput
              fullWidth
              label="סכום"
              value={parseFloat(expenseForm.amount) || 0}
              onChange={(value) => setExpenseForm({ ...expenseForm, amount: String(value) })}
            />
            <TextField
              fullWidth
              label="תאריך"
              type="date"
              value={expenseForm.expense_date}
              onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>קטגוריה</InputLabel>
              <Select
                value={expenseForm.category}
                label="קטגוריה"
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
              >
                <MenuItem value="fee">עמלה</MenuItem>
                <MenuItem value="office">הוצאות משרד</MenuItem>
                <MenuItem value="bank">עמלת בנק</MenuItem>
                <MenuItem value="legal">משפטי</MenuItem>
                <MenuItem value="other">אחר</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>שולם על ידי</InputLabel>
              <Select
                value={expenseForm.paid_by}
                label="שולם על ידי"
                onChange={(e) => setExpenseForm({ ...expenseForm, paid_by: e.target.value as 'gemach' | 'borrower', borrower_id: null })}
              >
                <MenuItem value="gemach">הנהלת הגמ"ח</MenuItem>
                <MenuItem value="borrower">לווה</MenuItem>
              </Select>
            </FormControl>
            {expenseForm.paid_by === 'borrower' && (
              <Autocomplete
                options={borrowerOptions}
                getOptionLabel={(option) => option.name}
                value={borrowerOptions.find(b => b.id === expenseForm.borrower_id) || null}
                onChange={(_, value) => setExpenseForm({ ...expenseForm, borrower_id: value?.id || null })}
                renderInput={(params) => <TextField {...params} label="בחר לווה" required />}
              />
            )}
            {settings.show_payment_method === 'yes' && (
              <PaymentMethodSelect
                value={expensePaymentData as any}
                onChange={(data) => setExpensePaymentData(data as any)}
              />
            )}
            <TextField
              fullWidth
              label="הערות"
              multiline
              rows={2}
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExpenseDialog}>ביטול</Button>
          <Button variant="contained" onClick={handleAddExpense}>{editingExpense ? 'עדכן' : 'הוסף'}</Button>
        </DialogActions>
      </Dialog>

      {/* Blacklist Dialog */}
      <Dialog open={blacklistDialogOpen} onClose={() => setBlacklistDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>הוספה לרשימה שחורה</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>סוג</InputLabel>
              <Select
                value={blacklistForm.type}
                label="סוג"
                onChange={(e) => setBlacklistForm({ ...blacklistForm, type: e.target.value as 'borrower' | 'guarantor', entity: null })}
              >
                <MenuItem value="borrower">לווה</MenuItem>
                <MenuItem value="guarantor">ערב</MenuItem>
              </Select>
            </FormControl>
            <Autocomplete
              options={entityOptions.filter(e => e.type === blacklistForm.type)}
              getOptionLabel={(option) => option.name}
              value={blacklistForm.entity}
              onChange={(_, value) => setBlacklistForm({ ...blacklistForm, entity: value })}
              renderInput={(params) => (
                <TextField {...params} label={blacklistForm.type === 'borrower' ? 'בחר לווה' : 'בחר ערב'} />
              )}
            />
            <TextField
              fullWidth
              label="סיבה"
              multiline
              rows={2}
              value={blacklistForm.reason}
              onChange={(e) => setBlacklistForm({ ...blacklistForm, reason: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlacklistDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" color="error" onClick={handleAddToBlacklist}>
            הוסף לרשימה
          </Button>
        </DialogActions>
      </Dialog>

      {/* Transfer to Guarantor Dialog */}
      <Dialog open={transferDialogOpen} onClose={() => setTransferDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>העברת חוב לערב</DialogTitle>
        <DialogContent>
          {transferData.loan && (
            <Box sx={{ pt: 1 }}>
              {/* Loan Info */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'warning.light' }}>
                <Typography variant="subtitle2">פרטי ההלוואה:</Typography>
                <Typography>לווה: <strong>{transferData.loan.borrower_name}</strong></Typography>
                <Typography>יתרת חוב: <strong>{formatCurrency(transferData.loan.remaining)}</strong></Typography>
                <Typography>תאריך פירעון: {formatDisplayDate(transferData.loan.due_date, settings.date_format)}</Typography>
              </Paper>

              {/* Guarantors */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>ערבים:</Typography>
              
              {transferData.guarantor1 && transferData.guarantor2 ? (
                // Two guarantors - show split options
                <Box>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>אופן חלוקה</InputLabel>
                    <Select
                      value={transferData.splitType}
                      label="אופן חלוקה"
                      onChange={(e) => {
                        const type = e.target.value as 'single' | 'equal' | 'custom'
                        const remaining = transferData.loan?.remaining || 0
                        setTransferData({
                          ...transferData,
                          splitType: type,
                          amount1: type === 'equal' ? Math.ceil(remaining / 2) : (type === 'single' ? remaining : transferData.amount1),
                          amount2: type === 'equal' ? Math.floor(remaining / 2) : (type === 'single' ? 0 : transferData.amount2)
                        })
                      }}
                    >
                      <MenuItem value="single">ערב אחד בלבד</MenuItem>
                      <MenuItem value="equal">חלוקה שווה</MenuItem>
                      <MenuItem value="custom">חלוקה מותאמת</MenuItem>
                    </Select>
                  </FormControl>

                  {transferData.splitType === 'single' && (
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>בחר ערב</InputLabel>
                      <Select
                        value={transferData.selectedGuarantor || ''}
                        label="בחר ערב"
                        onChange={(e) => setTransferData({ ...transferData, selectedGuarantor: e.target.value as 'g1' | 'g2' })}
                      >
                        <MenuItem value="g1">{transferData.guarantor1.first_name} {transferData.guarantor1.last_name}</MenuItem>
                        <MenuItem value="g2">{transferData.guarantor2.first_name} {transferData.guarantor2.last_name}</MenuItem>
                      </Select>
                    </FormControl>
                  )}

                  {(transferData.splitType === 'equal' || transferData.splitType === 'custom') && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {transferData.guarantor1.first_name} {transferData.guarantor1.last_name}
                        </Typography>
                        <AmountInput
                          fullWidth
                          label="סכום"
                          value={transferData.amount1}
                          onChange={(value) => setTransferData({ ...transferData, amount1: value })}
                          disabled={transferData.splitType === 'equal'}
                          size="small"
                        />
                      </Paper>
                      <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                        <Typography variant="body2" sx={{ mb: 1 }}>
                          {transferData.guarantor2.first_name} {transferData.guarantor2.last_name}
                        </Typography>
                        <AmountInput
                          fullWidth
                          label="סכום"
                          value={transferData.amount2}
                          onChange={(value) => setTransferData({ ...transferData, amount2: value })}
                          disabled={transferData.splitType === 'equal'}
                          size="small"
                        />
                      </Paper>
                    </Box>
                  )}
                </Box>
              ) : (
                // Single guarantor
                <Paper sx={{ p: 2, bgcolor: 'grey.100' }}>
                  <Typography>
                    {(transferData.guarantor1 || transferData.guarantor2)?.first_name}{' '}
                    {(transferData.guarantor1 || transferData.guarantor2)?.last_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    טלפון: {(transferData.guarantor1 || transferData.guarantor2)?.phone}
                  </Typography>
                </Paper>
              )}

              {/* Repayment Options */}
              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>אופן פירעון:</Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>סוג פירעון</InputLabel>
                <Select
                  value={transferData.repaymentType}
                  label="סוג פירעון"
                  onChange={(e) => setTransferData({ ...transferData, repaymentType: e.target.value as 'single' | 'monthly' })}
                >
                  <MenuItem value="single">תאריך פירעון חד-פעמי</MenuItem>
                  <MenuItem value="monthly">תשלומים חודשיים</MenuItem>
                </Select>
              </FormControl>

              {transferData.repaymentType === 'single' ? (
                <TextField
                  fullWidth
                  label="תאריך פירעון"
                  type="date"
                  value={transferData.dueDate}
                  onChange={(e) => setTransferData({ ...transferData, dueDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ mb: 2 }}
                />
              ) : (
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="מספר תשלומים"
                    type="number"
                    value={transferData.monthlyPayments}
                    onChange={(e) => setTransferData({ ...transferData, monthlyPayments: parseInt(e.target.value) || 1 })}
                    inputProps={{ min: 1 }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="תאריך התחלה"
                    type="date"
                    value={transferData.startDate}
                    onChange={(e) => setTransferData({ ...transferData, startDate: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                </Box>
              )}

              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  שים לב: הלווה המקורי ({transferData.loan.borrower_name}) יועבר אוטומטית לרשימה השחורה
                </Typography>
              </Alert>
              <Alert severity="info" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  ההלוואה תופיע בלשונית "ניהול ערבים" ותימחק אוטומטית אם הלווה המקורי יפרע את החוב
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransferDialogOpen(false)}>ביטול</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmTransfer}>
            אשר העברה
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payment Method Stats Dialog */}
      <Dialog open={paymentStatsDialogOpen} onClose={() => setPaymentStatsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>💳 סטטיסטיקות לפי אמצעי תשלום</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }} id="payment-stats-table">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>אמצעי תשלום</TableCell>
                  <TableCell align="center">הלוואות (יציאה)</TableCell>
                  <TableCell align="center">פירעונות (כניסה)</TableCell>
                  <TableCell align="center">תרומות (כניסה)</TableCell>
                  <TableCell align="center">הפקדות (כניסה)</TableCell>
                  <TableCell align="center">משיכות (יציאה)</TableCell>
                  <TableCell align="center">הוצאות (יציאה)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentStats ? Object.entries(paymentStats).map(([method, data]) => {
                  const methodLabels: Record<string, string> = {
                    cash: 'מזומן',
                    credit: 'אשראי',
                    transfer: 'העברה',
                    check: "צ'ק",
                    other: 'אחר',
                    unknown: 'לא צוין'
                  }
                  const hasData = data.loansOut > 0 || data.repaymentsIn > 0 || data.donationsIn > 0 || data.depositsIn > 0 || data.withdrawalsOut > 0 || data.expensesOut > 0
                  if (!hasData) return null
                  return (
                    <TableRow key={method}>
                      <TableCell>{methodLabels[method] || method}</TableCell>
                      <TableCell align="center" sx={{ color: 'error.main' }} className="out">{data.loansOut > 0 ? formatCurrency(data.loansOut) : '-'}</TableCell>
                      <TableCell align="center" sx={{ color: 'success.main' }} className="in">{data.repaymentsIn > 0 ? formatCurrency(data.repaymentsIn) : '-'}</TableCell>
                      <TableCell align="center" sx={{ color: 'success.main' }} className="in">{data.donationsIn > 0 ? formatCurrency(data.donationsIn) : '-'}</TableCell>
                      <TableCell align="center" sx={{ color: 'success.main' }} className="in">{data.depositsIn > 0 ? formatCurrency(data.depositsIn) : '-'}</TableCell>
                      <TableCell align="center" sx={{ color: 'error.main' }} className="out">{data.withdrawalsOut > 0 ? formatCurrency(data.withdrawalsOut) : '-'}</TableCell>
                      <TableCell align="center" sx={{ color: 'error.main' }} className="out">{data.expensesOut > 0 ? formatCurrency(data.expensesOut) : '-'}</TableCell>
                    </TableRow>
                  )
                }) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>טוען נתונים...</TableCell>
                  </TableRow>
                )}
                {paymentStats && Object.values(paymentStats).every(d => d.loansOut === 0 && d.repaymentsIn === 0 && d.donationsIn === 0 && d.depositsIn === 0 && d.withdrawalsOut === 0 && d.expensesOut === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      אין עדיין נתונים עם אמצעי תשלום
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePrintPaymentStats} startIcon={<PrintIcon />}>הדפסה</Button>
          <Button onClick={() => setPaymentStatsDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* Borrowers Report Dialog */}
      <Dialog open={borrowersReportDialogOpen} onClose={() => setBorrowersReportDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>📋 דו"ח לווים - {settings.gemach_name || 'גמ"ח שלי'}</DialogTitle>
        <DialogContent>
          <Box id="borrowers-report-content" sx={{ pt: 1 }}>
            {borrowersReportData && (
              <>
                {/* Summary Stats */}
                <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6} md={4}>
                      <Typography variant="body2" color="text.secondary">סה"כ הלוואות</Typography>
                      <Typography variant="h6">{borrowersReportData.stats.totalLoans}</Typography>
                    </Grid>
                    <Grid item xs={6} md={4}>
                      <Typography variant="body2" color="text.secondary">הלוואות פעילות</Typography>
                      <Typography variant="h6">{borrowersReportData.stats.activeLoans}</Typography>
                    </Grid>
                    <Grid item xs={6} md={4}>
                      <Typography variant="body2" color="text.secondary">סה"כ חוב</Typography>
                      <Typography variant="h6" color="error.main">{formatCurrency(borrowersReportData.stats.totalLoanAmount)}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                <Typography variant="h6" sx={{ mb: 2 }}>
                  לווים עם חוב פעיל ({borrowersReportData.borrowers.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell align="center">#</TableCell>
                        <TableCell>שם הלווה</TableCell>
                        <TableCell align="center">מספר הלוואות</TableCell>
                        <TableCell align="center">סה"כ חוב</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {borrowersReportData.borrowers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                            אין לווים עם חוב פעיל 🎉
                          </TableCell>
                        </TableRow>
                      ) : (
                        borrowersReportData.borrowers.map((b, i) => (
                          <TableRow key={i}>
                            <TableCell align="center">{i + 1}</TableCell>
                            <TableCell>{b.name}</TableCell>
                            <TableCell align="center">{b.loanCount}</TableCell>
                            <TableCell align="center" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                              {formatCurrency(b.totalDebt)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {borrowersReportData.borrowers.length > 0 && (
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell colSpan={3}><strong>סה"כ</strong></TableCell>
                          <TableCell align="center" sx={{ color: 'error.main' }}>
                            <strong>{formatCurrency(borrowersReportData.borrowers.reduce((sum, b) => sum + b.totalDebt, 0))}</strong>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePrintBorrowersReport} startIcon={<PrintIcon />}>הדפסה</Button>
          <Button onClick={() => setBorrowersReportDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* Depositors Report Dialog */}
      <Dialog open={depositorsReportDialogOpen} onClose={() => setDepositorsReportDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>📋 דו"ח מפקידים - {settings.gemach_name || 'גמ"ח שלי'}</DialogTitle>
        <DialogContent>
          <Box id="depositors-report-content" sx={{ pt: 1 }}>
            {depositorsReportData && (
              <>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  סה"כ הפקדות פעילות: {formatCurrency(depositorsReportData.totalAmount)} ({depositorsReportData.deposits.length} הפקדות)
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell align="center">#</TableCell>
                        <TableCell>מפקיד</TableCell>
                        <TableCell align="center">סכום</TableCell>
                        <TableCell align="center">תאריך הפקדה</TableCell>
                        <TableCell align="center">סוג תקופה</TableCell>
                        <TableCell align="center">תאריך פירעון</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {depositorsReportData.deposits.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                            אין הפקדות פעילות
                          </TableCell>
                        </TableRow>
                      ) : (
                        depositorsReportData.deposits.map((d, i) => (
                          <TableRow key={d.id}>
                            <TableCell align="center">{i + 1}</TableCell>
                            <TableCell>{d.depositor_name}</TableCell>
                            <TableCell align="center">{formatCurrency(d.amount)}</TableCell>
                            <TableCell align="center">{formatDisplayDate(d.deposit_date, settings.date_format)}</TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={d.period_type === 'fixed' ? 'קבועה' : 'גמישה'} 
                                size="small" 
                                color={d.period_type === 'fixed' ? 'primary' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="center">
                              {d.due_date ? formatDisplayDate(d.due_date, settings.date_format) : '-'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {depositorsReportData.deposits.length > 0 && (
                        <TableRow sx={{ bgcolor: 'grey.50' }}>
                          <TableCell colSpan={2}><strong>סה"כ</strong></TableCell>
                          <TableCell align="center">
                            <strong>{formatCurrency(depositorsReportData.totalAmount)}</strong>
                          </TableCell>
                          <TableCell colSpan={3} />
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePrintDepositorsReport} startIcon={<PrintIcon />}>הדפסה</Button>
          <Button onClick={() => setDepositorsReportDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* Full Statistics Dialog */}
      <Dialog open={fullStatsDialogOpen} onClose={() => setFullStatsDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>📊 דו"ח סטטיסטיקות מורחב - {settings.gemach_name || 'גמ"ח שלי'}</DialogTitle>
        <DialogContent>
          <Box id="full-stats-content" sx={{ pt: 1 }}>
            {fullStats && (
              <>
                {/* Financial Summary */}
                <Typography variant="h6" sx={{ mb: 2, borderBottom: '2px solid #1976d2', pb: 1 }}>
                  💰 סיכום כספי כללי
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>סה"כ נכנס (פירעונות + הפקדות + תרומות)</TableCell>
                        <TableCell align="left" sx={{ color: 'success.main', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {formatCurrency(fullStats.summary.totalIn)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>סה"כ יצא (הלוואות + משיכות)</TableCell>
                        <TableCell align="left" sx={{ color: 'error.main', fontWeight: 'bold', fontSize: '1.1rem' }}>
                          {formatCurrency(fullStats.summary.totalOut)}
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>נטו (לפני הוצאות)</TableCell>
                        <TableCell align="left" sx={{ fontWeight: 'bold', fontSize: '1.1rem', color: fullStats.summary.netBeforeExpenses >= 0 ? 'success.main' : 'error.main' }}>
                          {formatCurrency(fullStats.summary.netBeforeExpenses)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>הוצאות הנהלת הגמ"ח</TableCell>
                        <TableCell align="left" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                          {formatCurrency(fullStats.summary.expenses)}
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ bgcolor: fullStats.summary.netFinal >= 0 ? 'success.light' : 'error.light' }}>
                        <TableCell sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>נטו סופי</TableCell>
                        <TableCell align="left" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                          {formatCurrency(fullStats.summary.netFinal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Payment Method Summary */}
                <Typography variant="h6" sx={{ mb: 2, borderBottom: '2px solid #1976d2', pb: 1 }}>
                  💳 סיכום לפי אמצעי תשלום
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell>אמצעי תשלום</TableCell>
                        <TableCell align="center">הלוואות (יציאה)</TableCell>
                        <TableCell align="center">פירעונות (כניסה)</TableCell>
                        <TableCell align="center">תרומות (כניסה)</TableCell>
                        <TableCell align="center">הפקדות (כניסה)</TableCell>
                        <TableCell align="center">משיכות (יציאה)</TableCell>
                        <TableCell align="center">הוצאות (יציאה)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(fullStats.paymentMethodSummary).map(([method, data]) => {
                        const methodLabels: Record<string, string> = {
                          cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', unknown: 'לא צוין'
                        }
                        const hasData = data.loansOut > 0 || data.repaymentsIn > 0 || data.donationsIn > 0 || data.depositsIn > 0 || data.withdrawalsOut > 0 || data.expensesOut > 0
                        if (!hasData) return null
                        return (
                          <TableRow key={method}>
                            <TableCell>{methodLabels[method] || method}</TableCell>
                            <TableCell align="center" sx={{ color: 'error.main' }}>{data.loansOut > 0 ? formatCurrency(data.loansOut) : '-'}</TableCell>
                            <TableCell align="center" sx={{ color: 'success.main' }}>{data.repaymentsIn > 0 ? formatCurrency(data.repaymentsIn) : '-'}</TableCell>
                            <TableCell align="center" sx={{ color: 'success.main' }}>{data.donationsIn > 0 ? formatCurrency(data.donationsIn) : '-'}</TableCell>
                            <TableCell align="center" sx={{ color: 'success.main' }}>{data.depositsIn > 0 ? formatCurrency(data.depositsIn) : '-'}</TableCell>
                            <TableCell align="center" sx={{ color: 'error.main' }}>{data.withdrawalsOut > 0 ? formatCurrency(data.withdrawalsOut) : '-'}</TableCell>
                            <TableCell align="center" sx={{ color: 'error.main' }}>{data.expensesOut > 0 ? formatCurrency(data.expensesOut) : '-'}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Detailed by Type */}
                <Typography variant="h6" sx={{ mb: 2, borderBottom: '2px solid #1976d2', pb: 1 }}>
                  📋 פירוט מפורט לפי סוג פעולה
                </Typography>
                
                <Grid container spacing={2}>
                  {/* Loans */}
                  <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'error.main' }}>
                        📤 הלוואות שניתנו
                      </Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell>אמצעי תשלום</TableCell>
                            <TableCell align="center">מספר</TableCell>
                            <TableCell align="center">סכום</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(fullStats.loans.byMethod).map(([method, data]) => (
                            <TableRow key={method}>
                              <TableCell>{{ cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', '': 'לא צוין' }[method] || method}</TableCell>
                              <TableCell align="center">{data.count}</TableCell>
                              <TableCell align="center">{formatCurrency(data.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>סה"כ</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{Object.values(fullStats.loans.byMethod).reduce((s, d) => s + d.count, 0)}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{formatCurrency(Object.values(fullStats.loans.byMethod).reduce((s, d) => s + d.total, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Paper>
                  </Grid>

                  {/* Repayments */}
                  <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'success.main' }}>
                        📥 פירעונות שהתקבלו
                      </Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell>אמצעי תשלום</TableCell>
                            <TableCell align="center">מספר</TableCell>
                            <TableCell align="center">סכום</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(fullStats.repayments.byMethod).map(([method, data]) => (
                            <TableRow key={method}>
                              <TableCell>{{ cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', '': 'לא צוין' }[method] || method}</TableCell>
                              <TableCell align="center">{data.count}</TableCell>
                              <TableCell align="center">{formatCurrency(data.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>סה"כ</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{Object.values(fullStats.repayments.byMethod).reduce((s, d) => s + d.count, 0)}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{formatCurrency(Object.values(fullStats.repayments.byMethod).reduce((s, d) => s + d.total, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Paper>
                  </Grid>

                  {/* Deposits */}
                  <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'success.main' }}>
                        🏦 הפקדות שהתקבלו
                      </Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell>אמצעי תשלום</TableCell>
                            <TableCell align="center">מספר</TableCell>
                            <TableCell align="center">סכום</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(fullStats.deposits.byMethod).map(([method, data]) => (
                            <TableRow key={method}>
                              <TableCell>{{ cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', '': 'לא צוין' }[method] || method}</TableCell>
                              <TableCell align="center">{data.count}</TableCell>
                              <TableCell align="center">{formatCurrency(data.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>סה"כ</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{Object.values(fullStats.deposits.byMethod).reduce((s, d) => s + d.count, 0)}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{formatCurrency(Object.values(fullStats.deposits.byMethod).reduce((s, d) => s + d.total, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Paper>
                  </Grid>

                  {/* Donations */}
                  <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1, color: 'success.main' }}>
                        🎁 תרומות שהתקבלו
                      </Typography>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: 'grey.50' }}>
                            <TableCell>אמצעי תשלום</TableCell>
                            <TableCell align="center">מספר</TableCell>
                            <TableCell align="center">סכום</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.entries(fullStats.donations.byMethod).map(([method, data]) => (
                            <TableRow key={method}>
                              <TableCell>{{ cash: 'מזומן', credit: 'אשראי', transfer: 'העברה', check: "צ'ק", other: 'אחר', '': 'לא צוין' }[method] || method}</TableCell>
                              <TableCell align="center">{data.count}</TableCell>
                              <TableCell align="center">{formatCurrency(data.total)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow sx={{ bgcolor: 'grey.100' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>סה"כ</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{Object.values(fullStats.donations.byMethod).reduce((s, d) => s + d.count, 0)}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{formatCurrency(Object.values(fullStats.donations.byMethod).reduce((s, d) => s + d.total, 0))}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Guarantor Loans Summary */}
                <Typography variant="h6" sx={{ mt: 3, mb: 2, borderBottom: '2px solid #1976d2', pb: 1 }}>
                  🤝 הלוואות מועברות לערבים
                </Typography>
                <Paper sx={{ p: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 2 }}>
                        <Typography variant="h4">{fullStats.guarantorLoans.count}</Typography>
                        <Typography variant="body2">מספר הלוואות מועברות</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 2 }}>
                        <Typography variant="h5">{formatCurrency(fullStats.guarantorLoans.totalAmount)}</Typography>
                        <Typography variant="body2">סה"כ סכום שהועבר</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={4}>
                      <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 2 }}>
                        <Typography variant="h5">{formatCurrency(fullStats.guarantorLoans.totalRemaining)}</Typography>
                        <Typography variant="body2">יתרת חובות ערבים</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handlePrintFullStats} startIcon={<PrintIcon />}>הדפסה</Button>
          <Button onClick={() => setFullStatsDialogOpen(false)}>סגור</Button>
        </DialogActions>
      </Dialog>

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        open={excelImportDialogOpen}
        onClose={() => setExcelImportDialogOpen(false)}
        onSuccess={() => {
          loadData()
          setSnackbar({ open: true, message: 'הנתונים יובאו בהצלחה!', severity: 'success' })
        }}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  )
}
