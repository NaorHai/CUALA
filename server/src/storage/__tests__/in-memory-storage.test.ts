/**
 * InMemoryStorage Unit Tests
 *
 * Tests the in-memory storage implementation for:
 * - Execution management (CRUD operations)
 * - Plan persistence
 * - Configuration storage
 * - Scenario tracking and history
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../in-memory-storage.js';
import type { IExecutionState, IConfiguration } from '../index.js';
import type { IExecutionPlan } from '../../types/index.js';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  describe('Scenario ID Generation', () => {
    it('should generate consistent scenario IDs for same scenario', () => {
      const scenario = 'Navigate to https://example.com';
      const id1 = storage.generateScenarioId(scenario);
      const id2 = storage.generateScenarioId(scenario);

      expect(id1).toBe(id2);
      expect(id1).toMatch(/^scenario-[a-f0-9]{16}$/);
    });

    it('should generate different IDs for different scenarios', () => {
      const id1 = storage.generateScenarioId('Scenario A');
      const id2 = storage.generateScenarioId('Scenario B');

      expect(id1).not.toBe(id2);
    });

    it('should be case-insensitive', () => {
      const id1 = storage.generateScenarioId('NAVIGATE TO EXAMPLE.COM');
      const id2 = storage.generateScenarioId('navigate to example.com');

      expect(id1).toBe(id2);
    });

    it('should ignore leading/trailing whitespace', () => {
      const id1 = storage.generateScenarioId('  test scenario  ');
      const id2 = storage.generateScenarioId('test scenario');

      expect(id1).toBe(id2);
    });
  });

  describe('Execution Management', () => {
    it('should create execution with unique testId', async () => {
      const scenario = 'Test scenario';
      const testId = await storage.createExecution(scenario);

      expect(testId).toMatch(/^test-\d+-[a-z0-9]{9}$/);

      const execution = await storage.getExecution(testId);
      expect(execution).toBeDefined();
      expect(execution?.scenario).toBe(scenario);
      expect(execution?.status).toBe('pending');
    });

    it('should create multiple executions with unique IDs', async () => {
      const testId1 = await storage.createExecution('Scenario 1');
      const testId2 = await storage.createExecution('Scenario 2');

      expect(testId1).not.toBe(testId2);
    });

    it('should return null for non-existent execution', async () => {
      const execution = await storage.getExecution('non-existent-id');
      expect(execution).toBeNull();
    });

    it('should update execution state', async () => {
      const testId = await storage.createExecution('Test');

      await storage.updateExecution(testId, {
        status: 'running',
        results: [{ stepId: '1', status: 'success' }] as any
      });

      const execution = await storage.getExecution(testId);
      expect(execution?.status).toBe('running');
      expect(execution?.results).toHaveLength(1);
    });

    it('should throw error when updating non-existent execution', async () => {
      await expect(
        storage.updateExecution('non-existent', { status: 'completed' })
      ).rejects.toThrow('Execution non-existent not found');
    });

    it('should delete execution', async () => {
      const testId = await storage.createExecution('Test');
      await storage.deleteExecution(testId);

      const execution = await storage.getExecution(testId);
      expect(execution).toBeNull();
    });

    it('should list all executions', async () => {
      await storage.createExecution('Scenario 1');
      await storage.createExecution('Scenario 2');
      await storage.createExecution('Scenario 3');

      const executions = await storage.listExecutions();
      expect(executions).toHaveLength(3);
    });

    it('should delete all executions', async () => {
      await storage.createExecution('Scenario 1');
      await storage.createExecution('Scenario 2');
      await storage.deleteAllExecutions();

      const executions = await storage.listExecutions();
      expect(executions).toHaveLength(0);
    });
  });

  describe('Scenario History Tracking', () => {
    it('should group executions by scenario ID', async () => {
      const scenario = 'Test scenario';
      const testId1 = await storage.createExecution(scenario);
      const testId2 = await storage.createExecution(scenario);
      const testId3 = await storage.createExecution(scenario);

      const execution1 = await storage.getExecution(testId1);
      const scenarioId = execution1!.scenarioId;

      const executions = await storage.getExecutionsByScenarioId(scenarioId);
      expect(executions).toHaveLength(3);
    });

    it('should sort executions by creation time (newest first)', async () => {
      const scenario = 'Test scenario';
      const testId1 = await storage.createExecution(scenario);

      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const testId2 = await storage.createExecution(scenario);

      const execution1 = await storage.getExecution(testId1);
      const executions = await storage.getExecutionsByScenarioId(execution1!.scenarioId);

      expect(executions[0].testId).toBe(testId2); // Newest first
      expect(executions[1].testId).toBe(testId1);
    });

    it('should get latest execution for scenario', async () => {
      const scenario = 'Test scenario';
      await storage.createExecution(scenario);
      await new Promise(resolve => setTimeout(resolve, 10));
      const latestTestId = await storage.createExecution(scenario);

      const execution = await storage.getExecution(latestTestId);
      const latest = await storage.getLatestExecutionByScenarioId(execution!.scenarioId);

      expect(latest?.testId).toBe(latestTestId);
    });

    it('should return null for scenario with no executions', async () => {
      const latest = await storage.getLatestExecutionByScenarioId('non-existent-scenario');
      expect(latest).toBeNull();
    });

    it('should remove execution from scenario history on delete', async () => {
      const scenario = 'Test scenario';
      const testId = await storage.createExecution(scenario);
      const execution = await storage.getExecution(testId);
      const scenarioId = execution!.scenarioId;

      await storage.deleteExecution(testId);

      const executions = await storage.getExecutionsByScenarioId(scenarioId);
      expect(executions).toHaveLength(0);
    });
  });

  describe('Plan Management', () => {
    it('should save and retrieve plan', async () => {
      const plan: IExecutionPlan = {
        id: 'plan-123',
        scenarioId: 'scenario-abc',
        name: 'Test Plan',
        steps: [],
        phase: 'initial'
      };

      await storage.savePlan(plan);
      const retrieved = await storage.getPlanByPlanId('plan-123');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Plan');
      expect(retrieved?.createdAt).toBeDefined();
    });

    it('should return null for non-existent plan', async () => {
      const plan = await storage.getPlanByPlanId('non-existent');
      expect(plan).toBeNull();
    });

    it('should list all plans', async () => {
      await storage.savePlan({
        id: 'plan-1',
        scenarioId: 'scenario-1',
        name: 'Plan 1',
        steps: [],
        phase: 'initial'
      });
      await storage.savePlan({
        id: 'plan-2',
        scenarioId: 'scenario-2',
        name: 'Plan 2',
        steps: [],
        phase: 'refined'
      });

      const plans = await storage.listPlans();
      expect(plans).toHaveLength(2);
    });

    it('should update plan', async () => {
      const plan: IExecutionPlan = {
        id: 'plan-123',
        scenarioId: 'scenario-abc',
        name: 'Original Name',
        steps: [],
        phase: 'initial',
        createdAt: 1000
      };

      await storage.savePlan(plan);
      await storage.updatePlan('plan-123', {
        name: 'Updated Name',
        phase: 'refined'
      });

      const updated = await storage.getPlanByPlanId('plan-123');
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.phase).toBe('refined');
      expect(updated?.createdAt).toBe(1000); // Preserved
    });

    it('should not allow updating plan ID or scenarioId', async () => {
      const plan: IExecutionPlan = {
        id: 'plan-123',
        scenarioId: 'scenario-abc',
        name: 'Test',
        steps: [],
        phase: 'initial'
      };

      await storage.savePlan(plan);
      await storage.updatePlan('plan-123', {
        id: 'different-id',
        scenarioId: 'different-scenario'
      } as any);

      const updated = await storage.getPlanByPlanId('plan-123');
      expect(updated?.id).toBe('plan-123');
      expect(updated?.scenarioId).toBe('scenario-abc');
    });

    it('should throw error when updating non-existent plan', async () => {
      await expect(
        storage.updatePlan('non-existent', { name: 'New Name' })
      ).rejects.toThrow('Plan non-existent not found');
    });

    it('should delete plan', async () => {
      await storage.savePlan({
        id: 'plan-123',
        scenarioId: 'scenario-abc',
        name: 'Test',
        steps: [],
        phase: 'initial'
      });

      await storage.deletePlan('plan-123');
      const plan = await storage.getPlanByPlanId('plan-123');
      expect(plan).toBeNull();
    });

    it('should delete all plans', async () => {
      await storage.savePlan({
        id: 'plan-1',
        scenarioId: 'scenario-1',
        name: 'Plan 1',
        steps: [],
        phase: 'initial'
      });
      await storage.savePlan({
        id: 'plan-2',
        scenarioId: 'scenario-2',
        name: 'Plan 2',
        steps: [],
        phase: 'initial'
      });

      await storage.deleteAllPlans();
      const plans = await storage.listPlans();
      expect(plans).toHaveLength(0);
    });
  });

  describe('Plan History by Scenario', () => {
    it('should group plans by scenario ID', async () => {
      const scenarioId = 'scenario-abc';
      await storage.savePlan({
        id: 'plan-1',
        scenarioId,
        name: 'Plan 1',
        steps: [],
        phase: 'initial',
        createdAt: 1000
      });
      await storage.savePlan({
        id: 'plan-2',
        scenarioId,
        name: 'Plan 2',
        steps: [],
        phase: 'refined',
        createdAt: 2000
      });

      const plans = await storage.getPlansByScenarioId(scenarioId);
      expect(plans).toHaveLength(2);
    });

    it('should sort plans by creation time (newest first)', async () => {
      const scenarioId = 'scenario-abc';
      await storage.savePlan({
        id: 'plan-old',
        scenarioId,
        name: 'Old Plan',
        steps: [],
        phase: 'initial',
        createdAt: 1000
      });
      await storage.savePlan({
        id: 'plan-new',
        scenarioId,
        name: 'New Plan',
        steps: [],
        phase: 'refined',
        createdAt: 2000
      });

      const plans = await storage.getPlansByScenarioId(scenarioId);
      expect(plans[0].id).toBe('plan-new'); // Newest first
      expect(plans[1].id).toBe('plan-old');
    });

    it('should not duplicate plans when saved multiple times', async () => {
      const plan: IExecutionPlan = {
        id: 'plan-123',
        scenarioId: 'scenario-abc',
        name: 'Test',
        steps: [],
        phase: 'initial'
      };

      await storage.savePlan(plan);
      await storage.savePlan(plan);
      await storage.savePlan(plan);

      const plans = await storage.getPlansByScenarioId('scenario-abc');
      expect(plans).toHaveLength(1);
    });

    it('should remove plan from scenario history on delete', async () => {
      const scenarioId = 'scenario-abc';
      await storage.savePlan({
        id: 'plan-123',
        scenarioId,
        name: 'Test',
        steps: [],
        phase: 'initial'
      });

      await storage.deletePlan('plan-123');
      const plans = await storage.getPlansByScenarioId(scenarioId);
      expect(plans).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should set and get configuration', async () => {
      await storage.setConfiguration('test.key', 'test value', 'Test description');
      const config = await storage.getConfiguration('test.key');

      expect(config).toBeDefined();
      expect(config?.key).toBe('test.key');
      expect(config?.value).toBe('test value');
      expect(config?.description).toBe('Test description');
      expect(config?.id).toBeDefined();
      expect(config?.createdAt).toBeDefined();
      expect(config?.updatedAt).toBeDefined();
    });

    it('should return null for non-existent configuration', async () => {
      const config = await storage.getConfiguration('non.existent');
      expect(config).toBeNull();
    });

    it('should update existing configuration', async () => {
      await storage.setConfiguration('test.key', 'original', 'Original description');
      const original = await storage.getConfiguration('test.key');
      const originalCreatedAt = original?.createdAt;

      await new Promise(resolve => setTimeout(resolve, 10));
      await storage.setConfiguration('test.key', 'updated', 'Updated description');

      const updated = await storage.getConfiguration('test.key');
      expect(updated?.value).toBe('updated');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.createdAt).toBe(originalCreatedAt); // Preserved
      expect(updated?.updatedAt).toBeGreaterThan(original!.updatedAt);
    });

    it('should get all configurations', async () => {
      await storage.setConfiguration('key1', 'value1');
      await storage.setConfiguration('key2', 'value2');
      await storage.setConfiguration('key3', 'value3');

      const configs = await storage.getAllConfigurations();
      expect(configs).toHaveLength(3);
    });

    it('should filter configurations by prefix', async () => {
      await storage.setConfiguration('app.theme', 'dark');
      await storage.setConfiguration('app.language', 'en');
      await storage.setConfiguration('user.name', 'John');

      const appConfigs = await storage.getAllConfigurations('app.');
      expect(appConfigs).toHaveLength(2);
      expect(appConfigs.every(c => c.key.startsWith('app.'))).toBe(true);
    });

    it('should delete configuration', async () => {
      await storage.setConfiguration('test.key', 'value');
      await storage.deleteConfiguration('test.key');

      const config = await storage.getConfiguration('test.key');
      expect(config).toBeNull();
    });

    it('should delete all configurations', async () => {
      await storage.setConfiguration('key1', 'value1');
      await storage.setConfiguration('key2', 'value2');
      await storage.deleteAllConfigurations();

      const configs = await storage.getAllConfigurations();
      expect(configs).toHaveLength(0);
    });

    it('should delete configurations by prefix', async () => {
      await storage.setConfiguration('app.theme', 'dark');
      await storage.setConfiguration('app.language', 'en');
      await storage.setConfiguration('user.name', 'John');

      await storage.deleteAllConfigurations('app.');

      const allConfigs = await storage.getAllConfigurations();
      expect(allConfigs).toHaveLength(1);
      expect(allConfigs[0].key).toBe('user.name');
    });

    it('should handle complex value types', async () => {
      const complexValue = {
        nested: { data: [1, 2, 3] },
        boolean: true,
        number: 42
      };

      await storage.setConfiguration('complex.key', complexValue);
      const config = await storage.getConfiguration('complex.key');

      expect(config?.value).toEqual(complexValue);
    });
  });
});
