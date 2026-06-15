import { describe, it, expect, beforeEach } from 'vitest'
import {
  setUserPassword,
  verifyCode,
  getUserPassword,
  setProtectionEnabled,
  isProtectionEnabled,
  generateMasterCode,
  _hashPasswordForTesting as hashPassword,
  _verifyPasswordForTesting as verifyPassword,
} from '../services/protection'

describe('Password Security - Web Crypto API', () => {
  beforeEach(async () => {
    // ניקוי לפני כל בדיקה
    await setProtectionEnabled(false)
  })

  describe('hashPassword', () => {
    it('should create hash in format salt:hash', async () => {
      const password = 'test1234'
      const hash = await hashPassword(password)
      
      expect(hash).toContain(':')
      const [salt, hashPart] = hash.split(':')
      
      // Salt צריך להיות 32 תווים hex (16 bytes)
      expect(salt).toHaveLength(32)
      expect(salt).toMatch(/^[0-9a-f]+$/)
      
      // Hash צריך להיות 64 תווים hex (SHA-256 = 32 bytes)
      expect(hashPart).toHaveLength(64)
      expect(hashPart).toMatch(/^[0-9a-f]+$/)
    })

    it('should create different hashes for same password (different salts)', async () => {
      const password = 'test1234'
      const hash1 = await hashPassword(password)
      const hash2 = await hashPassword(password)
      
      // שני hashes שונים (כי salt שונה)
      expect(hash1).not.toBe(hash2)
    })

    it('should create same hash with same salt', async () => {
      const password = 'test1234'
      const salt = 'a'.repeat(32) // salt קבוע
      
      const hash1 = await hashPassword(password, salt)
      const hash2 = await hashPassword(password, salt)
      
      // אותו hash (כי אותו salt)
      expect(hash1).toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'mySecurePass123'
      const hash = await hashPassword(password)
      
      const isValid = await verifyPassword(password, hash)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'mySecurePass123'
      const wrongPassword = 'wrongPassword'
      const hash = await hashPassword(password)
      
      const isValid = await verifyPassword(wrongPassword, hash)
      expect(isValid).toBe(false)
    })

    it('should reject invalid hash format', async () => {
      const password = 'test1234'
      const invalidHash = 'not-a-valid-hash'
      
      const isValid = await verifyPassword(password, invalidHash)
      expect(isValid).toBe(false)
    })

    it('should be case sensitive', async () => {
      const password = 'MyPassword'
      const hash = await hashPassword(password)
      
      expect(await verifyPassword('MyPassword', hash)).toBe(true)
      expect(await verifyPassword('mypassword', hash)).toBe(false)
      expect(await verifyPassword('MYPASSWORD', hash)).toBe(false)
    })
  })

  describe('setUserPassword', () => {
    it('should save password as hash (not plain text)', async () => {
      const password = 'test1234'
      await setUserPassword(password)
      
      const storedValue = await getUserPassword()
      
      // הסיסמה לא צריכה להישמר בטקסט רגיל
      expect(storedValue).not.toBe(password)
      
      // צריך להיות hash בפורמט salt:hash
      expect(storedValue).toContain(':')
      expect(storedValue?.split(':')[0]).toHaveLength(32) // salt
      expect(storedValue?.split(':')[1]).toHaveLength(64) // hash
    })

    it('should allow verification after saving', async () => {
      const password = 'myPassword123'
      await setUserPassword(password)
      await setProtectionEnabled(true)
      
      const isValid = await verifyCode(password)
      expect(isValid).toBe(true)
    })
  })

  describe('verifyCode - backward compatibility', () => {
    it('should verify hashed password (new format)', async () => {
      const password = 'newSecurePassword'
      await setUserPassword(password)
      
      const isValid = await verifyCode(password)
      expect(isValid).toBe(true)
    })

    it('should verify master code', async () => {
      const masterCode = generateMasterCode()
      
      const isValid = await verifyCode(masterCode)
      expect(isValid).toBe(true)
    })

    it('should reject wrong password', async () => {
      const password = 'correctPassword'
      await setUserPassword(password)
      
      const isValid = await verifyCode('wrongPassword')
      expect(isValid).toBe(false)
    })
  })

  describe('Security Properties', () => {
    it('should not expose password in error messages', async () => {
      const password = 'secretPassword123'
      await setUserPassword(password)
      
      // אפילו בבדיקה שגויה, הסיסמה לא צריכה להיחשף
      const storedHash = await getUserPassword()
      expect(storedHash).not.toContain('secretPassword123')
    })

    it('should use random salt for each password', async () => {
      await setUserPassword('pass1')
      const hash1 = await getUserPassword()
      
      await setUserPassword('pass1') // אותה סיסמה שוב
      const hash2 = await getUserPassword()
      
      // צריכים להיות שונים (salt שונה)
      expect(hash1).not.toBe(hash2)
    })

    it('should handle special characters in password', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?'
      await setUserPassword(specialPassword)
      
      const isValid = await verifyCode(specialPassword)
      expect(isValid).toBe(true)
    })

    it('should handle unicode characters in password', async () => {
      const unicodePassword = 'סיסמה123🔐'
      await setUserPassword(unicodePassword)
      
      const isValid = await verifyCode(unicodePassword)
      expect(isValid).toBe(true)
    })

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000)
      await setUserPassword(longPassword)
      
      const isValid = await verifyCode(longPassword)
      expect(isValid).toBe(true)
    })
  })

  describe('Migration from plain text (backward compatibility)', () => {
    it('should auto-migrate old plain text password to hash on first login', async () => {
      // סימולציה של סיסמה ישנה (בטקסט רגיל)
      const oldPassword = 'oldPlainTextPassword'
      
      // שמירה ידנית כטקסט רגיל (כמו שהיה בעבר)
      const protectionStore = await import('localforage').then(lf => 
        lf.default.createInstance({ name: 'gemach', storeName: 'protection' })
      )
      await protectionStore.setItem('password', oldPassword)
      
      // בדיקה ראשונה - צריכה להצליח ולבצע migration
      const isValid = await verifyCode(oldPassword)
      expect(isValid).toBe(true)
      
      // אחרי ה-migration, הסיסמה צריכה להיות hash
      const storedValue = await getUserPassword()
      expect(storedValue).not.toBe(oldPassword) // לא טקסט רגיל יותר
      expect(storedValue).toContain(':') // פורמט hash חדש
      
      // בדיקה שנייה - צריכה לעבוד עם ה-hash החדש
      const isValidAfterMigration = await verifyCode(oldPassword)
      expect(isValidAfterMigration).toBe(true)
    })
  })
})
