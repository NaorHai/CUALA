import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RetryStrategy,
  CircuitBreaker,
  RetryableError,
  FatalError,
  createDefaultRetryStrategy,
  createDefaultCircuitBreaker
} from '../retry-utils.js';

describe('RetryStrategy', () => {
  let retryStrategy: RetryStrategy;

  beforeEach(() => {
    retryStrategy = new RetryStrategy();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'exponential'
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on RetryableError', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new RetryableError('temp error'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'constant',
        initialDelay: 100
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry on FatalError', async () => {
      const operation = vi.fn().mockRejectedValue(new FatalError('fatal'));

      await expect(
        retryStrategy.execute(operation, {
          maxRetries: 3,
          backoff: 'exponential'
        })
      ).rejects.toThrow('fatal');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new RetryableError('error1'))
        .mockRejectedValueOnce(new RetryableError('error2'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'exponential',
        initialDelay: 100,
        maxDelay: 10000
      });

      // First retry: ~100ms
      await vi.advanceTimersByTimeAsync(150);
      expect(operation).toHaveBeenCalledTimes(2);

      // Second retry: ~200ms (exponential)
      await vi.advanceTimersByTimeAsync(250);
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new RetryableError('always fails'));

      const promise = retryStrategy.execute(operation, {
        maxRetries: 2,
        backoff: 'constant',
        initialDelay: 100
      });

      // Catch the promise rejection to prevent unhandled rejection
      promise.catch(() => {});

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toThrow('always fails');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const operation = vi.fn()
        .mockRejectedValueOnce(new RetryableError('error'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'constant',
        initialDelay: 100,
        onRetry
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'error' }),
        1
      );
    });

    it('should respect maxDelay cap', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new RetryableError('error'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'exponential',
        initialDelay: 100,
        maxDelay: 150 // Cap at 150ms
      });

      // Delay should be capped at maxDelay (150ms) even though exponential would be higher
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toBe('success');
    });
  });

  describe('error classification', () => {
    it('should retry on timeout errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Operation timeout'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'constant',
        initialDelay: 100
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on rate limit errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce('success');

      const promise = retryStrategy.execute(operation, {
        maxRetries: 3,
        backoff: 'constant',
        initialDelay: 100
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
    });
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CLOSED state', () => {
    it('should allow operations in CLOSED state', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await circuitBreaker.execute('test-key', operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState('test-key')).toBe('CLOSED');
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute('test-key', operation)
        ).rejects.toThrow('failure');
      }

      expect(circuitBreaker.getState('test-key')).toBe('OPEN');
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const operation = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute('test-key', operation)
        ).rejects.toThrow();
      }
    });

    it('should reject immediately in OPEN state', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      await expect(
        circuitBreaker.execute('test-key', operation)
      ).rejects.toThrow('Circuit breaker is OPEN');

      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      // Wait for timeout
      await vi.advanceTimersByTimeAsync(1000);

      await circuitBreaker.execute('test-key', operation);

      expect(operation).toHaveBeenCalled();
      expect(circuitBreaker.getState('test-key')).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const operation = vi.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute('test-key', operation)
        ).rejects.toThrow();
      }

      // Wait for timeout to enter HALF_OPEN
      await vi.advanceTimersByTimeAsync(1000);
    });

    it('should close circuit after success threshold', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      // Need 2 successes to close
      await circuitBreaker.execute('test-key', operation);
      expect(circuitBreaker.getState('test-key')).toBe('HALF_OPEN');

      await circuitBreaker.execute('test-key', operation);
      expect(circuitBreaker.getState('test-key')).toBe('CLOSED');
    });

    it('should reopen on failure in HALF_OPEN', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      await expect(
        circuitBreaker.execute('test-key', operation)
      ).rejects.toThrow('failure');

      expect(circuitBreaker.getState('test-key')).toBe('OPEN');
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute('test-key', operation)
        ).rejects.toThrow();
      }

      expect(circuitBreaker.getState('test-key')).toBe('OPEN');

      // Reset
      circuitBreaker.reset('test-key');

      expect(circuitBreaker.getState('test-key')).toBe('CLOSED');
    });

    it('should reset all circuits', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('failure'));

      // Open multiple circuits
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute('key1', operation)
        ).rejects.toThrow();
        await expect(
          circuitBreaker.execute('key2', operation)
        ).rejects.toThrow();
      }

      circuitBreaker.resetAll();

      expect(circuitBreaker.getState('key1')).toBe('CLOSED');
      expect(circuitBreaker.getState('key2')).toBe('CLOSED');
    });
  });
});

describe('factory functions', () => {
  it('should create default retry strategy', () => {
    const strategy = createDefaultRetryStrategy();
    expect(strategy).toBeInstanceOf(RetryStrategy);
  });

  it('should create default circuit breaker', () => {
    const breaker = createDefaultCircuitBreaker();
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.getState('test')).toBe('CLOSED');
  });
});
