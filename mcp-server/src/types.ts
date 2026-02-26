import { z } from 'zod';

// ============================================================================
// CUALA API Request/Response Types
// ============================================================================

export const ExecuteScenarioSchema = z.object({
  scenario: z.string().describe('Natural language description of the test scenario'),
  failFast: z.boolean().optional().describe('Stop execution on first failure'),
});

export const ExecuteScenarioAsyncSchema = ExecuteScenarioSchema;

export const ExecutePlanSchema = z.object({
  planId: z.string().describe('ID of the plan to execute'),
  failFast: z.boolean().optional().describe('Stop execution on first failure'),
});

export const GeneratePlanSchema = z.object({
  scenario: z.string().describe('Natural language description for plan generation'),
});

export const GetStatusSchema = z.object({
  testId: z.string().describe('Execution test ID'),
});

export const GetHistorySchema = z.object({
  scenarioId: z.string().describe('Scenario ID to get execution history'),
});

export const GetLatestSchema = z.object({
  scenarioId: z.string().describe('Scenario ID to get latest execution'),
});

export const UpdatePlanSchema = z.object({
  planId: z.string().describe('Plan ID to update'),
  name: z.string().optional().describe('New plan name'),
  steps: z.array(z.any()).optional().describe('Updated plan steps'),
  phase: z.string().optional().describe('Plan phase (initial, refined, adaptive)'),
  refinementHistory: z.array(z.any()).optional().describe('Refinement history'),
});

export const DeletePlanSchema = z.object({
  planId: z.string().describe('Plan ID to delete'),
});

export const DeleteExecutionSchema = z.object({
  testId: z.string().describe('Execution test ID to delete'),
});

export const GetPlanSchema = z.object({
  planId: z.string().describe('Plan ID to retrieve'),
});

export const GetConfidenceThresholdSchema = z.object({
  actionType: z.string().describe('Action type (click, type, hover, verify)'),
});

export const UpdateConfidenceThresholdSchema = z.object({
  actionType: z.string().describe('Action type (click, type, hover, verify)'),
  threshold: z.number().min(0).max(1).describe('Confidence threshold (0.0 to 1.0)'),
});

export const DeleteConfidenceThresholdSchema = z.object({
  actionType: z.string().describe('Action type to reset threshold'),
});

// ============================================================================
// MCP Resource Types
// ============================================================================

export interface ExecutionResource {
  testId: string;
  scenario: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'error';
  startedAt?: string;
  completedAt?: string;
  steps?: Array<{
    stepId: string;
    description: string;
    status: string;
    selector?: string;
  }>;
}

export interface PlanResource {
  id: string;
  name: string;
  scenarioId: string;
  phase: 'initial' | 'refined' | 'adaptive';
  steps: Array<{
    action: string;
    description: string;
    selector?: string;
    value?: string;
  }>;
  createdAt: string;
}

export interface ConfidenceThresholdResource {
  actionType: string;
  threshold: number;
}
