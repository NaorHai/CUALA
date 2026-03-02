/**
 * LLM-based DOM Analysis Strategy v1.0
 * Refactored with retry logic, DOM caching, and better validation
 */

import { Page } from 'playwright';
import { IElementDiscoveryStrategy } from '../index.js';
import { IElementDiscoveryResult } from '../../types/index.js';
import { ILogger } from '../../infra/logger.js';
import { IConfig } from '../../infra/config.js';
import { PromptManager } from '../../infra/prompt-manager.js';
import { RetryStrategy, CircuitBreaker, RetryableError, createDefaultRetryStrategy, createDefaultCircuitBreaker } from '../../infra/retry-utils.js';
import { DOMCache, createDefaultDOMCache } from '../../infra/dom-cache.js';
import { DOMExtractor } from '../dom-extractor.js';
import { LLMProviderFactory, ILLMProvider } from '../../providers/index.js';

/**
 * LLM-based DOM analysis strategy with production-grade reliability
 */
export class LLMDOMStrategy implements IElementDiscoveryStrategy {
  public readonly name = 'LLM_DOM_ANALYSIS';
  private provider: ILLMProvider;
  private model: string;
  private promptManager: PromptManager;
  private retryStrategy: RetryStrategy;
  private circuitBreaker: CircuitBreaker;
  private domCache: DOMCache;
  private domExtractor: DOMExtractor;

  constructor(
    private config: IConfig,
    private logger: ILogger
  ) {
    // Use provider abstraction instead of direct OpenAI client
    this.provider = LLMProviderFactory.createFromConfig(config, logger);

    // Get model from provider using polymorphic interface method (SOLID compliance)
    this.model = this.provider.getDefaultModel();

    this.promptManager = PromptManager.getInstance();

    // Initialize resilience utilities
    this.retryStrategy = createDefaultRetryStrategy(logger);
    this.circuitBreaker = createDefaultCircuitBreaker(logger);
    this.domCache = createDefaultDOMCache(logger);
    this.domExtractor = new DOMExtractor(logger);

    logger.info('LLMDOMStrategy v1.0 initialized', {
      provider: this.provider.name,
      model: this.model
    });
  }

  async discover(
    page: Page,
    description: string,
    actionType: 'click' | 'type' | 'hover' | 'verify',
    context?: {
      url?: string;
      html?: string;
      testId?: string;
    }
  ): Promise<IElementDiscoveryResult | null> {
    const url = context?.url || page.url();
    const testId = context?.testId;

    this.logger.debug('LLM DOM Strategy v1.0: Starting discovery', {
      testId,
      description,
      actionType,
      url
    });

    try {
      // Try to get cached DOM structure
      let domStructure = this.domCache.get(url);

      if (!domStructure) {
        this.logger.debug('LLM DOM Strategy: Cache miss, extracting DOM', { testId, url });

        // Extract DOM using centralized extractor
        domStructure = await this.domExtractor.extract(page, {
          maxElements: 200,
          includePosition: false,
          includeContainers: actionType === 'verify' // Include containers for verify actions
        });

        // Cache the result
        this.domCache.set(url, domStructure);
      } else {
        this.logger.debug('LLM DOM Strategy: Cache hit', { testId, url });
      }

      if (!domStructure || domStructure === '[]') {
        this.logger.warn('Empty DOM structure extracted', { testId });
        return null;
      }

      // Use LLM to analyze DOM with retry and circuit breaker
      const systemPrompt = this.promptManager.render('element-discovery-system', {});
      const userPrompt = this.promptManager.render('element-discovery-user', {
        description,
        actionType,
        domStructure: domStructure.substring(0, 15000), // Limit size
        url
      });

      this.logger.debug('LLM DOM Strategy: Calling LLM with retry protection', {
        testId,
        provider: this.provider.name,
        model: this.model
      });

      // Call LLM with retry and circuit breaker
      const content = await this.callLLMWithProtection(async () => {
        const response = await this.provider.createChatCompletion({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });

        if (!response.content) {
          throw new RetryableError('LLM returned empty response for element discovery');
        }

        return response.content;
      });

      const parsed = JSON.parse(content);

      if (parsed.error || !parsed.selector) {
        this.logger.warn('LLM element discovery failed', {
          testId,
          error: parsed.error
        });
        return null;
      }

      // Validate selector with enhanced validation
      const primaryValidation = await this.domExtractor.validateSelector(page, parsed.selector);

      if (!primaryValidation.exists || !primaryValidation.isVisible) {
        this.logger.warn('Primary selector invalid', {
          testId,
          selector: parsed.selector,
          validation: primaryValidation
        });

        // Try alternatives if provided
        if (parsed.alternatives && parsed.alternatives.length > 0) {
          const bestResult = await this.domExtractor.getBestSelector(
            page,
            parsed.alternatives
          );

          if (bestResult.selector) {
            this.logger.info('Using alternative selector', {
              testId,
              originalSelector: parsed.selector,
              alternativeSelector: bestResult.selector,
              confidence: bestResult.confidence
            });

            return {
              selector: bestResult.selector,
              confidence: bestResult.confidence,
              alternatives: parsed.alternatives.filter((s: string) => s !== bestResult.selector),
              elementInfo: parsed.elementInfo || {
                tag: 'unknown',
                attributes: {}
              },
              strategy: this.name
            };
          }
        }

        return null;
      }

      // Calculate confidence based on validation
      let confidence = parsed.confidence || 0.7;
      if (primaryValidation.isUnique) confidence += 0.1;
      if (primaryValidation.isVisible) confidence += 0.1;
      confidence = Math.min(1, Math.max(0, confidence));

      this.logger.info('LLM DOM Strategy v1.0: Element discovered', {
        testId,
        selector: parsed.selector,
        confidence,
        validation: primaryValidation
      });

      return {
        selector: parsed.selector,
        confidence,
        alternatives: parsed.alternatives || [],
        elementInfo: parsed.elementInfo || {
          tag: 'unknown',
          attributes: {}
        },
        strategy: this.name
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('LLM DOM Strategy v1.0 failed', {
        testId,
        error: errorMsg,
        description
      });
      return null;
    }
  }

  /**
   * Call LLM with retry and circuit breaker protection
   */
  private async callLLMWithProtection<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    return this.circuitBreaker.execute(
      'llm-dom-discovery',
      () => this.retryStrategy.execute(
        operation,
        {
          maxRetries: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 10000,
          onRetry: (error, attempt) => {
            this.logger.warn(`LLM DOM discovery retry ${attempt}/3`, {
              error: error.message
            });
          }
        }
      )
    );
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.logger.debug('LLMDOMStrategy v1.0: Cleaning up');
    this.domCache.clear();
    this.circuitBreaker.reset('llm-dom-discovery');
  }
}
