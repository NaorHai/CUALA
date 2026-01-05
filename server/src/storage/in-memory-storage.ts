/**
 * In-memory implementation of IStorage.
 * This is a simple implementation that stores state in memory.
 * Can be easily replaced with a database implementation later.
 * 
 * Maintains execution history per scenario ID - all executions of the same scenario
 * share the same scenarioId and can be queried together.
 */

import { IStorage, IExecutionState, IConfiguration } from './index.js';
import { IExecutionPlan } from '../types/index.js';
import { createHash } from 'crypto';

export class InMemoryStorage implements IStorage {
  // Map testId -> execution state
  private executions: Map<string, IExecutionState> = new Map();
  
  // Map scenarioId -> array of testIds (for quick lookup of execution history)
  private scenarioExecutions: Map<string, string[]> = new Map();

  // Map planId -> plan (for plan persistence)
  private plans: Map<string, IExecutionPlan> = new Map();

  // Map scenarioId -> array of planIds (for plan history)
  private scenarioPlans: Map<string, string[]> = new Map();

  /**
   * Generate a consistent scenarioId from scenario description
   * This ensures all executions of the same scenario share the same scenarioId
   */
  generateScenarioId(scenario: string): string {
    const hash = createHash('sha256').update(scenario.trim().toLowerCase()).digest('hex');
    return `scenario-${hash.substring(0, 16)}`;
  }

  async createExecution(scenario: string): Promise<string> {
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const scenarioId = this.generateScenarioId(scenario);
    
    const state: IExecutionState = {
      testId,
      scenarioId,
      scenario,
      status: 'pending',
      createdAt: Date.now(),
      results: []
    };

    // Store execution by testId
    this.executions.set(testId, state);
    
    // Add to scenario execution history
    if (!this.scenarioExecutions.has(scenarioId)) {
      this.scenarioExecutions.set(scenarioId, []);
    }
    this.scenarioExecutions.get(scenarioId)!.push(testId);
    
    return testId;
  }

  async getExecution(testId: string): Promise<IExecutionState | null> {
    return this.executions.get(testId) || null;
  }

  async getExecutionsByScenarioId(scenarioId: string): Promise<IExecutionState[]> {
    const testIds = this.scenarioExecutions.get(scenarioId) || [];
    const executions: IExecutionState[] = [];
    
    for (const testId of testIds) {
      const execution = this.executions.get(testId);
      if (execution) {
        executions.push(execution);
      }
    }
    
    // Sort by creation time (newest first)
    return executions.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getLatestExecutionByScenarioId(scenarioId: string): Promise<IExecutionState | null> {
    const executions = await this.getExecutionsByScenarioId(scenarioId);
    return executions.length > 0 ? executions[0] : null;
  }

  async updateExecution(testId: string, updates: Partial<IExecutionState>): Promise<void> {
    const existing = this.executions.get(testId);
    if (!existing) {
      throw new Error(`Execution ${testId} not found`);
    }

    const updated: IExecutionState = {
      ...existing,
      ...updates
    };

    this.executions.set(testId, updated);
  }

  async deleteExecution(testId: string): Promise<void> {
    const execution = this.executions.get(testId);
    if (execution) {
      // Remove from scenario history
      const testIds = this.scenarioExecutions.get(execution.scenarioId);
      if (testIds) {
        const index = testIds.indexOf(testId);
        if (index > -1) {
          testIds.splice(index, 1);
        }
      }
    }
    
    this.executions.delete(testId);
  }

  async deleteAllExecutions(): Promise<void> {
    // Clear all executions
    this.executions.clear();
    
    // Clear all scenario execution mappings
    this.scenarioExecutions.clear();
  }

  async listExecutions(): Promise<IExecutionState[]> {
    return Array.from(this.executions.values());
  }

  async getPlanByPlanId(planId: string): Promise<IExecutionPlan | null> {
    // First check dedicated plan storage
    const plan = this.plans.get(planId);
    if (plan) {
      return plan;
    }
    
    // Fallback: search through executions (for backward compatibility)
    for (const execution of this.executions.values()) {
      if (execution.planId === planId && execution.plan) {
        return execution.plan;
      }
    }
    return null;
  }

  async savePlan(plan: IExecutionPlan): Promise<void> {
    // Store plan by planId
    const planWithTimestamp = {
      ...plan,
      createdAt: plan.createdAt || Date.now()
    };
    this.plans.set(plan.id, planWithTimestamp);
    
    // Add to scenario plan history
    if (!this.scenarioPlans.has(plan.scenarioId)) {
      this.scenarioPlans.set(plan.scenarioId, []);
    }
    const planIds = this.scenarioPlans.get(plan.scenarioId)!;
    if (!planIds.includes(plan.id)) {
      planIds.push(plan.id);
    }
  }

  async getPlansByScenarioId(scenarioId: string): Promise<IExecutionPlan[]> {
    const planIds = this.scenarioPlans.get(scenarioId) || [];
    const plans: IExecutionPlan[] = [];
    
    for (const planId of planIds) {
      const plan = this.plans.get(planId);
      if (plan) {
        plans.push(plan);
      }
    }
    
    // Sort by creation time (newest first)
    return plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async listPlans(): Promise<IExecutionPlan[]> {
    return Array.from(this.plans.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async deletePlan(planId: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (plan) {
      // Remove from scenario plan history
      const planIds = this.scenarioPlans.get(plan.scenarioId);
      if (planIds) {
        const index = planIds.indexOf(planId);
        if (index > -1) {
          planIds.splice(index, 1);
        }
      }
    }
    
    // Remove plan from storage
    this.plans.delete(planId);
  }

  async updatePlan(planId: string, updates: Partial<IExecutionPlan>): Promise<void> {
    const existing = this.plans.get(planId);
    if (!existing) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Merge updates with existing plan
    const updated: IExecutionPlan = {
      ...existing,
      ...updates,
      id: planId, // Ensure ID cannot be changed
      scenarioId: existing.scenarioId, // Ensure scenarioId cannot be changed
      createdAt: existing.createdAt // Preserve original creation time
    };

    this.plans.set(planId, updated);
  }

  async deleteAllPlans(): Promise<void> {
    // Clear all plans
    this.plans.clear();
    
    // Clear all scenario plan mappings
    this.scenarioPlans.clear();
  }

  // Configuration Storage
  private configurations: Map<string, IConfiguration> = new Map();

  async getConfiguration(key: string): Promise<IConfiguration | null> {
    return this.configurations.get(key) || null;
  }

  async getAllConfigurations(prefix?: string): Promise<IConfiguration[]> {
    const allConfigs = Array.from(this.configurations.values());
    if (!prefix) {
      return allConfigs;
    }
    return allConfigs.filter(config => config.key.startsWith(prefix));
  }

  async setConfiguration(key: string, value: unknown, description?: string): Promise<void> {
    const existing = this.configurations.get(key);
    const now = Date.now();
    
    const config: IConfiguration = {
      id: existing?.id || `config-${now}-${Math.random().toString(36).substr(2, 9)}`,
      key,
      value,
      description: description || existing?.description,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    
    this.configurations.set(key, config);
  }

  async deleteConfiguration(key: string): Promise<void> {
    this.configurations.delete(key);
  }

  async deleteAllConfigurations(prefix?: string): Promise<void> {
    if (!prefix) {
      this.configurations.clear();
      return;
    }
    
    // Delete all configurations with the given prefix
    const keysToDelete: string[] = [];
    for (const [key] of this.configurations.entries()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.configurations.delete(key));
  }
}

