/**
 * Result<T> Pattern - Consistent Error Handling
 * 
 * מבנה עקבי לטיפול בתוצאות ושגיאות במערכת
 * במקום לזרוק exceptions, כל פונקציה מחזירה Result<T>
 * שמכיל או data (הצלחה) או error (כישלון)
 */

/**
 * תוצאה מוצלחת
 */
export interface Success<T> {
  success: true
  data: T
  error: null
}

/**
 * תוצאה כושלת
 */
export interface Failure {
  success: false
  data: null
  error: string
}

/**
 * Result type - או הצלחה או כישלון
 */
export type Result<T> = Success<T> | Failure

/**
 * פונקציות עזר ליצירת Result
 */

/**
 * יצירת תוצאה מוצלחת
 */
export function ok<T>(data: T): Success<T> {
  return {
    success: true,
    data,
    error: null,
  }
}

/**
 * יצירת תוצאה כושלת
 */
export function err(error: string): Failure {
  return {
    success: false,
    data: null,
    error,
  }
}

/**
 * טיפול בשגיאה והמרה למחרוזת
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

/**
 * Wrap פונקציה אסינכרונית ב-Result
 * 
 * @example
 * const result = await wrapAsync(async () => {
 *   return await fetchData()
 * })
 */
export async function wrapAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (error) {
    return err(formatError(error))
  }
}

/**
 * Wrap פונקציה סינכרונית ב-Result
 * 
 * @example
 * const result = wrap(() => {
 *   return JSON.parse(data)
 * })
 */
export function wrap<T>(fn: () => T): Result<T> {
  try {
    const data = fn()
    return ok(data)
  } catch (error) {
    return err(formatError(error))
  }
}

/**
 * בדיקה אם Result הוא הצלחה
 */
export function isOk<T>(result: Result<T>): result is Success<T> {
  return result.success === true
}

/**
 * בדיקה אם Result הוא כישלון
 */
export function isErr<T>(result: Result<T>): result is Failure {
  return result.success === false
}

/**
 * החזרת data או default value
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  return result.success ? result.data : defaultValue
}

/**
 * החזרת data או throw error
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.success) {
    return result.data
  }
  throw new Error(result.error)
}

/**
 * Map על Result (רק אם success)
 * 
 * @example
 * const result = ok(5)
 * const doubled = map(result, x => x * 2) // ok(10)
 */
export function map<T, U>(
  result: Result<T>,
  fn: (data: T) => U
): Result<U> {
  if (result.success) {
    try {
      return ok(fn(result.data))
    } catch (error) {
      return err(formatError(error))
    }
  }
  return err(result.error)
}

/**
 * Chain results (flatMap / andThen)
 * 
 * @example
 * const result = ok(5)
 * const chained = chain(result, x => ok(x * 2)) // ok(10)
 */
export function chain<T, U>(
  result: Result<T>,
  fn: (data: T) => Result<U>
): Result<U> {
  if (result.success) {
    try {
      return fn(result.data)
    } catch (error) {
      return err(formatError(error))
    }
  }
  return err(result.error)
}

/**
 * Combine multiple results
 * מחזיר הצלחה רק אם כל ה-results מוצלחים
 * 
 * @example
 * const r1 = ok(1)
 * const r2 = ok(2)
 * const combined = combine([r1, r2]) // ok([1, 2])
 */
export function combine<T>(results: Result<T>[]): Result<T[]> {
  const data: T[] = []
  
  for (const result of results) {
    if (!result.success) {
      return err(result.error)
    }
    data.push(result.data)
  }
  
  return ok(data)
}

/**
 * דוגמאות שימוש:
 * 
 * @example
 * // Service function
 * async function getUser(id: number): Promise<Result<User>> {
 *   if (!id) {
 *     return err('User ID is required')
 *   }
 *   
 *   const user = await db.getUser(id)
 *   
 *   if (!user) {
 *     return err(`User ${id} not found`)
 *   }
 *   
 *   return ok(user)
 * }
 * 
 * @example
 * // Component usage
 * const result = await getUser(123)
 * 
 * if (!result.success) {
 *   alert(result.error)
 *   return
 * }
 * 
 * console.log('User:', result.data)
 */
