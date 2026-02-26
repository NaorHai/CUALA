#!/usr/bin/env node

/**
 * CUALA MCP Server
 *
 * Model Context Protocol server that exposes CUALA browser automation capabilities
 * to AI assistants like Claude. This allows Claude to:
 * - Execute browser automation scenarios
 * - Generate and manage test plans
 * - Query execution status and history
 * - Configure confidence thresholds
 *
 * Usage:
 *   node build/index.js
 *
 * Environment Variables:
 *   CUALA_API_URL - CUALA API server URL (default: http://localhost:3001)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { CUALAClient } from './client.js';
import {
  ExecuteScenarioSchema,
  ExecuteScenarioAsyncSchema,
  ExecutePlanSchema,
  GeneratePlanSchema,
  GetStatusSchema,
  GetHistorySchema,
  GetLatestSchema,
  UpdatePlanSchema,
  DeletePlanSchema,
  DeleteExecutionSchema,
  GetPlanSchema,
  GetConfidenceThresholdSchema,
  UpdateConfidenceThresholdSchema,
  DeleteConfidenceThresholdSchema,
} from './types.js';

dotenv.config();

// ============================================================================
// Server Configuration
// ============================================================================

const CUALA_API_URL = process.env.CUALA_API_URL || 'http://localhost:3001';
const client = new CUALAClient(CUALA_API_URL);

const server = new Server(
  {
    name: 'cuala-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================================================
// Tool Definitions
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Execution Tools
      {
        name: 'cuala_execute_scenario',
        description: 'Execute a browser automation scenario synchronously. Returns results immediately when complete.',
        inputSchema: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: 'Natural language description of the test scenario (e.g., "Navigate to google.com and search for cats")',
            },
            failFast: {
              type: 'boolean',
              description: 'Stop execution on first failure (default: true)',
            },
          },
          required: ['scenario'],
        },
      },
      {
        name: 'cuala_execute_scenario_async',
        description: 'Execute a browser automation scenario asynchronously. Returns immediately with testId for polling.',
        inputSchema: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: 'Natural language description of the test scenario',
            },
            failFast: {
              type: 'boolean',
              description: 'Stop execution on first failure (default: true)',
            },
          },
          required: ['scenario'],
        },
      },
      {
        name: 'cuala_execute_plan',
        description: 'Execute a previously generated plan synchronously.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: {
              type: 'string',
              description: 'ID of the plan to execute',
            },
            failFast: {
              type: 'boolean',
              description: 'Stop execution on first failure',
            },
          },
          required: ['planId'],
        },
      },
      {
        name: 'cuala_execute_plan_async',
        description: 'Execute a previously generated plan asynchronously.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: {
              type: 'string',
              description: 'ID of the plan to execute',
            },
            failFast: {
              type: 'boolean',
              description: 'Stop execution on first failure',
            },
          },
          required: ['planId'],
        },
      },

      // Plan Management Tools
      {
        name: 'cuala_generate_plan',
        description: 'Generate an execution plan from natural language without executing it (dry run). Useful for previewing steps.',
        inputSchema: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: 'Natural language description for plan generation',
            },
          },
          required: ['scenario'],
        },
      },
      {
        name: 'cuala_get_plan',
        description: 'Get details of a specific plan by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: {
              type: 'string',
              description: 'Plan ID to retrieve',
            },
          },
          required: ['planId'],
        },
      },
      {
        name: 'cuala_list_plans',
        description: 'List all execution plans with their metadata.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'cuala_update_plan',
        description: 'Update an existing plan (name, steps, phase, or refinement history).',
        inputSchema: {
          type: 'object',
          properties: {
            planId: {
              type: 'string',
              description: 'Plan ID to update',
            },
            name: {
              type: 'string',
              description: 'New plan name',
            },
            steps: {
              type: 'array',
              description: 'Updated plan steps',
            },
            phase: {
              type: 'string',
              description: 'Plan phase (initial, refined, adaptive)',
            },
            refinementHistory: {
              type: 'array',
              description: 'Refinement history',
            },
          },
          required: ['planId'],
        },
      },
      {
        name: 'cuala_delete_plan',
        description: 'Delete a specific plan by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: {
              type: 'string',
              description: 'Plan ID to delete',
            },
          },
          required: ['planId'],
        },
      },
      {
        name: 'cuala_delete_all_plans',
        description: 'Delete all plans. Use with caution.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // Execution Status Tools
      {
        name: 'cuala_get_status',
        description: 'Get execution status and results for a specific test.',
        inputSchema: {
          type: 'object',
          properties: {
            testId: {
              type: 'string',
              description: 'Execution test ID',
            },
          },
          required: ['testId'],
        },
      },
      {
        name: 'cuala_get_all_statuses',
        description: 'Get status of all executions.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'cuala_get_history',
        description: 'Get execution history for a specific scenario.',
        inputSchema: {
          type: 'object',
          properties: {
            scenarioId: {
              type: 'string',
              description: 'Scenario ID to get execution history',
            },
          },
          required: ['scenarioId'],
        },
      },
      {
        name: 'cuala_get_latest',
        description: 'Get the latest execution for a specific scenario.',
        inputSchema: {
          type: 'object',
          properties: {
            scenarioId: {
              type: 'string',
              description: 'Scenario ID to get latest execution',
            },
          },
          required: ['scenarioId'],
        },
      },
      {
        name: 'cuala_delete_execution',
        description: 'Delete a specific execution by test ID.',
        inputSchema: {
          type: 'object',
          properties: {
            testId: {
              type: 'string',
              description: 'Execution test ID to delete',
            },
          },
          required: ['testId'],
        },
      },
      {
        name: 'cuala_delete_all_executions',
        description: 'Delete all execution records. Use with caution.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },

      // Configuration Tools
      {
        name: 'cuala_get_confidence_thresholds',
        description: 'Get all confidence thresholds for element discovery.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'cuala_get_confidence_threshold',
        description: 'Get confidence threshold for a specific action type.',
        inputSchema: {
          type: 'object',
          properties: {
            actionType: {
              type: 'string',
              description: 'Action type (click, type, hover, verify)',
            },
          },
          required: ['actionType'],
        },
      },
      {
        name: 'cuala_update_confidence_threshold',
        description: 'Update confidence threshold for a specific action type.',
        inputSchema: {
          type: 'object',
          properties: {
            actionType: {
              type: 'string',
              description: 'Action type (click, type, hover, verify)',
            },
            threshold: {
              type: 'number',
              description: 'Confidence threshold (0.0 to 1.0)',
              minimum: 0,
              maximum: 1,
            },
          },
          required: ['actionType', 'threshold'],
        },
      },
      {
        name: 'cuala_delete_confidence_threshold',
        description: 'Reset confidence threshold for a specific action type to default.',
        inputSchema: {
          type: 'object',
          properties: {
            actionType: {
              type: 'string',
              description: 'Action type to reset threshold',
            },
          },
          required: ['actionType'],
        },
      },
      {
        name: 'cuala_reset_all_confidence_thresholds',
        description: 'Reset all confidence thresholds to defaults.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// ============================================================================
// Tool Execution Handler
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Execution Tools
      case 'cuala_execute_scenario': {
        const { scenario, failFast } = ExecuteScenarioSchema.parse(args);
        const result = await client.executeScenario(scenario, failFast);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_execute_scenario_async': {
        const { scenario, failFast } = ExecuteScenarioAsyncSchema.parse(args);
        const result = await client.executeScenarioAsync(scenario, failFast);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_execute_plan': {
        const { planId, failFast } = ExecutePlanSchema.parse(args);
        const result = await client.executePlan(planId, failFast);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_execute_plan_async': {
        const { planId, failFast } = ExecutePlanSchema.parse(args);
        const result = await client.executePlanAsync(planId, failFast);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Plan Management Tools
      case 'cuala_generate_plan': {
        const { scenario } = GeneratePlanSchema.parse(args);
        const result = await client.generatePlan(scenario);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_get_plan': {
        const { planId } = GetPlanSchema.parse(args);
        const result = await client.getPlan(planId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_list_plans': {
        const result = await client.listPlans();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_update_plan': {
        const { planId, ...updates } = UpdatePlanSchema.parse(args);
        const result = await client.updatePlan(planId, updates);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_delete_plan': {
        const { planId } = DeletePlanSchema.parse(args);
        const result = await client.deletePlan(planId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_delete_all_plans': {
        const result = await client.deleteAllPlans();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Execution Status Tools
      case 'cuala_get_status': {
        const { testId } = GetStatusSchema.parse(args);
        const result = await client.getStatus(testId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_get_all_statuses': {
        const result = await client.getAllStatuses();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_get_history': {
        const { scenarioId } = GetHistorySchema.parse(args);
        const result = await client.getHistory(scenarioId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_get_latest': {
        const { scenarioId } = GetLatestSchema.parse(args);
        const result = await client.getLatest(scenarioId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_delete_execution': {
        const { testId } = DeleteExecutionSchema.parse(args);
        const result = await client.deleteExecution(testId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_delete_all_executions': {
        const result = await client.deleteAllExecutions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Configuration Tools
      case 'cuala_get_confidence_thresholds': {
        const result = await client.getConfidenceThresholds();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_get_confidence_threshold': {
        const { actionType } = GetConfidenceThresholdSchema.parse(args);
        const result = await client.getConfidenceThreshold(actionType);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_update_confidence_threshold': {
        const { actionType, threshold } = UpdateConfidenceThresholdSchema.parse(args);
        const result = await client.updateConfidenceThreshold(actionType, threshold);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_delete_confidence_threshold': {
        const { actionType } = DeleteConfidenceThresholdSchema.parse(args);
        const result = await client.deleteConfidenceThreshold(actionType);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala_reset_all_confidence_thresholds': {
        const result = await client.resetAllConfidenceThresholds();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
    throw error;
  }
});

// ============================================================================
// Resource Definitions
// ============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'cuala://executions/all',
        name: 'All Executions',
        description: 'List of all test executions with their current status',
        mimeType: 'application/json',
      },
      {
        uri: 'cuala://plans/all',
        name: 'All Plans',
        description: 'List of all test plans',
        mimeType: 'application/json',
      },
      {
        uri: 'cuala://config/confidence-thresholds',
        name: 'Confidence Thresholds',
        description: 'Current confidence threshold configuration',
        mimeType: 'application/json',
      },
    ],
  };
});

// ============================================================================
// Resource Read Handler
// ============================================================================

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case 'cuala://executions/all': {
        const result = await client.getAllStatuses();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala://plans/all': {
        const result = await client.listPlans();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'cuala://config/confidence-thresholds': {
        const result = await client.getConfidenceThresholds();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read resource: ${error.message}`);
    }
    throw error;
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('CUALA MCP Server running');
  console.error(`Connected to CUALA API at ${CUALA_API_URL}`);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
