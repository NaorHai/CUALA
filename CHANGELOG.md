# Changelog

All notable changes to CUALA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-26

### Added

#### 🤖 Multi-LLM Provider Support
- **Provider Abstraction Layer** - Clean interface for multiple LLM providers
- **Anthropic Claude Support** - Full integration with Claude 3.5 Sonnet and Haiku
- **Provider Factory** - Automatic provider selection based on configuration
- **Flexible Configuration** - Easy switching between OpenAI and Anthropic

#### Supported Providers
**OpenAI**
- GPT-4o, GPT-4o-mini, GPT-4-turbo
- Native JSON mode support
- Vision capabilities
- Moderation API integration

**Anthropic Claude**
- Claude 3.5 Sonnet (latest, most capable)
- Claude 3.5 Haiku (faster, cost-effective)
- Claude 3 Opus (maximum capability)
- Excellent reasoning and vision support

#### New Configuration Options
- `LLM_PROVIDER` - Select 'openai' or 'anthropic'
- `ANTHROPIC_API_KEY` - API key for Claude
- `ANTHROPIC_MODEL` - Default Claude model
- `ANTHROPIC_VISION_MODEL` - Claude model for vision tasks
- `ANTHROPIC_PLANNER_MODEL` - Claude model for planning

#### Technical Implementation
- Created `ILLMProvider` interface with common abstraction
- Implemented `OpenAIProvider` adapter
- Implemented `AnthropicProvider` adapter
- Updated all components to use provider abstraction (Planner, Verifier, Element Discovery)
- Added provider factory with configuration-based instantiation

### Changed
- Refactored `OpenAIPlanner` to `LLMPlanner` (provider-agnostic)
- Updated all LLM-using components to work with provider abstraction
- Enhanced `.env.example` with comprehensive provider configuration

### Technical Details
- **Dependencies**: Added `@anthropic-ai/sdk` ^0.32.1
- **Architecture**: Provider pattern for LLM abstraction
- **Backward Compatible**: Existing OpenAI configurations continue to work

---

## [0.2.0] - 2026-02-26

### Added

#### 🤖 Model Context Protocol (MCP) Integration
- **Complete MCP Server** for Claude Desktop and Claude Code CLI integration
  - 19 tools exposing full CUALA API functionality
  - 3 resources for data access (executions, plans, configuration)
  - Type-safe implementation with TypeScript and Zod validation
  - Full API coverage (24/24 endpoints)

#### 📚 Comprehensive Documentation
- **7 documentation files** (2,500+ lines total)
  - `README.md` - Complete API reference
  - `CLAUDE_SETUP.md` - Claude Desktop setup guide
  - `CLAUDE_CODE_CLI_SETUP.md` - Claude Code CLI setup guide
  - `EXAMPLES.md` - 18 real-world usage examples
  - `MCP_SUMMARY.md` - Technical project summary
  - `INTEGRATION_SUMMARY.md` - Integration overview
  - `README_FIRST.md` - Quick start guide

#### 🛠️ Automation Scripts
- `setup-mcp.sh` - Automated MCP server setup
- `quick-start.sh` - One-command service startup
- `test-connection.sh` - Connection verification script

#### ✨ Key Features
- Natural language browser testing from Claude
- Synchronous and asynchronous execution modes
- Test plan generation and management
- Execution status tracking and history
- Confidence threshold configuration
- Works with both Claude Desktop and Claude Code CLI

### Technical Details

#### MCP Tools (19 total)
**Execution Tools (4)**
- `cuala_execute_scenario` - Execute scenario synchronously
- `cuala_execute_scenario_async` - Execute scenario asynchronously
- `cuala_execute_plan` - Execute saved plan synchronously
- `cuala_execute_plan_async` - Execute saved plan asynchronously

**Plan Management Tools (6)**
- `cuala_generate_plan` - Generate plan without execution
- `cuala_get_plan` - Get plan details by ID
- `cuala_list_plans` - List all plans
- `cuala_update_plan` - Update existing plan
- `cuala_delete_plan` - Delete specific plan
- `cuala_delete_all_plans` - Delete all plans

**Status & History Tools (6)**
- `cuala_get_status` - Get execution status
- `cuala_get_all_statuses` - List all executions
- `cuala_get_history` - Get scenario history
- `cuala_get_latest` - Get latest execution
- `cuala_delete_execution` - Delete specific execution
- `cuala_delete_all_executions` - Delete all executions

**Configuration Tools (5)**
- `cuala_get_confidence_thresholds` - Get all thresholds
- `cuala_get_confidence_threshold` - Get specific threshold
- `cuala_update_confidence_threshold` - Update threshold
- `cuala_delete_confidence_threshold` - Reset threshold
- `cuala_reset_all_confidence_thresholds` - Reset all thresholds

#### MCP Resources (3 total)
- `cuala://executions/all` - All test executions
- `cuala://plans/all` - All test plans
- `cuala://config/confidence-thresholds` - Configuration

#### Performance
- Startup time: <100ms
- Tool call latency: ~50ms
- Memory usage: ~30MB
- Build time: ~2 seconds

#### Security
- Local execution only
- Input validation with Zod schemas
- Type-safe TypeScript implementation
- No credential storage in MCP server

### Changed
- Updated main README with MCP integration section
- Bumped version from 0.1.0 to 0.2.0 across all packages

---

## [0.1.0] - 2025-01-12

### Added
- Initial release of CUALA browser automation system
- Natural language test scenario execution
- DOM-based execution with vision AI fallback
- Adaptive planning and refinement system
- Multi-strategy element discovery
- Intelligent verification system
- REST API for programmatic access
- React-based UI for test management
- Redis storage support
- Comprehensive logging and reporting

### Core Components
- Adaptive Planner with LLM integration
- Adaptive Execution Orchestrator
- Unified Executor (DOM + Vision AI)
- Multi-Strategy Element Discovery
- AI Verifier
- Refinement Decision Engine

### Features
- SOLID architecture principles
- TypeScript with strict mode
- OpenAI integration for planning and vision
- Playwright for browser automation
- Express-based REST API
- Safety checking with moderation API
- Sandboxed browser sessions
- Zero persistence between executions
