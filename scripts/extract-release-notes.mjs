// מפיק את פתקי השחרור (release notes) לגרסה הנוכחית ישירות מתוך CHANGELOG.md,
// כדי שגוף ה-release ב-GitHub (וממנו מסך "מה חדש" בעדכון האוטומטי) תמיד ישקף
// את השינויים האמיתיים של הגרסה, ולא טקסט ישן שהועתק בטעות מגרסה קודמת.
//
// שימוש: node scripts/extract-release-notes.mjs
// כותב את התוצאה ל-GITHUB_OUTPUT תחת המפתח "body" (multiline).
// דורש שב-CHANGELOG.md תהיה כותרת בפורמט: ## [X.Y.Z] - YYYY-MM-DD

import { readFileSync, appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const version = pkg.version

if (!version) {
  console.error('❌ לא נמצאה version בתוך package.json')
  process.exit(1)
}

const changelog = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')

// escape לתווים מיוחדים ב-regex (הנקודות בגרסה)
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const headerPattern = new RegExp(`^## \\[${escapedVersion}\\].*$`, 'm')

const headerMatch = changelog.match(headerPattern)

if (!headerMatch) {
  console.error(`❌ לא נמצאה כותרת "## [${version}]" בקובץ CHANGELOG.md`)
  console.error('   ודא שהוספת סעיף לגרסה הזו ב-CHANGELOG.md לפני יצירת ה-tag')
  process.exit(1)
}

const startIndex = headerMatch.index + headerMatch[0].length
const rest = changelog.slice(startIndex)

// הסעיף מסתיים בכותרת הגרסה הבאה (## [...]) או בסוף הקובץ
const nextHeaderMatch = rest.match(/^## \[/m)
const sectionEnd = nextHeaderMatch ? nextHeaderMatch.index : rest.length

let body = rest.slice(0, sectionEnd)

// הסרת קו מפריד (---) בסוף הסעיף אם קיים, וניקוי שורות ריקות מובילות/סוגרות
body = body.replace(/\n---\s*$/, '')
body = body.trim()

if (!body) {
  console.error(`❌ הסעיף של גרסה ${version} ב-CHANGELOG.md ריק`)
  process.exit(1)
}

const releaseBody = `## שינויים בגרסה ${version}

${body}

### הורדה והתקנה
הורד את הקובץ המתאים למערכת ההפעלה שלך מהקבצים למטה.

לפרטים נוספים ראה [CHANGELOG.md](https://github.com/sh5616107/Administration-gemach/blob/main/CHANGELOG.md)
`

const githubOutputPath = process.env.GITHUB_OUTPUT

if (!githubOutputPath) {
  // הרצה מקומית לצורך בדיקה - פשוט הדפס לקונסול
  console.log(releaseBody)
  process.exit(0)
}

// כתיבה בפורמט multiline output של GitHub Actions, עם delimiter ייחודי
// כדי שלא יתנגש עם תוכן שיכול להכיל את המילה EOF
const delimiter = `RELEASE_NOTES_${Date.now()}`
appendFileSync(githubOutputPath, `body<<${delimiter}\n${releaseBody}\n${delimiter}\n`, 'utf8')

console.log(`✅ פתקי השחרור לגרסה ${version} חולצו בהצלחה מ-CHANGELOG.md`)
