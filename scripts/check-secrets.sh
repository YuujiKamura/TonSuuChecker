#!/bin/bash

# Check for secrets and hardcoded values in all source files
# 全ソースファイルの機密情報チェック

echo "Checking all source files for secrets..."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Find all source files
FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "./node_modules/*" ! -path "./.git/*")

# Check for Google API keys
echo ""
echo "=== Checking for API keys ==="
API_KEY_PATTERN='AIza[A-Za-z0-9_-]{35}'
for FILE in $FILES; do
    MATCHES=$(grep -nE "$API_KEY_PATTERN" "$FILE" 2>/dev/null)
    if [ ! -z "$MATCHES" ]; then
        echo -e "${RED}ERROR: API key in $FILE${NC}"
        echo "$MATCHES"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check for hardcoded GAS URLs
echo ""
echo "=== Checking for hardcoded URLs ==="
for FILE in $FILES; do
    MATCHES=$(grep -nE 'https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec' "$FILE" 2>/dev/null)
    if [ ! -z "$MATCHES" ]; then
        echo -e "${YELLOW}WARNING: Hardcoded GAS URL in $FILE${NC}"
        echo "$MATCHES"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# Summary
echo ""
echo "=== Summary ==="
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}Errors: $ERRORS${NC}"
fi
if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
fi
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
fi

exit $ERRORS
