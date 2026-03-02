import { IPlanner } from './index.js';
import {
  ITestScenario,
  IExecutionPlan,
  IAdaptivePlan,
  IPlanRefinement,
  IStep,
  IRefinedStep,
  ISnapshot,
  IExecutionResult
} from '../types/index.js';
import { ILogger } from '../infra/logger.js';
import { IConfig } from '../infra/config.js';
import { PromptManager } from '../infra/prompt-manager.js';
import { IElementDiscoveryService } from '../element-discovery/index.js';
import { RetryStrategy, CircuitBreaker, RetryableError, createDefaultRetryStrategy, createDefaultCircuitBreaker } from '../infra/retry-utils.js';
import { DOMCache, createDefaultDOMCache } from '../infra/dom-cache.js';
import OpenAI from 'openai';
import { Page } from 'playwright';

/**
 * Adaptive Planner v1.0
 * Refactored with retry logic, circuit breaker, and DOM caching for production stability
 */
export class AdaptivePlanner implements IPlanner {
  private basePlanner: IPlanner;
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;
  private retryStrategy: RetryStrategy;
  private circuitBreaker: CircuitBreaker;
  private domCache: DOMCache;
  private maxRefinementHistory: number;

  constructor(
    basePlanner: IPlanner,
    private elementDiscovery: IElementDiscoveryService,
    config: IConfig,
    private logger: ILogger
  ) {
    this.basePlanner = basePlanner;
    const apiKey = config.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined for AdaptivePlanner');
    }
    this.client = new OpenAI({ apiKey });
    this.model = config.get('OPENAI_MODEL') || 'gpt-4-turbo-preview';
    this.promptManager = PromptManager.getInstance();

    // Initialize retry strategy with configuration
    const maxRetries = parseInt(config.get('MAX_RETRIES') || '3');
    this.retryStrategy = createDefaultRetryStrategy(logger);

    // Initialize circuit breaker for LLM calls
    this.circuitBreaker = createDefaultCircuitBreaker(logger);

    // Initialize DOM cache with configuration
    const domCacheSize = parseInt(config.get('DOM_CACHE_SIZE') || '100');
    const domCacheTTL = parseInt(config.get('DOM_CACHE_TTL') || '60') * 1000; // Convert to ms
    this.domCache = new DOMCache({
      maxSize: domCacheSize,
      ttl: domCacheTTL,
      maxEntrySize: 500 * 1024 // 500KB max per entry
    }, logger);

    // Max refinement history entries (prevent unbounded growth)
    this.maxRefinementHistory = parseInt(config.get('MAX_REFINEMENT_HISTORY') || '20');

