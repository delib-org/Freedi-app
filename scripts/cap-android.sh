#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🤖 Freedi Android Development Script${NC}"
echo ""

# Function to show help
show_help() {
    echo "Usage: ./scripts/cap-android.sh [options]"
    echo ""
    echo "Options:"
    echo "  -l, --live     Run with live reload"
    echo "  -b, --build    Build only (no run)"
    echo "  -o, --open     Open in Android Studio only"
    echo "  -d, --device   Run on physical device"
    echo "  -h, --help     Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/cap-android.sh          # Build and run on emulator"
    echo "  ./scripts/cap-android.sh -l       # Run with live reload"
    echo "  ./scripts/cap-android.sh -d       # Run on connected device"
}

# Parse arguments
LIVE_RELOAD=false
BUILD_ONLY=false
OPEN_ONLY=false
DEVICE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--live)
            LIVE_RELOAD=true
            shift
            ;;
        -b|--build)
            BUILD_ONLY=true
            shift
            ;;
        -o|--open)
            OPEN_ONLY=true
            shift
            ;;
        -d|--device)
            DEVICE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Check if Android platform is added
if [ ! -d "android" ]; then
    echo -e "${YELLOW}Android platform not found. Adding it now...${NC}"
    npx cap add android
fi

# Open only
if [ "$OPEN_ONLY" = true ]; then
    echo -e "${YELLOW}Opening Android Studio...${NC}"
    npx cap open android
    exit 0
fi

# Update capacitor config for Android
echo -e "${YELLOW}Updating Capacitor config for Android...${NC}"
# Create a temporary config that uses the Android emulator address
if [ "$LIVE_RELOAD" = true ]; then
    sed -i.bak 's|http://localhost:5173|http://10.0.2.2:5173|g' capacitor.config.ts
fi

# Build and sync
if [ "$LIVE_RELOAD" = false ]; then
    echo -e "${YELLOW}Building app...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        # Restore config
        if [ "$LIVE_RELOAD" = true ]; then
            mv capacitor.config.ts.bak capacitor.config.ts
        fi
        exit 1
    fi
fi

echo -e "${YELLOW}Syncing Android project...${NC}"
npx cap sync android

# Restore config after sync
if [ "$LIVE_RELOAD" = true ]; then
    mv capacitor.config.ts.bak capacitor.config.ts
fi

# Build only
if [ "$BUILD_ONLY" = true ]; then
    echo -e "${GREEN}Build complete!${NC}"
    exit 0
fi

# Run the app
if [ "$LIVE_RELOAD" = true ]; then
    echo -e "${YELLOW}Starting with live reload...${NC}"
    echo -e "${YELLOW}Make sure 'npm run dev' is running in another terminal!${NC}"
    if [ "$DEVICE" = true ]; then
        npx cap run android -l --target device
    else
        npx cap run android -l
    fi
else
    echo -e "${YELLOW}Running on Android...${NC}"
    if [ "$DEVICE" = true ]; then
        npx cap run android --target device
    else
        npx cap run android
    fi
fi

echo -e "${GREEN}Done! 🎉${NC}"