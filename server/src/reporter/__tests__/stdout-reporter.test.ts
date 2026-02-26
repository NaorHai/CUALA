/**
 * StdoutReporter Unit Tests
 *
 * Tests console output reporting for test results
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StdoutReporter } from '../stdout-reporter.js';
import type { IReportData } from '../../types/index.js';

describe('StdoutReporter', () => {
  let reporter: StdoutReporter;
  let consoleLogSpy: any;

  beforeEach(() => {
    reporter = new StdoutReporter();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Basic Reporting', () => {
    it('should report successful execution', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success',
            verification: {
              isVerified: true,
              evidence: 'Element found and verified'
            }
          } as any
        ],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      expect(consoleLogSpy).toHaveBeenCalled();
      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');

      expect(allLogs).toContain('CUALA TEST REPORT');
      expect(allLogs).toContain('scenario-123');
      expect(allLogs).toContain('plan-456');
      expect(allLogs).toContain('PASSED');
    });

    it('should report failed execution', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'failure',
            verification: {
              isVerified: false,
              evidence: 'Element not found'
            }
          } as any
        ],
        summary: {
          success: false,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('FAILED');
    });

    it('should display duration', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 3500
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('2500ms'); // endTime - startTime
    });
  });

  describe('Step Reporting', () => {
    it('should report all execution steps', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success'
          } as any,
          {
            stepId: '2',
            status: 'success'
          } as any,
          {
            stepId: '3',
            status: 'failure'
          } as any
        ],
        summary: {
          success: false,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('Step 1');
      expect(allLogs).toContain('Step 2');
      expect(allLogs).toContain('Step 3');
    });

    it('should show step status (SUCCESS/FAILURE)', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success'
          } as any,
          {
            stepId: '2',
            status: 'failure'
          } as any
        ],
        summary: {
          success: false,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('SUCCESS');
      expect(allLogs).toContain('FAILURE');
    });

    it('should display verification results', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success',
            verification: {
              isVerified: true,
              evidence: 'Title matches expected value'
            }
          } as any
        ],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('Verification');
      expect(allLogs).toContain('Title matches expected value');
    });

    it('should show verification pass/fail indicators', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success',
            verification: {
              isVerified: true,
              evidence: 'Passed'
            }
          } as any,
          {
            stepId: '2',
            status: 'failure',
            verification: {
              isVerified: false,
              evidence: 'Failed'
            }
          } as any
        ],
        summary: {
          success: false,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      // Check for checkmark and X indicators
      expect(allLogs).toContain('✓');
      expect(allLogs).toContain('✗');
    });

    it('should handle steps without verification', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [
          {
            stepId: '1',
            status: 'success'
            // No verification field
          } as any
        ],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      expect(consoleLogSpy).toHaveBeenCalled();
      // Should not throw error
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results array', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('CUALA TEST REPORT');
      expect(allLogs).toContain('PASSED');
    });

    it('should handle very long scenario IDs', async () => {
      const reportData: IReportData = {
        scenarioId: 'a'.repeat(100),
        planId: 'b'.repeat(100),
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      expect(consoleLogSpy).toHaveBeenCalled();
      // Should not throw error
    });

    it('should handle zero duration', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 1000
        }
      };

      await reporter.report(reportData);

      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('0ms');
    });

    it('should handle many steps', async () => {
      const results = Array.from({ length: 50 }, (_, i) => ({
        stepId: `${i + 1}`,
        status: 'success' as const
      })) as any;

      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results,
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await reporter.report(reportData);

      expect(consoleLogSpy).toHaveBeenCalled();
      const allLogs = consoleLogSpy.mock.calls.map((call: any) => call[0]).join('\n');
      expect(allLogs).toContain('Step 1');
      expect(allLogs).toContain('Step 50');
    });
  });

  describe('IReporter Interface', () => {
    it('should implement IReporter interface', () => {
      expect(typeof reporter.report).toBe('function');
    });

    it('should return a promise', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      const result = reporter.report(reportData);
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should complete successfully', async () => {
      const reportData: IReportData = {
        scenarioId: 'scenario-123',
        planId: 'plan-456',
        results: [],
        summary: {
          success: true,
          startTime: 1000,
          endTime: 2000
        }
      };

      await expect(reporter.report(reportData)).resolves.toBeUndefined();
    });
  });
});
