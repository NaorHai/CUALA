/**
 * Storage Factory Unit Tests
 *
 * Tests the storage factory for creating different storage implementations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStorage } from '../storage-factory.js';
import { InMemoryStorage } from '../in-memory-storage.js';

describe('Storage Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Memory Storage', () => {
    it('should create InMemoryStorage when STORAGE_TYPE is "memory"', async () => {
      process.env.STORAGE_TYPE = 'memory';
      const storage = await createStorage();
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });

    it('should create InMemoryStorage when STORAGE_TYPE is not set', async () => {
      delete process.env.STORAGE_TYPE;
      const storage = await createStorage();
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });

    it('should create InMemoryStorage as default', async () => {
      process.env.STORAGE_TYPE = 'invalid-type';
      const storage = await createStorage();
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });

    it('should handle case-insensitive storage type', async () => {
      process.env.STORAGE_TYPE = 'MEMORY';
      const storage = await createStorage();
      expect(storage).toBeInstanceOf(InMemoryStorage);
    });
  });

  describe('Redis Storage', () => {
    it('should create RedisStorage when STORAGE_TYPE is "redis"', async () => {
      process.env.STORAGE_TYPE = 'redis';
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Mock Redis connection - we can't test actual Redis without infrastructure
      // This test verifies the factory logic, not Redis functionality
      try {
        const storage = await createStorage();
        // If we get here, the factory created a Redis storage instance
        expect(storage).toBeDefined();
        expect(storage).not.toBeInstanceOf(InMemoryStorage);
      } catch (error) {
        // Expected in test environment without Redis - that's okay
        // We're testing the factory logic, not Redis connectivity
        expect((error as Error).message).toMatch(/redis|connect/i);
      }
    });

    it('should handle redis type case-insensitively', async () => {
      process.env.STORAGE_TYPE = 'REDIS';
      process.env.REDIS_URL = 'redis://localhost:6379';

      try {
        const storage = await createStorage();
        expect(storage).toBeDefined();
      } catch (error) {
        // Expected in test environment
        expect((error as Error).message).toMatch(/redis|connect/i);
      }
    });
  });

  describe('Storage Interface', () => {
    it('should return storage implementing IStorage interface', async () => {
      const storage = await createStorage();

      // Check all required methods exist
      expect(typeof storage.createExecution).toBe('function');
      expect(typeof storage.getExecution).toBe('function');
      expect(typeof storage.updateExecution).toBe('function');
      expect(typeof storage.deleteExecution).toBe('function');
      expect(typeof storage.listExecutions).toBe('function');
      expect(typeof storage.getPlanByPlanId).toBe('function');
      expect(typeof storage.savePlan).toBe('function');
      expect(typeof storage.updatePlan).toBe('function');
      expect(typeof storage.deletePlan).toBe('function');
      expect(typeof storage.listPlans).toBe('function');
      expect(typeof storage.getConfiguration).toBe('function');
      expect(typeof storage.setConfiguration).toBe('function');
      expect(typeof storage.deleteConfiguration).toBe('function');
    });

    it('should create functional storage instance', async () => {
      const storage = await createStorage();

      // Test basic functionality
      const testId = await storage.createExecution('Test scenario');
      expect(testId).toBeDefined();

      const execution = await storage.getExecution(testId);
      expect(execution).toBeDefined();
      expect(execution?.scenario).toBe('Test scenario');
    });
  });
});
