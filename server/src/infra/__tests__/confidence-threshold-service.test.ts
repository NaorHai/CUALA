/**
 * ConfidenceThresholdService Unit Tests
 *
 * Tests confidence threshold management with storage and defaults
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfidenceThresholdService } from '../confidence-threshold-service.js';
import { InMemoryStorage } from '../../storage/in-memory-storage.js';
import type { ILogger } from '../logger.js';
import type { IConfig } from '../config.js';

// Mock logger
const createMockLogger = (): ILogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

// Mock config
const createMockConfig = (overrides: Record<string, string> = {}): IConfig => ({
  get: (key: string) => overrides[key] || undefined
});

describe('ConfidenceThresholdService', () => {
  let storage: InMemoryStorage;
  let logger: ILogger;
  let config: IConfig;
  let service: ConfidenceThresholdService;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    logger = createMockLogger();
    config = createMockConfig();
    service = new ConfidenceThresholdService(storage, logger, config);

    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Default Thresholds', () => {
    it('should use hard-coded defaults when no env config provided', async () => {
      const clickThreshold = await service.getThreshold('click');
      const typeThreshold = await service.getThreshold('type');
      const verifyThreshold = await service.getThreshold('verify');

      expect(clickThreshold).toBe(0.5);
      expect(typeThreshold).toBe(0.7);
      expect(verifyThreshold).toBe(0.7);
    });

    it('should use env config values when provided', async () => {
      // Use fresh storage to avoid conflicts with default initialization
      const customStorage = new InMemoryStorage();
      const customConfig = createMockConfig({
        CONFIDENCE_THRESHOLD_CLICK: '0.8',
        CONFIDENCE_THRESHOLD_TYPE: '0.9'
      });

      const customService = new ConfidenceThresholdService(customStorage, logger, customConfig);
      await new Promise(resolve => setTimeout(resolve, 50));

      const clickThreshold = await customService.getThreshold('click');
      const typeThreshold = await customService.getThreshold('type');

      expect(clickThreshold).toBe(0.8);
      expect(typeThreshold).toBe(0.9);
    });

    it('should initialize defaults in storage', async () => {
      // Give time for async initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      const clickConfig = await storage.getConfiguration('confidence.threshold.click');
      const typeConfig = await storage.getConfiguration('confidence.threshold.type');

      expect(clickConfig).toBeDefined();
      expect(clickConfig?.value).toBe(0.5);
      expect(typeConfig).toBeDefined();
      expect(typeConfig?.value).toBe(0.7);
    });

    it('should not overwrite existing storage values', async () => {
      // Pre-set a custom value
      await storage.setConfiguration('confidence.threshold.click', 0.95);

      // Create new service (will try to initialize)
      const newService = new ConfidenceThresholdService(storage, logger, config);
      await new Promise(resolve => setTimeout(resolve, 50));

      const threshold = await newService.getThreshold('click');
      expect(threshold).toBe(0.95); // Should use stored value, not default
    });
  });

  describe('Get Threshold', () => {
    it('should get threshold for specific action type', async () => {
      const clickThreshold = await service.getThreshold('click');
      expect(clickThreshold).toBeGreaterThanOrEqual(0);
      expect(clickThreshold).toBeLessThanOrEqual(1);
    });

    it('should get configured threshold from storage', async () => {
      await storage.setConfiguration('confidence.threshold.click', 0.85);
      const threshold = await service.getThreshold('click');
      expect(threshold).toBe(0.85);
    });

    it('should fallback to default if storage value is invalid', async () => {
      await storage.setConfiguration('confidence.threshold.click', 'invalid' as any);
      const threshold = await service.getThreshold('click');
      expect(threshold).toBe(0.5); // Default for click
    });

    it('should use default action threshold for unknown action types', async () => {
      const threshold = await service.getThreshold('unknown-action' as any);
      expect(threshold).toBe(0.6); // Default threshold
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage to throw error
      const errorStorage = {
        getConfiguration: vi.fn().mockRejectedValue(new Error('Storage error')),
        getAllConfigurations: vi.fn(),
        setConfiguration: vi.fn()
      } as any;

      const errorService = new ConfidenceThresholdService(errorStorage, logger, config);
      const threshold = await errorService.getThreshold('click');

      expect(threshold).toBe(0.5); // Should fallback to default
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Get All Thresholds', () => {
    it('should return all default thresholds', async () => {
      const thresholds = await service.getAllThresholds();

      expect(thresholds.size).toBeGreaterThan(0);
      expect(thresholds.has('click')).toBe(true);
      expect(thresholds.has('type')).toBe(true);
      expect(thresholds.has('verify')).toBe(true);
      expect(thresholds.has('default')).toBe(true);
    });

    it('should include configured thresholds', async () => {
      await storage.setConfiguration('confidence.threshold.click', 0.95);
      await storage.setConfiguration('confidence.threshold.type', 0.85);

      const thresholds = await service.getAllThresholds();

      expect(thresholds.get('click')).toBe(0.95);
      expect(thresholds.get('type')).toBe(0.85);
    });

    it('should merge configured and default thresholds', async () => {
      // Configure only click
      await storage.setConfiguration('confidence.threshold.click', 0.95);

      const thresholds = await service.getAllThresholds();

      expect(thresholds.get('click')).toBe(0.95); // Configured
      expect(thresholds.get('type')).toBe(0.7); // Default
      expect(thresholds.get('verify')).toBe(0.7); // Default
    });

    it('should handle storage errors and return defaults', async () => {
      const errorStorage = {
        getConfiguration: vi.fn(),
        getAllConfigurations: vi.fn().mockRejectedValue(new Error('Storage error')),
        setConfiguration: vi.fn()
      } as any;

      const errorService = new ConfidenceThresholdService(errorStorage, logger, config);
      const thresholds = await errorService.getAllThresholds();

      expect(thresholds.size).toBeGreaterThan(0);
      expect(thresholds.has('default')).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle boundary threshold values (0 and 1)', async () => {
      await storage.setConfiguration('confidence.threshold.click', 0);
      await storage.setConfiguration('confidence.threshold.type', 1);

      const clickThreshold = await service.getThreshold('click');
      const typeThreshold = await service.getThreshold('type');

      expect(clickThreshold).toBe(0);
      expect(typeThreshold).toBe(1);
    });

    it('should handle decimal precision', async () => {
      await storage.setConfiguration('confidence.threshold.click', 0.123456789);
      const threshold = await service.getThreshold('click');
      expect(threshold).toBe(0.123456789);
    });

    it('should handle concurrent getThreshold calls', async () => {
      const promises = [
        service.getThreshold('click'),
        service.getThreshold('type'),
        service.getThreshold('verify'),
        service.getThreshold('hover'),
        service.getThreshold('default')
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(typeof result).toBe('number');
      });
    });
  });
});
