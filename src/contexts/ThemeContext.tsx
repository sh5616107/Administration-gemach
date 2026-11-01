import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { Theme } from '@mui/material/styles';
import { ThemeId, DEFAULT_THEME_ID, THEMES, createThemeById } from '../theme/themes';

interface ThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  theme: Theme;
  availableThemes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'gemach_theme_id';

/**
 * קריאת מזהה ערכה מ-localStorage (סינכרונית)
 * @returns מזהה ערכה או ברירת מחדל
 */
function loadThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // ודא שהערכה קיימת
      const isValid = THEMES.some(t => t.id === stored);
      if (isValid) {
        return stored as ThemeId;
      }
    }
  } catch (error) {
    console.warn('Failed to load theme from localStorage:', error);
  }
  return DEFAULT_THEME_ID;
}

/**
 * שמירת מזהה ערכה ב-localStorage
 * @param id מזהה ערכה
 */
function saveThemeId(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (error) {
    console.error('Failed to save theme to localStorage:', error);
  }
}

interface AppThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Provider לניהול ערכת נושא
 * - טוען מזהה ערכה מ-localStorage בטעינה ראשונה (סינכרונית)
 * - שומר אוטומטית כל שינוי
 * - יוצר theme מחדש רק כאשר themeId משתנה
 */
export function AppThemeProvider({ children }: AppThemeProviderProps) {
  // טעינה סינכרונית לפני הרינדור הראשון
  const [themeId, setThemeIdState] = useState<ThemeId>(() => loadThemeId());

  // יצירת theme (רק כאשר themeId משתנה)
  const theme = useMemo(() => {
    return createThemeById(themeId);
  }, [themeId]);

  // פונקציה לשינוי ערכה (עם שמירה אוטומטית)
  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    saveThemeId(id);
  };

  const contextValue: ThemeContextValue = {
    themeId,
    setThemeId,
    theme,
    availableThemes: THEMES,
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook לגישה להקשר הערכה
 */
export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within AppThemeProvider');
  }
  return context;
}
