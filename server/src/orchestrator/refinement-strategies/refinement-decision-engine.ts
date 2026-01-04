/**
 * Refinement Decision Engine
 * Evaluates all refinement strategies and makes intelligent decisions
 */

import { Page } from 'playwright';
import { IStep, IAdaptivePlan, IExecutionResult, IPlanRefinement } from '../../types/index.js';
import { IRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { NavigationRefinementStrategy } from './navigation-refinement-strategy.js';
import { ConfidenceRefinementStrategy } from './confidence-refinement-strategy.js';
import { PageChangeRefinementStrategy } from './page-change-refinement-strategy.js';
import { ProactiveRefinementStrategy } from './proactive-refinement-strategy.js';
import { FailureRefinementStrategy } from './failure-refinement-strategy.js';
import { ILogger } from '../../infra/logger.js';
import { IConfig } from '../../infra/config.js';

export interface RefinementDecisionResult {
  shouldRefine: boolean;
  strategy: string;
  reason: string;
  confidence: number;
  allDecisions: RefinementDecision[];
}

export class RefinementDecisionEngine {
  private strategies: IRefinementStrategy[] = [];

  constructor(
    private logger: ILogger,
    config?: IConfig
  ) {
    // Initialize default strategies
    this.strategies = [
      new NavigationRefinementStrategy(),
      new PageChangeRefinementStrategy(),
      new FailureRefinementStrategy(
        parseInt(config?.get('MAX_RETRIES') || '2')
      ),
      new ConfidenceRefinementStrategy(
        parseFloat(config?.get('CONFIDENCE_THRESHOLD') || '0.6')
      ),
      new ProactiveRefinementStrategy(
        config?.get('PROACTIVE_REFINEMENT') !== 'false'
      )
    ];

    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Add a custom refinement strategy
   */
  addStrategy(strategy: IRefinementStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Added refinement strategy: ${strategy.name}`);
  }

  /**
   * Remove a strategy by name
   */
  removeStrategy(name: string): void {
    const index = this.strategies.findIndex(s => s.name === name);
    if (index >= 0) {
      this.strategies.splice(index, 1);
      this.logger.debug(`Removed refinement strategy: ${name}`);
    }
  }

  /**
   * Get all strategies
   */
  getStrategies(): IRefinementStrategy[] {
    return [...this.strategies];
  }

  /**
   * Evaluate if refinement should occur for a step
   */
  async shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    page: Page,
    executedSteps: IExecutionResult[],
    currentStepIndex: number,
    stepResult?: IExecutionResult
  ): Promise<RefinementDecisionResult> {
    const previousPageUrl = executedSteps.length > 0 
      ? executedSteps[executedSteps.length - 1].snapshot.metadata.url as string
      : undefined;
    const currentPageUrl = page.url();
    const pageChanged = previousPageUrl !== undefined && previousPageUrl !== currentPageUrl;

    const context: RefinementContext = {
      page,
      executedSteps,
      currentStepIndex,
      totalSteps: plan.steps.length,
      previousRefinements: plan.refinementHistory || [],
      pageUrl: currentPageUrl,
      previousPageUrl,
      pageChanged,
      stepResult
    };

    const decisions: RefinementDecision[] = [];

    // Evaluate all applicable strategies
    for (const strategy of this.strategies) {
      if (!strategy.isApplicable(step, context)) {
        continue;
      }

      try {
        const decision = await strategy.shouldRefine(step, plan, context);
        decisions.push(decision);

        // Note: testId is not available in refinement engine, but will be added by orchestrator logs
        this.logger.debug(`Refinement strategy ${strategy.name} evaluated`, {
          stepId: step.id,
          shouldRefine: decision.shouldRefine,
          reason: decision.reason,
          confidence: decision.confidence
        });
      } catch (error) {
        this.logger.warn(`Refinement strategy ${strategy.name} failed`, { error });
      }
    }

    // Find the best decision
    // Prioritize: shouldRefine=true > higher confidence > higher priority
    const positiveDecisions = decisions.filter(d => d.shouldRefine);
    
    if (positiveDecisions.length === 0) {
      return {
        shouldRefine: false,
        strategy: 'none',
        reason: 'No strategy recommended refinement',
        confidence: 0,
        allDecisions: decisions
      };
    }

    // Sort by confidence (highest first), then by priority
    positiveDecisions.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.priority - a.priority;
    });

    const bestDecision = positiveDecisions[0];
    const strategy = this.strategies.find(
      s => s.priority === bestDecision.priority
    )?.name || 'unknown';

    return {
      shouldRefine: true,
      strategy,
      reason: bestDecision.reason,
      confidence: bestDecision.confidence,
      allDecisions: decisions
    };
  }
}

