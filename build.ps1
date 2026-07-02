# Gemach Manager Build Script

Write-Host "Building Gemach Manager..." -ForegroundColor Cyan

# Build the Node sidecar first. Tauri bundles src-tauri\binaries\*, so a stale
# placeholder here becomes a runtime os error 216.
Write-Host "Building bank scraper sidecar..." -ForegroundColor Cyan
Push-Location "sidecar"
npm run build
$sidecarExitCode = $LASTEXITCODE
Pop-Location

if ($sidecarExitCode -ne 0) {
    Write-Host "Sidecar build failed!" -ForegroundColor Red
    exit $sidecarExitCode
}

$sidecarBinary = "src-tauri\binaries\bank-scraper-x86_64-pc-windows-msvc.exe"
if (!(Test-Path $sidecarBinary)) {
    Write-Host "Sidecar binary is missing: $sidecarBinary" -ForegroundColor Red
    exit 1
}

$sidecarInfo = Get-Item $sidecarBinary
$header = [System.IO.File]::ReadAllBytes($sidecarBinary)[0..1]
if ($sidecarInfo.Length -lt 1048576 -or $header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
    Write-Host "Invalid sidecar binary: $sidecarBinary ($($sidecarInfo.Length) bytes)" -ForegroundColor Red
    Write-Host "Run: cd sidecar; npm run build" -ForegroundColor Yellow
    exit 1
}

if (!(Test-Path "release")) {
    New-Item -ItemType Directory -Path "release" | Out-Null
}

# Build with Tauri
npx tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    
    # Copy installer to release folder
    $source = "src-tauri\target\release\bundle\nsis\gemach-manager_4.1.5_x64-setup.exe"
    $dest = "release\gemach-manager_4.1.5_x64-setup.exe"
    
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "Installer copied to: $dest" -ForegroundColor Green
    }
    
    # Copy portable exe to release folder
    $portableSource = "src-tauri\target\release\gemach-manager.exe"
    $portableDest = "release\gemach-manager-portable.exe"
    
    if (Test-Path $portableSource) {
        Copy-Item $portableSource $portableDest -Force
        Write-Host "Portable exe copied to: $portableDest" -ForegroundColor Green
    }
    
    # Also copy to old name for compatibility
    $oldDest = "release\gemach-manager-tauri.exe"
    if (Test-Path $portableSource) {
        Copy-Item $portableSource $oldDest -Force
        Write-Host "Portable exe also copied to: $oldDest" -ForegroundColor Green
    }
    
    Write-Host "`nDone! Files are in the release folder:" -ForegroundColor Cyan
    Write-Host "  - gemach-manager_4.1.5_x64-setup.exe (Installer)" -ForegroundColor White
    Write-Host "  - gemach-manager-portable.exe (Portable)" -ForegroundColor White
    Write-Host "  - portable.txt (Portable marker - optional)" -ForegroundColor Gray
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
