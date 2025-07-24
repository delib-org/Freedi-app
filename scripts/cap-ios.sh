#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🍎 Freedi iOS Development Script${NC}"
echo ""

# Function to show help
show_help() {
    echo "Usage: ./scripts/cap-ios.sh [options]"
    echo ""
    echo "Options:"
    echo "  -l, --live     Run with live reload"
    echo "  -b, --build    Build only (no run)"
    echo "  -o, --open     Open in Xcode only"
    echo "  -d, --device   Run on physical device"
    echo "  -h, --help     Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/cap-ios.sh          # Build and run on simulator"
    echo "  ./scripts/cap-ios.sh -l       # Run with live reload"
    echo "  ./scripts/cap-ios.sh -d       # Run on connected device"
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

# Open only
if [ "$OPEN_ONLY" = true ]; then
    echo -e "${YELLOW}Opening Xcode...${NC}"
    npx cap open ios
    exit 0
fi

# Build and sync
if [ "$LIVE_RELOAD" = false ]; then
    echo -e "${YELLOW}Building app...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}Syncing iOS project...${NC}"
npx cap sync ios

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
        npx cap run ios -l --target device
    else
        npx cap run ios -l
    fi
else
    echo -e "${YELLOW}Running on iOS...${NC}"
    if [ "$DEVICE" = true ]; then
        npx cap run ios --target device
    else
        npx cap run ios
    fi
fi

echo -e "${GREEN}Done! 🎉${NC}"