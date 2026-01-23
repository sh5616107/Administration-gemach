# Gemach Manager Build Script

Write-Host "Building Gemach Manager..." -ForegroundColor Cyan

# Build with Tauri
npx tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    
    # Copy installer to release folder
    $source = "src-tauri\target\release\bundle\nsis\gemach-manager_3.6.0_x64-setup.exe"
    $dest = "release\gemach-manager_3.6.0_x64-setup.exe"
    
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
    Write-Host "  - gemach-manager_3.6.0_x64-setup.exe (Installer)" -ForegroundColor White
    Write-Host "  - gemach-manager-portable.exe (Portable)" -ForegroundColor White
    Write-Host "  - portable.txt (Portable marker - optional)" -ForegroundColor Gray
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
