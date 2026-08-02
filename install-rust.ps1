# Rust Installation Script for Tauri Project

Write-Host "=== Installing Rust for Tauri ===" -ForegroundColor Cyan
Write-Host ""

# Check if Rust is already installed
Write-Host "Checking if Rust is installed..." -ForegroundColor Yellow
try {
    $cargoVersion = & cargo --version 2>&1
    Write-Host "OK: Rust is already installed: $cargoVersion" -ForegroundColor Green
    Write-Host ""
    Write-Host "If you still have issues, try closing and reopening your terminal" -ForegroundColor Yellow
    exit 0
} catch {
    Write-Host "Rust is not installed" -ForegroundColor Red
}

Write-Host ""
Write-Host "Downloading rustup-init..." -ForegroundColor Yellow

# Download rustup-init
$rustupUrl = "https://win.rustup.rs/x86_64"
$rustupPath = "$env:TEMP\rustup-init.exe"

try {
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupPath
    Write-Host "OK: Download completed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Download failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing Rust... (this may take a few minutes)" -ForegroundColor Yellow
Write-Host "Press 1 and Enter to continue with default installation" -ForegroundColor Cyan
Write-Host ""

# Run installation
try {
    & $rustupPath
    Write-Host ""
    Write-Host "OK: Installation completed!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Installation failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Close this terminal/VSCode" -ForegroundColor Yellow
Write-Host "2. Open a new terminal" -ForegroundColor Yellow
Write-Host "3. Verify installation:" -ForegroundColor Yellow
Write-Host "   cargo --version" -ForegroundColor White
Write-Host "4. Run the project:" -ForegroundColor Yellow
Write-Host "   cd 'c:\proyecys\gemach system'" -ForegroundColor White
Write-Host "   npm run tauri dev" -ForegroundColor White
Write-Host ""
