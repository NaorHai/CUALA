import { BaseRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { IStep, IAdaptivePlan } from '../../types/index.js';
import { EXECUTION_STATUS } from '../../constants/index.js';

/**
 * Refines plan after step failures
 * This is the recovery mechanism
 */
export class FailureRefinementStrategy extends BaseRefinementStrategy {
  name = 'FailureRefinement';
  priority = 95; // Very high priority - failures need immediate attention

  constructor(private maxRetries: number = 2) {
    super();
  }

  isApplicable(step: IStep, context: RefinementContext): boolean {
    // Only applicable if we have a step result and it failed
    return !!context.stepResult && 
           context.stepResult.status !== EXECUTION_STATUS.SUCCESS &&
           this.isInteractionStep(step);
  }

  async shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision> {
    if (!context.stepResult) {
      return {
        shouldRefine: false,
        reason: 'No step result available',
        priority: this.priority,
        confidence: 0
      };
    }

    if (context.stepResult.status === EXECUTION_STATUS.SUCCESS) {
      return {
        shouldRefine: false,
        reason: 'Step succeeded, no refinement needed',
        priority: this.priority,
        confidence: 0
      };
    }

    if (!this.isInteractionStep(step)) {
      return {
        shouldRefine: false,
        reason: 'Not an interaction step, cannot refine',
        priority: this.priority,
        confidence: 0
      };
    }

    // Check retry count
    const retryCount = (step as any).retryCount || 0;
    if (retryCount >= this.maxRetries) {
      return {
        shouldRefine: false,
        reason: `Exceeded max retries (${this.maxRetries})`,
        priority: this.priority,
        confidence: 0
      };
    }

    // Check if we've already refined this step recently
    const stepRefinements = context.previousRefinements.filter(r => r.stepId === step.id);
    const recentRefinement = stepRefinements.find(
      r => Date.now() - r.timestamp < 5000 // Within last 5 seconds
    );

    if (recentRefinement) {
      return {
        shouldRefine: false,
        reason: 'Recently refined this step after failure',
        priority: this.priority,
        confidence: 0
      };
    }

    const error = context.stepResult.error || 'Unknown error';
    return {
      shouldRefine: true,
      reason: `Step failed: ${error}, refining to find alternative selector`,
      priority: this.priority,
      confidence: 0.95 // Very high confidence - failure definitely needs refinement
    };
  }
}

