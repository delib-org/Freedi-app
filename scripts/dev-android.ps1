# PowerShell script to run Android development with Firebase emulators
# This script starts Firebase emulators, builds the app, and runs it on Android

Write-Host "🚀 Starting Android Development Environment..." -ForegroundColor Green

# Function to check if a process is running on a specific port
function Test-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet
        return $connection
    } catch {
        return $false
    }
}

# Function to wait for emulators to start
function Wait-ForEmulators {
    $ports = @(5000, 8080, 9099, 5001, 9199)
    $maxWait = 60  # seconds
    $waited = 0
    
    Write-Host "⏳ Waiting for Firebase emulators to start..." -ForegroundColor Yellow
    
    while ($waited -lt $maxWait) {
        $allRunning = $true
        foreach ($port in $ports) {
            if (-not (Test-Port -Port $port)) {
                $allRunning = $false
                break
            }
        }
        
        if ($allRunning) {
            Write-Host "✅ All Firebase emulators are running!" -ForegroundColor Green
            return $true
        }
        
        Start-Sleep -Seconds 2
        $waited += 2
        Write-Host "." -NoNewline
    }
    
    Write-Host ""
    Write-Host "⚠️  Some emulators may not be running. Continuing anyway..." -ForegroundColor Yellow
    return $false
}

# Check if Firebase emulators are already running
$emulatorsRunning = Test-Port -Port 5000
if (-not $emulatorsRunning) {
    Write-Host "🔥 Starting Firebase emulators..." -ForegroundColor Blue
    Start-Process -FilePath "firebase" -ArgumentList "emulators:start" -NoNewWindow
    Wait-ForEmulators
} else {
    Write-Host "✅ Firebase emulators already running" -ForegroundColor Green
}

# Build the app
Write-Host "🔨 Building the app..." -ForegroundColor Blue
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Sync Capacitor
Write-Host "🔄 Syncing Capacitor..." -ForegroundColor Blue
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Capacitor sync failed!" -ForegroundColor Red
    exit 1
}

# Check for connected Android devices/emulators
Write-Host "📱 Checking for Android devices..." -ForegroundColor Blue
$devices = adb devices
Write-Host $devices

$deviceList = adb devices | Select-String "device$" | ForEach-Object { $_.Line.Split()[0] }
if ($deviceList.Count -eq 0) {
    Write-Host "❌ No Android devices connected! Please start an emulator or connect a device." -ForegroundColor Red
    exit 1
}

# If multiple devices, let user choose or use the first one
if ($deviceList.Count -gt 1) {
    Write-Host "📱 Multiple devices found:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $deviceList.Count; $i++) {
        Write-Host "  [$i] $($deviceList[$i])"
    }
    $choice = Read-Host "Enter device number (0-$($deviceList.Count-1)) or press Enter for first device"
    if ([string]::IsNullOrEmpty($choice)) {
        $selectedDevice = $deviceList[0]
    } else {
        $selectedDevice = $deviceList[[int]$choice]
    }
} else {
    $selectedDevice = $deviceList[0]
}

Write-Host "🎯 Using device: $selectedDevice" -ForegroundColor Green

# Install and run the app
Write-Host "📦 Installing APK..." -ForegroundColor Blue
adb -s $selectedDevice install -r "android\app\build\outputs\apk\debug\app-debug.apk"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ APK installation failed!" -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Launching app..." -ForegroundColor Blue
adb -s $selectedDevice shell am start -n com.freedi.app/com.freedi.app.MainActivity
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ App launch failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Development environment ready!" -ForegroundColor Green
Write-Host "🌐 Firebase UI: http://localhost:5002" -ForegroundColor Cyan
Write-Host "📱 App running on: $selectedDevice" -ForegroundColor Cyan
Write-Host "🔧 To view logs: .\scripts\debug-android.ps1" -ForegroundColor Cyan
