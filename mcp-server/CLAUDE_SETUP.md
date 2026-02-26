# Setting Up CUALA MCP Server with Claude Desktop

This guide walks you through integrating CUALA with Claude Desktop using the Model Context Protocol.

## Prerequisites

✅ **CUALA API Server** running at `http://localhost:3001`
✅ **Claude Desktop** installed
✅ **Node.js 18+** installed

## Step 1: Build the MCP Server

```bash
cd /path/to/CUALA/mcp-server
npm install
npm run build
```

Verify the build succeeded:
```bash
ls build/index.js
# Should show: build/index.js
```

## Step 2: Configure Claude Desktop

### Find Your Config File

**macOS:**
```bash
open ~/Library/Application\ Support/Claude/
# Edit: claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```
~/.config/Claude/claude_desktop_config.json
```

### Add CUALA Configuration

Edit `claude_desktop_config.json` and add the CUALA MCP server:

```json
{
  "mcpServers": {
    "cuala": {
      "command": "node",
      "args": [
        "/path/to/CUALA/mcp-server/build/index.js"
      ],
      "env": {
        "CUALA_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

**⚠️ Important:** Replace `/path/to/CUALA` with your actual path if different.

### If You Have Existing MCP Servers

If you already have MCP servers configured, merge them:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "...",
      "args": ["..."]
    },
    "cuala": {
      "command": "node",
      "args": [
        "/path/to/CUALA/mcp-server/build/index.js"
      ],
      "env": {
        "CUALA_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Step 3: Start Required Services

### Terminal 1: CUALA API Server

```bash
cd /path/to/CUALA/server
npm run dev
```

Wait for: `CUALA API Server running at http://localhost:3001`

### Terminal 2: CUALA UI (Optional)

```bash
cd /path/to/CUALA/ui
npm run dev
```

Open: `http://localhost:3000`

## Step 4: Restart Claude Desktop

**Completely quit and restart Claude Desktop** for the changes to take effect.

- **macOS**: Cmd+Q, then reopen
- **Windows**: File → Exit, then reopen
- **Linux**: Quit completely, then reopen

## Step 5: Verify Integration

### Check MCP Server Status

In Claude Desktop, look for:
- A tool icon (🔧) in the input area
- MCP servers shown in settings/tools panel

### Test with Simple Command

In Claude Desktop, try:

```
Can you list all available CUALA plans?
```

Claude should use the `cuala_list_plans` tool and show results.

### Test Execution

```
Use CUALA to navigate to https://example.com and verify the heading says "Example Domain"
```

Claude should:
1. Call `cuala_execute_scenario`
2. Show execution progress
3. Return results with screenshots

## Common Test Scenarios

### 1. Generate Plan (Dry Run)

```
Generate a CUALA test plan for:
1. Navigate to google.com
2. Search for "Model Context Protocol"
3. Verify results appear

Don't execute it yet, just show me the plan.
```

### 2. Execute Simple Scenario

```
Execute a CUALA test:
- Go to https://example.com
- Verify the page title contains "Example"
```

### 3. Check Execution Status

```
What's the status of CUALA test execution <testId>?
```

### 4. Manage Configuration

```
Show me the current CUALA confidence thresholds and set the click threshold to 0.8
```

## Troubleshooting

### Issue: MCP Server Not Appearing

**Check config file syntax:**
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python -m json.tool
```

If syntax error, it will show line number.

**Check build exists:**
```bash
ls /path/to/CUALA/mcp-server/build/index.js
```

**View Claude Desktop logs:**
- Help → View Logs
- Look for MCP-related errors

### Issue: "Failed to connect to CUALA API"

**Test API manually:**
```bash
curl http://localhost:3001/api/list-plans
```

Should return JSON (even if empty list).

**Check API server is running:**
```bash
lsof -i :3001
```

Should show node process on port 3001.

### Issue: Tools Not Working

**Test with MCP Inspector:**
```bash
cd /path/to/CUALA/mcp-server
npx @modelcontextprotocol/inspector node build/index.js
```

Opens UI at `http://localhost:5173` to test tools directly.

**Check API endpoints manually:**
```bash
# Generate a plan
curl -X POST http://localhost:3001/api/plan \
  -H "Content-Type: application/json" \
  -d '{"scenario": "Navigate to google.com"}'

# List plans
curl http://localhost:3001/api/list-plans
```

### Issue: Outdated Build

After any code changes, rebuild:
```bash
cd /path/to/CUALA/mcp-server
npm run build
```

Then restart Claude Desktop.

## Advanced Configuration

### Using Different API URL

If CUALA API is on different port/host:

```json
{
  "mcpServers": {
    "cuala": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "CUALA_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

### Running Multiple CUALA Instances

```json
{
  "mcpServers": {
    "cuala-dev": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "CUALA_API_URL": "http://localhost:3001"
      }
    },
    "cuala-prod": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "CUALA_API_URL": "http://production-server:3001"
      }
    }
  }
}
```

## What Claude Can Do with CUALA

Once configured, Claude can:

### ✅ Execute Browser Tests
```
Test the login flow on example.com:
- Navigate to login page
- Fill username "test@example.com"
- Fill password "password123"
- Click login button
- Verify dashboard appears
```

### ✅ Generate Test Plans
```
Create a test plan for an e-commerce checkout flow but don't run it yet
```

### ✅ Debug Failed Tests
```
Test execution abc123 failed. Can you analyze what went wrong and suggest fixes?
```

### ✅ Manage Test Suite
```
List all CUALA test plans and delete any older than 30 days
```

### ✅ Configure Thresholds
```
The element discovery is too strict. Can you lower the confidence thresholds?
```

## Security Notes

- ✅ MCP server runs **locally** on your machine
- ✅ No external network access (except to your CUALA API)
- ✅ All browser automation runs in **isolated contexts**
- ✅ No credentials stored in MCP server
- ✅ API calls validated with **Zod schemas**

## Updates

To update the MCP server after code changes:

```bash
cd /path/to/CUALA/mcp-server
git pull  # if pulling updates
npm install  # if dependencies changed
npm run build
```

Then restart Claude Desktop.

## Getting Help

- **CUALA Issues**: https://github.com/NaorHai/CUALA/issues
- **MCP Documentation**: https://modelcontextprotocol.io
- **Claude Support**: help.anthropic.com

---

**Happy automating with Claude + CUALA! 🚀**
