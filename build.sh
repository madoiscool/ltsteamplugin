#!/bin/bash
# Build Script for LuaTools Steam Plugin (Linux/Mac)
# Creates a ZIP file ready for distribution

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Configuration
OUTPUT_NAME="${1:-ltsteamplugin.zip}"
CLEAN="${2:-false}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_PATH="${ROOT_DIR}/${OUTPUT_NAME}"

echo -e "${CYAN}=== LuaTools Build Script ===${NC}"
echo -e "${GRAY}Root directory: ${ROOT_DIR}${NC}"

# Clean previous build if requested
if [ "$CLEAN" = "true" ] && [ -f "$OUTPUT_PATH" ]; then
    echo -e "${YELLOW}Removing previous build...${NC}"
    rm -f "$OUTPUT_PATH"
fi

# Validate project structure
echo -e "\n${CYAN}Validating project structure...${NC}"

REQUIRED_FILES=(
    "plugin.json"
    "backend/main.py"
    "public/luatools.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "${ROOT_DIR}/${file}" ]; then
        echo -e "${RED}ERROR: Required file not found: ${file}${NC}"
        exit 1
    fi
done

echo -e "${GREEN}Structure validated successfully!${NC}"

# Read version from plugin.json
if command -v python3 &> /dev/null; then
    VERSION=$(python3 -c "import json; print(json.load(open('${ROOT_DIR}/plugin.json'))['version'])" 2>/dev/null || echo "unknown")
    echo -e "${CYAN}Plugin version: ${VERSION}${NC}"
else
    VERSION="unknown"
    echo -e "${YELLOW}WARNING: Python not found, could not read version${NC}"
fi

# Validate locales (optional)
echo -e "\n${CYAN}Validating locale files...${NC}"
if command -v python3 &> /dev/null; then
    cd "$ROOT_DIR"
    if python3 scripts/validate_locales.py; then
        echo -e "${GREEN}Locales validated successfully!${NC}"
    else
        echo -e "${YELLOW}WARNING: Locale validation failed, but continuing...${NC}"
    fi
    cd - > /dev/null
else
    echo -e "${YELLOW}WARNING: Python not found, skipping locale validation${NC}"
fi

# Create ZIP file
echo -e "\n${CYAN}Creating ZIP file...${NC}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

# Copy files to temporary directory
cd "$ROOT_DIR"

# Copy required directories and files
cp -r backend "$TEMP_DIR/"
cp -r public "$TEMP_DIR/"
cp -r vendor "$TEMP_DIR/"
cp plugin.json "$TEMP_DIR/"
cp requirements.txt "$TEMP_DIR/" 2>/dev/null || true
cp readme "$TEMP_DIR/" 2>/dev/null || true

# Remove temporary files and cache
find "$TEMP_DIR" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "$TEMP_DIR" -type f -name "*.pyc" -delete 2>/dev/null || true
find "$TEMP_DIR" -type f -name "*.pyo" -delete 2>/dev/null || true
find "$TEMP_DIR" -type f -name ".DS_Store" -delete 2>/dev/null || true

# Remove temporary directories if they exist
rm -rf "$TEMP_DIR/backend/temp_dl" 2>/dev/null || true
rm -rf "$TEMP_DIR/backend/data" 2>/dev/null || true

# Create ZIP
cd "$TEMP_DIR"
zip -r "$OUTPUT_PATH" . -q
cd "$ROOT_DIR"

# Verify ZIP was created
if [ ! -f "$OUTPUT_PATH" ]; then
    echo -e "${RED}ERROR: Failed to create ZIP file${NC}"
    exit 1
fi

ZIP_SIZE=$(du -h "$OUTPUT_PATH" | cut -f1)

echo -e "\n${GREEN}✓ Build completed successfully!${NC}"
echo -e "  ${CYAN}File: ${OUTPUT_PATH}${NC}"
echo -e "  ${CYAN}Size: ${ZIP_SIZE}${NC}"
echo -e "  ${CYAN}Version: ${VERSION}${NC}"

echo -e "\n${CYAN}=== Build Finished ===${NC}"
