import { createTheme, ThemeOptions } from '@mui/material/styles';
import { sidebarTokens, calendarTokens, confidenceTokens } from './tokens';

// הרחבת טיפוסים של MUI
declare module '@mui/material/styles' {
  interface Palette {
    accent: string;
    sidebar: typeof sidebarTokens;
    calendar: typeof calendarTokens;
    confidence: typeof confidenceTokens;
  }
  interface PaletteOptions {
    accent?: string;
    sidebar?: typeof sidebarTokens;
    calendar?: typeof calendarTokens;
    confidence?: typeof confidenceTokens;
  }
}

/**
 * מפרט פלטת צבעים
 */
interface PaletteSpec {
  primary: { main: string; light: string; dark: string; contrastText: string };
  secondary: { main: string; light: string; dark: string; contrastText: string };
  success: { main: string; light: string; dark: string; contrastText: string };
  warning: { main: string; light: string; dark: string; contrastText: string };
  error: { main: string; light: string; dark: string; contrastText: string };
  info: { main: string; light: string; dark: string; contrastText: string };
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
  divider: string;
  grey: { 50: string; 100: string; 200: string };
  accent: string;
}

/**
 * פלטת Teal + זהב
 */
const tealGoldPalette: PaletteSpec = {
  primary: {
    main: '#0F5C5C',
    light: '#3F8A87',
    dark: '#0A4242',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#4A5D5A',
    light: '#7A8D8A',
    dark: '#33423F',
    contrastText: '#FFFFFF',
  },
  success: {
    main: '#2F7D57',
    light: '#DDEEE6',
    dark: '#1F5E3E',
    contrastText: '#FFFFFF',
  },
  warning: {
    main: '#9A6A00',
    light: '#F6E7C8',
    dark: '#7A5200',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#A63A2B',
    light: '#F5DAD6',
    dark: '#8E2A1F',
    contrastText: '#FFFFFF',
  },
  info: {
    main: '#2C6E8A',
    light: '#D9E8EF',
    dark: '#1E5068',
    contrastText: '#FFFFFF',
  },
  background: {
    default: '#F7F5F0',
    paper: '#FFFFFF',
  },
  text: {
    primary: '#1E2B29',
    secondary: '#5B6B68',
  },
  divider: '#E6E1D5',
  grey: {
    50: '#F7F5F0',
    100: '#F1EEE6',
    200: '#E6E1D5',
  },
  accent: '#B8892D', // זהב - לקישוטים בלבד, לא לטקסט
};

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
      ...paletteSpec,
      sidebar: sidebarTokens,
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
