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
import OpenAI from 'openai';
import { Page } from 'playwright';

/**
 * Adaptive Planner that wraps a base planner and adds refinement capabilities
 */
export class AdaptivePlanner implements IPlanner {
  private basePlanner: IPlanner;
  private client: OpenAI;
  private model: string;
  private promptManager: PromptManager;

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
   * Refine plan after DOM inspection
   */
  async refinePlan(
    plan: IExecutionPlan,
    page: Page,
    executedSteps: IExecutionResult[] = []
  ): Promise<IAdaptivePlan> {
    // Extract testId from scenarioId (in async flows, scenarioId equals testId)
    const testId = plan.scenarioId;
    
    this.logger.info('PLAN REFINEMENT: Starting plan refinement', { 
      testId,
      planId: plan.id,
      planPhase: (plan as IAdaptivePlan).phase || 'initial',
      totalSteps: plan.steps.length,
      executedStepsCount: executedSteps.length,
      pageUrl: page.url()
    });

    // Convert plan to adaptive plan if needed (outside try block for catch access)
    const adaptivePlan: IAdaptivePlan = (plan as IAdaptivePlan).phase 
      ? plan as IAdaptivePlan 
      : { ...plan, phase: 'initial', refinementHistory: [] };

    try {
      // Extract DOM structure
      this.logger.debug('PLAN REFINEMENT: Extracting DOM structure', { testId, planId: plan.id });
      const domStructure = await this.extractDOMStructure(page);
      const url = page.url();
      
      this.logger.debug('PLAN REFINEMENT: DOM structure extracted', {
        testId,
        planId: plan.id,
        domStructureLength: domStructure.length,
        url
      });

    // Prepare executed steps summary
    const executedStepsSummary = executedSteps.map(r => ({
      stepId: r.stepId,
      status: r.status,
      error: r.error
    }));

    // Use LLM to refine the plan
    const systemPrompt = this.promptManager.render('planner-refine-system', {});
    const userPrompt = this.promptManager.render('planner-refine-user', {
      originalPlan: JSON.stringify(adaptivePlan, null, 2),
      domStructure: domStructure.substring(0, 15000), // Limit size
      url,
      executedSteps: JSON.stringify(executedStepsSummary, null, 2)
    });

      this.logger.debug('PLAN REFINEMENT: Calling LLM for refinement', {
        testId,
        planId: plan.id,
        model: this.model,
        promptLength: userPrompt.length
      });

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
        this.logger.error('PLAN REFINEMENT: LLM returned empty response', { testId, planId: plan.id });
        throw new Error('Planner refinement returned empty response');
      }

      this.logger.debug('PLAN REFINEMENT: Parsing LLM response', { testId, planId: plan.id });
      const parsed = JSON.parse(content);
      
      if (parsed.error) {
        this.logger.error('PLAN REFINEMENT: LLM returned error', {
          testId,
          planId: plan.id,
          error: parsed.error
        });
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

      // Create a map of refined steps by ID for easier lookup
      const refinedStepsMap = new Map<string, any>();
      if (parsed.steps && Array.isArray(parsed.steps)) {
        parsed.steps.forEach((refinedStep: any) => {
          if (refinedStep.id) {
            refinedStepsMap.set(refinedStep.id, refinedStep);
          }
        });
      }

      // Refine steps with discovered selectors, filtering out removed steps
      const refinedSteps: IRefinedStep[] = adaptivePlan.steps
        .filter(step => !removedStepIds.has(step.id)) // Remove steps marked for removal
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

          // Try element discovery if LLM refinement didn't work well
          if (!refinedSelector || confidence < 0.6) {
            // Will be handled by runtime discovery
            return {
              ...step,
              originalSelector,
              elementDiscovery: undefined // Will be discovered at runtime
            } as IRefinedStep;
          }

          // Create refinement record
          const refinement: IPlanRefinement = {
            stepId: step.id,
            originalSelector,
            refinedSelector,
            reason: `Refined selector based on DOM analysis`,
            timestamp: Date.now(),
            confidence
          };

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
                originalSelector // Keep original for reference
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

      // Collect refinements and add removal records
      const refinements: IPlanRefinement[] = parsed.refinements || [];
      
      // Add removal records to refinement history
      removedStepsInfo.forEach(removed => {
        refinements.push({
          stepId: removed.stepId,
          reason: `Step removed: ${removed.reason}`,
          timestamp: Date.now()
        });
      });

      const refinedPlan: IAdaptivePlan = {
        ...adaptivePlan,
        steps: refinedSteps,
        phase: 'refined',
        refinementHistory: [...(adaptivePlan.refinementHistory || []), ...refinements],
        refinementTimestamp: Date.now(),
        createdAt: adaptivePlan.createdAt || Date.now()
      };

      this.logger.info('PLAN REFINEMENT: Plan refinement completed successfully', {
        testId,
        planId: plan.id,
        originalStepsCount: adaptivePlan.steps.length,
        refinedStepsCount: refinedSteps.length,
        removedStepsCount: removedStepIds.size,
        refinementsCount: refinements.length,
        refinedSelectorsCount: refinedSteps.filter(s => (s as IRefinedStep).elementDiscovery).length
      });

      return refinedPlan;
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : { message: String(error) };
      
      this.logger.error('PLAN REFINEMENT: Plan refinement failed', {
        testId,
        planId: plan.id,
        error: errorDetails,
        willContinueWithOriginalPlan: true
      });
      
      // Return original plan if refinement fails
      return {
        ...adaptivePlan,
        phase: 'refined', // Mark as refined even if failed (to avoid retry)
        refinementHistory: [
          ...(adaptivePlan.refinementHistory || []),
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
   * Incrementally refine only the next step(s) after successful execution
   * More efficient than refining the entire plan
   */
  async refineNextStep(
    plan: IAdaptivePlan,
    page: Page,
    executedSteps: IExecutionResult[],
    nextStepIndex: number,
    testId?: string
  ): Promise<{ plan: IAdaptivePlan; removedStepIds: string[] }> {
    const planTestId = testId || plan.scenarioId;
    
    // Get the next step to refine
    if (nextStepIndex >= plan.steps.length) {
      this.logger.debug('No next step to refine', { testId: planTestId, nextStepIndex, totalSteps: plan.steps.length });
      return { plan, removedStepIds: [] };
    }

    const nextStep = plan.steps[nextStepIndex];
    
    this.logger.info('INCREMENTAL REFINEMENT: Refining next step', { 
      testId: planTestId,
      planId: plan.id,
      nextStepId: nextStep.id,
      nextStepDescription: nextStep.description,
      executedStepsCount: executedSteps.length,
      pageUrl: page.url()
    });

    try {
      // Extract DOM structure
      const domStructure = await this.extractDOMStructure(page);
      const url = page.url();
      
      // Prepare last executed step summary
      const lastExecutedStep = executedSteps.length > 0 ? {
        stepId: executedSteps[executedSteps.length - 1].stepId,
        status: executedSteps[executedSteps.length - 1].status,
        description: plan.steps.find(s => s.id === executedSteps[executedSteps.length - 1].stepId)?.description || 'unknown'
      } : null;

      // Use LLM to refine only the next step
      const systemPrompt = this.promptManager.render('planner-refine-system', {});
      const userPrompt = this.promptManager.render('planner-refine-next-step-user', {
        originalPlan: JSON.stringify(plan, null, 2),
        domStructure: domStructure.substring(0, 15000), // Limit size
        url,
        lastExecutedStep: lastExecutedStep ? JSON.stringify(lastExecutedStep, null, 2) : 'None',
        nextStep: JSON.stringify(nextStep, null, 2)
      });

      this.logger.debug('INCREMENTAL REFINEMENT: Calling LLM for next step refinement', {
        testId: planTestId,
        planId: plan.id,
        nextStepId: nextStep.id,
        model: this.model
      });

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
        this.logger.error('INCREMENTAL REFINEMENT: LLM returned empty response', { testId: planTestId, nextStepId: nextStep.id });
        return { plan, removedStepIds: [] };
      }

      const parsed = JSON.parse(content);
      
      if (parsed.error) {
        this.logger.error('INCREMENTAL REFINEMENT: LLM returned error', {
          testId: planTestId,
          nextStepId: nextStep.id,
          error: parsed.error
        });
        return { plan, removedStepIds: [] };
      }

      // Handle removed steps
      const removedStepIds: string[] = [];
      const removedStepsInfo: Array<{ stepId: string; reason: string }> = parsed.removedSteps || [];
      
      removedStepsInfo.forEach(removed => {
        if (removed.stepId === nextStep.id) {
          removedStepIds.push(removed.stepId);
          this.logger.info('INCREMENTAL REFINEMENT: Next step marked for removal', {
            testId: planTestId,
            stepId: removed.stepId,
            reason: removed.reason
          });
        }
      });

      // If step should be removed, remove it from plan
      if (removedStepIds.includes(nextStep.id)) {
        const updatedSteps = plan.steps.filter(s => s.id !== nextStep.id);
        const refinement: IPlanRefinement = {
          stepId: nextStep.id,
          reason: removedStepsInfo.find(r => r.stepId === nextStep.id)?.reason || 'Step removed as unnecessary',
          timestamp: Date.now()
        };

        const refinedPlan: IAdaptivePlan = {
          ...plan,
          steps: updatedSteps,
          phase: 'adaptive',
          refinementHistory: [...(plan.refinementHistory || []), refinement],
          refinementTimestamp: Date.now()
        };

        this.logger.info('INCREMENTAL REFINEMENT: Next step removed', {
          testId: planTestId,
          stepId: nextStep.id,
          reason: refinement.reason,
          remainingSteps: updatedSteps.length
        });

        return { plan: refinedPlan, removedStepIds };
      }

      // If step should be refined, update it
      const refinedStepData = parsed.steps && parsed.steps.length > 0 ? parsed.steps[0] : null;
      if (refinedStepData && refinedStepData.id === nextStep.id) {
        const interactionActions = ['click', 'type', 'hover'];
        const isInteractionStep = interactionActions.includes(nextStep.action.name) ||
          nextStep.action.name.startsWith('verify_element');

        if (isInteractionStep) {
          const originalSelector = nextStep.action.arguments.selector as string;
          const refinedSelector = refinedStepData.action?.arguments?.selector as string;
          const confidence = refinedStepData.action?.arguments?.confidence as number || 0.5;
          const alternatives = refinedStepData.action?.arguments?.alternatives as string[] || [];

          if (refinedSelector && confidence >= 0.6) {
            const refinement: IPlanRefinement = {
              stepId: nextStep.id,
              originalSelector,
              refinedSelector,
              reason: `Incrementally refined selector based on DOM analysis`,
              timestamp: Date.now(),
              confidence
            };

            // Update the step in the plan
            const updatedSteps = plan.steps.map(step => {
              if (step.id === nextStep.id) {
                return {
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
                    strategy: 'INCREMENTAL_REFINEMENT'
                  }
                } as IRefinedStep;
              }
              return step;
            });

            const refinedPlan: IAdaptivePlan = {
              ...plan,
              steps: updatedSteps,
              phase: 'adaptive',
              refinementHistory: [...(plan.refinementHistory || []), refinement],
              refinementTimestamp: Date.now()
            };

            this.logger.info('INCREMENTAL REFINEMENT: Next step refined', {
              testId: planTestId,
              stepId: nextStep.id,
              originalSelector,
              refinedSelector,
              confidence
            });

            return { plan: refinedPlan, removedStepIds };
          }
        }
      }

      // No changes needed
      return { plan, removedStepIds };
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : { message: String(error) };
      
      this.logger.error('INCREMENTAL REFINEMENT: Failed', {
        testId: planTestId,
        nextStepId: nextStep.id,
        error: errorDetails
      });
      
      return { plan, removedStepIds: [] };
    }
  }

  /**
   * Adapt plan during execution based on failures
   */
  async adaptPlan(
    plan: IAdaptivePlan,
    failedStep: IStep,
    failure: IExecutionResult,
    page: Page
  ): Promise<IAdaptivePlan> {
    const testId = plan.scenarioId; // Extract testId from scenarioId
    
    this.logger.info('Adapting plan due to step failure', { 
      testId,
      planId: plan.id, 
      stepId: failedStep.id,
      error: failure.error 
    });

    const interactionActions = ['click', 'type', 'hover'];
    const isInteractionStep = interactionActions.includes(failedStep.action.name);

    if (!isInteractionStep) {
      // Can't adapt non-interaction steps
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
      // Use element discovery to find the element
      const discovery = await this.elementDiscovery.discoverElement(
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

      return {
        ...plan,
        steps: adaptedSteps,
        phase: 'adaptive',
        refinementHistory: [...(plan.refinementHistory || []), refinement]
      };
    } catch (error) {
      this.logger.error('Plan adaptation failed', {
        testId,
        error: error instanceof Error ? error.message : String(error)
      });
      return plan; // Return original plan if adaptation fails
    }
  }

  /**
   * Extract simplified DOM structure
   * Uses function declaration instead of arrow function to avoid __name transpilation issues
   */
  private async extractDOMStructure(page: Page): Promise<string> {
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
  }
}

