# CUALA MCP Server

Model Context Protocol (MCP) server that exposes CUALA browser automation capabilities to AI assistants like Claude.

## Features

### 🛠️ Tools (19 total)

#### Execution Tools
- `cuala_execute_scenario` - Execute browser automation scenario synchronously
- `cuala_execute_scenario_async` - Execute scenario asynchronously (returns testId)
- `cuala_execute_plan` - Execute a saved plan synchronously
- `cuala_execute_plan_async` - Execute a saved plan asynchronously

#### Plan Management Tools
- `cuala_generate_plan` - Generate execution plan without executing (dry run)
- `cuala_get_plan` - Get plan details by ID
- `cuala_list_plans` - List all plans
- `cuala_update_plan` - Update existing plan
- `cuala_delete_plan` - Delete specific plan
- `cuala_delete_all_plans` - Delete all plans

#### Status & History Tools
- `cuala_get_status` - Get execution status by testId
- `cuala_get_all_statuses` - Get all execution statuses
- `cuala_get_history` - Get execution history for a scenario
- `cuala_get_latest` - Get latest execution for a scenario
- `cuala_delete_execution` - Delete specific execution
- `cuala_delete_all_executions` - Delete all executions

#### Configuration Tools
- `cuala_get_confidence_thresholds` - Get all confidence thresholds
- `cuala_get_confidence_threshold` - Get threshold for specific action
- `cuala_update_confidence_threshold` - Update action threshold
- `cuala_delete_confidence_threshold` - Reset threshold to default
- `cuala_reset_all_confidence_thresholds` - Reset all thresholds

### 📚 Resources (3 total)

- `cuala://executions/all` - All test executions
- `cuala://plans/all` - All test plans
- `cuala://config/confidence-thresholds` - Configuration

## Installation

### Prerequisites

1. **CUALA API Server must be running**
   ```bash
   cd ../server
   npm run dev
   # Server should be running at http://localhost:3001
   ```

2. **Node.js 18+** installed

### Install Dependencies

```bash
cd mcp-server
npm install
```

### Build

```bash
npm run build
```

## Usage

### Option 1: Using with Claude Desktop

1. **Build the MCP server:**
   ```bash
   npm run build
   ```

2. **Configure Claude Desktop:**

   Edit your Claude Desktop config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

   Add the CUALA MCP server:
   ```json
   {
     "mcpServers": {
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

3. **Restart Claude Desktop**

4. **Test the integration:**

   In Claude Desktop, try:
   ```
   Can you use CUALA to navigate to google.com and search for "MCP protocol"?
   ```

### Option 2: Testing Locally (Development)

```bash
# Terminal 1: Start CUALA API server
cd ../server
npm run dev

# Terminal 2: Start MCP server in development mode
cd mcp-server
npm run dev
```

### Option 3: Using with MCP Inspector

```bash
# Install MCP Inspector (if not already installed)
npm install -g @modelcontextprotocol/inspector

# Run the MCP server through inspector
npx @modelcontextprotocol/inspector node build/index.js
```

This opens a web UI at `http://localhost:5173` where you can:
- Test all tools interactively
- View available resources
- Debug tool calls

## Configuration

### Environment Variables

Create a `.env` file in the `mcp-server` directory:

```env
CUALA_API_URL=http://localhost:3001
```

**Default**: `http://localhost:3001` (if not specified)

## Example Usage in Claude

Once configured, Claude can use CUALA directly:

### Example 1: Execute a Simple Scenario

**User:** "Use CUALA to test logging into example.com"

**Claude will:**
1. Call `cuala_execute_scenario` with natural language description
2. CUALA breaks it into steps (navigate, find login form, fill fields, submit)
3. Returns execution results with screenshots

### Example 2: Generate and Review Plan

**User:** "Generate a test plan for checking out on an e-commerce site, but don't execute it yet"

**Claude will:**
1. Call `cuala_generate_plan` to create the plan
2. Show you the steps that would be executed
3. Ask for confirmation before executing

### Example 3: Check Execution Status

**User:** "What's the status of test execution abc123?"

**Claude will:**
1. Call `cuala_get_status` with testId
2. Parse and explain the results
3. Show any failures or screenshots

