# Development Environment Setup Script
Write-Host "*** Development Environment Setup ***" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

Write-Host ""
Write-Host ">>> Checking required tools..." -ForegroundColor Blue

# Check Node.js
Write-Host -NoNewline "Node.js: "
try {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $version = node --version 2>$null
        if ($version) {
            Write-Host "[OK] $version" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] Not found - Install from https://nodejs.org/" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking Node.js" -ForegroundColor Red
}

# Check npm
Write-Host -NoNewline "npm: "
try {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        $version = npm --version 2>$null
        if ($version) {
            Write-Host "[OK] v$version" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] Not found" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking npm" -ForegroundColor Red
}

# Check Firebase CLI
Write-Host -NoNewline "Firebase CLI: "
try {
    if (Get-Command firebase -ErrorAction SilentlyContinue) {
        $version = firebase --version 2>$null | Select-Object -First 1
        if ($version) {
            Write-Host "[OK] $version" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] Not found - Install: npm install -g firebase-tools" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking Firebase CLI" -ForegroundColor Red
}

# Check ADB
Write-Host -NoNewline "ADB: "
try {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        $adbOutput = adb version 2>$null
        if ($adbOutput) {
            $version = $adbOutput | Select-Object -First 1
            Write-Host "[OK] $version" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] Not found - Install Android SDK Platform Tools" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking ADB" -ForegroundColor Red
}

# Check Java
Write-Host -NoNewline "Java: "
try {
    if (Get-Command java -ErrorAction SilentlyContinue) {
        $javaOutput = cmd /c "java -version 2>&1" 2>$null
        if ($javaOutput) {
            $version = ($javaOutput | Select-Object -First 1) -replace '"', ''
            Write-Host "[OK] $version" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] Command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] Not found - Install Java JDK 17" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking Java" -ForegroundColor Red
}

Write-Host ""
Write-Host ">>> Checking project files..." -ForegroundColor Blue

# Check project files
$files = @("package.json", "capacitor.config.ts", "firebase.json")
foreach ($file in $files) {
    Write-Host -NoNewline "${file}: "
    if (Test-Path $file -PathType Leaf) {
        Write-Host "[OK] Found" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Missing" -ForegroundColor Red
    }
}

# Check android directory
Write-Host -NoNewline "android/ directory: "
if (Test-Path "android" -PathType Container) {
    Write-Host "[OK] Found" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Missing - Run: npx cap add android" -ForegroundColor Red
}

Write-Host ""
Write-Host ">>> Checking Android devices..." -ForegroundColor Blue

try {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        $adbDevicesOutput = adb devices 2>$null
        if ($adbDevicesOutput) {
            $devices = $adbDevicesOutput | Where-Object { $_ -match "device$|emulator$" }
            if ($devices) {
                Write-Host "[OK] Found $($devices.Count) device(s)" -ForegroundColor Green
                foreach ($device in $devices) {
                    # Use regex split with proper syntax
                    $parts = $device -split '\s+', 2
                    if ($parts.Length -ge 2) {
                        $id = $parts[0]
                        $status = $parts[1]
                        Write-Host "   -> $id ($status)" -ForegroundColor Cyan
                    }
                }
            } else {
                Write-Host "[WARN] No devices connected" -ForegroundColor Yellow
            }
        } else {
            Write-Host "[FAIL] ADB command failed" -ForegroundColor Red
        }
    } else {
        Write-Host "[FAIL] ADB not available" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] Error checking devices" -ForegroundColor Red
}

Write-Host ""
Write-Host ">>> Checking Firebase emulators..." -ForegroundColor Blue

$emulatorPorts = @(
    @{Port = 5000; Name = "Hosting"},
    @{Port = 8080; Name = "Emulator UI"},
    @{Port = 9099; Name = "Auth"},
    @{Port = 5001; Name = "Functions"},
    @{Port = 9199; Name = "Database"},
    @{Port = 5002; Name = "Firestore"}
)

$runningCount = 0
$runningEmulators = @()

foreach ($emulator in $emulatorPorts) {
    try {
        $test = Test-NetConnection -ComputerName "localhost" -Port $emulator.Port -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        if ($test -and $test.TcpTestSucceeded) {
            $runningCount++
            $runningEmulators += "$($emulator.Name) ($($emulator.Port))"
        }
    } catch {
        # Port test failed, continue
    }
}

if ($runningCount -eq $emulatorPorts.Count) {
    Write-Host "[OK] All emulators running" -ForegroundColor Green
} elseif ($runningCount -gt 0) {
    Write-Host "[WARN] $runningCount/$($emulatorPorts.Count) emulators running" -ForegroundColor Yellow
    $joinedEmulators = $runningEmulators -join ", "
    Write-Host "   Running: $joinedEmulators" -ForegroundColor Cyan
} else {
    Write-Host "[FAIL] No emulators running - Run: npm run android:emulators" -ForegroundColor Red
}

Write-Host ""
Write-Host ">>> Checking dependencies..." -ForegroundColor Blue
if (Test-Path "node_modules" -PathType Container) {
    if ((Test-Path "package.json") -and (Test-Path "node_modules")) {
        $packageJsonTime = (Get-Item "package.json").LastWriteTime
        $nodeModulesTime = (Get-Item "node_modules").LastWriteTime
        if ($packageJsonTime -gt $nodeModulesTime) {
            Write-Host "[WARN] Dependencies may be outdated - Consider running: npm install" -ForegroundColor Yellow
        } else {
            Write-Host "[OK] Dependencies installed" -ForegroundColor Green
        }
    } else {
        Write-Host "[OK] Dependencies installed" -ForegroundColor Green
    }
} else {
    Write-Host "[FAIL] Run: npm install" -ForegroundColor Yellow
}

Write-Host ""
Write-Host ">>> Available commands:" -ForegroundColor Cyan
Write-Host "  npm run android:setup            # Run this setup"
Write-Host "  npm run android:emulators        # Start Firebase emulators"
Write-Host "  npm run android:dev              # Full dev setup"
Write-Host "  npm run android:deploy           # Deploy app"
Write-Host "  npm run android:deploy-logs      # Deploy + logs"
Write-Host "  npm run android:errors           # Error monitoring"
Write-Host "  npm run android:debug            # Debug tools"

Write-Host ""
Write-Host ">>> Workflow:" -ForegroundColor Yellow
Write-Host "  1. npm run android:emulators"
Write-Host "  2. npm run android:deploy-logs"
Write-Host "  3. npm run android:errors (new terminal)"

Write-Host ""
Write-Host "*** Setup complete! ***" -ForegroundColor Green