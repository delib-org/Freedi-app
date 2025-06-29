# PowerShell script for quick Android app deployment
# This script builds and deploys the app to Android without starting emulators

param(
    [string]$Device = "",
    [switch]$SkipBuild,
    [switch]$SkipSync,
    [switch]$WatchLogs
)

Write-Host "📱 Quick Android Deployment" -ForegroundColor Green
Write-Host "===========================" -ForegroundColor Green

# Function to get device list
function Get-AndroidDevices {
    $devices = adb devices | Select-String "device$" | ForEach-Object { $_.Line.Split()[0] }
    return $devices
}

# Select device
if ([string]::IsNullOrEmpty($Device)) {
    $devices = Get-AndroidDevices
    if ($devices.Count -eq 0) {
        Write-Host "❌ No Android devices connected!" -ForegroundColor Red
        Write-Host "Please start an Android emulator or connect a device." -ForegroundColor Yellow
        exit 1
    } elseif ($devices.Count -eq 1) {
        $Device = $devices[0]
        Write-Host "📱 Using device: $Device" -ForegroundColor Green
    } else {
        Write-Host "📱 Multiple devices found:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $devices.Count; $i++) {
            Write-Host "  [$i] $($devices[$i])"
        }
        $choice = Read-Host "Enter device number (0-$($devices.Count-1))"
        $Device = $devices[[int]$choice]
    }
}

# Build the app (unless skipped)
if (-not $SkipBuild) {
    Write-Host "🔨 Building the app..." -ForegroundColor Blue
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Build completed" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping build (using existing dist/)" -ForegroundColor Yellow
}

# Sync Capacitor (unless skipped)
if (-not $SkipSync) {
    Write-Host "🔄 Syncing Capacitor..." -ForegroundColor Blue
    npx cap sync android
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Capacitor sync failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Capacitor sync completed" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping Capacitor sync" -ForegroundColor Yellow
}

# Install APK
Write-Host "📦 Installing APK on $Device..." -ForegroundColor Blue
adb -s $Device install -r "android\app\build\outputs\apk\debug\app-debug.apk"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ APK installation failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ APK installed successfully" -ForegroundColor Green

# Launch app
Write-Host "🚀 Launching app..." -ForegroundColor Blue
adb -s $Device shell am start -n com.freedi.app/com.freedi.app.MainActivity
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ App launch failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ App deployed and launched successfully!" -ForegroundColor Green
Write-Host "📱 Running on device: $Device" -ForegroundColor Cyan
Write-Host ""

# Ask if user wants to view filtered logs
if ($WatchLogs) {
    $watchLogs = "y"
} else {
    $watchLogs = Read-Host "Would you like to watch app logs now? (y/n)"
}

if (($watchLogs -eq "y") -or ($watchLogs -eq "Y") -or ($watchLogs -eq "yes")) {
    Write-Host "📋 Watching logs for com.freedi.app and Firebase..." -ForegroundColor Blue
    Write-Host "Press Ctrl+C to stop log monitoring" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Gray
    
    # Filter logs for your app and Firebase-related events
    adb -s $Device logcat | Select-String -Pattern "com\.freedi\.app|Firebase|freedi|Capacitor|WebView|chromium"
}

Write-Host ""
Write-Host "🔧 Useful commands:" -ForegroundColor Yellow
Write-Host "  .\scripts\debug-android.ps1 -Logs     # View app logs"
Write-Host "  .\scripts\deploy-android.ps1 -SkipBuild  # Deploy without rebuilding"
Write-Host "  adb -s $Device shell am force-stop com.freedi.app  # Stop the app"
Write-Host "  adb -s $Device logcat -c  # Clear log buffer"
