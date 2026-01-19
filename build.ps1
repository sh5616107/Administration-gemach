# Gemach Manager Build Script

Write-Host "Building Gemach Manager..." -ForegroundColor Cyan

# Build with Tauri
npx tauri build

if ($LASTEXITCODE -eq 0) {
    Write-Host "Build successful!" -ForegroundColor Green
    
    # Copy to release folder
    $source = "src-tauri\target\release\bundle\nsis\gemach-manager_3.5.0_x64-setup.exe"
    $dest = "release\gemach-manager_3.5.0_x64-setup.exe"
    
    if (Test-Path $source) {
        Copy-Item $source $dest -Force
        Write-Host "Installer copied to: $dest" -ForegroundColor Green
    }
    
    # Also copy the portable exe
    $portableSource = "src-tauri\target\release\gemach-manager.exe"
    $portableDest = "release\gemach-manager-tauri.exe"
    
    if (Test-Path $portableSource) {
        Copy-Item $portableSource $portableDest -Force
        Write-Host "Portable exe copied to: $portableDest" -ForegroundColor Green
    }
    
    Write-Host "Done! Files are in the release folder." -ForegroundColor Cyan
} else {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}
