#!/bin/bash

# Test Runner Script for Refactored HTTP Functions

echo "🧪 Firebase Functions Test Runner"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the functions directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Not in functions directory${NC}"
    echo "Please run this script from the functions/ directory"
    exit 1
fi

# Function to run tests
run_tests() {
    case $1 in
        "all")
            echo -e "${GREEN}Running all tests...${NC}"
            npm test
            ;;
        "watch")
            echo -e "${GREEN}Running tests in watch mode...${NC}"
            npm run test:watch
            ;;
        "coverage")
            echo -e "${GREEN}Running tests with coverage report...${NC}"
            npm run test:coverage
            echo ""
            echo -e "${YELLOW}Coverage report generated in coverage/html/index.html${NC}"
            ;;
        "unit")
            echo -e "${GREEN}Running unit tests only...${NC}"
            npm test -- --testPathPattern="(services|utils)/__tests__"
            ;;
        "integration")
            echo -e "${GREEN}Running integration tests only...${NC}"
            npm test -- --testPathPattern="controllers/__tests__"
            ;;
        "specific")
            if [ -z "$2" ]; then
                echo -e "${RED}Error: Please provide a test name pattern${NC}"
                echo "Usage: ./run-tests.sh specific \"test name pattern\""
                exit 1
            fi
            echo -e "${GREEN}Running tests matching: $2${NC}"
            npm test -- --testNamePattern="$2"
            ;;
        "file")
            if [ -z "$2" ]; then
                echo -e "${RED}Error: Please provide a file name${NC}"
                echo "Usage: ./run-tests.sh file filename.test.ts"
                exit 1
            fi
            echo -e "${GREEN}Running tests in file: $2${NC}"
            npm test -- "$2"
            ;;
        *)
            echo "Usage: ./run-tests.sh [command] [options]"
            echo ""
            echo "Commands:"
            echo "  all         - Run all tests"
            echo "  watch       - Run tests in watch mode"
            echo "  coverage    - Run tests with coverage report"
            echo "  unit        - Run unit tests only"
            echo "  integration - Run integration tests only"
            echo "  specific    - Run tests matching a pattern"
            echo "  file        - Run tests in a specific file"
            echo ""
            echo "Examples:"
            echo "  ./run-tests.sh all"
            echo "  ./run-tests.sh coverage"
            echo "  ./run-tests.sh specific \"should fetch user options\""
            echo "  ./run-tests.sh file statementService.test.ts"
            ;;
    esac
}

# Check if jest is installed
if ! npm list jest &>/dev/null; then
    echo -e "${YELLOW}Jest is not installed. Installing test dependencies...${NC}"
    npm install --save-dev jest @types/jest ts-jest @firebase/testing firebase-functions-test
fi

# Run the requested test command
run_tests "$@"