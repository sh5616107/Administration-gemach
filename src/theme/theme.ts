import { createTheme, ThemeOptions } from '@mui/material/styles';
import { calendarTokens, confidenceTokens } from './tokens';
import { PaletteSpec, SidebarTokens, tealGoldPalette } from './palettes';

// הרחבת טיפוסים של MUI
declare module '@mui/material/styles' {
  interface Palette {
    accent: string;
    sidebar: SidebarTokens;
    calendar: typeof calendarTokens;
    confidence: typeof confidenceTokens;
  }
  interface PaletteOptions {
    accent?: string;
    sidebar?: SidebarTokens;
    calendar?: typeof calendarTokens;
    confidence?: typeof confidenceTokens;
  }
}

export type { PaletteSpec, SidebarTokens };

/**
 * יצירת theme מרוכז
 */
export function createAppTheme(paletteSpec: PaletteSpec) {
  const themeOptions: ThemeOptions = {
    direction: 'rtl',
    typography: {
      fontFamily: '"Heebo", "Roboto", "Arial", sans-serif',
    },
    palette: {
      primary: paletteSpec.primary,
      secondary: paletteSpec.secondary,
      success: paletteSpec.success,
      warning: paletteSpec.warning,
      error: paletteSpec.error,
      info: paletteSpec.info,
      background: paletteSpec.background,
      text: paletteSpec.text,
      divider: paletteSpec.divider,
      grey: paletteSpec.grey,
      accent: paletteSpec.accent,
      sidebar: paletteSpec.sidebar,
      calendar: calendarTokens,
      confidence: confidenceTokens,
    },
    shape: {
      borderRadius: 8,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
        },
        defaultProps: {
          disableElevation: true,
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 8,
            boxShadow: 'none',
            border: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
          size: 'small',
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderColor: theme.palette.divider,
          }),
          head: ({ theme }) => ({
            backgroundColor: theme.palette.grey[100],
            color: theme.palette.text.secondary,
            fontWeight: 600,
          }),
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.grey[100],
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 500,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
          },
        },
      },
      MuiCssBaseline: {
        styleOverrides: {
          'td, th': {
            fontVariantNumeric: 'tabular-nums',
          },
        },
      },
    },
  };

  return createTheme(themeOptions);
}

/**
 * theme ברירת מחדל (teal + זהב)
 */
export const defaultTheme = createAppTheme(tealGoldPalette);
