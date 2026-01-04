import { Page } from 'playwright';
import { BaseRefinementStrategy, RefinementContext, RefinementDecision } from './index.js';
import { IStep, IAdaptivePlan } from '../../types/index.js';

/**
 * Proactively refines plans before execution
 * Validates selectors and refines if they don't exist
 */
export class ProactiveRefinementStrategy extends BaseRefinementStrategy {
  name = 'ProactiveRefinement';
  priority = 70; // Medium priority - proactive but not urgent

  constructor(private validateBeforeExecution: boolean = true) {
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

    if (!this.validateBeforeExecution) {
      return {
        shouldRefine: false,
        reason: 'Proactive validation disabled',
        priority: this.priority,
        confidence: 0
      };
    }

    // Check if step is unnecessary (e.g., "click to reveal form" when form is already visible)
    const isUnnecessary = await this.checkIfStepIsUnnecessary(step, context.page);
    if (isUnnecessary) {
      return {
        shouldRefine: true,
        reason: `Step "${step.description}" is unnecessary - target element is already visible`,
        priority: this.priority + 10, // Higher priority for unnecessary step removal
        confidence: 0.95
      };
    }

    const selector = step.action.arguments.selector as string;
    if (!selector) {
      // No selector - definitely need refinement
      return {
        shouldRefine: true,
        reason: `Step ${step.id} has no selector, proactively refining`,
        priority: this.priority,
        confidence: 0.95
      };
    }

    // Validate selector exists and is visible
    const isValid = await this.validateSelector(context.page, selector);
    if (!isValid) {
      // Selector doesn't exist - proactively refine
      return {
        shouldRefine: true,
        reason: `Selector "${selector}" not found or not visible, proactively refining before execution`,
        priority: this.priority,
        confidence: 0.9
      };
    }

    // Selector exists - check confidence
    const confidence = this.getStepConfidence(step);
    if (confidence < 0.7) {
      // Low confidence even though selector exists - might want better selector
      return {
        shouldRefine: true,
        reason: `Selector exists but confidence ${confidence} is low, proactively refining for better selector`,
        priority: this.priority,
        confidence: 0.6
      };
    }

    return {
      shouldRefine: false,
      reason: 'Selector exists and confidence is acceptable',
      priority: this.priority,
      confidence: 0
    };
  }

  /**
   * Check if a step is unnecessary by directly inspecting the DOM
   * For example, if step says "click to reveal login form" but form is already visible
   */
  private async checkIfStepIsUnnecessary(step: IStep, page: Page): Promise<boolean> {
    const description = step.description.toLowerCase();
    const actionName = step.action.name;

    // Check for "reveal", "show", "open" patterns that indicate revealing something
    const revealPatterns = [
      /reveal.*login.*form/i,
      /click.*login.*button.*reveal/i,
      /open.*login.*form/i,
      /show.*login.*form/i,
      /click.*to.*reveal/i,
      /click.*to.*show/i
    ];

    const isRevealStep = revealPatterns.some(pattern => pattern.test(description)) ||
                         (actionName === 'click' && description.includes('reveal'));

    if (isRevealStep) {
      // Check if login form is already visible by looking for email/password inputs
      try {
        const emailInputs = await page.locator('input[type="email"]').count();
        const passwordInputs = await page.locator('input[type="password"]').count();
        const formElements = await page.locator('form').count();
        
        // If we find email/password inputs or form elements, the form is likely already visible
        if (emailInputs > 0 && passwordInputs > 0) {
          return true; // Form is already visible, step is unnecessary
        }
        if (formElements > 0 && (emailInputs > 0 || passwordInputs > 0)) {
          return true; // Form exists with login inputs
        }
      } catch (error) {
        // If check fails, assume step might be needed
        return false;
      }
    }

    return false;
  }
}

