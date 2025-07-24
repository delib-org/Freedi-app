#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🤖 Running Freedi on Android${NC}"

# Function to check if emulator is running
check_emulator() {
    ~/Library/Android/sdk/platform-tools/adb devices | grep -E "emulator-[0-9]+" | grep -v offline
}

# Function to wait for emulator
wait_for_emulator() {
    echo -e "${YELLOW}Waiting for emulator to be ready...${NC}"
    while [ -z "$(check_emulator)" ]; do
        sleep 2
    done
    echo -e "${GREEN}Emulator is ready!${NC}"
}

# Check if emulator is running
if [ -z "$(check_emulator)" ]; then
    echo -e "${RED}No Android emulator detected!${NC}"
    echo -e "${YELLOW}Please start an emulator from Android Studio:${NC}"
    echo "1. Open Android Studio"
    echo "2. Click 'AVD Manager' (phone icon)"
    echo "3. Start an emulator"
    exit 1
fi

# Kill and restart ADB if needed
echo -e "${YELLOW}Restarting ADB server...${NC}"
~/Library/Android/sdk/platform-tools/adb kill-server
~/Library/Android/sdk/platform-tools/adb start-server

# Wait for emulator to be ready
wait_for_emulator

# Get emulator ID
EMULATOR_ID=$(~/Library/Android/sdk/platform-tools/adb devices | grep -E "emulator-[0-9]+" | grep -v offline | head -1 | awk '{print $1}')

if [ -z "$EMULATOR_ID" ]; then
    echo -e "${RED}Could not find emulator ID${NC}"
    exit 1
fi

echo -e "${GREEN}Found emulator: $EMULATOR_ID${NC}"

# Build the app
echo -e "${YELLOW}Building app...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

# Sync Android
echo -e "${YELLOW}Syncing Android...${NC}"
npx cap sync android

# Run on the emulator
echo -e "${YELLOW}Deploying to emulator...${NC}"
npx cap run android --target "$EMULATOR_ID"

echo -e "${GREEN}Done! Check your Android emulator.${NC}"