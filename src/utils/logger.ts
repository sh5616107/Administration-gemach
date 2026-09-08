/**
 * מערכת logging מרכזית
 * מאפשרת שליטה על רמות לוג, פורמט, ואפשרות לשמירה
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogConfig {
  level: LogLevel
  enableConsole: boolean
  enableStorage: boolean
  maxStoredLogs: number
}

const defaultConfig: LogConfig = {
  level: 'info',
  enableConsole: true,
  enableStorage: false,
  maxStoredLogs: 1000
}

let config: LogConfig = { ...defaultConfig }
const storedLogs: Array<{ timestamp: string; level: LogLevel; message: string; context?: any }> = []

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/**
 * הגדרת תצורת logger
 */
export function configureLogger(newConfig: Partial<LogConfig>): void {
  config = { ...config, ...newConfig }
}

/**
 * בדיקה האם רמת לוג צריכה להיות מוצגת
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level]
}

/**
 * שמירת לוג לזיכרון
 */
function storeLog(level: LogLevel, message: string, context?: any): void {
  if (!config.enableStorage) return
  
  storedLogs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    context
  })
  
  // שמירת מספר מוגבל של לוגים
  if (storedLogs.length > config.maxStoredLogs) {
    storedLogs.shift()
  }
}

/**
 * פורמט הודעת לוג
 */
function formatMessage(level: LogLevel, message: string, context?: any): string {
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`
  const contextStr = context ? ` ${JSON.stringify(context)}` : ''
  return `${prefix} ${message}${contextStr}`
}

/**
 * Logger functions
 */
export const logger = {
  debug(message: string, context?: any): void {
    if (!shouldLog('debug')) return
    
    storeLog('debug', message, context)
    if (config.enableConsole) {
      console.debug(formatMessage('debug', message, context))
    }
  },
  
  info(message: string, context?: any): void {
    if (!shouldLog('info')) return
    
    storeLog('info', message, context)
    if (config.enableConsole) {
      console.info(formatMessage('info', message, context))
    }
  },
  
  warn(message: string, context?: any): void {
    if (!shouldLog('warn')) return
    
    storeLog('warn', message, context)
    if (config.enableConsole) {
      console.warn(formatMessage('warn', message, context))
    }
  },
  
  error(message: string, context?: any): void {
    if (!shouldLog('error')) return
    
    storeLog('error', message, context)
    if (config.enableConsole) {
      console.error(formatMessage('error', message, context))
    }
  },
  
  /**
   * קבלת כל הלוגים השמורים
   */
  getLogs(): typeof storedLogs {
    return [...storedLogs]
  },
  
  /**
   * ניקוי לוגים שמורים
   */
  clearLogs(): void {
    storedLogs.length = 0
  },
  
  /**
   * הגדרת רמת לוג
   */
  setLevel(level: LogLevel): void {
    config.level = level
  }
}

// ייצוא ברירת מחדל
export default logger
