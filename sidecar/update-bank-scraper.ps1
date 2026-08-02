# עדכון מהיר של israeli-bank-scrapers
# שימוש: .\update-bank-scraper.ps1

Write-Host "🔍 בודק עדכונים ל-israeli-bank-scrapers..." -ForegroundColor Cyan

# בדיקת גרסה נוכחית
$current = npm list israeli-bank-scrapers --depth=0 --json | ConvertFrom-Json
$currentVersion = $current.dependencies.'israeli-bank-scrapers'.version

# בדיקת גרסה אחרונה
$latestVersion = npm view israeli-bank-scrapers version

Write-Host "גרסה נוכחית: $currentVersion" -ForegroundColor Yellow
Write-Host "גרסה אחרונה: $latestVersion" -ForegroundColor Green

if ($currentVersion -eq $latestVersion) {
    Write-Host "✅ המערכת מעודכנת!" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "🆕 נמצא עדכון חדש!" -ForegroundColor Magenta
$response = Read-Host "האם לעדכן? (Y/N)"

if ($response -eq 'Y' -or $response -eq 'y') {
    Write-Host "📦 מעדכן..." -ForegroundColor Cyan
    npm install israeli-bank-scrapers@latest
    
    Write-Host "🌐 מתקין Chrome..." -ForegroundColor Cyan
    npx puppeteer browsers install chrome
    
    Write-Host "✅ עדכון הושלם!" -ForegroundColor Green
    Write-Host ""
    Write-Host "גרסה חדשה: $latestVersion" -ForegroundColor Green
} else {
    Write-Host "❌ ביטול עדכון" -ForegroundColor Red
}