### Example 4: Manage Confidence Thresholds

**User:** "Set the click confidence threshold to 0.8"

**Claude will:**
1. Call `cuala_update_confidence_threshold`
2. Confirm the change
3. Explain what this means for element discovery

## Tool Details

### cuala_execute_scenario

Execute a browser automation scenario synchronously.

**Parameters:**
- `scenario` (required): Natural language description
- `failFast` (optional): Stop on first failure (default: true)

**Returns:**
- Execution results with steps, status, screenshots

**Example:**
```typescript
{
  scenario: "Navigate to https://google.com and search for 'MCP'",
  failFast: true
}
```

### cuala_generate_plan

Generate an execution plan without executing (dry run).

**Parameters:**
- `scenario` (required): Natural language description

**Returns:**
- Generated plan with steps and metadata

**Use Cases:**
- Preview what CUALA will do
- Review and edit steps before execution
- Create reusable test templates

### cuala_get_status

Get execution status and detailed results.

**Parameters:**
- `testId` (required): Execution test ID

**Returns:**
- Status (pending, running, success, failure, error)
- Step-by-step results
- Screenshots
- Error messages

## Architecture

```
Claude Desktop
     ↓
MCP Protocol (stdio)
     ↓
CUALA MCP Server (this project)
     ↓
HTTP/REST
     ↓
CUALA API Server (localhost:3001)
     ↓
CUALA Core (Playwright + AI)
```

## Development

### File Structure

```
mcp-server/
├── src/
│   ├── index.ts       # MCP server implementation
│   ├── client.ts      # CUALA API client
│   └── types.ts       # TypeScript types and Zod schemas
├── build/             # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode for development
- `npm run dev` - Run in development mode with tsx
- `npm start` - Run the compiled server

### Adding New Tools

1. **Add type schema** in `src/types.ts`:
   ```typescript
   export const NewToolSchema = z.object({
     param1: z.string(),
   });
   ```

2. **Add client method** in `src/client.ts`:
   ```typescript
   async newTool(param1: string) {
     return this.request('POST', '/api/new-endpoint', { param1 });
   }
   ```

3. **Register tool** in `src/index.ts` (ListToolsRequestSchema):
   ```typescript
   {
     name: 'cuala_new_tool',
     description: 'Description of what it does',
     inputSchema: {
       type: 'object',
       properties: {
         param1: { type: 'string', description: '...' }
       },
       required: ['param1']
     }
   }
   ```

4. **Add handler** in `src/index.ts` (CallToolRequestSchema):
   ```typescript
   case 'cuala_new_tool': {
     const { param1 } = NewToolSchema.parse(args);
     const result = await client.newTool(param1);
     return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
   }
   ```

## Troubleshooting

### MCP Server Not Showing in Claude Desktop

1. Check config file path is correct
2. Verify build folder exists: `ls build/index.js`
3. Check Claude Desktop logs (Help → View Logs)
4. Restart Claude Desktop completely

### "Failed to connect to CUALA API"

1. Ensure CUALA API server is running:
   ```bash
   curl http://localhost:3001/health
   ```
2. Check `CUALA_API_URL` in config matches server address
3. Check server logs for errors

### Tools Not Working

1. Test with MCP Inspector first: `npx @modelcontextprotocol/inspector node build/index.js`
2. Check server logs: `npm run dev` shows detailed logs
3. Verify API endpoints work directly: `curl -X POST http://localhost:3001/api/list-plans`

## Security Considerations

- MCP server runs locally on your machine
- No external network access required (except to CUALA API)
- All browser automation runs in isolated contexts
- No credentials stored in MCP server
- API calls are validated with Zod schemas

## Contributing

Contributions welcome! Please:
1. Add tests for new tools
2. Update documentation
3. Follow existing code style
4. Add type safety with Zod

## License

Same as CUALA project

## Support

- GitHub Issues: [CUALA Repository](https://github.com/NaorHai/CUALA)
- MCP Documentation: [Model Context Protocol](https://modelcontextprotocol.io)

---

**Built with ❤️ for the Claude + CUALA integration**
