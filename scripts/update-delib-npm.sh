#!/bin/bash

# Script to update delib-npm package to latest version across all apps
# Usage: ./update-delib-npm.sh

set -e

echo "🔄 Updating delib-npm package to latest version..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory (root of the project)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define app directories
MAIN_APP="$SCRIPT_DIR"
MC_APP="$SCRIPT_DIR/apps/mass-consensus"
FUNCTIONS_APP="$SCRIPT_DIR/functions"

# Function to update delib-npm in a directory
update_delib_npm() {
    local dir=$1
    local name=$2

    if [ -f "$dir/package.json" ]; then
        # Check if delib-npm is a dependency
        if grep -q '"delib-npm"' "$dir/package.json"; then
            echo -e "${BLUE}📦 Updating $name...${NC}"
            cd "$dir"
            npm install delib-npm@latest
            echo -e "${GREEN}✅ $name updated successfully${NC}"
            echo ""
        else
            echo "⏭️  $name: delib-npm not found in dependencies, skipping..."
            echo ""
        fi
    else
        echo "⚠️  $name: package.json not found at $dir"
        echo ""
    fi
}

# Update all apps
update_delib_npm "$MAIN_APP" "Main App"
update_delib_npm "$MC_APP" "Mass Consensus App"
update_delib_npm "$FUNCTIONS_APP" "Firebase Functions"

# Return to original directory
cd "$SCRIPT_DIR"

# Show updated versions
echo "📋 Current delib-npm versions:"
echo ""

if [ -f "$MAIN_APP/package.json" ]; then
    VERSION=$(grep '"delib-npm"' "$MAIN_APP/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
    if [ -n "$VERSION" ]; then
        echo "   Main App:           $VERSION"
    fi
fi

if [ -f "$MC_APP/package.json" ]; then
    VERSION=$(grep '"delib-npm"' "$MC_APP/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
    if [ -n "$VERSION" ]; then
        echo "   Mass Consensus App: $VERSION"
    fi
fi

if [ -f "$FUNCTIONS_APP/package.json" ]; then
    VERSION=$(grep '"delib-npm"' "$FUNCTIONS_APP/package.json" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
    if [ -n "$VERSION" ]; then
        echo "   Firebase Functions: $VERSION"
    fi
fi

echo ""
echo -e "${GREEN}🎉 All apps updated!${NC}"
