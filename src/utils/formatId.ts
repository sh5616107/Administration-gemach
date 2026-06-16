/**
 * Format UUID for display
 * ממיר UUID למספר קצר וקריא יותר
 */

/**
 * המרת UUID למספר קצר וקריא
 * מציג את 8 התווים הראשונים בלבד
 * דוגמה: 550e8400-e29b-41d4-a716-446655440000 → 550E8400
 */
export function formatShortId(id: string): string {
  if (!id) return ''
  return id.substring(0, 8).toUpperCase()
}

/**
 * המרת UUID לפורמט קריא עם מקפים
 * מציג רק את החלק הראשון והאחרון
 * דוגמה: 550e8400-e29b-41d4-a716-446655440000 → 550E-4000
 */
export function formatCompactId(id: string): string {
  if (!id) return ''
  const parts = id.split('-')
  if (parts.length < 2) return id.substring(0, 8).toUpperCase()
  
  const first = parts[0].substring(0, 4).toUpperCase()
  const last = parts[parts.length - 1].substring(-4).toUpperCase()
  return `${first}-${last}`
}

/**
 * המרת UUID לפורמט עם אייקון
 * מציג את 6 התווים הראשונים עם סימן #
 * דוגמה: 550e8400-e29b-41d4-a716-446655440000 → #550E84
 */
export function formatHashId(id: string): string {
  if (!id) return ''
  return '#' + id.substring(0, 6).toUpperCase()
}
