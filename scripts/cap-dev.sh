#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}📱 Freedi Mobile Development Environment${NC}"
echo ""

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a process is running
is_running() {
    pgrep -f "$1" > /dev/null
}

# Function to get local IP
get_local_ip() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}'
    else
        # Linux
        hostname -I | awk '{print $1}'
    fi
}

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command_exists npx; then
    echo -e "${RED}Error: npm/npx not found. Please install Node.js${NC}"
    exit 1
fi

if ! command_exists firebase; then
    echo -e "${RED}Error: Firebase CLI not found. Please install: npm install -g firebase-tools${NC}"
    exit 1
fi

# Get local IP
LOCAL_IP=$(get_local_ip)
echo -e "${BLUE}Local IP: $LOCAL_IP${NC}"

# Update environment config with local IP
echo -e "${YELLOW}Updating environment config...${NC}"
sed -i.bak "s/192\.168\.[0-9]\+\.[0-9]\+/$LOCAL_IP/g" src/config/environment.ts
sed -i.bak "s/192\.168\.[0-9]\+\.[0-9]\+/$LOCAL_IP/g" src/controllers/db/config.ts

# Start Firebase emulators if not running
if ! is_running "firebase emulators"; then
    echo -e "${YELLOW}Starting Firebase emulators...${NC}"
    osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && npm run deve"'
    echo -e "${GREEN}Firebase emulators starting in new terminal...${NC}"
    sleep 5
else
    echo -e "${GREEN}Firebase emulators already running${NC}"
fi

# Start Vite dev server if not running
if ! is_running "vite"; then
    echo -e "${YELLOW}Starting Vite dev server...${NC}"
    osascript -e 'tell app "Terminal" to do script "cd '$(pwd)' && npm run dev"'
    echo -e "${GREEN}Vite dev server starting in new terminal...${NC}"
    sleep 5
else
    echo -e "${GREEN}Vite dev server already running${NC}"
fi

# Show menu
echo ""
echo -e "${GREEN}Development environment ready!${NC}"
echo ""
echo "What would you like to do?"
echo "1) Run iOS Simulator"
echo "2) Run Android Emulator"
echo "3) Run both iOS and Android"
echo "4) Open iOS in Xcode"
echo "5) Open Android in Android Studio"
echo "6) Build for production"
echo "7) Exit"
echo ""
read -p "Enter your choice (1-7): " choice

case $choice in
    1)
        echo -e "${YELLOW}Starting iOS...${NC}"
        ./scripts/cap-ios.sh -l
        ;;
    2)
        echo -e "${YELLOW}Starting Android...${NC}"
        ./scripts/cap-android.sh -l
        ;;
    3)
        echo -e "${YELLOW}Starting both platforms...${NC}"
        ./scripts/cap-ios.sh -l &
        ./scripts/cap-android.sh -l &
        wait
        ;;
    4)
        npx cap open ios
        ;;
    5)
        npx cap open android
        ;;
    6)
        echo -e "${YELLOW}Building for production...${NC}"
        npm run build
        npx cap sync
        echo -e "${GREEN}Production build complete!${NC}"
        ;;
    7)
        echo -e "${GREEN}Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac