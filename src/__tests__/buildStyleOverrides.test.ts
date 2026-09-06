import { describe, it, expect, vi } from 'vitest'
import { createEmptyDocumentLayoutConfig } from '../types/documentLayout'

vi.mock('html2canvas', () => ({ default: vi.fn() }))
vi.mock('jspdf', () => ({ default: vi.fn() }))

const { buildStyleOverrides } = await import('../services/documents')

describe('buildStyleOverrides', () => {
  it('layout לא מוגדר (undefined) — מחזירה מחרוזת ריקה, לא זורקת', () => {
    expect(buildStyleOverrides(undefined)).toBe('')
  })

  it('קונפיג ריק — מחזירה מחרוזת ריקה (אין override)', () => {
    expect(buildStyleOverrides(createEmptyDocumentLayoutConfig())).toBe('')
  })

  it('blackAndWhite: מזריקה grayscale על ה-body + print-color-adjust כדי שרקעים לא ייעלמו בהדפסה', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), blackAndWhite: true }
    const css = buildStyleOverrides(layout)
    expect(css).toContain('filter: grayscale(100%)')
    expect(css).toContain('print-color-adjust: exact')
  })

  it('hideDividers: מסתירה את כל ה-hr', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), hideDividers: true }
    expect(buildStyleOverrides(layout)).toBe('<style>hr { display: none !important; }</style>')
  })

  it('hideDividers גובר על dividerColor כששניהם מוגדרים', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), hideDividers: true, dividerColor: '#ff0000' }
    const css = buildStyleOverrides(layout)
    expect(css).toContain('display: none')
    expect(css).not.toContain('#ff0000')
  })

  it('dividerColor תקין (hex) מוזרק, ולא נבלם ע"י blackAndWhite (שני ה-rules מתקיימים יחד — הפילטר ינטרל חזותית את הצבע, אבל הקונפיג לא נמחק)', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), dividerColor: '#ff0000', blackAndWhite: true }
    const css = buildStyleOverrides(layout)
    expect(css).toContain('grayscale(100%)')
    expect(css).toContain('border-color: #ff0000')
  })

  it('dividerColor לא תקין (ניסיון CSS/HTML injection) — מסונן ולא מוזרק', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), dividerColor: 'red; } body { display: none' }
    expect(buildStyleOverrides(layout)).toBe('')
  })

  it('accentColor תקין (hex) מוזרק כמשתנה CSS גלובלי', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), accentColor: '#123abc' }
    expect(buildStyleOverrides(layout)).toBe('<style>:root { --doc-accent: #123abc; }</style>')
  })

  it('accentColor בשם צבע CSS פשוט (לא hex) גם מתקבל', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), accentColor: 'darkred' }
    expect(buildStyleOverrides(layout)).toBe('<style>:root { --doc-accent: darkred; }</style>')
  })

  it('accentColor לא תקין (ניסיון injection) — מסונן ולא מוזרק', () => {
    const layout = { ...createEmptyDocumentLayoutConfig(), accentColor: '#fff; } </style><script>alert(1)</script>' }
    expect(buildStyleOverrides(layout)).toBe('')
  })

  it('כל ארבעת השדות יחד — כל ה-rules הרלוונטיים מופיעים במחרוזת אחת', () => {
    const layout = {
      ...createEmptyDocumentLayoutConfig(),
      blackAndWhite: true,
      hideDividers: true,
      accentColor: '#00ff00',
    }
    const css = buildStyleOverrides(layout)
    expect(css).toContain('grayscale(100%)')
    expect(css).toContain('hr { display: none !important; }')
    expect(css).toContain('--doc-accent: #00ff00')
  })
})
