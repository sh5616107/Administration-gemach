import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { Theme } from '@mui/material/styles';
import { ThemeId, DEFAULT_THEME_ID, THEMES, createThemeById } from '../theme/themes';
import { loadThemeId, saveThemeId } from '../theme/themeStorage';

interface ThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  theme: Theme;
  availableThemes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const stored = loadThemeId();
    if (stored) {
      // ודא שהערכה קיימת
      const isValid = THEMES.some(t => t.id === stored);
      if (isValid) {
        return stored as ThemeId;
      }
    }
    return DEFAULT_THEME_ID;
  });

  // יצירת theme (רק כאשר themeId משתנה)
  const theme = useMemo(() => {
    return createThemeById(themeId);
  }, [themeId]);

  // פונקציה לשינוי ערכה (עם שמירה אוטומטית)
  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    saveThemeId(id);
  }, []);

  const contextValue: ThemeContextValue = useMemo(() => ({
    themeId,
    setThemeId,
    theme,
    availableThemes: THEMES,
  }), [themeId, setThemeId, theme]);

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
