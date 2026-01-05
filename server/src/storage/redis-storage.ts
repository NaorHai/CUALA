/**
 * Redis implementation of IStorage.
 * Stores execution states and plans in Redis with JSON serialization.
 * 
 * Redis keys structure:
 * - execution:{testId} -> JSON(IExecutionState)
 * - scenario:executions:{scenarioId} -> Set of testIds
 * - plan:{planId} -> JSON(IExecutionPlan)
 * - scenario:plans:{scenarioId} -> Set of planIds
 * - executions:all -> Set of all testIds
 * - plans:all -> Set of all planIds
 */

import { IStorage, IExecutionState, IConfiguration } from './index.js';
import { IExecutionPlan } from '../types/index.js';
import { createHash } from 'crypto';
import { createClient, type RedisClientType } from 'redis';

export class RedisStorage implements IStorage {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({ 
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Too many reconnection attempts, giving up');
            return new Error('Too many reconnection attempts');
          }
          const delay = Math.min(retries * 100, 3000);
          console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        }
      }
    });
    
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      console.log('Redis Client Ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      console.log('Redis Client Disconnected');
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis (call this before using the storage)
   */
  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Ensure Redis connection is active before operations
   */
  private async ensureConnected(): Promise<void> {
    try {
      // Check if client is open/ready
      if (!this.client.isOpen) {
        this.isConnected = false;
        await this.connect();
      } else if (!this.isConnected) {
        // Client is open but our flag is wrong, verify with ping
        await this.client.ping();
        this.isConnected = true;
      }
    } catch (error) {
      // If connection check fails, reconnect
      console.warn('Redis connection check failed, reconnecting...', error);
      this.isConnected = false;
      try {
        if (this.client.isOpen) {
          await this.client.disconnect();
        }
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
      await this.connect();
    }
  }

  /**
   * Generate a consistent scenarioId from scenario description
   */
  generateScenarioId(scenario: string): string {
    const hash = createHash('sha256').update(scenario.trim().toLowerCase()).digest('hex');
    return `scenario-${hash.substring(0, 16)}`;
  }

  async createExecution(scenario: string): Promise<string> {
    await this.ensureConnected();
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
    await this.client.set(`execution:${testId}`, JSON.stringify(state));
    
    // Add to scenario execution history
    await this.client.sAdd(`scenario:executions:${scenarioId}`, testId);
    
    // Add to all executions set
    await this.client.sAdd('executions:all', testId);
    
    return testId;
  }

  async getExecution(testId: string): Promise<IExecutionState | null> {
    await this.ensureConnected();
    const data = await this.client.get(`execution:${testId}`);
    if (!data) {
      return null;
    }
    return JSON.parse(data) as IExecutionState;
  }

  async getExecutionsByScenarioId(scenarioId: string): Promise<IExecutionState[]> {
    await this.ensureConnected();
    const testIds = await this.client.sMembers(`scenario:executions:${scenarioId}`);
    const executions: IExecutionState[] = [];
    
    for (const testId of testIds) {
      const execution = await this.getExecution(testId);
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
    await this.ensureConnected();
    const existing = await this.getExecution(testId);
    if (!existing) {
      throw new Error(`Execution ${testId} not found`);
    }

    const updated: IExecutionState = {
      ...existing,
      ...updates
    };

    await this.client.set(`execution:${testId}`, JSON.stringify(updated));
  }

  async deleteExecution(testId: string): Promise<void> {
    await this.ensureConnected();
    const execution = await this.getExecution(testId);
    if (execution) {
      // Remove from scenario history
      await this.client.sRem(`scenario:executions:${execution.scenarioId}`, testId);
    }
    
    // Remove from all executions set
    await this.client.sRem('executions:all', testId);
    
    // Delete execution data
    await this.client.del(`execution:${testId}`);
  }

  async deleteAllExecutions(): Promise<void> {
    await this.ensureConnected();
    // Get all test IDs
    const testIds = await this.client.sMembers('executions:all');
    
    if (testIds.length === 0) {
      return; // No executions to delete
    }
    
    // Get all executions to find their scenario IDs
    const executions = await Promise.all(
      testIds.map(testId => this.getExecution(testId))
    );
    
    // Remove from scenario execution history sets
    const scenarioIds = new Set<string>();
    executions.forEach(execution => {
      if (execution) {
        scenarioIds.add(execution.scenarioId);
      }
    });
    
    // Delete all scenario execution mappings
    for (const scenarioId of scenarioIds) {
      await this.client.del(`scenario:executions:${scenarioId}`);
    }
    
    // Delete all execution data
    if (testIds.length > 0) {
      await this.client.del(testIds.map(id => `execution:${id}`));
    }
    
    // Clear the all executions set
    await this.client.del('executions:all');
  }

  async listExecutions(): Promise<IExecutionState[]> {
    await this.ensureConnected();
    const testIds = await this.client.sMembers('executions:all');
    const executions: IExecutionState[] = [];
    
    for (const testId of testIds) {
      const execution = await this.getExecution(testId);
      if (execution) {
        executions.push(execution);
      }
    }
    
    return executions;
  }

  async getPlanByPlanId(planId: string): Promise<IExecutionPlan | null> {
    await this.ensureConnected();
    // First check dedicated plan storage
    const data = await this.client.get(`plan:${planId}`);
    if (data) {
      return JSON.parse(data) as IExecutionPlan;
    }
    
    // Fallback: search through executions (for backward compatibility)
    const testIds = await this.client.sMembers('executions:all');
    for (const testId of testIds) {
      const execution = await this.getExecution(testId);
      if (execution && execution.planId === planId && execution.plan) {
        return execution.plan;
      }
    }
    return null;
  }

  async savePlan(plan: IExecutionPlan): Promise<void> {
    await this.ensureConnected();
    // Store plan by planId
    const planWithTimestamp = {
      ...plan,
      createdAt: plan.createdAt || Date.now()
    };
    await this.client.set(`plan:${plan.id}`, JSON.stringify(planWithTimestamp));
    
    // Add to scenario plan history
    await this.client.sAdd(`scenario:plans:${plan.scenarioId}`, plan.id);
    
    // Add to all plans set
    await this.client.sAdd('plans:all', plan.id);
  }

  async getPlansByScenarioId(scenarioId: string): Promise<IExecutionPlan[]> {
    await this.ensureConnected();
    const planIds = await this.client.sMembers(`scenario:plans:${scenarioId}`);
    const plans: IExecutionPlan[] = [];
    
    for (const planId of planIds) {
      const plan = await this.getPlanByPlanId(planId);
      if (plan) {
        plans.push(plan);
      }
    }
    
    // Sort by creation time (newest first)
    return plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async listPlans(): Promise<IExecutionPlan[]> {
    await this.ensureConnected();
    const planIds = await this.client.sMembers('plans:all');
    const plans: IExecutionPlan[] = [];
    
    for (const planId of planIds) {
      const plan = await this.getPlanByPlanId(planId);
      if (plan) {
        plans.push(plan);
      }
    }
    
    // Sort by creation time (newest first)
    return plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async deletePlan(planId: string): Promise<void> {
    await this.ensureConnected();
    const plan = await this.getPlanByPlanId(planId);
    if (plan) {
      // Remove from scenario plan history
      await this.client.sRem(`scenario:plans:${plan.scenarioId}`, planId);
    }
    
    // Remove from all plans set
    await this.client.sRem('plans:all', planId);
    
    // Delete plan data
    await this.client.del(`plan:${planId}`);
  }

  async updatePlan(planId: string, updates: Partial<IExecutionPlan>): Promise<void> {
    await this.ensureConnected();
    const existing = await this.getPlanByPlanId(planId);
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

    await this.client.set(`plan:${planId}`, JSON.stringify(updated));
  }

  async deleteAllPlans(): Promise<void> {
    await this.ensureConnected();
    // Get all plan IDs
    const planIds = await this.client.sMembers('plans:all');
    
    if (planIds.length === 0) {
      return; // No plans to delete
    }
    
    // Get all plans to find their scenario IDs
    const plans = await Promise.all(
      planIds.map(planId => this.getPlanByPlanId(planId))
    );
    
    // Remove from scenario plan history sets
    const scenarioIds = new Set<string>();
    plans.forEach(plan => {
      if (plan) {
        scenarioIds.add(plan.scenarioId);
      }
    });
    
    // Delete all scenario plan mappings
    for (const scenarioId of scenarioIds) {
      await this.client.del(`scenario:plans:${scenarioId}`);
    }
    
    // Delete all plan data
    if (planIds.length > 0) {
      await this.client.del(planIds.map(id => `plan:${id}`));
    }
    
    // Clear the all plans set
    await this.client.del('plans:all');
  }

  // Configuration Storage
  async getConfiguration(key: string): Promise<IConfiguration | null> {
    await this.ensureConnected();
    const data = await this.client.get(`config:${key}`);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as IConfiguration;
    } catch (error) {
      return null;
    }
  }

  async getAllConfigurations(prefix?: string): Promise<IConfiguration[]> {
    await this.ensureConnected();
    const pattern = prefix ? `config:${prefix}*` : 'config:*';
    const keys = await this.client.keys(pattern);
    const configurations: IConfiguration[] = [];
    
    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        try {
          const config = JSON.parse(data) as IConfiguration;
          configurations.push(config);
        } catch (error) {
          // Skip invalid configurations
        }
      }
    }
    
    return configurations;
  }

  async setConfiguration(key: string, value: unknown, description?: string): Promise<void> {
    await this.ensureConnected();
    const existing = await this.getConfiguration(key);
    const now = Date.now();
    
    const config: IConfiguration = {
      id: existing?.id || `config-${now}-${Math.random().toString(36).substr(2, 9)}`,
      key,
      value,
      description: description || existing?.description,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    
    await this.client.set(`config:${key}`, JSON.stringify(config));
    
    // Add to all configurations set for quick lookup
    await this.client.sAdd('configs:all', key);
  }

  async deleteConfiguration(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(`config:${key}`);
    await this.client.sRem('configs:all', key);
  }

  async deleteAllConfigurations(prefix?: string): Promise<void> {
    await this.ensureConnected();
    const pattern = prefix ? `config:${prefix}*` : 'config:*';
    const keys = await this.client.keys(pattern);
    
    if (keys.length > 0) {
      await this.client.del(keys);
      
      // Remove from all configurations set
      if (prefix) {
        // Remove only keys matching the prefix
        const configKeys = keys.map(k => k.replace('config:', ''));
        if (configKeys.length > 0) {
          await this.client.sRem('configs:all', configKeys);
        }
      } else {
        // Clear the entire set
        await this.client.del('configs:all');
      }
    }
  }
}

