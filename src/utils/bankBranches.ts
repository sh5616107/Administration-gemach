// Bank and Branch utilities
import banksData from '../data/snifim_he.json'

export interface Bank {
  code: string
  name: string
}

export interface BankBranch {
  bankCode: string
  branchCode: string
  branchName: string
  branchAddress: string
  city: string
}

interface RawBankData {
  Bank_Code: number
  Bank_Name: string
  Branch_Code: number
  Branch_Name: string
  Branch_Address: string
  City: string
}

let banksCache: Bank[] | null = null
let branchesCache: Map<string, BankBranch[]> | null = null

export function resetCache() {
  banksCache = null
  branchesCache = null
}

export async function getAllBanks(): Promise<Bank[]> {
  if (banksCache) return banksCache

  const data = banksData as RawBankData[]
  const banksMap = new Map<string, string>()

  for (const item of data) {
    const code = String(item.Bank_Code)
    if (!banksMap.has(code)) {
      banksMap.set(code, item.Bank_Name)
    }
  }

  banksCache = Array.from(banksMap.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))

  return banksCache
}

export async function getBankBranches(bankCode: string): Promise<BankBranch[]> {
  if (!branchesCache) {
    branchesCache = new Map()
    const data = banksData as RawBankData[]

    for (const item of data) {
      const code = String(item.Bank_Code)
      if (!branchesCache.has(code)) {
        branchesCache.set(code, [])
      }
      branchesCache.get(code)!.push({
        bankCode: code,
        branchCode: String(item.Branch_Code),
        branchName: item.Branch_Name,
        branchAddress: item.Branch_Address,
        city: item.City,
      })
    }
  }

  return branchesCache.get(bankCode) || []
}

export function formatBankDisplay(bank: Bank): string {
  return `${bank.code} - ${bank.name}`
}

export function formatBranchDisplay(branch: BankBranch): string {
  return `${branch.branchCode} - ${branch.branchName} (${branch.city})`
}
