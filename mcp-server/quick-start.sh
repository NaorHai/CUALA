#!/bin/bash

# CUALA MCP Server - Quick Start Script
# Starts all required services for Claude Code integration

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting CUALA Services for Claude Code"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if CUALA API is already running
if curl -s http://localhost:3001/api/list-plans > /dev/null 2>&1; then
    echo -e "${GREEN}✅ CUALA API already running${NC}"
else
    echo -e "${BLUE}Starting CUALA API Server...${NC}"
    cd "$PROJECT_ROOT/server"

    # Start in background
    npm run dev > /tmp/cuala-api.log 2>&1 &
    API_PID=$!
    echo $API_PID > /tmp/cuala-api.pid

    # Wait for it to start
    echo "Waiting for API to start..."
    for i in {1..10}; do
        if curl -s http://localhost:3001/api/list-plans > /dev/null 2>&1; then
            echo -e "${GREEN}✅ CUALA API started (PID: $API_PID)${NC}"
            break
        fi
        sleep 1
    done
fi

echo ""
echo -e "${GREEN}🎉 CUALA is ready!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Exit current Claude Code session (if in one): exit"
echo "  2. Start new Claude Code session: claude"
echo "  3. Test CUALA: 'Use CUALA to test example.com'"
echo ""
echo -e "${BLUE}Monitor logs:${NC}"
echo "  CUALA API: tail -f /tmp/cuala-api.log"
echo "  Claude Code: tail -f ~/.claude/debug/*.log | grep -i cuala"
echo ""
echo -e "${BLUE}Stop services:${NC}"
echo "  kill \$(cat /tmp/cuala-api.pid) 2>/dev/null || true"
echo ""
