import { describe, it, expect } from 'vitest'
import {
  ok,
  err,
  isOk,
  isErr,
  unwrapOr,
  unwrap,
  map,
  chain,
  combine,
  wrap,
  wrapAsync,
  formatError,
  type Result,
} from '../types/result'

describe('Result<T> Pattern', () => {
  describe('ok() - Success', () => {
    it('should create successful result', () => {
      const result = ok(42)
      
      expect(result.success).toBe(true)
      expect(result.data).toBe(42)
      expect(result.error).toBeNull()
    })

    it('should work with objects', () => {
      const user = { id: 1, name: 'Test' }
      const result = ok(user)
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual(user)
    })

    it('should work with arrays', () => {
      const items = [1, 2, 3]
      const result = ok(items)
      
      expect(result.success).toBe(true)
      expect(result.data).toEqual(items)
    })

    it('should work with null/undefined', () => {
      const result1 = ok(null)
      const result2 = ok(undefined)
      
      expect(result1.success).toBe(true)
      expect(result1.data).toBeNull()
      expect(result2.success).toBe(true)
      expect(result2.data).toBeUndefined()
    })
  })

  describe('err() - Failure', () => {
    it('should create error result', () => {
      const result = err('Something went wrong')
      
      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBe('Something went wrong')
    })

    it('should work with Hebrew errors', () => {
      const result = err('שגיאה קרתה')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('שגיאה קרתה')
    })
  })

  describe('isOk() and isErr()', () => {
    it('should identify success', () => {
      const result = ok(42)
      
      expect(isOk(result)).toBe(true)
      expect(isErr(result)).toBe(false)
    })

    it('should identify failure', () => {
      const result = err('Error')
      
      expect(isOk(result)).toBe(false)
      expect(isErr(result)).toBe(true)
    })

    it('should work as type guards', () => {
      const successResult: Result<number> = ok(42)
      
      if (isOk(successResult)) {
        // TypeScript knows result.data is number
        expect(successResult.data).toBe(42)
      }
      
      const errorResult: Result<number> = err('test error')
      
      if (isErr(errorResult)) {
        // TypeScript knows result.error is string
        expect(errorResult.error).toBeDefined()
      }
    })
  })

  describe('unwrapOr()', () => {
    it('should return data on success', () => {
      const result = ok(42)
      const value = unwrapOr(result, 0)
      
      expect(value).toBe(42)
    })

    it('should return default on failure', () => {
      const result = err('Error')
      const value = unwrapOr(result, 0)
      
      expect(value).toBe(0)
    })
  })

  describe('unwrap()', () => {
    it('should return data on success', () => {
      const result = ok(42)
      const value = unwrap(result)
      
      expect(value).toBe(42)
    })

    it('should throw on failure', () => {
      const result = err('Something went wrong')
      
      expect(() => unwrap(result)).toThrow('Something went wrong')
    })
  })

  describe('map()', () => {
    it('should transform success value', () => {
      const result = ok(5)
      const doubled = map(result, x => x * 2)
      
      expect(doubled.success).toBe(true)
      if (doubled.success) {
        expect(doubled.data).toBe(10)
      }
    })

    it('should pass through error', () => {
      const result = err('Error')
      const doubled = map(result, (x: number) => x * 2)
      
      expect(doubled.success).toBe(false)
      expect(doubled.error).toBe('Error')
    })

    it('should catch errors in mapper', () => {
      const result = ok('not a number')
      const parsed = map(result, x => {
        throw new Error('Parse error')
      })
      
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error).toBe('Parse error')
      }
    })
  })

  describe('chain()', () => {
    it('should chain successful results', () => {
      const result = ok(5)
      const chained = chain(result, x => ok(x * 2))
      
      expect(chained.success).toBe(true)
      if (chained.success) {
        expect(chained.data).toBe(10)
      }
    })

    it('should stop on first error', () => {
      const result = err('First error')
      const chained = chain(result, (x: number) => ok(x * 2))
      
      expect(chained.success).toBe(false)
      expect(chained.error).toBe('First error')
    })

    it('should propagate chained error', () => {
      const result = ok(5)
      const chained = chain(result, x => err('Second error'))
      
      expect(chained.success).toBe(false)
      expect(chained.error).toBe('Second error')
    })
  })

  describe('combine()', () => {
    it('should combine all successful results', () => {
      const results = [ok(1), ok(2), ok(3)]
      const combined = combine(results)
      
      expect(combined.success).toBe(true)
      if (combined.success) {
        expect(combined.data).toEqual([1, 2, 3])
      }
    })

    it('should fail if any result fails', () => {
      const results = [ok(1), err('Error 2'), ok(3)]
      const combined = combine(results)
      
      expect(combined.success).toBe(false)
      expect(combined.error).toBe('Error 2')
    })

    it('should work with empty array', () => {
      const results: Result<number>[] = []
      const combined = combine(results)
      
      expect(combined.success).toBe(true)
      if (combined.success) {
        expect(combined.data).toEqual([])
      }
    })
  })

  describe('wrap()', () => {
    it('should wrap successful function', () => {
      const result = wrap(() => 42)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(42)
      }
    })

    it('should catch errors', () => {
      const result = wrap(() => {
        throw new Error('Something went wrong')
      })
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Something went wrong')
      }
    })

    it('should handle JSON parsing', () => {
      const result = wrap(() => JSON.parse('{"name":"test"}'))
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'test' })
      }
    })

    it('should catch JSON parse errors', () => {
      const result = wrap(() => JSON.parse('invalid json'))
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('JSON')
      }
    })
  })

  describe('wrapAsync()', () => {
    it('should wrap successful async function', async () => {
      const result = await wrapAsync(async () => {
        return await Promise.resolve(42)
      })
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(42)
      }
    })

    it('should catch async errors', async () => {
      const result = await wrapAsync(async () => {
        throw new Error('Async error')
      })
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Async error')
      }
    })

    it('should catch rejected promises', async () => {
      const result = await wrapAsync(async () => {
        return await Promise.reject(new Error('Rejected'))
      })
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Rejected')
      }
    })
  })

  describe('formatError()', () => {
    it('should format Error objects', () => {
      const error = new Error('Test error')
      const formatted = formatError(error)
      
      expect(formatted).toBe('Test error')
    })

    it('should format string errors', () => {
      const formatted = formatError('String error')
      
      expect(formatted).toBe('String error')
    })

    it('should format other types', () => {
      expect(formatError(42)).toBe('42')
      expect(formatError({ message: 'obj' })).toContain('obj')
      expect(formatError(null)).toBe('null')
    })
  })

  describe('Real-world scenarios', () => {
    // סימולציה של service
    async function findUser(id: number): Promise<Result<{ id: number; name: string }>> {
      if (!id) {
        return err('User ID is required')
      }
      
      if (id === 999) {
        return err('User not found')
      }
      
      return ok({ id, name: `User ${id}` })
    }

    it('should handle service success', async () => {
      const result = await findUser(1)
      
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.id).toBe(1)
        expect(result.data.name).toBe('User 1')
      }
    })

    it('should handle validation error', async () => {
      const result = await findUser(0)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('User ID is required')
      }
    })

    it('should handle not found error', async () => {
      const result = await findUser(999)
      
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('User not found')
      }
    })

    it('should chain multiple operations', async () => {
      // קבלת משתמש → בדיקת הרשאה → עדכון
      const getUserResult = await findUser(1)
      
      const checkPermission = (user: { id: number; name: string }) => {
        if (user.id === 1) {
          return ok(user)
        }
        return err('No permission')
      }
      
      const updateUser = (user: { id: number; name: string }) => {
        return ok({ ...user, name: 'Updated' })
      }
      
      const final = chain(
        chain(getUserResult, checkPermission),
        updateUser
      )
      
      expect(final.success).toBe(true)
      if (final.success) {
        expect(final.data.name).toBe('Updated')
      }
    })
  })
})