    logger.info('AdaptivePlanner v1.0 initialized', {
      maxRetries,
      domCacheSize,
      domCacheTTLSeconds: domCacheTTL / 1000,
      maxRefinementHistory: this.maxRefinementHistory
    });
  }

  /**
   * Generate initial plan (delegates to base planner)
   */
  async plan(scenario: ITestScenario): Promise<IExecutionPlan> {
    this.logger.info('Generating initial plan', { scenarioId: scenario.id });
    const initialPlan = await this.basePlanner.plan(scenario);

    // Convert to adaptive plan with phase
    const adaptivePlan: IAdaptivePlan = {
      ...initialPlan,
      phase: 'initial',
      refinementHistory: [],
      createdAt: initialPlan.createdAt || Date.now()
    };

    return adaptivePlan;
  }

  /**
   * Smart plan refinement - only refines steps that need it
   * v1.0: Uses retry logic, circuit breaker, and DOM caching
   */
  async refinePlan(
    plan: IExecutionPlan,
    page: Page,
    executedSteps: IExecutionResult[] = []
  ): Promise<IAdaptivePlan> {
    const testId = plan.scenarioId;

    this.logger.info('PLAN REFINEMENT v1.0: Starting smart refinement', {
      testId,
      planId: plan.id,
      planPhase: (plan as IAdaptivePlan).phase || 'initial',
      totalSteps: plan.steps.length,
      executedStepsCount: executedSteps.length,
      pageUrl: page.url()
    });

    // Convert plan to adaptive plan if needed
    const adaptivePlan: IAdaptivePlan = (plan as IAdaptivePlan).phase
      ? plan as IAdaptivePlan
      : { ...plan, phase: 'initial', refinementHistory: [] };

    try {
      // Extract or get cached DOM structure
      const url = page.url();
      let domStructure = this.domCache.get(url);

      if (!domStructure) {
        this.logger.debug('PLAN REFINEMENT: DOM cache miss, extracting structure', { testId, url });
        domStructure = await this.extractDOMStructure(page);
        this.domCache.set(url, domStructure);
      } else {
        this.logger.debug('PLAN REFINEMENT: DOM cache hit', { testId, url });
      }

      // Prepare executed steps summary
      const executedStepsSummary = executedSteps.map(r => ({
        stepId: r.stepId,
        status: r.status,
        error: r.error
      }));

      // Use LLM to refine plan with retry and circuit breaker
      const systemPrompt = this.promptManager.render('planner-refine-system', {});
      const userPrompt = this.promptManager.render('planner-refine-user', {
        originalPlan: JSON.stringify(adaptivePlan, null, 2),
        domStructure: domStructure.substring(0, 15000), // Limit size
        url,
        executedSteps: JSON.stringify(executedStepsSummary, null, 2)
      });

      this.logger.debug('PLAN REFINEMENT: Calling LLM with retry protection', {
        testId,
        planId: plan.id,
        model: this.model
      });

      // Call LLM with retry strategy and circuit breaker
      const content = await this.callLLMWithProtection('plan-refinement', async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new RetryableError('LLM returned empty response for plan refinement');
        }
        return content;
      });

      this.logger.debug('PLAN REFINEMENT: Parsing LLM response', { testId, planId: plan.id });
      const parsed = JSON.parse(content);

      if (parsed.error) {
        throw new Error(`Plan refinement failed: ${parsed.error}`);
      }

      // Handle removed steps
      const removedStepIds = new Set<string>();
      const removedStepsInfo: Array<{ stepId: string; reason: string }> = parsed.removedSteps || [];

      removedStepsInfo.forEach(removed => {
        removedStepIds.add(removed.stepId);
        this.logger.info('PLAN REFINEMENT: Step marked for removal', {
          testId,
          stepId: removed.stepId,
          reason: removed.reason
        });
      });

      // Create map of refined steps
      const refinedStepsMap = new Map<string, any>();
      if (parsed.steps && Array.isArray(parsed.steps)) {
        parsed.steps.forEach((refinedStep: any) => {
          if (refinedStep.id) {
            refinedStepsMap.set(refinedStep.id, refinedStep);
          }
        });
      }

      // Refine steps with discovered selectors
      const refinedSteps: IRefinedStep[] = adaptivePlan.steps
        .filter(step => !removedStepIds.has(step.id))
        .map((step) => {
          const refinedStepData = refinedStepsMap.get(step.id);

          // Only refine interaction steps
          const interactionActions = ['click', 'type', 'hover'];
          const isInteractionStep = interactionActions.includes(step.action.name) ||
            step.action.name.startsWith('verify_element');

          if (!isInteractionStep || !refinedStepData) {
            return step as IRefinedStep;
          }

          const originalSelector = step.action.arguments.selector as string;
          const refinedSelector = refinedStepData.action?.arguments?.selector as string;
          const confidence = refinedStepData.action?.arguments?.confidence as number || 0.5;
          const alternatives = refinedStepData.action?.arguments?.alternatives as string[] || [];

          // Skip refinement if confidence is too low
          if (!refinedSelector || confidence < 0.6) {
            return {
              ...step,
              originalSelector,
              elementDiscovery: undefined
            } as IRefinedStep;
          }

          // Update step with refined selector
          const refinedStep: IRefinedStep = {
            ...step,
            action: {
              ...step.action,
              arguments: {
                ...step.action.arguments,
                selector: refinedSelector,
                confidence,
                alternatives,
                originalSelector
              }
            },
            originalSelector,
            elementDiscovery: {
              selector: refinedSelector,
              confidence,
              alternatives,
              elementInfo: refinedStepData.action?.arguments?.elementInfo || {
                tag: 'unknown',
                attributes: {}
              },
              strategy: 'LLM_REFINEMENT'
            }
          };

          return refinedStep;
        });

      // Collect refinements
      const refinements: IPlanRefinement[] = parsed.refinements || [];

      // Add removal records to refinement history
      removedStepsInfo.forEach(removed => {
        refinements.push({
          stepId: removed.stepId,
          reason: `Step removed: ${removed.reason}`,
          timestamp: Date.now()
        });
      });

      // Trim refinement history to max size
      const existingHistory = adaptivePlan.refinementHistory || [];
      const combinedHistory = [...existingHistory, ...refinements];
      const trimmedHistory = combinedHistory.slice(-this.maxRefinementHistory);

      if (combinedHistory.length > trimmedHistory.length) {
        this.logger.debug('PLAN REFINEMENT: Trimmed refinement history', {
          testId,
          planId: plan.id,
          removedEntries: combinedHistory.length - trimmedHistory.length,
          maxHistory: this.maxRefinementHistory
        });
      }

      const refinedPlan: IAdaptivePlan = {
        ...adaptivePlan,
        steps: refinedSteps,
        phase: 'refined',
        refinementHistory: trimmedHistory,
        refinementTimestamp: Date.now(),
        createdAt: adaptivePlan.createdAt || Date.now()
      };

      this.logger.info('PLAN REFINEMENT v1.0: Completed successfully', {
        testId,
        planId: plan.id,
        originalStepsCount: adaptivePlan.steps.length,
        refinedStepsCount: refinedSteps.length,
        removedStepsCount: removedStepIds.size,
        refinementsCount: refinements.length,
        historySize: trimmedHistory.length
      });

      return refinedPlan;
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : { message: String(error) };

      this.logger.error('PLAN REFINEMENT v1.0: Failed', {
        testId,
        planId: plan.id,
        error: errorDetails,
        willContinueWithOriginalPlan: true
      });

      // Return original plan with error recorded in history
      return {
        ...adaptivePlan,
        phase: 'refined',
        refinementHistory: [
          ...(adaptivePlan.refinementHistory || []).slice(-this.maxRefinementHistory),
          {
            stepId: 'plan-refinement',
            reason: `Refinement failed: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: Date.now()
          }
        ]
      };
    }
  }

  /**
   * Adapt plan during execution based on failures
   * v1.0: Uses retry logic and circuit breaker
   */
  async adaptPlan(
    plan: IAdaptivePlan,
    failedStep: IStep,
    failure: IExecutionResult,
    page: Page
  ): Promise<IAdaptivePlan> {
    const testId = plan.scenarioId;

    this.logger.info('PLAN ADAPTATION v1.0: Adapting due to failure', {
      testId,
      planId: plan.id,
      stepId: failedStep.id,
      error: failure.error
    });

    const interactionActions = ['click', 'type', 'hover'];
    const isInteractionStep = interactionActions.includes(failedStep.action.name);

    if (!isInteractionStep) {
      return plan;
    }

    const description = (failedStep.action.arguments.description as string) ||
                       (failedStep.action.arguments.selector as string) ||
                       failedStep.description;

    if (!description) {
      this.logger.warn('Cannot adapt step without description', { testId, stepId: failedStep.id });
      return plan;
    }

    try {
      // Use element discovery with retry
      const discovery = await this.retryStrategy.execute(
        () => this.elementDiscovery.discoverElement(
          page,
          description,
          failedStep.action.name as 'click' | 'type' | 'hover',
          {
            url: page.url(),
            html: failure.snapshot.metadata.html_length as number > 0
              ? 'available'
              : undefined,
            testId
          }
        ),
        {
          maxRetries: 2,
          backoff: 'exponential',
          initialDelay: 1000,
          onRetry: (error, attempt) => {
            this.logger.warn(`Element discovery retry ${attempt}`, {
              testId,
              stepId: failedStep.id,
              error: error.message
            });
          }
        }
      );

      // Update the failed step in the plan
      const adaptedSteps = plan.steps.map(step => {
        if (step.id !== failedStep.id) {
          return step;
        }

        const refinedStep: IRefinedStep = {
          ...step,
          action: {
            ...step.action,
            arguments: {
              ...step.action.arguments,
              selector: discovery.selector,
              confidence: discovery.confidence,
              alternatives: discovery.alternatives
            }
          },
          elementDiscovery: discovery,
          originalSelector: step.action.arguments.selector as string,
          retryCount: ((step as IRefinedStep).retryCount || 0) + 1
        };

        return refinedStep;
      });

      // Add refinement record
      const refinement: IPlanRefinement = {
        stepId: failedStep.id,
        originalSelector: failedStep.action.arguments.selector as string,
        refinedSelector: discovery.selector,
        reason: `Adapted due to execution failure: ${failure.error}`,
        timestamp: Date.now(),
        confidence: discovery.confidence
      };

      // Trim history
      const combinedHistory = [...(plan.refinementHistory || []), refinement];
      const trimmedHistory = combinedHistory.slice(-this.maxRefinementHistory);

      return {
        ...plan,
        steps: adaptedSteps,
        phase: 'adaptive',
        refinementHistory: trimmedHistory
      };
    } catch (error) {
      this.logger.error('PLAN ADAPTATION v1.0: Failed', {
        testId,
        stepId: failedStep.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return plan;
    }
  }

  /**
   * Call LLM with retry strategy and circuit breaker protection
   */
  private async callLLMWithProtection<T>(
    operationKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.circuitBreaker.execute(
      operationKey,
      () => this.retryStrategy.execute(
        operation,
        {
          maxRetries: 3,
          backoff: 'exponential',
          initialDelay: 1000,
          maxDelay: 10000,
          onRetry: (error, attempt) => {
            this.logger.warn(`LLM call retry ${attempt}/${3}`, {
              operation: operationKey,
              error: error.message
            });
          }
        }
      )
    );
  }

  /**
   * Extract simplified DOM structure
   * v1.0: Improved error handling
   */
  private async extractDOMStructure(page: Page): Promise<string> {
    try {
      return await page.evaluate(function() {
        function extractElementInfo(el: Element): any {
          const info: any = {
            tag: el.tagName.toLowerCase(),
            attributes: {}
          };

          if (el.id) {
            info.id = el.id;
          }
          if (el.className && typeof el.className === 'string') {
            const classList = el.className.split(/\s+/);
            info.classes = [];
            for (let i = 0; i < classList.length; i++) {
              const c = classList[i];
              if (c.length > 0) {
                info.classes.push(c);
              }
            }
          }

          const importantAttrs = ['role', 'type', 'name', 'data-testid', 'aria-label', 'placeholder', 'value'];
          for (let i = 0; i < importantAttrs.length; i++) {
            const attr = importantAttrs[i];
            const value = el.getAttribute(attr);
            if (value) {
              info.attributes[attr] = value;
              if (attr === 'role') info.role = value;
              if (attr === 'type') info.type = value;
              if (attr === 'name') info.name = value;
              if (attr === 'data-testid') info['data-testid'] = value;
              if (attr === 'aria-label') info['aria-label'] = value;
            }
          }

          const textContent = el.textContent;
          if (textContent) {
            const trimmed = textContent.trim();
            if (trimmed.length > 0 && trimmed.length < 100) {
              info.text = trimmed;
            }
          }

          return info;
        }

        const selectors = [
          'button',
          'a',
          'input',
          'select',
          'textarea',
          '[role="button"]',
          '[role="link"]',
          '[data-testid]',
          '[id]',
          'h1, h2, h3, h4, h5, h6'
        ];

        const elements: any[] = [];
        for (let i = 0; i < selectors.length; i++) {
          const selector = selectors[i];
          try {
            const nodeList = document.querySelectorAll(selector);
            for (let j = 0; j < nodeList.length; j++) {
              const el = nodeList[j];
              elements.push(extractElementInfo(el));
            }
          } catch (e) {
            // Ignore invalid selectors
          }
        }

        const seen = new Set();
        const uniqueElements: any[] = [];
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const key = el.tag + '-' + (el.id || '') + '-' + (el.classes ? el.classes.join(',') : '');
          if (!seen.has(key)) {
            seen.add(key);
            uniqueElements.push(el);
          }
        }

        return JSON.stringify(uniqueElements.slice(0, 200), null, 2);
      });
    } catch (error) {
      this.logger.error('Failed to extract DOM structure', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Return empty structure on error
      return JSON.stringify([], null, 2);
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.logger.info('AdaptivePlanner v1.0: Cleaning up resources');
    this.domCache.clear();
    this.circuitBreaker.resetAll();
  }
}
