import { useState, useEffect } from 'react'
import { getAllBanks, getBankBranches, formatBankDisplay, formatBranchDisplay, Bank, BankBranch, resetCache } from '../utils/bankBranches'

interface BankBranchSelectorProps {
  selectedBankCode?: string
  selectedBranchCode?: string
  onBankChange: (bankCode: string, bankName: string) => void
  onBranchChange: (branchCode: string, branchName: string, branchAddress: string, city: string) => void
  disabled?: boolean
  showLabels?: boolean
  bankLabel?: string
  branchLabel?: string
}

const BankBranchSelector = ({
  selectedBankCode = '',
  selectedBranchCode = '',
  onBankChange,
  onBranchChange,
  disabled = false,
  showLabels = true,
  bankLabel = 'בנק:',
  branchLabel = 'סניף:'
}: BankBranchSelectorProps) => {
  const [banks, setBanks] = useState<Bank[]>([])
  const [branches, setBranches] = useState<BankBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [internalBankCode, setInternalBankCode] = useState(selectedBankCode)
  const [internalBranchCode, setInternalBranchCode] = useState(selectedBranchCode)

  useEffect(() => {
    const loadBanks = async () => {
      try {
        console.log('🚀 BankBranchSelector: מתחיל לטעון בנקים...')
        // איפוס קאש לפיתוח
        resetCache()
        const allBanks = await getAllBanks()
        console.log('📋 BankBranchSelector: קיבל', allBanks.length, 'בנקים')
        console.log('🔍 BankBranchSelector: דוגמת בנקים:', allBanks.slice(0, 3).map(b => `${b.code} - ${b.name}`))
        setBanks(allBanks)
        setLoading(false)
      } catch (error) {
        console.error('❌ BankBranchSelector: שגיאה בטעינת בנקים:', error)
        setLoading(false)
      }
    }
    loadBanks()
  }, [])

  // סנכרון עם ערכים חיצוניים
  useEffect(() => {
    setInternalBankCode(selectedBankCode)
  }, [selectedBankCode])

  useEffect(() => {
    setInternalBranchCode(selectedBranchCode)
  }, [selectedBranchCode])

  useEffect(() => {
    const loadBranches = async () => {
      if (internalBankCode) {
        const bankBranches = await getBankBranches(internalBankCode)
        setBranches(bankBranches)
      } else {
        setBranches([])
      }
    }
    loadBranches()
  }, [internalBankCode])

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bankCode = e.target.value
    console.log('🏦 BankBranchSelector: בחירת בנק:', bankCode)
    const bank = banks.find(b => b.code === bankCode)
    console.log('🏦 BankBranchSelector: בנק נמצא:', bank)
    
    setInternalBankCode(bankCode)
    setInternalBranchCode('') // נקה סניף כשמשנים בנק
    
    if (bank) {
      console.log('🏦 BankBranchSelector: קורא ל-onBankChange עם:', bankCode, bank.name)
      onBankChange(bankCode, bank.name)
      // נקה את בחירת הסניף כשמשנים בנק
      onBranchChange('', '', '', '')
    } else {
      console.log('🏦 BankBranchSelector: מנקה בחירת בנק')
      onBankChange('', '')
      onBranchChange('', '', '', '')
    }
  }

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branchCode = e.target.value
    console.log('🏢 BankBranchSelector: בחירת סניף:', branchCode)
    const branch = branches.find(b => b.branchCode === branchCode)
    console.log('🏢 BankBranchSelector: סניף נמצא:', branch)
    
    setInternalBranchCode(branchCode)
    
    if (branch) {
      console.log('🏢 BankBranchSelector: קורא ל-onBranchChange עם:', branchCode, branch.branchName)
      onBranchChange(branchCode, branch.branchName, branch.branchAddress, branch.city)
    } else {
      console.log('🏢 BankBranchSelector: מנקה בחירת סניף')
      onBranchChange('', '', '', '')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span>טוען נתוני בנקים...</span>
      </div>
    )
  }



  return (
    <>
      {showLabels && <label>{bankLabel}</label>}
      <select
        value={internalBankCode}
        onChange={handleBankChange}
        disabled={disabled}
        onClick={() => console.log('🖱️ BankBranchSelector: לחיצה על select')}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer'
        }}
      >
        <option value="">בחר בנק</option>
        {banks.map(bank => (
          <option key={bank.code} value={bank.code}>
            {formatBankDisplay(bank)}
          </option>
        ))}
      </select>

      {internalBankCode && branches.length > 0 && (
        <>
          {showLabels && <label>{branchLabel}</label>}
          <select
            value={internalBranchCode}
            onChange={handleBranchChange}
            disabled={disabled}
          >
            <option value="">בחר סניף</option>
            {branches.map(branch => (
              <option key={branch.branchCode} value={branch.branchCode}>
                {formatBranchDisplay(branch)}
              </option>
            ))}
          </select>
        </>
      )}
    </>
  )
}

export default BankBranchSelector