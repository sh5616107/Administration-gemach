import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadThemeId, saveThemeId } from '../theme/themeStorage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('themeStorage', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('loadThemeId', () => {
    it('מחזיר null כאשר אין ערך שמור', () => {
      const id = loadThemeId();
      expect(id).toBeNull();
    });

    it('טוען ערך מ-localStorage כמו שהוא (ללא ולידציה)', () => {
      localStorageMock.setItem('gemach_theme_id', 'classic');
      const id = loadThemeId();
      expect(id).toBe('classic');
    });

    it('מחזיר ערך גם אם הוא לא תקין (validation ב-consumer)', () => {
      localStorageMock.setItem('gemach_theme_id', 'invalid_theme');
      const id = loadThemeId();
      expect(id).toBe('invalid_theme');
    });

    it('מחזיר ערך ריק אם שמור', () => {
      localStorageMock.setItem('gemach_theme_id', '');
      const id = loadThemeId();
      expect(id).toBe('');
    });

    it('מטפל בשגיאות localStorage ומחזיר null', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const originalGetItem = localStorageMock.getItem;
      
      localStorageMock.getItem = () => {
        throw new Error('Storage error');
      };

      const id = loadThemeId();
      expect(id).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to load theme from localStorage:',
        expect.any(Error)
      );

      localStorageMock.getItem = originalGetItem;
      consoleWarnSpy.mockRestore();
    });
  });

  describe('saveThemeId', () => {
    it('שומר ערך תקין ב-localStorage', () => {
      saveThemeId('burgundy');
      expect(localStorageMock.getItem('gemach_theme_id')).toBe('burgundy');
    });

    it('מחליף ערך קיים', () => {
      localStorageMock.setItem('gemach_theme_id', 'classic');
      saveThemeId('indigo');
      expect(localStorageMock.getItem('gemach_theme_id')).toBe('indigo');
    });

    it('מטפל בשגיאות localStorage', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalSetItem = localStorageMock.setItem;
      
      localStorageMock.setItem = () => {
        throw new Error('Storage quota exceeded');
      };

      // לא צריך לזרוק שגיאה - רק לרשום ב-console
      expect(() => saveThemeId('classic')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save theme to localStorage:',
        expect.any(Error)
      );

      localStorageMock.setItem = originalSetItem;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('integration', () => {
    it('שמירה וטעינה עובדים יחד', () => {
      saveThemeId('royalNavy');
      const loaded = loadThemeId();
      expect(loaded).toBe('royalNavy');
    });

    it('טעינה אחרי שמירה של מספר ערכות', () => {
      saveThemeId('classic');
      saveThemeId('burgundy');
      saveThemeId('indigo');
      
      const loaded = loadThemeId();
      expect(loaded).toBe('indigo'); // האחרונה ששמרנו
    });
  });
});
