# Mobile Development Guide

## Quick Start Scripts

### 📱 All-in-One Development Script
```bash
./scripts/cap-dev.sh
```
This interactive script will:
- Check prerequisites
- Start Firebase emulators
- Start Vite dev server
- Let you choose which platform to run

### 🍎 iOS Development

**Basic commands (npm scripts):**
```bash
npm run cap:ios          # Build and run on iOS simulator
npm run cap:ios:live     # Run with live reload (requires npm run dev)
npm run cap:open:ios     # Open in Xcode
```

**Advanced script:**
```bash
./scripts/cap-ios.sh [options]

Options:
  -l, --live     Run with live reload
  -b, --build    Build only (no run)
  -o, --open     Open in Xcode only
  -d, --device   Run on physical device
  -h, --help     Show help

Examples:
  ./scripts/cap-ios.sh          # Build and run on simulator
  ./scripts/cap-ios.sh -l       # Run with live reload
  ./scripts/cap-ios.sh -d       # Run on connected device
```

### 🤖 Android Development

**Basic commands (npm scripts):**
```bash
npm run cap:android          # Build and run on Android emulator
npm run cap:android:live     # Run with live reload (requires npm run dev)
npm run cap:open:android     # Open in Android Studio
```

**Advanced script:**
```bash
./scripts/cap-android.sh [options]

Options:
  -l, --live     Run with live reload
  -b, --build    Build only (no run)
  -o, --open     Open in Android Studio only
  -d, --device   Run on physical device
  -h, --help     Show help

Examples:
  ./scripts/cap-android.sh          # Build and run on emulator
  ./scripts/cap-android.sh -l       # Run with live reload
  ./scripts/cap-android.sh -d       # Run on connected device
```

## Development Workflow

### 1. First Time Setup
```bash
# iOS (requires Xcode and CocoaPods)
npx cap add ios
cd ios/App && pod install

# Android (requires Android Studio)
npx cap add android
```

### 2. Daily Development
```bash
# Start all services and choose platform
./scripts/cap-dev.sh

# Or manually:
# Terminal 1: Firebase emulators
npm run deve

# Terminal 2: Vite dev server
npm run dev

# Terminal 3: Run mobile app with live reload
npm run cap:ios:live      # iOS
npm run cap:android:live  # Android
```

### 3. Building for Production
```bash
# Build and sync all platforms
npm run cap:build

# Then open in IDE to create release builds
npm run cap:open:ios      # For iOS App Store
npm run cap:open:android  # For Google Play
```

## Configuration

### Firebase Emulators
The app is configured to use Firebase emulators for local development:
- **Web**: Uses localhost
- **iOS**: Uses localhost (simulator can access Mac's localhost)
- **Android**: Uses 10.0.2.2 (Android emulator's host address)
- **Physical devices**: Uses your Mac's IP address

### Live Reload
When using live reload (`-l` flag):
- Make sure `npm run dev` is running
- iOS uses `http://localhost:5173`
- Android uses `http://10.0.2.2:5173`
- Changes in your code will automatically reload the app

## Troubleshooting

### iOS Issues
- **White screen**: Check Safari Developer Tools (Develop > Simulator > localhost)
- **Xcode errors**: Run `cd ios/App && pod install`
- **Can't connect to emulators**: Check firewall settings

### Android Issues
- **White screen**: Check Chrome DevTools (chrome://inspect)
- **Build errors**: Clean with `cd android && ./gradlew clean`
- **Emulator not found**: Create one in Android Studio AVD Manager

### General Issues
- **Port conflicts**: Kill processes on ports 5173, 5001, 8080, 9099
- **IP address issues**: Update `src/config/environment.ts` with your current IP
- **Auth issues**: Mobile uses production auth, web uses auth emulator