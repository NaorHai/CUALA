/**
 * Storage interface for test execution state.
 * Follows SOLID principles - specifically Dependency Inversion Principle.
 * This abstraction allows easy migration from in-memory to real database.
 */

import { IReportData, IExecutionResult, IVerificationResult, IExecutionPlan } from '../types/index.js';

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IExecutionState {
  testId: string;
  scenarioId: string;
  scenario: string;
  status: ExecutionStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  planId?: string;
  plan?: IExecutionPlan;
  currentStep?: number;
  totalSteps?: number;
  results: IExecutionResult[];
  reportData?: IReportData;
  error?: string;
}

export interface IStorage {
  /**
   * Create a new execution state and return the test ID
   * The scenarioId is derived from the scenario description to maintain history
   */
  createExecution(scenario: string): Promise<string>;

  /**
   * Get execution state by test ID
   */
  getExecution(testId: string): Promise<IExecutionState | null>;

  /**
   * Get all executions for a scenario ID (execution history)
   */
  getExecutionsByScenarioId(scenarioId: string): Promise<IExecutionState[]>;

  /**
   * Get the latest execution for a scenario ID
   */
  getLatestExecutionByScenarioId(scenarioId: string): Promise<IExecutionState | null>;

  /**
   * Update execution state
   */
  updateExecution(testId: string, updates: Partial<IExecutionState>): Promise<void>;

  /**
   * Delete execution state (cleanup)
   */
  deleteExecution(testId: string): Promise<void>;

  /**
   * Delete all executions from storage
   */
  deleteAllExecutions(): Promise<void>;

  /**
   * List all executions (optional, for debugging)
   */
  listExecutions(): Promise<IExecutionState[]>;

  /**
   * Get execution plan by plan ID
   */
  getPlanByPlanId(planId: string): Promise<IExecutionPlan | null>;

  /**
   * Save a plan (persist it independently of executions)
   */
  savePlan(plan: IExecutionPlan): Promise<void>;

  /**
   * Get all plans for a scenario ID
   */
  getPlansByScenarioId(scenarioId: string): Promise<IExecutionPlan[]>;

  /**
   * List all execution plans
   */
  listPlans(): Promise<IExecutionPlan[]>;

  /**
   * Delete a plan by plan ID
   */
  deletePlan(planId: string): Promise<void>;

  /**
   * Update an existing plan by plan ID
   */
  updatePlan(planId: string, updates: Partial<IExecutionPlan>): Promise<void>;

  /**
   * Delete all plans from storage
   */
  deleteAllPlans(): Promise<void>;

  /**
   * Generate scenarioId from scenario description (for lookup purposes)
   */
  generateScenarioId(scenario: string): string;

  /**
   * Configuration Management
   * Generic configuration storage that can be extended for any configuration property
   */
  getConfiguration(key: string): Promise<IConfiguration | null>;
  getAllConfigurations(prefix?: string): Promise<IConfiguration[]>;
  setConfiguration(key: string, value: unknown, description?: string): Promise<void>;
  deleteConfiguration(key: string): Promise<void>;
  deleteAllConfigurations(prefix?: string): Promise<void>;
}

/**
 * Configuration entity interface
 */
export interface IConfiguration {
  id: string;
  key: string;
  value: unknown;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

