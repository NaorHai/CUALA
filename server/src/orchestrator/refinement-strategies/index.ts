/**
 * Refinement Strategy System
 * Provides extensible, intelligent plan refinement capabilities
 */

import { Page } from 'playwright';
import { IStep, IAdaptivePlan, IExecutionResult, IPlanRefinement } from '../../types/index.js';

/**
 * Context information available to refinement strategies
 */
export interface RefinementContext {
  page: Page;
  executedSteps: IExecutionResult[];
  currentStepIndex: number;
  totalSteps: number;
  previousRefinements: IPlanRefinement[];
  pageUrl: string;
  previousPageUrl?: string;
  pageChanged: boolean;
  stepResult?: IExecutionResult; // Available for failure-based strategies
}

/**
 * Decision result from a refinement strategy
 */
export interface RefinementDecision {
  shouldRefine: boolean;
  reason: string;
  priority: number; // Higher priority = more important refinement
  confidence: number; // 0-1, how confident we are this refinement is needed
}

/**
 * Strategy interface for determining when/how to refine plans
 */
export interface IRefinementStrategy {
  /**
   * Unique name for this strategy
   */
  name: string;

  /**
   * Priority of this strategy (higher = runs first)
   */
  priority: number;

  /**
   * Determine if refinement should occur
   */
  shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision>;

  /**
   * Check if this strategy is applicable to the current step
   */
  isApplicable(step: IStep, context: RefinementContext): boolean;
}

/**
 * Base class for refinement strategies with common utilities
 */
export abstract class BaseRefinementStrategy implements IRefinementStrategy {
  abstract name: string;
  abstract priority: number;

  abstract shouldRefine(
    step: IStep,
    plan: IAdaptivePlan,
    context: RefinementContext
  ): Promise<RefinementDecision>;

  isApplicable(step: IStep, context: RefinementContext): boolean {
    return true; // Override in subclasses if needed
  }

  /**
   * Check if step is an interaction step that needs refinement
   */
  protected isInteractionStep(step: IStep): boolean {
    const interactionActions = ['click', 'type', 'hover'];
    return interactionActions.includes(step.action.name) ||
           step.action.name.startsWith('verify_element');
  }

  /**
   * Get confidence from step's action arguments
   */
  protected getStepConfidence(step: IStep): number {
    const confidence = step.action.arguments.confidence as number;
    return confidence !== undefined ? confidence : 1.0; // Default to high confidence
  }

  /**
   * Check if selector exists and is visible on page
   */
  protected async validateSelector(page: Page, selector: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      if (!element) return false;
      const isVisible = await element.isVisible().catch(() => false);
      return isVisible;
    } catch {
      return false;
    }
  }
}

