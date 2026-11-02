/**
 * ניהול שמירה וטעינה של מזהה ערכה מ-localStorage
 */

import type { ThemeId } from './themes';

const STORAGE_KEY = 'gemach_theme_id';

/**
 * קריאת מזהה ערכה מ-localStorage (סינכרונית)
 * @returns מזהה ערכה או null אם לא נמצא/שגיאה
 */
export function loadThemeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to load theme from localStorage:', error);
    return null;
  }
}

/**
 * שמירת מזהה ערכה ב-localStorage
 * @param id מזהה ערכה
 */
export function saveThemeId(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.error('Failed to save theme to localStorage:', error);
  }
}
