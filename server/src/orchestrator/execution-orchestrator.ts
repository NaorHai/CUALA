import {
  IExecutionPlan,
  IExecutionResult,
  IReportData,
  IVerificationResult,
  IStep,
} from '../types/index.js';
import { IOrchestrator } from './index.js';
import { IExecutor } from '../executors/index.js';
import { IVerifier } from '../verifier/index.js';
import { ILogger } from '../infra/logger.js';
import { EXECUTION_STATUS } from '../constants/index.js';

export class ExecutionOrchestrator implements IOrchestrator {
  constructor(
    protected domExecutor: IExecutor,
    protected computerExecutor: IExecutor,
    protected verifier: IVerifier,
    protected logger: ILogger
  ) {}

  async execute(
    plan: IExecutionPlan,
    onProgress?: (currentStep: number, totalSteps: number, results: IExecutionResult[]) => Promise<void>,
    failFast: boolean = true
  ): Promise<IReportData> {
    const startTime = Date.now();
    const results: IExecutionResult[] = [];
    let success = true;
    let failureReason: string | undefined;
    const totalSteps = plan.steps.length;

    this.logger.info(`Starting execution for plan: ${plan.id}`, {
      scenarioId: plan.scenarioId,
    });

    // Always use unified executor (first executor is unified)
    const executor = this.domExecutor; // Unified executor is passed as domExecutor

    try {
      for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex++) {
        const step = plan.steps[stepIndex];
        const stepStartTime = Date.now();
        this.logger.info(`DECISION: Executing step ${step.id} using unified executor`, { 
          stepId: step.id, 
          action: step.action.name,
          hasAssertion: !!step.assertion
        });

        // Add testId to action if available (for async flows)
        const testId = (plan as any).scenarioId; // In async flows, scenarioId equals testId
        if (testId) {
          (step.action as any).testId = testId;
        }

        const result = await executor.execute(step.action);
        // Set the stepId and description from the plan step
        result.stepId = step.id;
        result.description = step.description;
        const stepEndTime = Date.now();
        const duration = stepEndTime - stepStartTime;
        
        this.logger.info(`ACTION COMPLETED: ${step.id}`, { 
          status: result.status, 
          durationMs: duration,
          snapshotCaptured: !!result.snapshot 
        });

        if (result.status !== EXECUTION_STATUS.SUCCESS) {
          this.logger.error(`STEP FAILED: ${step.id}`, { error: result.error });
          success = false;
          failureReason = `Step ${step.id} (${step.description}) failed: ${result.error || 'Unknown error'}`;
          if (failFast) {
            // Still add result to array even if failed (for reporting)
            results.push(result);
            if (onProgress) {
              await onProgress(stepIndex + 1, totalSteps, results);
            }
            // Break immediately on failure when failFast is true
            break;
          }
          // Continue to next step if failFast is false
        }

        // Check assertion for this step if one exists
        if (step.assertion) {
          // If step has an assertion, verify it
          this.logger.info(`Checking assertion for step ${step.id}: ${step.assertion.description}`);
          const verifyStartTime = Date.now();
          const assertionVerifications = await this.verifier.verifyAssertions([step.assertion], result);
          const assertionVerification = assertionVerifications[0];
          const verifyEndTime = Date.now();
          
          // Use assertion verification as the step's verification
          result.verification = assertionVerification;
          
          this.logger.info(`ASSERTION VERIFICATION COMPLETED: ${step.id}`, { 
            isVerified: assertionVerification.isVerified,
            evidence: assertionVerification.evidence,
            durationMs: verifyEndTime - verifyStartTime
          });
        } else {
          // No assertion for this step, perform standard step verification
          const verifyStartTime = Date.now();
          const stepVerification = await this.verifier.verifyStep(step, result);
          const verifyEndTime = Date.now();
          
          result.verification = stepVerification;
          
          this.logger.info(`VERIFICATION COMPLETED: ${step.id}`, { 
            isVerified: stepVerification.isVerified,
            durationMs: verifyEndTime - verifyStartTime
          });
        }

        // Check if verification failed (either step or assertion)
        const verification = result.verification;
        if (!verification.isVerified) {
          const verificationType = step.assertion ? 'assertion' : 'verification';
          this.logger.error(`${verificationType.toUpperCase()} FAILED: ${step.id}`, { evidence: verification.evidence });
          success = false;
          failureReason = `${verificationType === 'assertion' ? 'Assertion' : 'Verification'} failed for step ${step.id} (${step.description}): ${verification.evidence}`;
          if (failFast) {
            // Add result with failed verification
            results.push(result);
            if (onProgress) {
              await onProgress(stepIndex + 1, totalSteps, results);
            }
            // Break immediately on verification failure when failFast is true
            break;
          }
          // Continue to next step if failFast is false
        }

        // Add result with verification attached
        results.push(result);

        // Update progress after step completion (action + verification)
        if (onProgress) {
          await onProgress(stepIndex + 1, totalSteps, results);
        }
      }
    } catch (error) {
      this.logger.error('Unrecoverable error during execution', error);
      success = false;
      failureReason = error instanceof Error ? error.message : String(error);
    } finally {
      // Cleanup errors should not affect test results - they're just resource cleanup
      this.logger.info('Enforcing session isolation: Cleaning up executors...');
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
              this.logger.warn('Cleanup error in domExecutor (non-fatal)', { error: errorMsg });
            } else {
              this.logger.debug('domExecutor cleanup: context already closed');
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
              this.logger.warn('Cleanup error in computerExecutor (non-fatal)', { error: errorMsg });
            } else {
              this.logger.debug('computerExecutor cleanup: context already closed');
            }
          })
        ]);
        
        // Log any rejected promises (should be caught above, but just in case)
        cleanupResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const executorName = index === 0 ? 'domExecutor' : 'computerExecutor';
            this.logger.warn(`Cleanup promise rejected for ${executorName} (non-fatal)`, { 
              reason: result.reason instanceof Error ? result.reason.message : String(result.reason) 
            });
          }
        });
      } catch (cleanupError) {
        // Log but don't throw - cleanup errors should not affect test results
        const errorMsg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        this.logger.warn('Cleanup error (non-fatal)', { error: errorMsg });
      }
    }

    const endTime = Date.now();
    const report: IReportData = {
      scenarioId: plan.scenarioId,
      planId: plan.id,
      results,
      summary: {
        startTime,
        endTime,
        success,
        reason: success ? undefined : failureReason,
      },
    };

    this.logger.info(`Execution finished. Success: ${success}`, { duration: endTime - startTime });

    return report;
  }

  // Removed selectExecutor - unified executor handles everything automatically
}

