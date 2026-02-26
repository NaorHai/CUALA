# CUALA MCP Server - Claude Code CLI Setup

## ✅ Configuration Complete!

The CUALA MCP server has been added to your Claude Code CLI configuration.

## Configuration Added

**File**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    ...
    "cuala": {
      "command": "node",
      "args": [
        "/Users/nhaimov/Documents/Private/CUALA/mcp-server/build/index.js"
      ],
      "env": {
        "CUALA_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Next Steps

### 1. **Exit Current Claude Code Session**

You need to exit this session for the MCP server to load:

```bash
# Type 'exit' or Ctrl+D
exit
```

### 2. **Ensure CUALA API is Running**

Before starting Claude Code again, make sure the CUALA API server is running:

```bash
# Terminal 1: Start CUALA API
cd /Users/nhaimov/Documents/Private/CUALA/server
npm run dev

# Wait for: "CUALA API Server running at http://localhost:3001"
```

### 3. **Start New Claude Code Session**

```bash
claude
```

### 4. **Verify MCP Server Loaded**

Once Claude Code starts, test the integration:

**Test 1: List Resources**
```
Can you list available CUALA resources?
```

**Test 2: List Plans**
```
Use the cuala_list_plans tool to show me all test plans
```

**Test 3: Execute Simple Scenario**
```
Use CUALA to navigate to example.com and verify the heading says "Example Domain"
```

## Available Tools

Once loaded, you'll have access to 19 CUALA tools:

### Execution
- `cuala_execute_scenario` - Run tests synchronously
- `cuala_execute_scenario_async` - Run tests asynchronously
- `cuala_execute_plan` - Execute saved plan
- `cuala_execute_plan_async` - Execute plan async

### Plan Management
- `cuala_generate_plan` - Generate plan (dry run)
- `cuala_get_plan` - Get plan details
- `cuala_list_plans` - List all plans
- `cuala_update_plan` - Modify plan
- `cuala_delete_plan` - Delete plan
- `cuala_delete_all_plans` - Clear all plans

### Status & History
- `cuala_get_status` - Get execution status
- `cuala_get_all_statuses` - List all executions
- `cuala_get_history` - Get scenario history
- `cuala_get_latest` - Get latest execution
- `cuala_delete_execution` - Delete execution
- `cuala_delete_all_executions` - Clear executions

### Configuration
- `cuala_get_confidence_thresholds` - Get thresholds
- `cuala_get_confidence_threshold` - Get specific threshold
- `cuala_update_confidence_threshold` - Update threshold
- `cuala_delete_confidence_threshold` - Reset threshold
- `cuala_reset_all_confidence_thresholds` - Reset all

## Example Usage in Claude Code

### Simple Test
```
Run a CUALA test:
- Navigate to google.com
- Search for "model context protocol"
- Verify results appear
```

### Generate Plan
```
Generate a CUALA test plan for an e-commerce checkout flow:
1. Add product to cart
2. Go to checkout
3. Fill shipping info
4. Verify order summary
Don't execute it yet, just show me the plan.
```

### Check Status
```
What's the status of CUALA test execution abc123?
```

### Manage Configuration
```
Show me all CUALA confidence thresholds and lower the click threshold to 0.6
```

## Troubleshooting

### MCP Server Not Loading

**Check Claude Code logs:**
```bash
# In new terminal
tail -f ~/.claude/debug/*.log | grep -i cuala
```

**Verify configuration:**
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .mcpServers.cuala
```

**Expected output:**
```json
{
  "command": "node",
  "args": [
    "/Users/nhaimov/Documents/Private/CUALA/mcp-server/build/index.js"
  ],
  "env": {
    "CUALA_API_URL": "http://localhost:3001"
  }
}
```

### CUALA API Not Responding

**Test API manually:**
```bash
curl http://localhost:3001/api/list-plans
```

**Should return:**
```json
{"totalPlans":0,"plans":[]}
```

**If not responding:**
```bash
cd /Users/nhaimov/Documents/Private/CUALA/server
npm run dev
```

### MCP Tools Not Appearing

**Restart Claude Code completely:**
```bash
# Exit current session
exit

# Kill any remaining Claude Code processes
pkill -f "claude"

# Start fresh
claude
```

**Check MCP server status:**
```bash
ps aux | grep cuala | grep -v grep
```

Should show the MCP server process running.

### Test MCP Server Directly

**Run MCP Inspector:**
```bash
cd /Users/nhaimov/Documents/Private/CUALA/mcp-server
npx @modelcontextprotocol/inspector node build/index.js
```

Opens UI at http://localhost:5173 for interactive testing.

## Permissions

You may need to approve CUALA tools on first use. When Claude asks to use a CUALA tool, approve it and optionally add to always-allow list.

**To always allow CUALA tools**, add to `~/.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__cuala__cuala_execute_scenario",
      "mcp__cuala__cuala_list_plans",
      "mcp__cuala__cuala_get_status"
    ]
  }
}
```

## Integration with Skills

You can create Claude Code skills that use CUALA:

**Example Skill**: `~/.claude/skills/web-test.md`

```markdown
---
name: web-test
description: Run browser automation tests with CUALA
argument-hint: [scenario]
allowed-tools: mcp__cuala__cuala_execute_scenario, mcp__cuala__cuala_get_status
---

# Web Test Skill

Run browser automation tests using CUALA.

## Usage

```bash
/web-test "Navigate to example.com and verify title"
```

## Implementation

1. Use cuala_execute_scenario_async to start test
2. Poll cuala_get_status until complete
3. Display results with screenshots
```

## Benefits in Claude Code

### Workflow Integration

**Test as Part of Development:**
```
I just deployed my changes to staging. Can you run the CUALA smoke tests?
```

**Continuous Validation:**
```
Run the login test suite and let me know if anything fails
```

**Debugging:**
```
That test failed. Can you analyze the screenshots and suggest what's wrong?
```

### Combined with Other MCP Servers

**CUALA + GUS:**
```
Get the GUS ticket W-12345678, then generate and run CUALA tests for all acceptance criteria
```

**CUALA + Confluence:**
```
Search Confluence for our test plan, then execute those scenarios with CUALA
```

**CUALA + Slack:**
```
Run the checkout tests and post results to #qa-channel
```

## Architecture

```
Your Command
     ↓
Claude Code CLI
     ↓
MCP Protocol (stdio)
     ↓
CUALA MCP Server (node process)
     ↓
HTTP REST
     ↓
CUALA API Server (localhost:3001)
     ↓
Browser Automation (Playwright + AI)
```

## Files Reference

- **MCP Server**: `/Users/nhaimov/Documents/Private/CUALA/mcp-server/`
- **API Server**: `/Users/nhaimov/Documents/Private/CUALA/server/`
- **UI**: `/Users/nhaimov/Documents/Private/CUALA/ui/`
- **Config**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Logs**: `~/.claude/debug/`

## Quick Reference

**Start Everything:**
```bash
# Terminal 1: CUALA API
cd /Users/nhaimov/Documents/Private/CUALA/server && npm run dev

# Terminal 2: CUALA UI (optional)
cd /Users/nhaimov/Documents/Private/CUALA/ui && npm run dev

# Terminal 3: Claude Code
claude
```

**Test Connection:**
```bash
cd /Users/nhaimov/Documents/Private/CUALA/mcp-server
./test-connection.sh
```

**View Logs:**
```bash
tail -f ~/.claude/debug/*.log | grep -i cuala
```

---

## 🎉 Ready to Use!

Exit this session, ensure CUALA API is running, and start a new Claude Code session to access CUALA tools!

**First command to try:**
```
Can you use CUALA to test example.com?
```
