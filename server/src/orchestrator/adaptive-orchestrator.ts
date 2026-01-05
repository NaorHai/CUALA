import {
  IExecutionPlan,
  IExecutionResult,
  IReportData,
  IStep,
  IAdaptivePlan,
  IRefinedStep,
} from '../types/index.js';
import { IOrchestrator } from './index.js';
import { ExecutionOrchestrator } from './execution-orchestrator.js';
import { IExecutor } from '../executors/index.js';
import { IVerifier } from '../verifier/index.js';
import { ILogger } from '../infra/logger.js';
import { IElementDiscoveryService } from '../element-discovery/index.js';
import { AdaptivePlanner } from '../planner/adaptive-planner.js';
import { EXECUTION_STATUS } from '../constants/index.js';
import { IStorage } from '../storage/index.js';
import { IConfig } from '../infra/config.js';
import { ConfidenceThresholdService } from '../infra/confidence-threshold-service.js';
import { Page } from 'playwright';
import { RefinementDecisionEngine } from './refinement-strategies/refinement-decision-engine.js';

/**
 * Adaptive Execution Orchestrator
 * Extends ExecutionOrchestrator with plan refinement and recovery capabilities
 */
export class AdaptiveExecutionOrchestrator extends ExecutionOrchestrator {
  private page: Page | null = null;
  private storage?: IStorage;
  private refinementEngine: RefinementDecisionEngine;
  private previousPageUrl?: string;
  private testId?: string; // Track testId for logging

  constructor(
    domExecutor: IExecutor,
    computerExecutor: IExecutor,
    verifier: IVerifier,
    private adaptivePlanner: AdaptivePlanner,
    private elementDiscovery: IElementDiscoveryService,
    logger: ILogger,
    storage?: IStorage,
    config?: IConfig,
    private confidenceThresholdService?: ConfidenceThresholdService
  ) {
    super(domExecutor, computerExecutor, verifier, logger);
    this.storage = storage;
    this.refinementEngine = new RefinementDecisionEngine(logger, config);
  }

  /**
   * Get page instance from executor (for DOM inspection)
   * Accesses executor's internal page property
   */
  private async getPageFromExecutor(executor: IExecutor): Promise<Page | null> {
    try {
      // Access executor's internal state to get page
      // Both executors have a private 'page' property
      const executorAny = executor as any;
      
      // Try direct page access
      if (executorAny.page && typeof executorAny.page.evaluate === 'function') {
        return executorAny.page;
      }
      
      // Try through context
      if (executorAny.context) {
        const pages = executorAny.context.pages();
        if (pages && pages.length > 0) {
          return pages[0];
        }
      }
      
      // Ensure session is initialized
      if (typeof executorAny.ensureSession === 'function') {
        await executorAny.ensureSession();
        if (executorAny.page) {
          return executorAny.page;
        }
      }
    } catch (error) {
      this.logger.debug('Could not access page from executor', { error });
    }
    return null;
  }

