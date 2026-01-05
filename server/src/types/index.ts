/**
 * Core domain types for CUALA.
 * These types are shared across the system to maintain a common language.
 */

export interface ITestScenario {
  id: string;
  name: string;
  description: string;
  rawInput?: string;
}

// ExecutionMode is deprecated - unified executor automatically chooses DOM or Vision
// Kept for backward compatibility only
export type ExecutionMode = 'DOM_PREFERRED' | 'VISION_REQUIRED' | 'UNIFIED';

export type PlanPhase = 'initial' | 'refined' | 'adaptive';

export interface IExecutionPlan {
  id: string;
  scenarioId: string;
  scenario?: string; // The original scenario text/description
  name?: string; // Human-readable name for the plan
  steps: IStep[];
  phase?: PlanPhase; // Plan phase/type: initial (from planner), refined (after DOM inspection), adaptive (after recovery)
  refinementHistory?: IPlanRefinement[]; // History of plan refinements
  createdAt?: number; // Timestamp when plan was created
  // executionMode removed - unified executor handles everything automatically
}

export interface IStep {
  id: string;
  description: string;
  action: IAction;
  assertion?: IAssertion; // Optional assertion for this step
}

export interface IAssertion {
  id: string;
  description: string;
  check: string;
}

export interface IAction {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ISnapshot {
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface IExecutionResult {
  stepId: string;
  description?: string; // Step description for better API responses
  selector?: string; // Final selector that was used for execution
  status: 'success' | 'failure' | 'error';
  snapshot: ISnapshot;
  error?: string;
  timestamp?: number;
  verification?: IVerificationResult; // Verification result for this step
}

export interface IVerificationResult {
  stepId: string;
  isVerified: boolean;
  evidence: string;
}

export interface IReportData {
  scenarioId: string;
  planId: string;
  results: IExecutionResult[]; // Each result includes verification (which may include assertion verification)
  summary: {
    startTime: number;
    endTime: number;
    success: boolean;
    reason?: string; // Reason for failure if success is false
  };
}

// Adaptive Planning Types
export interface IElementDiscoveryResult {
  selector: string;
  confidence: number; // 0-1
  alternatives: string[]; // Fallback selectors
  elementInfo: {
    tag: string;
    attributes: Record<string, string>;
    text?: string;
    position?: { x: number; y: number };
  };
  strategy: string; // Which discovery strategy was used
  metadata?: {
    coordinates?: { x: number; y: number };
    visualConcept?: boolean;
    visionDiscovered?: boolean;
    [key: string]: unknown;
  };
}

export interface IRefinedStep extends IStep {
  elementDiscovery?: IElementDiscoveryResult;
  fallbackStrategies?: string[];
  retryCount?: number;
  originalSelector?: string; // Original inferred selector before refinement
}

export interface IPlanRefinement {
  stepId: string;
  originalSelector?: string;
  refinedSelector?: string;
  reason: string;
  timestamp: number;
  confidence?: number;
}

export interface IAdaptivePlan extends IExecutionPlan {
  phase: PlanPhase; // Required for adaptive plans
  refinementHistory?: IPlanRefinement[];
  refinementTimestamp?: number;
}
