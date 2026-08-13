import { useState, useEffect, useCallback } from 'react'
import localforage from 'localforage'

const settingsStore = localforage.createInstance({ name: 'gemach', storeName: 'settings' })

interface Settings {
  gemach_name: string
  gemach_logo: string
  gemach_document_frame: string
  risk_threshold: string
  field_labels: string
  id_required: string
  currency: string
  default_loan_months: string
  default_loan_type: string
  auto_backup: string
  auto_backup_path: string
  show_recurring_options: string
  show_waitlist_tab: string
  date_format: string
  show_payment_method: string
  email_provider: string
  loan_document_text: string
  deposit_document_text: string
  language: string
  report_repayments_order: 'newest_first' | 'oldest_first'
  report_page_border: 'yes' | 'no'
}

const defaultSettings: Settings = {
  gemach_name: 'גמ"ח שלי',
  gemach_logo: '',
  gemach_document_frame: '',
  risk_threshold: '50000',
  field_labels: '',
  id_required: 'optional',
  currency: 'ILS',
  default_loan_months: '12',
  default_loan_type: 'flexible',
  auto_backup: 'off',
  auto_backup_path: '',
  show_recurring_options: 'yes',
  show_waitlist_tab: 'yes',
  date_format: 'gregorian',
  show_payment_method: 'no',
  email_provider: 'gmail',
  loan_document_text: 'מאשר בזה כי לוויתי מהגמ״ח סכום כסף ואני מתחייב להחזירו במועד שנקבע.',
  deposit_document_text: 'ואני מתחייב להחזיר את הסכום בתנאים שנקבעו.',
  language: 'he',
  report_repayments_order: 'newest_first',
  report_page_border: 'no',
}

// Custom event for settings changes
const SETTINGS_CHANGED_EVENT = 'gemach-settings-changed'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    try {
      const loadedSettings = { ...defaultSettings } as Settings
      
      for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
        const value = await settingsStore.getItem<string>(key)
        if (value !== null) {
          (loadedSettings as any)[key] = value
        }
      }
      
      setSettings(loadedSettings)
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
    
    // Listen for settings changes from other components
    const handleSettingsChange = () => {
      loadSettings()
    }
    
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
  }, [loadSettings])

  const updateSetting = async (key: keyof Settings, value: string) => {
    try {
      await settingsStore.setItem(key, value)
      setSettings(prev => ({ ...prev, [key]: value }))
    } catch (error) {
      console.error('Error updating setting:', error)
    }
  }

  const refreshSettings = async () => {
    await loadSettings()
    // Notify other components that settings changed
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT))
  }

  return { settings, loading, updateSetting, refreshSettings }
}
