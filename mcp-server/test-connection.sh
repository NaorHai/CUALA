#!/bin/bash

# Test CUALA MCP Server Connection
# This script verifies that the MCP server can connect to the CUALA API

echo "🔍 Testing CUALA MCP Server Connection..."
echo ""

# Check if CUALA API is running
echo "1️⃣ Checking if CUALA API is running..."
if curl -s http://localhost:3001/api/list-plans > /dev/null 2>&1; then
    echo "   ✅ CUALA API is running at http://localhost:3001"
else
    echo "   ❌ CUALA API is not responding"
    echo "   💡 Start it with: cd ../server && npm run dev"
    exit 1
fi

echo ""

# Check if build exists
echo "2️⃣ Checking if MCP server is built..."
if [ -f "build/index.js" ]; then
    echo "   ✅ MCP server built successfully"
else
    echo "   ❌ MCP server not built"
    echo "   💡 Build it with: npm run build"
    exit 1
fi

echo ""

# Test a simple API call
echo "3️⃣ Testing API connection..."
RESULT=$(curl -s http://localhost:3001/api/list-plans)
if [ $? -eq 0 ]; then
    echo "   ✅ Successfully connected to CUALA API"
    echo "   📊 Response: $RESULT"
else
    echo "   ❌ Failed to connect to CUALA API"
    exit 1
fi

echo ""
echo "✅ All checks passed! The MCP server should work correctly."
echo ""
echo "📝 Next steps:"
echo "   1. Configure Claude Desktop (see CLAUDE_SETUP.md)"
echo "   2. Restart Claude Desktop"
echo "   3. Test with: 'Can you list all CUALA plans?'"
