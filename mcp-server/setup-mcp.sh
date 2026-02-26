#!/bin/bash

# CUALA MCP Server Setup Script
# This script sets up the MCP server and configures Claude Desktop

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 CUALA MCP Server Setup"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Install dependencies
echo -e "${BLUE}1️⃣ Installing dependencies...${NC}"
cd "$SCRIPT_DIR"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 2: Build the MCP server
echo -e "${BLUE}2️⃣ Building MCP server...${NC}"
npm run build
echo -e "${GREEN}✅ MCP server built successfully${NC}"
echo ""

# Step 3: Check if CUALA API is running
echo -e "${BLUE}3️⃣ Checking CUALA API server...${NC}"
if curl -s http://localhost:3001/api/list-plans > /dev/null 2>&1; then
    echo -e "${GREEN}✅ CUALA API is running${NC}"
else
    echo -e "${YELLOW}⚠️  CUALA API is not running${NC}"
    echo -e "   Start it with: ${BLUE}cd $PROJECT_ROOT/server && npm run dev${NC}"
    echo ""
fi

# Step 4: Detect OS and show config file location
echo -e "${BLUE}4️⃣ Claude Desktop Configuration${NC}"
echo ""

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "Platform: macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    CONFIG_DIR="$HOME/.config/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "Platform: Linux"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    CONFIG_DIR="$APPDATA/Claude"
    CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
    echo "Platform: Windows"
else
    echo -e "${YELLOW}⚠️  Unknown platform. Please manually configure Claude Desktop.${NC}"
    CONFIG_FILE=""
fi

if [ -n "$CONFIG_FILE" ]; then
    echo "Config file: $CONFIG_FILE"
    echo ""

    # Check if config file exists
    if [ -f "$CONFIG_FILE" ]; then
        echo -e "${GREEN}✅ Config file exists${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  You need to manually add the CUALA MCP server to your config${NC}"
        echo ""
        echo "Add this to your mcpServers section:"
        echo ""
        echo -e "${BLUE}\"cuala\": {
  \"command\": \"node\",
  \"args\": [
    \"$SCRIPT_DIR/build/index.js\"
  ],
  \"env\": {
    \"CUALA_API_URL\": \"http://localhost:3001\"
  }
}${NC}"
    else
        echo -e "${YELLOW}⚠️  Config file doesn't exist yet${NC}"
        echo "Creating directory..."
        mkdir -p "$CONFIG_DIR"

        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "cuala": {
      "command": "node",
      "args": [
        "$SCRIPT_DIR/build/index.js"
      ],
      "env": {
        "CUALA_API_URL": "http://localhost:3001"
      }
    }
  }
}
EOF
        echo -e "${GREEN}✅ Created config file with CUALA MCP server${NC}"
    fi
fi

echo ""
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Ensure CUALA API server is running:"
echo "     cd $PROJECT_ROOT/server && npm run dev"
echo ""
echo "  2. Restart Claude Desktop completely (Cmd+Q / File→Exit)"
echo ""
echo "  3. Test in Claude Desktop:"
echo "     'Can you list all CUALA plans?'"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  - Setup Guide: $SCRIPT_DIR/CLAUDE_SETUP.md"
echo "  - Examples: $SCRIPT_DIR/EXAMPLES.md"
echo "  - Test connection: ./test-connection.sh"
echo ""
echo -e "${BLUE}Troubleshooting:${NC}"
echo "  - View logs: npm run dev (shows detailed logs)"
echo "  - Test with inspector: npx @modelcontextprotocol/inspector node build/index.js"
echo ""
