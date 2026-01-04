import { BaseRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { IStep, IAdaptivePlan } from '../../types/index.js';
import { ACTIONS } from '../../constants/index.js';

/**
 * Refines plan after navigation steps
 * This is the original refinement trigger - after first navigation
 */
export class NavigationRefinementStrategy extends BaseRefinementStrategy {
  name = 'NavigationRefinement';
  priority = 100; // High priority - should run early

  isApplicable(step: IStep, context: RefinementContext): boolean {
    return step.action.name === ACTIONS.NAVIGATE;
  }

  async shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision> {
    // Only refine after navigation if plan is still in initial phase
    if (plan.phase !== 'initial') {
      return {
        shouldRefine: false,
        reason: 'Plan already refined',
        priority: this.priority,
        confidence: 0
      };
    }

    // Only refine once (check if we've already refined after navigation)
    const hasNavigationRefinement = context.previousRefinements.some(
      r => r.reason?.includes('navigation') || r.reason?.includes('Navigation')
    );

    if (hasNavigationRefinement) {
      return {
        shouldRefine: false,
        reason: 'Already refined after navigation',
        priority: this.priority,
        confidence: 0
      };
    }

    // Check if there are remaining steps that need refinement
    const remainingSteps = plan.steps.slice(context.currentStepIndex + 1);
    const needsRefinement = remainingSteps.some(s => this.isInteractionStep(s));

    if (!needsRefinement) {
      return {
        shouldRefine: false,
        reason: 'No interaction steps remaining to refine',
        priority: this.priority,
        confidence: 0
      };
    }

    return {
      shouldRefine: true,
      reason: 'Refining plan after navigation to update selectors based on actual DOM',
      priority: this.priority,
      confidence: 0.9 // High confidence - navigation is a good refinement point
    };
  }
}

