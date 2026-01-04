import { BaseRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { IStep, IAdaptivePlan } from '../../types/index.js';

/**
 * Refines plan when step confidence is low
 * Proactive refinement before execution
 */
export class ConfidenceRefinementStrategy extends BaseRefinementStrategy {
  name = 'ConfidenceRefinement';
  priority = 80; // Medium-high priority

  constructor(private confidenceThreshold: number = 0.6) {
    super();
  }

  isApplicable(step: IStep, context: RefinementContext): boolean {
    return this.isInteractionStep(step);
  }

  async shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision> {
    if (!this.isInteractionStep(step)) {
      return {
        shouldRefine: false,
        reason: 'Not an interaction step',
        priority: this.priority,
        confidence: 0
      };
    }

    const stepConfidence = this.getStepConfidence(step);
    
    // Check if confidence is below threshold
    if (stepConfidence >= this.confidenceThreshold) {
      return {
        shouldRefine: false,
        reason: `Confidence ${stepConfidence} is above threshold ${this.confidenceThreshold}`,
        priority: this.priority,
        confidence: 0
      };
    }

    // Check if we've already refined this step
    const stepRefinements = context.previousRefinements.filter(r => r.stepId === step.id);
    if (stepRefinements.length > 0) {
      const lastRefinement = stepRefinements[stepRefinements.length - 1];
      // Don't refine again if we just refined it
      if (Date.now() - lastRefinement.timestamp < 5000) {
        return {
          shouldRefine: false,
          reason: 'Recently refined this step',
          priority: this.priority,
          confidence: 0
        };
      }
    }

    // Validate selector exists
    const selector = step.action.arguments.selector as string;
    if (selector && await this.validateSelector(context.page, selector)) {
      // Selector exists but confidence is low - might need better selector
      return {
        shouldRefine: true,
        reason: `Low confidence (${stepConfidence}) for step ${step.id}, refining to find better selector`,
        priority: this.priority,
        confidence: 0.7 - stepConfidence // Higher confidence in refinement need if step confidence is lower
      };
    }

    // Selector doesn't exist or not visible - definitely need refinement
    return {
      shouldRefine: true,
      reason: `Selector not found or not visible, confidence ${stepConfidence} below threshold`,
      priority: this.priority,
      confidence: 0.9
    };
  }
}

