# PowerShell script to start Firebase emulators in the background
# This script starts all Firebase emulators and waits for them to be ready

Write-Host "נ”¥ Starting Firebase Emulators..." -ForegroundColor Green

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    try {
        $connection = Test-NetConnection -ComputerName "localhost" -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        return $connection
    } catch {
        return $false
    }
}

# Check if emulators are already running
$ports = @(
    @{Name="Hosting"; Port=5000},
    @{Name="Firestore"; Port=8080},
    @{Name="Auth"; Port=9099},
    @{Name="Functions"; Port=5001},
    @{Name="Storage"; Port=9199},
    @{Name="UI"; Port=5002}
)

$runningPorts = @()
$notRunningPorts = @()

foreach ($portInfo in $ports) {
    if (Test-Port -Port $portInfo.Port) {
        $runningPorts += $portInfo
        Write-Host "ג… $($portInfo.Name) already running on port $($portInfo.Port)" -ForegroundColor Green
    } else {
        $notRunningPorts += $portInfo
    }
}

if ($notRunningPorts.Count -eq 0) {
    Write-Host "נ‰ All Firebase emulators are already running!" -ForegroundColor Green
    Write-Host "נ Firebase UI: http://localhost:5002" -ForegroundColor Cyan
    exit 0
}

# Kill any existing firebase processes to avoid conflicts
Write-Host "נ§¹ Cleaning up any existing Firebase processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -like "*firebase*" -or $_.ProcessName -like "*java*"} | ForEach-Object {
    try {
        $_.Kill()
        Write-Host "Killed process: $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Yellow
    } catch {
        # Process might have already exited
    }
}

Start-Sleep -Seconds 2

# Start Firebase emulators
Write-Host "נ€ Starting Firebase emulators..." -ForegroundColor Blue
$firebaseProcess = Start-Process -FilePath "firebase" -ArgumentList "emulators:start" -PassThru -WindowStyle Hidden

# Wait for emulators to start
$maxWait = 120  # seconds
$waited = 0
$allReady = $false

Write-Host "ג³ Waiting for emulators to start (max $maxWait seconds)..." -ForegroundColor Yellow

while ($waited -lt $maxWait -and -not $allReady) {
    Start-Sleep -Seconds 3
    $waited += 3
    
    $readyCount = 0
    foreach ($portInfo in $ports) {
        if (Test-Port -Port $portInfo.Port) {
            $readyCount++
        }
    }
    
    $progress = [math]::Round(($readyCount / $ports.Count) * 100)
    $progressText = "${progress}%"
    Write-Host "Progress: $readyCount/$($ports.Count) emulators ready ($progressText)" -ForegroundColor Cyan
    
    if ($readyCount -eq $ports.Count) {
        $allReady = $true
    }
}

if ($allReady) {
    Write-Host "ג… All Firebase emulators are now running!" -ForegroundColor Green
    Write-Host ""
    Write-Host "נ“ Emulator Status:" -ForegroundColor Cyan
    foreach ($portInfo in $ports) {
        Write-Host "  $($portInfo.Name): http://localhost:$($portInfo.Port)" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "נ Firebase UI: http://localhost:5002" -ForegroundColor Green
    Write-Host "נ”§ To stop emulators: firebase emulators:stop" -ForegroundColor Yellow
} else {
    Write-Host "ג ן¸  Some emulators may not have started within the timeout period." -ForegroundColor Yellow
    Write-Host "Check the Firebase emulator output for any errors." -ForegroundColor Yellow
    
    # Show which ones are running
    foreach ($portInfo in $ports) {
        if (Test-Port -Port $portInfo.Port) {
            Write-Host "ג… $($portInfo.Name): Running" -ForegroundColor Green
        } else {
            Write-Host "ג $($portInfo.Name): Not responding" -ForegroundColor Red
        }
    }
}