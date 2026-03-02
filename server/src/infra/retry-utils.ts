/**
 * Retry and Circuit Breaker Utilities
 * Provides robust error handling with exponential backoff and circuit breaker pattern
 */

import { ILogger } from './logger.js';

export interface RetryOptions {
  maxRetries: number;
  backoff: 'exponential' | 'linear' | 'constant';
  initialDelay?: number; // milliseconds
  maxDelay?: number; // milliseconds
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (error: Error, attempt: number) => void;
}

export class RetryableError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class FatalError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'FatalError';
  }
}

/**
 * Retry strategy with configurable backoff
 */
export class RetryStrategy {
  constructor(private logger?: ILogger) {}

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    const {
      maxRetries,
      backoff,
      initialDelay = 1000,
      maxDelay = 30000,
      retryableErrors = [],
      onRetry
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        const isRetryable = this.isRetryableError(lastError, retryableErrors);

        if (!isRetryable || attempt === maxRetries) {
          // Fatal error or max retries exceeded
          if (this.logger) {
            this.logger.error('Operation failed after retries', {
              attempt: attempt + 1,
              maxRetries,
              error: lastError.message,
              isRetryable
            });
          }
          throw lastError;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt, backoff, initialDelay, maxDelay);

        if (this.logger) {
          this.logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}`, {
            error: lastError.message,
            nextRetryIn: delay
          });
        }

        // Call retry callback if provided
        if (onRetry) {
          onRetry(lastError, attempt + 1);
        }

        // Wait before retry
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Operation failed');
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(
    error: Error,
    retryableErrors: Array<new (...args: any[]) => Error>
  ): boolean {
    // Always retry RetryableError
    if (error instanceof RetryableError) {
      return true;
    }

    // Never retry FatalError
    if (error instanceof FatalError) {
      return false;
    }

    // Check against custom retryable error types
    if (retryableErrors.length > 0) {
      return retryableErrors.some(ErrorType => error instanceof ErrorType);
    }

    // Default: retry on network/timeout errors
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /rate.?limit/i,
      /too many requests/i,
      /503/i,
      /502/i,
      /504/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Calculate retry delay based on backoff strategy
   */
  private calculateDelay(
    attempt: number,
    backoff: 'exponential' | 'linear' | 'constant',
    initialDelay: number,
    maxDelay: number
  ): number {
    let delay: number;

    switch (backoff) {
      case 'exponential':
        delay = initialDelay * Math.pow(2, attempt);
        break;
      case 'linear':
        delay = initialDelay * (attempt + 1);
        break;
      case 'constant':
        delay = initialDelay;
        break;
      default:
        delay = initialDelay;
    }

    // Add jitter (0-20% random variation) to prevent thundering herd
    const jitter = delay * 0.2 * Math.random();
    delay = delay + jitter;

    // Cap at max delay
    return Math.min(delay, maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'CLOSED',   // Normal operation
  OPEN = 'OPEN',       // Circuit is open, requests fail immediately
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes needed to close circuit
  timeout: number;          // Timeout before transitioning to half-open (ms)
}

/**
 * Circuit breaker pattern implementation
 * Prevents cascade failures by failing fast when service is down
 */
export class CircuitBreaker {
  private circuits = new Map<string, {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: number;
    nextAttemptTime?: number;
  }>();

  constructor(
    private options: CircuitBreakerOptions,
    private logger?: ILogger
  ) {}

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(key);

    // Check circuit state
    if (circuit.state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (circuit.nextAttemptTime && Date.now() >= circuit.nextAttemptTime) {
        this.logger?.info(`Circuit ${key} transitioning to HALF_OPEN`);
        circuit.state = CircuitState.HALF_OPEN;
        circuit.successes = 0;
      } else {
        const waitTime = circuit.nextAttemptTime
          ? Math.round((circuit.nextAttemptTime - Date.now()) / 1000)
          : 0;
        throw new FatalError(
          `Circuit breaker is OPEN for "${key}". Wait ${waitTime}s before retry.`
        );
      }
    }

    try {
      const result = await operation();

      // Success - update circuit
      this.onSuccess(key, circuit);

      return result;
    } catch (error) {
      // Failure - update circuit
      this.onFailure(key, circuit, error instanceof Error ? error : new Error(String(error)));

      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(key: string, circuit: ReturnType<typeof this.getOrCreateCircuit>): void {
    circuit.successes++;
    circuit.failures = 0;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Check if we have enough successes to close circuit
      if (circuit.successes >= this.options.successThreshold) {
        this.logger?.info(`Circuit ${key} transitioning to CLOSED after ${circuit.successes} successes`);
        circuit.state = CircuitState.CLOSED;
        circuit.successes = 0;
      }
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(key: string, circuit: ReturnType<typeof this.getOrCreateCircuit>, error: Error): void {
    circuit.failures++;
    circuit.lastFailureTime = Date.now();
    circuit.successes = 0;

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Failure in half-open state -> back to open
      this.logger?.warn(`Circuit ${key} transitioning back to OPEN after failure in HALF_OPEN`);
      circuit.state = CircuitState.OPEN;
      circuit.nextAttemptTime = Date.now() + this.options.timeout;
    } else if (circuit.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (circuit.failures >= this.options.failureThreshold) {
        this.logger?.warn(`Circuit ${key} transitioning to OPEN after ${circuit.failures} failures`, {
          error: error.message
        });
        circuit.state = CircuitState.OPEN;
        circuit.nextAttemptTime = Date.now() + this.options.timeout;
      }
    }
  }

  /**
   * Get or create circuit for a key
   */
  private getOrCreateCircuit(key: string) {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0
      });
    }
    return this.circuits.get(key)!;
  }

  /**
   * Get circuit state for a key
   */
  getState(key: string): CircuitState {
    return this.getOrCreateCircuit(key).state;
  }

  /**
   * Reset circuit to closed state
   */
  reset(key: string): void {
    const circuit = this.getOrCreateCircuit(key);
    circuit.state = CircuitState.CLOSED;
    circuit.failures = 0;
    circuit.successes = 0;
    circuit.lastFailureTime = undefined;
    circuit.nextAttemptTime = undefined;
    this.logger?.info(`Circuit ${key} manually reset to CLOSED`);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.circuits.clear();
    this.logger?.info('All circuits reset');
  }
}

/**
 * Create a retry strategy with default configuration
 */
export function createDefaultRetryStrategy(logger?: ILogger): RetryStrategy {
  return new RetryStrategy(logger);
}

/**
 * Create a circuit breaker with default configuration
 */
export function createDefaultCircuitBreaker(logger?: ILogger): CircuitBreaker {
  return new CircuitBreaker(
    {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000 // 1 minute
    },
    logger
  );
}
