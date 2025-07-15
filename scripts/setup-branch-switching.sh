#!/bin/bash

# Setup script for React version branch switching
# This script configures the development environment for easy React version switching

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Setting up React version branch switching...${NC}"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ This is not a git repository${NC}"
    exit 1
fi

# Configure git hooks path
echo -e "${YELLOW}📂 Configuring git hooks...${NC}"
git config core.hooksPath .githooks

# Make hooks executable
echo -e "${YELLOW}🔧 Making hooks executable...${NC}"
chmod +x .githooks/post-checkout

# Test the setup
echo -e "${YELLOW}🧪 Testing setup...${NC}"
if [ -x ".githooks/post-checkout" ]; then
    echo -e "${GREEN}✅ Post-checkout hook is executable${NC}"
else
    echo -e "${RED}❌ Post-checkout hook is not executable${NC}"
    exit 1
fi

# Show current React version
echo -e "${BLUE}📋 Current React version:${NC}"
npm list react react-dom 2>/dev/null || echo "React not found in node_modules"

echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${BLUE}📖 Available commands:${NC}"
echo -e "  ${YELLOW}npm run switch-to-react18${NC}  - Switch to React 18"
echo -e "  ${YELLOW}npm run switch-to-react19${NC}  - Switch to React 19"
echo -e "  ${YELLOW}npm run check-react${NC}        - Check current React version"
echo ""
echo -e "${BLUE}🔄 Automatic switching:${NC}"
echo -e "  The post-checkout hook will automatically install the correct React version"
echo -e "  when you switch branches with 'git checkout <branch>'"
echo ""
echo -e "${GREEN}🎉 Happy coding!${NC}"