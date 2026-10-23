/**
 * קבועים קשיחים למסמכי תרומה והפקדה.
 *
 * מכוונת: הערכים כאן אינם נקראים מ-DocumentLayoutConfig (לא labelOverrides,
 * לא showSystemBlocks, לא customBlocks) ואינם ניתנים לשינוי מהגדרות או מפאנל
 * עיצוב המסמכים. הסיבה: המסמכים האלה אינם קבלה או חשבונית לצורכי מס, והכותרת
 * ושורת ההבהרה מונעות מצב שבו הם יוצגו ככאלה.
 */

/** כותרת מסמך התרומה. לא להחליף ל"קבלה". */
export const DONATION_DOC_TITLE = 'אישור קבלת תרומה'

/** כותרת מסמך ההפקדה. לא להחליף ל"קבלה". */
export const DEPOSIT_DOC_TITLE = 'אישור קבלת הפקדה'

/** שורת ההבהרה שמודפסת בכל מסמך תרומה והפקדה. */
export const NON_TAX_DISCLAIMER =
  'מסמך זה אינו קבלה או חשבונית לצורכי מס ואינו מזכה בהטבת מס'

/**
 * HTML של שורת ההבהרה. מקבלת אפס פרמטרים בכוונה, כדי שלא יהיה אפשר
 * להסתיר או לשנות אותה דרך layout.
 */
export function renderNonTaxDisclaimer(): string {
  return `<div data-doc-disclaimer="non-tax" style="margin: 20px 0 0 0; padding: 8px 10px; border: 1px solid #888; text-align: center; direction: rtl; font-size: 12px; color: #333;">${NON_TAX_DISCLAIMER}</div>`
}
