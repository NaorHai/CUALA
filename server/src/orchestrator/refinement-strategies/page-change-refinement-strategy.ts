import { BaseRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { IStep, IAdaptivePlan } from '../../types/index.js';

/**
 * Refines plan when page URL changes
 * Useful for SPAs and multi-page flows
 */
export class PageChangeRefinementStrategy extends BaseRefinementStrategy {
  name = 'PageChangeRefinement';
  priority = 90; // High priority - page changes are important

  isApplicable(step: IStep, context: RefinementContext): boolean {
    return context.pageChanged && this.isInteractionStep(step);
  }

  async shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision> {
    if (!context.pageChanged) {
      return {
        shouldRefine: false,
        reason: 'Page URL has not changed',
        priority: this.priority,
        confidence: 0
      };
    }

    if (!this.isInteractionStep(step)) {
      return {
        shouldRefine: false,
        reason: 'Not an interaction step',
        priority: this.priority,
        confidence: 0
      };
    }

    // Check if we've already refined after this page change
    const recentRefinements = context.previousRefinements.filter(
      r => Date.now() - r.timestamp < 10000 // Within last 10 seconds
    );
    
    const hasPageChangeRefinement = recentRefinements.some(
      r => r.reason?.includes('page change') || r.reason?.includes('Page change')
    );

    if (hasPageChangeRefinement) {
      return {
        shouldRefine: false,
        reason: 'Already refined after page change',
        priority: this.priority,
        confidence: 0
      };
    }

    // Check remaining steps on this page
    const remainingSteps = plan.steps.slice(context.currentStepIndex);
    const stepsOnNewPage = remainingSteps.filter(s => this.isInteractionStep(s));

    if (stepsOnNewPage.length === 0) {
      return {
        shouldRefine: false,
        reason: 'No interaction steps remaining on new page',
        priority: this.priority,
        confidence: 0
      };
    }

    return {
      shouldRefine: true,
      reason: `Page changed from ${context.previousPageUrl} to ${context.pageUrl}, refining selectors for new page`,
      priority: this.priority,
      confidence: 0.85
    };
  }
}