  async execute(
    plan: IExecutionPlan,
    onProgress?: (currentStep: number, totalSteps: number, results: IExecutionResult[]) => Promise<void>,
    failFast: boolean = true
  ): Promise<IReportData> {
    // Convert to adaptive plan if needed
    const adaptivePlan: IAdaptivePlan = (plan as IAdaptivePlan).phase 
      ? plan as IAdaptivePlan 
      : { ...plan, phase: 'initial', refinementHistory: [] };

    // Extract testId from scenarioId (in async flows, scenarioId equals testId)
    // For sync flows, scenarioId might be different, so we'll use scenarioId as testId
    this.testId = adaptivePlan.scenarioId;

    // Always use unified executor (first executor is unified)
    const executor = this.domExecutor; // Unified executor is passed as domExecutor
    
    // Initialize executor and get page instance for DOM inspection
    // Unified executor always has DOM access
    {
      // Ensure executor is initialized by executing a dummy action or accessing page
      const executorAny = executor as any;
      if (typeof executorAny.ensureSession === 'function') {
        await executorAny.ensureSession();
      } else if (typeof executorAny.initialize === 'function') {
        await executorAny.initialize();
      }
      this.page = await this.getPageFromExecutor(executor);
    }

    const startTime = Date.now();
    const results: IExecutionResult[] = [];
    let success = true;
    let failureReason: string | undefined;
    let currentPlan: IAdaptivePlan = adaptivePlan;
    const totalSteps = adaptivePlan.steps.length;

    this.logger.info(`Starting adaptive execution for plan: ${adaptivePlan.id}`, {
      testId: this.testId,
      scenarioId: adaptivePlan.scenarioId,
      phase: adaptivePlan.phase,
      totalSteps: adaptivePlan.steps.length
    });

    try {
      // Track removed step IDs to skip execution
      const removedStepIds = new Set<string>();
      
      for (let stepIndex = 0; stepIndex < currentPlan.steps.length; stepIndex++) {
        const step = currentPlan.steps[stepIndex];
        
        // Skip if this step was marked for removal
        if (removedStepIds.has(step.id)) {
          this.logger.info(`Skipping removed step ${step.id}`, {
            testId: this.testId,
            stepId: step.id,
            description: step.description
          });
          continue;
        }
        
        // Track page URL changes
        const currentPageUrl = this.page?.url() || '';
        const pageChanged = this.previousPageUrl !== undefined && 
                           this.previousPageUrl !== currentPageUrl;

        // Check if step is unnecessary before refinement
        if (this.page && step.action.name === 'click') {
          const isUnnecessary = await this.checkIfStepIsUnnecessary(step);
          if (isUnnecessary) {
            this.logger.info(`Step ${step.id} is unnecessary - target is already visible, skipping`, {
              testId: this.testId,
              stepId: step.id,
              description: step.description,
              reason: 'Target element (form/modal) is already visible on the page'
            });
            removedStepIds.add(step.id);
            continue; // Skip this step
          }
        }

        // Intelligent refinement decision before step execution
        if (this.page) {
          this.logger.info(`ORCHESTRATOR DECISION: Evaluating refinement strategies for step ${step.id}`, {
            testId: this.testId,
            stepId: step.id,
            action: step.action.name,
            selector: step.action.arguments.selector,
            description: step.description,
            planPhase: currentPlan.phase,
            currentStepIndex: stepIndex,
            totalSteps: currentPlan.steps.length,
            pageUrl: this.page.url()
          });

          const refinementDecision = await this.refinementEngine.shouldRefine(
            step,
            currentPlan,
            this.page,
            results,
            stepIndex,
            undefined // No step result yet - proactive refinement
          );

          // Log all strategy evaluations
          this.logger.info(`ORCHESTRATOR DECISION: All refinement strategies evaluated for step ${step.id}`, {
            testId: this.testId,
            stepId: step.id,
            strategiesEvaluated: refinementDecision.allDecisions.length,
            decisions: refinementDecision.allDecisions.map((d, idx) => ({
              index: idx,
              shouldRefine: d.shouldRefine,
              reason: d.reason,
              confidence: d.confidence,
              priority: d.priority
            })),
            finalDecision: {
              shouldRefine: refinementDecision.shouldRefine,
              strategy: refinementDecision.strategy,
              reason: refinementDecision.reason,
              confidence: refinementDecision.confidence
            }
          });

          if (refinementDecision.shouldRefine) {
            this.logger.info(`REFINEMENT DECISION: ${refinementDecision.strategy}`, {
              testId: this.testId,
              stepId: step.id,
              reason: refinementDecision.reason,
              confidence: refinementDecision.confidence,
              allDecisions: refinementDecision.allDecisions.map(d => ({
                strategy: 'unknown',
                shouldRefine: d.shouldRefine,
                reason: d.reason,
                confidence: d.confidence
              }))
            });

            try {
              // Wait for page to stabilize if needed
              if (pageChanged || step.action.name === 'navigate') {
                await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
              }

              const planBeforeRefinement = currentPlan;
              currentPlan = await this.adaptivePlanner.refinePlan(
                currentPlan,
                this.page,
                results
              );

              // Persist refined plan
              if (this.storage) {
                await this.storage.savePlan(currentPlan);
                this.logger.info('Refined plan persisted', { 
                  planId: currentPlan.id, 
                  phase: currentPlan.phase,
                  strategy: refinementDecision.strategy
                });
              }

              // Check which steps were removed during refinement
              const planBeforeStepIds = new Set(planBeforeRefinement.steps.map(s => s.id));
              const planAfterStepIds = new Set(currentPlan.steps.map(s => s.id));
              const newlyRemovedStepIds = [...planBeforeStepIds].filter(id => !planAfterStepIds.has(id));
              
              // Add newly removed steps to the tracking set
              newlyRemovedStepIds.forEach(id => {
                removedStepIds.add(id);
                this.logger.info(`Step ${id} was removed during refinement, will skip execution`, {
                  testId: this.testId,
                  stepId: id,
                  reason: 'Step determined to be unnecessary based on DOM state'
                });
              });

              // Check if current step was removed
              if (removedStepIds.has(step.id)) {
                this.logger.info(`Current step ${step.id} was removed during refinement, skipping execution`, {
                  testId: this.testId,
                  stepId: step.id,
                  description: step.description
                });
                continue; // Skip to next step
              }

              this.logger.info('Plan refined successfully', {
                refinements: currentPlan.refinementHistory?.length || 0,
                strategy: refinementDecision.strategy,
                originalStepsCount: planBeforeRefinement.steps.length,
                refinedStepsCount: currentPlan.steps.length,
                removedStepsCount: newlyRemovedStepIds.length
              });

              // Update step reference from refined plan (find by ID since indices may have changed)
              const refinedStep = currentPlan.steps.find(s => s.id === step.id);
              if (refinedStep) {
                Object.assign(step, refinedStep);
              } else {
                // Step not found in refined plan - it was removed
                this.logger.warn(`Step ${step.id} not found in refined plan, marking as removed`, {
                  testId: this.testId,
                  stepId: step.id
                });
                removedStepIds.add(step.id);
                continue; // Skip execution
              }
            } catch (error) {
              const errorDetails = error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
              } : { message: String(error) };
              
              this.logger.error('ORCHESTRATOR DECISION: Plan refinement failed', { 
                testId: this.testId,
                stepId: step.id,
                strategy: refinementDecision.strategy,
                error: errorDetails,
                reason: 'Refinement attempted but failed - continuing with original plan',
                willContinue: true
              });
            }
          } else {
            this.logger.info(`ORCHESTRATOR DECISION: No refinement needed for step ${step.id}`, {
              testId: this.testId,
              stepId: step.id,
              reason: refinementDecision.reason,
              allStrategiesEvaluated: refinementDecision.allDecisions.length
            });
          }
        }

        const stepStartTime = Date.now();
        this.logger.info(`ORCHESTRATOR DECISION: Executing step ${step.id}`, { 
          testId: this.testId,
          stepId: step.id, 
          action: step.action.name,
          selector: step.action.arguments.selector,
          description: step.description,
          hasRefinedSelector: !!(step as IRefinedStep).elementDiscovery,
          planPhase: currentPlan.phase,
          stepIndex: stepIndex + 1,
          totalSteps: currentPlan.steps.length
        });

        // Add testId to action for logging purposes
        (step.action as any).testId = this.testId;

            // Execute step
            let result = await executor.execute(step.action);
            result.stepId = step.id;
            result.description = step.description;
        const stepEndTime = Date.now();
        const duration = stepEndTime - stepStartTime;
        
        this.logger.info(`ACTION COMPLETED: ${step.id}`, { 
          testId: this.testId,
          status: result.status, 
          durationMs: duration
        });

        // Update page URL tracking
        if (this.page) {
          this.previousPageUrl = currentPageUrl;
        }

        // Handle step failure with intelligent recovery
        if (result.status !== EXECUTION_STATUS.SUCCESS) {
          this.logger.error(`STEP FAILED: ${step.id}`, { 
            testId: this.testId,
            error: result.error 
          });
          
          // Use refinement engine to decide if recovery should be attempted
          if (this.page) {
            const failureDecision = await this.refinementEngine.shouldRefine(
              step,
              currentPlan,
              this.page,
              results,
              stepIndex,
              result // Include failure result
            );

            // Log all failure strategy evaluations
            this.logger.info(`ORCHESTRATOR DECISION: Failure recovery strategies evaluated for step ${step.id}`, {
              testId: this.testId,
              stepId: step.id,
              error: result.error,
              strategiesEvaluated: failureDecision.allDecisions.length,
              decisions: failureDecision.allDecisions.map((d, idx) => ({
                index: idx,
                shouldRefine: d.shouldRefine,
                reason: d.reason,
                confidence: d.confidence,
                priority: d.priority
              })),
              finalDecision: {
                shouldRefine: failureDecision.shouldRefine,
                strategy: failureDecision.strategy,
                reason: failureDecision.reason,
                confidence: failureDecision.confidence
              }
            });

            if (failureDecision.shouldRefine) {
              this.logger.info(`FAILURE REFINEMENT: ${failureDecision.strategy}`, {
                testId: this.testId,
                stepId: step.id,
                reason: failureDecision.reason,
                confidence: failureDecision.confidence
              });

              const recovered = await this.attemptRecovery(step, result, currentPlan);
              
              if (recovered) {
                this.logger.info(`Step ${step.id} recovered, retrying...`);
                // Retry with recovered selector
                result = await executor.execute(step.action);
                result.stepId = step.id;
                result.description = step.description;
                
                if (result.status === EXECUTION_STATUS.SUCCESS) {
                  this.logger.info(`Step ${step.id} succeeded after recovery`);
                  // Continue normal flow
                } else {
                  // Recovery failed
                  success = false;
                  failureReason = `Step ${step.id} failed even after recovery attempt: ${result.error || 'Unknown error'}`;
                  if (failFast) {
                    results.push(result);
                    if (onProgress) {
                      await onProgress(stepIndex + 1, totalSteps, results);
                    }
                    break;
                  }
                }
              } else {
                // Recovery not possible
                this.logger.error(`ORCHESTRATOR DECISION: Recovery failed for step ${step.id}`, {
                  testId: this.testId,
                  stepId: step.id,
                  reason: 'Element discovery failed or returned low confidence',
                  willAbort: failFast
                });
                success = false;
                failureReason = `Step ${step.id} (${step.description}) failed: ${result.error || 'Unknown error'}`;
                if (failFast) {
                  results.push(result);
                  if (onProgress) {
                    await onProgress(stepIndex + 1, totalSteps, results);
                  }
                  break;
                }
              }
            } else {
              // No recovery strategy recommended
              this.logger.warn(`ORCHESTRATOR DECISION: No recovery strategy recommended for step ${step.id}`, {
                testId: this.testId,
                stepId: step.id,
                reason: failureDecision.reason,
                allStrategiesEvaluated: failureDecision.allDecisions.length,
                willAbort: failFast
              });
              success = false;
              failureReason = `Step ${step.id} (${step.description}) failed: ${result.error || 'Unknown error'}`;
              if (failFast) {
                results.push(result);
                if (onProgress) {
                  await onProgress(stepIndex + 1, totalSteps, results);
                }
                break;
              }
            }
          } else {
            // No page access for recovery
            success = false;
            failureReason = `Step ${step.id} (${step.description}) failed: ${result.error || 'Unknown error'}`;
            if (failFast) {
              results.push(result);
              if (onProgress) {
                await onProgress(stepIndex + 1, totalSteps, results);
              }
              break;
            }
          }
        }

        // Perform verification (same as base orchestrator)
        if (step.assertion) {
          this.logger.info(`Checking assertion for step ${step.id}`, { testId: this.testId });
          const verifyStartTime = Date.now();
          const assertionVerifications = await this.verifier.verifyAssertions([step.assertion], result);
          const assertionVerification = assertionVerifications[0];
          const verifyEndTime = Date.now();
          
          result.verification = assertionVerification;
          
          this.logger.info(`ASSERTION VERIFICATION COMPLETED: ${step.id}`, { 
            testId: this.testId,
            isVerified: assertionVerification.isVerified,
            durationMs: verifyEndTime - verifyStartTime
          });
        } else {
          const verifyStartTime = Date.now();
          const stepVerification = await this.verifier.verifyStep(step, result);
          const verifyEndTime = Date.now();
          
          result.verification = stepVerification;
          
          this.logger.info(`VERIFICATION COMPLETED: ${step.id}`, { 
            testId: this.testId,
            isVerified: stepVerification.isVerified,
            durationMs: verifyEndTime - verifyStartTime
          });
        }

        // Check verification failure
        const verification = result.verification;
        if (!verification.isVerified) {
          const verificationType = step.assertion ? 'assertion' : 'verification';
          this.logger.error(`${verificationType.toUpperCase()} FAILED: ${step.id}`, { 
            testId: this.testId,
            evidence: verification.evidence 
          });
          success = false;
          failureReason = `${verificationType === 'assertion' ? 'Assertion' : 'Verification'} failed for step ${step.id} (${step.description}): ${verification.evidence}`;
          if (failFast) {
            results.push(result);
            if (onProgress) {
              await onProgress(stepIndex + 1, totalSteps, results);
            }
            break;
          }
        }

        results.push(result);

        // Incremental refinement: After successful step execution and verification,
        // refine only the next step (more efficient than refining entire plan)
        if (this.page && stepIndex + 1 < currentPlan.steps.length) {
          const nextStepIndex = stepIndex + 1;
          const nextStep = currentPlan.steps[nextStepIndex];
          
          // Skip if next step is already marked for removal
          if (!removedStepIds.has(nextStep.id)) {
            this.logger.info(`INCREMENTAL REFINEMENT: Evaluating next step ${nextStep.id} after successful execution`, {
              testId: this.testId,
              currentStepId: step.id,
              nextStepId: nextStep.id,
              nextStepDescription: nextStep.description
            });

            try {
              const refinementResult = await this.adaptivePlanner.refineNextStep(
                currentPlan,
                this.page,
                results,
                nextStepIndex,
                this.testId
              );

              // Update plan with refined next step
              if (refinementResult.removedStepIds.length > 0) {
                this.logger.info(`INCREMENTAL REFINEMENT: Next step(s) removed`, {
                  testId: this.testId,
                  removedStepIds: refinementResult.removedStepIds,
                  nextStepId: nextStep.id
                });
                refinementResult.removedStepIds.forEach(id => removedStepIds.add(id));
              }

              // Update current plan if it was refined
              if (refinementResult.plan.steps.length !== currentPlan.steps.length ||
                  refinementResult.plan.refinementHistory?.length !== currentPlan.refinementHistory?.length) {
                const planBeforeUpdate = currentPlan;
                currentPlan = refinementResult.plan;
                
                // If a step was removed, we need to adjust the loop
                // The removed step will be skipped in the next iteration due to removedStepIds check
                if (refinementResult.removedStepIds.length > 0) {
                  this.logger.info(`INCREMENTAL REFINEMENT: Plan updated, step removed from plan`, {
                    testId: this.testId,
                    removedStepIds: refinementResult.removedStepIds,
                    planStepsBefore: planBeforeUpdate.steps.length,
                    planStepsAfter: currentPlan.steps.length
                  });
                }
                
                // Persist refined plan
                if (this.storage) {
                  await this.storage.savePlan(currentPlan);
                  this.logger.info('INCREMENTAL REFINEMENT: Refined plan persisted', { 
                    testId: this.testId,
                    planId: currentPlan.id, 
                    phase: currentPlan.phase
                  });
                }
              }
            } catch (error) {
              const errorDetails = error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                name: error.name
              } : { message: String(error) };
              
              this.logger.warn('INCREMENTAL REFINEMENT: Failed for next step (non-fatal)', {
                testId: this.testId,
                nextStepId: nextStep.id,
                error: errorDetails,
                willContinue: true
              });
              // Continue execution even if incremental refinement fails
            }
          }
        }

        if (onProgress) {
          await onProgress(stepIndex + 1, totalSteps, results);
        }
      }
    } catch (error) {
      this.logger.error('Unrecoverable error during adaptive execution', {
        testId: this.testId,
        error: error instanceof Error ? error.message : String(error)
      });
      success = false;
      failureReason = error instanceof Error ? error.message : String(error);
    } finally {
      // Cleanup errors should not affect test results - they're just resource cleanup
      this.logger.info('Enforcing session isolation: Cleaning up executors...', { testId: this.testId });
      try {
        // Use Promise.allSettled to ensure both cleanup attempts complete
        // Even if one fails, the other should still run
        const cleanupResults = await Promise.allSettled([
          this.domExecutor.cleanup().catch(err => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            // Only log if it's not an expected cleanup error
            const isExpectedError = 
              errorMsg.includes('Target page, context or browser has been closed') ||
              errorMsg.includes('Failed to find context') ||
              errorMsg.includes('Target.disposeBrowserContext') ||
              errorMsg.includes('Protocol error');
            
            if (!isExpectedError) {
              this.logger.warn('Cleanup error in domExecutor (non-fatal)', { testId: this.testId, error: errorMsg });
            } else {
              this.logger.debug('domExecutor cleanup: context already closed', { testId: this.testId });
            }
          }),
          this.computerExecutor.cleanup().catch(err => {
            const errorMsg = err instanceof Error ? err.message : String(err);
            // Only log if it's not an expected cleanup error
            const isExpectedError = 
              errorMsg.includes('Target page, context or browser has been closed') ||
              errorMsg.includes('Failed to find context') ||
              errorMsg.includes('Target.disposeBrowserContext') ||
              errorMsg.includes('Protocol error');
            
            if (!isExpectedError) {
              this.logger.warn('Cleanup error in computerExecutor (non-fatal)', { testId: this.testId, error: errorMsg });
            } else {
              this.logger.debug('computerExecutor cleanup: context already closed', { testId: this.testId });
            }
          })
        ]);
        
        // Log any rejected promises (should be caught above, but just in case)
        cleanupResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const executorName = index === 0 ? 'domExecutor' : 'computerExecutor';
            this.logger.warn(`Cleanup promise rejected for ${executorName} (non-fatal)`, { 
              testId: this.testId,
              reason: result.reason instanceof Error ? result.reason.message : String(result.reason) 
            });
          }
        });
      } catch (cleanupError) {
        // Log but don't throw - cleanup errors should not affect test results
        const errorMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        this.logger.warn('Cleanup error (non-fatal)', { testId: this.testId, error: errorMsg });
      }
    }

    const endTime = Date.now();
    const report: IReportData = {
      scenarioId: currentPlan.scenarioId,
      planId: currentPlan.id,
      results,
      summary: {
        startTime,
        endTime,
        success,
        reason: success ? undefined : failureReason,
      },
    };

    this.logger.info(`Adaptive execution finished. Success: ${success}`, { 
      testId: this.testId,
      duration: endTime - startTime,
      refinements: currentPlan.refinementHistory?.length || 0,
      finalPhase: currentPlan.phase
    });

    return report;
  }

  /**
   * Check if a step is unnecessary by directly inspecting the DOM
   * For example, if step says "click to reveal login form" but form is already visible
   */
  private async checkIfStepIsUnnecessary(step: IStep): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    const description = step.description.toLowerCase();
    const actionName = step.action.name;

    // Check for "reveal", "show", "open" patterns that indicate revealing something
    const revealPatterns = [
      /reveal.*login.*form/i,
      /click.*login.*button.*reveal/i,
      /open.*login.*form/i,
      /show.*login.*form/i,
      /click.*to.*reveal/i,
      /click.*to.*show/i,
      /reveal.*form/i
    ];

    const isRevealStep = revealPatterns.some(pattern => pattern.test(description)) ||
                         (actionName === 'click' && (description.includes('reveal') || description.includes('show')));

    if (isRevealStep) {
      // Check if login form is already visible by looking for email/password inputs
      try {
        const emailInputs = await this.page.locator('input[type="email"]').count();
        const passwordInputs = await this.page.locator('input[type="password"]').count();
        const formElements = await this.page.locator('form').count();
        
        // If we find email/password inputs or form elements, the form is likely already visible
        if (emailInputs > 0 && passwordInputs > 0) {
          this.logger.info(`Form is already visible - found ${emailInputs} email inputs and ${passwordInputs} password inputs`, {
            testId: this.testId,
            stepId: step.id
          });
          return true; // Form is already visible, step is unnecessary
        }
        if (formElements > 0 && (emailInputs > 0 || passwordInputs > 0)) {
          this.logger.info(`Form is already visible - found form element with login inputs`, {
            testId: this.testId,
            stepId: step.id
          });
          return true; // Form exists with login inputs
        }
      } catch (error) {
        // If check fails, assume step might be needed
        this.logger.debug(`Could not check if step is unnecessary`, {
          testId: this.testId,
          stepId: step.id,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    }

    return false;
  }

  /**
   * Attempt to recover from step failure by discovering element
   * Uses intelligent refinement strategies to guide recovery
   */
  private async attemptRecovery(
    step: IStep,
    failure: IExecutionResult,
    plan: IAdaptivePlan
  ): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    const refinedStep = step as IRefinedStep;
    
    // Check retry count (max retries handled by FailureRefinementStrategy)
    if ((refinedStep.retryCount || 0) >= 2) {
      this.logger.warn(`Step ${step.id} exceeded max retry count`, { testId: this.testId });
      return false;
    }

    const description = (step.action.arguments.description as string) || 
                       (step.action.arguments.selector as string) || 
                       step.description;

    if (!description) {
      return false;
    }

    try {
      this.logger.info(`ORCHESTRATOR DECISION: Attempting intelligent recovery for step ${step.id}`, { 
        testId: this.testId,
        stepId: step.id,
        description,
        action: step.action.name,
        failedSelector: step.action.arguments.selector,
        pageUrl: this.page.url()
      });
      
      // Log available discovery strategies
      const availableStrategies = (this.elementDiscovery as any).strategies?.map((s: any) => s.name) || ['unknown'];
      this.logger.info(`ORCHESTRATOR DECISION: Element discovery strategies available`, {
        testId: this.testId,
        stepId: step.id,
        strategies: availableStrategies,
        note: availableStrategies.includes('VISION') 
          ? 'Vision AI fallback available' 
          : 'WARNING: No Vision AI strategy available - only DOM-based discovery'
      });
      
      // Use element discovery to find the element
      const discovery = await this.elementDiscovery.discoverElement(
        this.page,
        description,
        step.action.name as 'click' | 'type' | 'hover',
        {
          url: this.page.url(),
          html: failure.snapshot.metadata.html_length as number > 0 
            ? 'available' 
            : undefined,
          testId: this.testId
        }
      );

      // Use confidence threshold from configuration service
      const defaultThreshold = this.confidenceThresholdService 
        ? await this.confidenceThresholdService.getThreshold('default')
        : 0.5; // Fallback to hard-coded value if service not available
      if (discovery.confidence < defaultThreshold) {
        this.logger.warn(`Low confidence discovery for step ${step.id}`, { 
          testId: this.testId,
          confidence: discovery.confidence,
          threshold: defaultThreshold,
          selector: discovery.selector
        });
        return false;
      }

      // Update step action with discovered selector
      step.action.arguments.selector = discovery.selector;
      step.action.arguments.confidence = discovery.confidence;
      step.action.arguments.alternatives = discovery.alternatives;

      // Adapt plan with new selector
      const adaptedPlan = await this.adaptivePlanner.adaptPlan(
        plan,
        step,
        failure,
        this.page
      );

      // Persist adapted plan
      if (this.storage) {
        await this.storage.savePlan(adaptedPlan);
        this.logger.info('Adapted plan persisted', { 
          testId: this.testId,
          planId: adaptedPlan.id, 
          phase: adaptedPlan.phase 
        });
      }

      this.logger.info(`Recovery successful for step ${step.id}`, {
        testId: this.testId,
        originalSelector: refinedStep.originalSelector,
        discoveredSelector: discovery.selector,
        confidence: discovery.confidence,
        strategy: discovery.strategy
      });

      return true;
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : { message: String(error) };
      
      this.logger.error(`ORCHESTRATOR DECISION: Recovery failed for step ${step.id}`, {
        testId: this.testId,
        stepId: step.id,
        error: errorDetails,
        reason: 'Element discovery could not find element',
        availableStrategies: (this.elementDiscovery as any).strategies?.map((s: any) => s.name) || ['unknown'],
        note: 'If no Vision AI strategy is available, DOM-based discovery may fail for complex elements'
      });
      return false;
    }
  }
}

