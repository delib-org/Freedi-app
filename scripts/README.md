# Development Scripts

This directory contains PowerShell scripts to streamline Android development with Firebase emulators.

## Available Scripts

### 1. `setup-dev.ps1` - Environment Setup

**Purpose**: Validates that all required tools are installed and configured properly.

```powershell
.\scripts\setup-dev.ps1
```

**What it checks**:

- Node.js and npm installation
- Firebase CLI
- Android development tools (ADB, Android Studio, etc.)
- Java version
- Capacitor CLI
- Git configuration
- Firebase project setup
- Available ports for emulators

### 2. `start-firebase.ps1` - Firebase Emulators

**Purpose**: Starts all Firebase emulators and waits for them to be ready.

```powershell
.\scripts\start-firebase.ps1
```

**Features**:

- Checks for already running emulators
- Cleans up conflicting processes
- Starts all emulators (Hosting, Firestore, Auth, Functions, Storage)
- Waits for all services to be ready
- Provides Firebase UI access at http://localhost:5002

### 3. `dev-android.ps1` - Full Development Workflow

**Purpose**: Complete development workflow - starts emulators, builds app, and deploys to Android.

```powershell
.\scripts\dev-android.ps1
```

**What it does**:

1. Starts Firebase emulators (if not running)
2. Builds the Vite app
3. Syncs Capacitor
4. Finds available Android devices/emulators
5. Installs and launches the app

### 4. `deploy-android.ps1` - Quick Deployment

**Purpose**: Fast build and deployment to Android without starting emulators.

```powershell
# Deploy to any available device
.\scripts\deploy-android.ps1

# Deploy to specific device
.\scripts\deploy-android.ps1 -Device "emulator-5556"

# Skip build step (use existing dist/)
.\scripts\deploy-android.ps1 -SkipBuild

# Skip both build and Capacitor sync
.\scripts\deploy-android.ps1 -SkipBuild -SkipSync
```

### 5. `debug-android.ps1` - Debugging Tools

**Purpose**: Provides various debugging tools and information.

```powershell
# Show app logs
.\scripts\debug-android.ps1 -Logs

# Test network connectivity
.\scripts\debug-android.ps1 -Network

# Check Firebase connection
.\scripts\debug-android.ps1 -Firebase

# Run all debugging tools
.\scripts\debug-android.ps1 -All

# Debug specific device
.\scripts\debug-android.ps1 -Device "emulator-5556" -Logs
```

## Typical Workflow

### First Time Setup

```powershell
# 1. Check environment
.\scripts\setup-dev.ps1

# 2. Start development
.\scripts\dev-android.ps1
```

### Daily Development

```powershell
# Option 1: Full workflow (if emulators aren't running)
.\scripts\dev-android.ps1

# Option 2: Quick deployment (if emulators are already running)
.\scripts\deploy-android.ps1

# Option 3: Just start emulators
.\scripts\start-firebase.ps1
# Then use your IDE or manual commands
```

### Debugging Issues

```powershell
# Check logs
.\scripts\debug-android.ps1 -Logs

# Test connectivity
.\scripts\debug-android.ps1 -Network

# All debugging info
.\scripts\debug-android.ps1 -All
```

## Firebase Emulator Ports

- **Hosting**: http://localhost:5000 (what the Android app connects to via 10.0.2.2:5000)
- **Firestore**: http://localhost:8080
- **Auth**: http://localhost:9099
- **Functions**: http://localhost:5001
- **Storage**: http://localhost:9199
- **UI Dashboard**: http://localhost:5002

## Android Emulator Network

The Android emulator uses `10.0.2.2` to access the host machine's `localhost`. This is why the `capacitor.config.ts` is configured to use `http://10.0.2.2:5000`.

## Troubleshooting

### Common Issues

1. **"No Android devices connected"**

    - Start an Android emulator from Android Studio
    - Or connect a physical device with USB debugging enabled

2. **"Port already in use"**

    - Run `.\scripts\start-firebase.ps1` which will clean up existing processes
    - Or manually kill Firebase processes

3. **"Build failed"**

    - Run `npm install` to ensure dependencies are installed
    - Check for TypeScript errors in your code

4. **"App won't connect to Firebase"**

    - Ensure emulators are running (`.\scripts\debug-android.ps1 -Network`)
    - Check that `capacitor.config.ts` has the correct URL
    - Verify Firebase config in `src/controllers/db/config.ts`

5. **Java/Gradle issues**
    - All Java compatibility issues should be fixed
    - If you encounter new issues, check Java version with `java -version`

## Manual Commands

If you prefer manual control:

```powershell
# Start Firebase emulators
firebase emulators:start

# Build app
npm run build

# Sync Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android

# Install APK directly
adb install -r android\app\build\outputs\apk\debug\app-debug.apk

# View logs
adb logcat | Select-String "Freedi|Firebase|Capacitor"
```
